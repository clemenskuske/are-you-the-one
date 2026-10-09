import {
  canSaveForcedPair,
  getAddedPairKey,
  getAddedToMatchMoves,
  getMatchingNightPairs,
  getSeasonDegreeOptions,
  type ExpectedMatchDecision,
  type MatchBoardState,
} from './match-board'

type Constraint = { indices: number[]; total: number }
type Problem = { constraints: Constraint[]; values: Int8Array }
type SearchOptions = { signal?: AbortSignal; maxNodes?: number; maxMilliseconds?: number }
type AssignmentResult = Int8Array | null | 'limit'
export type ForcedPairsResult =
  | { kind: 'found'; decisions: ExpectedMatchDecision[] }
  | { kind: 'none' | 'contradiction' | 'limit' | 'cancelled' }

function createProblems(state: MatchBoardState) {
  const pairs = Object.values(state.matches)
  const indices = new Map(pairs.map((pair, index) => [pair.key, index]))
  const initialValues = Int8Array.from(pairs.map(pair =>
    pair.stage === 'match' || pair.stage === 'exp-match' ? 1
      : pair.stage === 'no-match' || pair.stage === 'exp-no-match' ? 0 : -1,
  ))
  for (const move of getAddedToMatchMoves(state)) {
    const addedKey = getAddedPairKey(state, move)
    for (const key of [move.pairKey, addedKey]) {
      const index = key ? indices.get(key) : undefined
      if (index === undefined || initialValues[index] === 0) return { pairs, problems: [] }
      initialValues[index] = 1
    }
  }
  const nights = state.matchingNights.map(night => ({
    total: night.matches,
    indices: getMatchingNightPairs(state, night).map(pair => indices.get(pair.key)!),
  }))
  const problems: Problem[] = getSeasonDegreeOptions(state).flatMap(degrees => {
    const values = initialValues.slice()
    for (const key of degrees.requiredPairKeys) {
      const index = indices.get(key)
      if (index === undefined || values[index] === 0) return []
      values[index] = 1
    }
    return [{
      values,
      constraints: [
        ...nights,
        ...state.leftPeople.map(person => ({
          total: degrees.left.get(person.id)!,
          indices: pairs.flatMap((pair, index) => pair.leftId === person.id ? [index] : []),
        })),
        ...state.rightPeople.map(person => ({
          total: degrees.right.get(person.id)!,
          indices: pairs.flatMap((pair, index) => pair.rightId === person.id ? [index] : []),
        })),
      ],
    }]
  })
  return { pairs, problems }
}

function propagate(values: Int8Array, constraints: Constraint[]) {
  let changed = true
  while (changed) {
    changed = false
    for (const constraint of constraints) {
      let positiveCount = 0
      const unknown: number[] = []
      for (const index of constraint.indices) {
        if (values[index] === 1) positiveCount++
        else if (values[index] === -1) unknown.push(index)
      }
      if (!Number.isInteger(constraint.total) || positiveCount > constraint.total ||
        positiveCount + unknown.length < constraint.total) return false
      if (unknown.length === 0) continue
      const forcedValue = positiveCount === constraint.total ? 0
        : positiveCount + unknown.length === constraint.total ? 1 : null
      if (forcedValue === null) continue
      for (const index of unknown) values[index] = forcedValue
      changed = true
    }
  }
  return true
}

// A witness must satisfy every person's degree and every night simultaneously.
// Budget exhaustion is distinct from a proof that no assignment exists.
function createSearch(options: SearchOptions) {
  let nodes = 0
  let lastYield = performance.now()
  const startedAt = lastYield
  async function search(problem: Problem, values: Int8Array): Promise<AssignmentResult> {
    nodes++
    if (options.signal?.aborted) return 'limit'
    if (nodes > (options.maxNodes ?? 100_000) || performance.now() - startedAt > (options.maxMilliseconds ?? 4000)) return 'limit'
    if (performance.now() - lastYield >= 12) {
      await new Promise(resolve => setTimeout(resolve, 0))
      lastYield = performance.now()
      if (options.signal?.aborted) return 'limit'
    }
    if (!propagate(values, problem.constraints)) return null
    let candidates: number[] | null = null
    for (const constraint of problem.constraints) {
      const unknown = constraint.indices.filter(index => values[index] === -1)
      if (unknown.length && (!candidates || unknown.length < candidates.length)) candidates = unknown
    }
    if (!candidates) return values
    const index = candidates[0]
    for (const value of [1, 0]) {
      const branch = values.slice()
      branch[index] = value
      const result = await search(problem, branch)
      if (result !== null) return result
    }
    return null
  }
  return async function findAssignment(problems: Problem[], assumption?: { index: number; value: number }) {
    for (const problem of problems) {
      const values = problem.values.slice()
      if (assumption) {
        if (values[assumption.index] !== -1 && values[assumption.index] !== assumption.value) continue
        values[assumption.index] = assumption.value
      }
      const result = await search(problem, values)
      if (result !== null) return result
    }
    return null
  }
}

export async function checkJointMatchBoardState(state: MatchBoardState, options: SearchOptions = {}) {
  const { problems } = createProblems(state)
  const assignment = await createSearch(options)(problems)
  return options.signal?.aborted ? 'cancelled' : assignment === 'limit' ? 'limit' : assignment === null ? 'impossible' : 'possible'
}

export async function findForcedPairs(state: MatchBoardState, options: SearchOptions = {}): Promise<ForcedPairsResult> {
  const { pairs, problems } = createProblems(state)
  const search = createSearch(options)
  const witness = await search(problems)
  if (options.signal?.aborted) return { kind: 'cancelled' }
  if (witness === 'limit') return { kind: 'limit' }
  if (witness === null) return { kind: 'contradiction' }

  // Leave confirmed outcomes and saved expectations alone. Prove every other
  // outcome against the same inputs across all shared-partner configurations.
  const decisions: ExpectedMatchDecision[] = []
  const candidates = pairs.map((pair, index) => ({ pair, index })).filter(({ pair }) =>
    canSaveForcedPair(pair.stage),
  )
  for (const { pair, index } of candidates) {
    const opposite = witness[index] === 1 ? 0 : 1
    const result = await search(problems, { index, value: opposite })
    if (options.signal?.aborted) return { kind: 'cancelled' }
    if (result === 'limit') return { kind: 'limit' }
    if (result === null) decisions.push({ pairKey: pair.key, stage: witness[index] === 1 ? 'exp-match' : 'exp-no-match' })
  }
  return decisions.length ? { kind: 'found', decisions } : { kind: 'none' }
}
