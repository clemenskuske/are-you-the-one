import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'
import { buildSeedItems } from '../../infra/scripts/build-dynamodb-seed.mjs'

let server
let board
let rules
let solver
let connector

before(async () => {
  server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  board = await server.ssrLoadModule('/src/features/matching/match-board.ts')
  rules = await server.ssrLoadModule('/src/features/matching/match-count-rules.ts')
  solver = await server.ssrLoadModule('/src/features/matching/match-solver.ts')
  connector = await server.ssrLoadModule('/src/connectors/datapoints.ts')
})

after(async () => { await server?.close() })

function createBoard(left = ['a', 'b', 'c'], right = ['x', 'y', 'z']) {
  const matches = Object.fromEntries(left.flatMap(leftId => right.map(rightId => {
    const key = `${leftId}:${rightId}`
    return [key, {
      key, leftId, rightId, stage: 'undefined',
      derivationText: null, derivationPrerequisites: [],
    }]
  })))
  return {
    leftPeople: left.map(id => ({ id })),
    rightPeople: right.map(id => ({ id })),
    addedToMatch: null, matches,
    matchingNights: [], matchBoxes: [], timeline: [],
  }
}

function addNight(state, pairKeys, matches, matchingNight = 1) {
  state.matchingNights.push({
    id: `night-${state.matchingNights.length + 1}`, label: '', pairKeys, matches,
    total: pairKeys.length, matchingNight,
  })
}

function setStages(state, stages) {
  for (const [key, stage] of Object.entries(stages)) state.matches[key].stage = stage
}

function derive(state) { return board.deriveBasicMatchBoardState(state) }

test('a zero-match night rules out its pairs, without double-counting duplicates', () => {
  const state = createBoard()
  addNight(state, ['a:x', 'a:x', 'b:y', 'c:z'], 0)
  const result = derive(state)
  for (const key of ['a:x', 'b:y', 'c:z']) {
    assert.equal(result.matches[key].stage, 'derived-no-match')
  }
  const summary = board.summarizeMatchingNight(state, state.matchingNights[0])
  assert.equal(summary.undefinedPairCount, 3)
  assert.equal(state.matches['a:x'].stage, 'undefined', 'the input is not mutated')
})

test('a full-match night forces every possible pair and excludes other partners', () => {
  const state = createBoard()
  addNight(state, ['a:x', 'b:y', 'c:z'], 3)
  const result = derive(state)
  for (const key of ['a:x', 'b:y', 'c:z']) assert.equal(result.matches[key].stage, 'derived-match')
  for (const key of ['a:y', 'a:z', 'b:x', 'b:z', 'c:x', 'c:y']) {
    assert.equal(result.matches[key].stage, 'derived-no-match')
  }
  assert.deepEqual(derive(result), result, 'the rules reach a stable fixed point')
})

test('a remaining partner becomes confirmed when only confirmed exclusions support it', () => {
  const state = createBoard()
  setStages(state, { 'a:x': 'derived-exp-match', 'a:y': 'no-match', 'a:z': 'no-match' })
  assert.equal(derive(state).matches['a:x'].stage, 'derived-match')
})

test('remaining-partner deductions depend on expected exclusions', () => {
  const state = createBoard()
  setStages(state, { 'a:y': 'exp-no-match', 'a:z': 'no-match' })
  assert.equal(derive(state).matches['a:x'].stage, 'derived-exp-match')
})

test('a Matching Night can confirm an expected deduction using independent facts', () => {
  const state = createBoard()
  setStages(state, { 'a:x': 'match', 'b:y': 'derived-exp-no-match' })
  addNight(state, ['a:x', 'b:y', 'c:z'], 1)
  const result = derive(state)
  assert.equal(result.matches['b:y'].stage, 'derived-no-match')
  assert.equal(result.matches['c:z'].stage, 'derived-no-match')
})

test('unrelated expectations do not weaken a confirmed Matching Night exclusion', () => {
  const state = createBoard()
  setStages(state, { 'a:x': 'match', 'c:z': 'exp-no-match' })
  addNight(state, ['a:x', 'b:y', 'c:z'], 1)
  assert.equal(derive(state).matches['b:y'].stage, 'derived-no-match')
})

test('expected positives make Matching Night exclusions conditional', () => {
  const state = createBoard()
  setStages(state, { 'a:x': 'exp-match' })
  addNight(state, ['a:x', 'b:y', 'c:z'], 1)
  assert.equal(derive(state).matches['b:y'].stage, 'derived-exp-no-match')
})

test('capacity exclusions can upgrade an expected no-match to a confirmed no-match', () => {
  const state = createBoard()
  setStages(state, { 'a:x': 'match', 'a:y': 'derived-exp-no-match' })
  assert.equal(derive(state).matches['a:y'].stage, 'derived-no-match')
})

test('a confirmed Match-Box counts once, including when omitted from the visible night', () => {
  const state = createBoard()
  setStages(state, { 'a:x': 'match' })
  state.matchBoxes.push(
    { id: 'box-1', label: '', pairKey: 'a:x', matchingNight: 1 },
    { id: 'box-2', label: '', pairKey: 'a:x', matchingNight: 1 },
  )
  addNight(state, ['b:y', 'c:z'], 1)
  const result = derive(state)
  assert.equal(result.matches['b:y'].stage, 'derived-no-match')
  assert.equal(result.matches['c:z'].stage, 'derived-no-match')
  assert.equal(board.summarizeMatchingNight(state, state.matchingNights[0]).priorPositiveMatchBoxCount, 1)
  state.matchingNights[0].pairKeys.push('a:x')
  const summary = board.summarizeMatchingNight(state, state.matchingNights[0])
  assert.equal(summary.positivePairCount, 1)
  assert.equal(summary.priorPositiveMatchBoxCount, 0)
})

test('an expected or future Match-Box cannot add a hidden beam to an earlier night', () => {
  const state = createBoard()
  setStages(state, { 'a:x': 'exp-match', 'b:y': 'match' })
  state.matchBoxes.push(
    { id: 'box-1', label: '', pairKey: 'a:x', matchingNight: 1 },
    { id: 'box-2', label: '', pairKey: 'b:y', matchingNight: 2 },
  )
  addNight(state, ['c:z'], 0)
  assert.equal(board.summarizeMatchingNight(state, state.matchingNights[0]).priorPositiveMatchBoxCount, 0)
})

test('an unknown double-match partner retains a second slot on the smaller side', () => {
  const state = createBoard(['a', 'b', 'c'], ['x', 'y'])
  setStages(state, { 'a:x': 'match' })
  const result = derive(state)
  assert.equal(result.matches['a:y'].stage, 'derived-no-match')
  assert.equal(result.matches['b:x'].stage, 'undefined')
  assert.equal(result.matches['c:x'].stage, 'undefined')
})

test('two confirmed partners resolve the double-match slot for everyone else', () => {
  const state = createBoard(['a', 'b', 'c', 'd'], ['x', 'y', 'z'])
  setStages(state, { 'a:x': 'match', 'b:x': 'match', 'c:y': 'match' })
  assert.equal(derive(state).matches['d:y'].stage, 'derived-no-match')
})

test('an expected double-match slot makes other capacity exclusions conditional', () => {
  const state = createBoard(['a', 'b', 'c', 'd'], ['x', 'y', 'z'])
  setStages(state, { 'a:x': 'match', 'b:x': 'exp-match', 'c:y': 'match' })
  const result = derive(state)
  assert.equal(result.matches['d:y'].stage, 'derived-exp-no-match')
  assert.ok(result.matches['d:y'].derivationText.includes('both matches'))
})

test('adding the extra contestant works with either side larger and stays conditional', () => {
  for (const larger of ['left', 'right']) {
    const state = larger === 'left'
      ? createBoard(['a', 'b', 'c'], ['x', 'y'])
      : createBoard(['a', 'b'], ['x', 'y', 'z'])
    setStages(state, { 'a:x': 'match' })
    state.addedToMatch = { personId: larger === 'left' ? 'b' : 'y', pairKey: 'a:x' }
    const result = derive(state)
    const addedKey = larger === 'left' ? 'b:x' : 'a:y'
    const excludedKey = larger === 'left' ? 'b:y' : 'b:y'
    assert.equal(result.matches[addedKey].stage, 'derived-exp-match')
    assert.equal(result.matches[excludedKey].stage, 'derived-exp-no-match')
    assert.equal(board.isMatchBoardStatePossible(result), true)
  }
})

test('conflicting nights terminate, retain outcomes, and are reported as impossible', () => {
  for (const results of [[0, 1], [1, 0]]) {
    const state = createBoard(['a', 'b'], ['x', 'y'])
    for (const count of results) addNight(state, ['a:x'], count)
    const result = new board.MatchBoardManager(state).getSnapshot()
    assert.equal(result.matches['a:x'].stage, results[0] ? 'derived-match' : 'derived-no-match')
    assert.equal(board.isMatchBoardStatePossible(result), false)
    assert.deepEqual(derive(result), result)
  }
})

test('explicit facts and assumptions remain authoritative even in a contradictory state', () => {
  const state = createBoard()
  setStages(state, { 'a:x': 'match', 'a:y': 'exp-match', 'a:z': 'no-match' })
  const result = derive(state)
  for (const key of ['a:x', 'a:y', 'a:z']) assert.equal(result.matches[key].stage, state.matches[key].stage)
  assert.equal(board.isMatchBoardStatePossible(result), false)
})

test('removing an expected decision clears its dependent deductions', () => {
  const manager = new board.MatchBoardManager(createBoard())
  const assumed = manager.setMatchStageByKey('a:x', 'exp-match')
  assert.equal(assumed.matches['a:y'].stage, 'derived-exp-no-match')
  const cleared = manager.revertMatchStageByKey('a:x')
  assert.equal(cleared.matches['a:x'].stage, 'undefined')
  assert.equal(cleared.matches['a:y'].stage, 'undefined')
})

test('each collected deduction cites only its actual derived prerequisites', () => {
  const state = createBoard()
  addNight(state, ['a:y', 'a:z'], 0)
  const plan = new board.MatchBoardManager(createBoard()).setMatchStageByKeyWithPlan('a:x', 'exp-match')
  assert.ok(plan.derivationSteps.length > 0)
  for (const step of plan.derivationSteps) {
    assert.ok(step.derivationPrerequisites.every(reference => reference.pairKey !== step.pairKey))
  }
  const result = derive(state)
  assert.equal(result.matches['a:x'].stage, 'derived-match')
  assert.deepEqual(result.matches['a:x'].derivationPrerequisites.map(reference => reference.pairKey).sort(), ['a:y', 'a:z'])
})

test('all count-rule deductions are sound against exhaustive three-pair assignments', () => {
  const stages = board.MATCH_STAGE_ORDER
  let checked = 0
  function assignments(pairs, required, capacity, useExpected) {
    const result = []
    for (let mask = 0; mask < 8; mask++) {
      const values = pairs.map((_, index) => Boolean(mask & (1 << index)))
      const count = values.filter(Boolean).length
      if (count < required || count > capacity) continue
      if (pairs.some((pair, index) => {
        if (!useExpected && rules.isExpectedStage(pair.stage)) return false
        return (rules.isPositiveStage(pair.stage) && !values[index]) ||
          (rules.isNegativeStage(pair.stage) && values[index])
      })) continue
      result.push(values)
    }
    return result
  }
  for (const first of stages) for (const second of stages) for (const third of stages) {
    const pairs = [first, second, third].map((stage, index) => ({ key: `a:${index}`, stage }))
    for (let required = 0; required <= 3; required++) for (let capacity = required; capacity <= 3; capacity++) {
      const assumed = assignments(pairs, required, capacity, true)
      const facts = assignments(pairs, required, capacity, false)
      const deductions = rules.getMatchCountDeductions(pairs, { required, capacity })
      if (assumed.length === 0) assert.deepEqual(deductions, [])
      for (const deduction of deductions) {
        const index = pairs.findIndex(pair => pair.key === deduction.pairKey)
        const expectedValue = rules.isPositiveStage(deduction.stage)
        const relevant = rules.isExpectedStage(deduction.stage) ? assumed : facts
        assert.ok(relevant.length > 0)
        assert.ok(relevant.every(values => values[index] === expectedValue), JSON.stringify({ pairs, required, capacity, deduction }))
        assert.ok(!deduction.supportingPairKeys.includes(deduction.pairKey))
        checked++
      }
    }
  }
  assert.ok(checked > 1000)
})

test('invalid counts produce no deductions', () => {
  const pairs = [{ key: 'a:x', stage: 'undefined' }]
  for (const bounds of [
    { required: -1, capacity: 1 }, { required: 2, capacity: 1 },
    { required: 0.5, capacity: 1 }, { required: 0, capacity: NaN },
  ]) assert.deepEqual(rules.getMatchCountDeductions(pairs, bounds), [])
})

test('equal total casts retain a historical shared match and an extra active man', () => {
  const state = createBoard()
  setStages(state, { 'a:x': 'match' })
  state.knownAddedToMatches = [{ personId: 'b', pairKey: 'a:x' }]
  const result = derive(state)
  assert.equal(result.leftPeople.length, result.rightPeople.length)
  assert.deepEqual(board.getActivePeople(result, 'left').map(person => person.id), ['a', 'c'])
  assert.equal(board.getSmallerSide(result), 'left')
  assert.equal(board.summarizePersonMatchOptions(result, 'x', 'right').requiredMatchCount, 2)
  assert.equal(board.summarizePersonMatchOptions(result, 'a', 'left').matchCapacity, 2)
  assert.equal(result.matches['b:x'].stage, 'derived-match')
  assert.equal(result.matches['a:y'].stage, 'undefined')
  assert.equal(board.isMatchBoardStatePossible(result), true)
})

test('a new extra-man choice and its removal preserve the earlier extra-woman match', () => {
  const state = createBoard()
  setStages(state, { 'a:x': 'match' })
  state.knownAddedToMatches = [{ personId: 'b', pairKey: 'a:x' }]
  const manager = new board.MatchBoardManager(state)
  const added = manager.setAddedToMatch({ personId: 'y', pairKey: 'a:x' })
  assert.deepEqual(added.knownAddedToMatches, state.knownAddedToMatches)
  assert.equal(added.matches['a:y'].stage, 'derived-exp-match')
  assert.equal(added.matches['b:x'].stage, 'derived-match')
  assert.equal(board.getSmallerSide(added), null)
  assert.equal(board.isMatchBoardStatePossible(added), true)
  const removed = manager.setAddedToMatch(null)
  assert.equal(removed.matches['b:x'].stage, 'derived-match')
  assert.equal(removed.matches['a:y'].stage, 'undefined')
  assert.equal(board.getSmallerSide(removed), 'left')
})

function currentSeasonRecords() {
  function decode(value) {
    if (value.S !== undefined) return value.S
    if (value.N !== undefined) return Number(value.N)
    if (value.BOOL !== undefined) return value.BOOL
    if (value.NULL !== undefined) return null
    if (value.L !== undefined) return value.L.map(decode)
    if (value.M !== undefined) return Object.fromEntries(Object.entries(value.M).map(([key, item]) => [key, decode(item)]))
    throw new Error('Unsupported DynamoDB value in fixture')
  }
  const items = buildSeedItems().items
    .map(item => decode({ M: item }))
    .filter(item => item.pk === '2026-vip')
  return connector.splitDatapointsByType(items.map(item => ({ pk: item.pk, sk: item.sk, fields: item })), '2026-vip')
}

test('the current season switches from extra women to extra men without misclassifying male singles', () => {
  const records = currentSeasonRecords()
  const manager = new board.MatchBoardManager(createBoard())
  for (const [cutoff, counts] of [[1, [11, 10]], [3, [10, 10]], [5, [10, 11]], [7, [10, 11]]]) {
    const { snapshot } = manager.hydrateFromSeasonDatapoints(records, { maxMatchingNight: cutoff })
    assert.deepEqual([board.getActivePeople(snapshot, 'left').length, board.getActivePeople(snapshot, 'right').length], counts)
    assert.equal(snapshot.leftPeople.some(person => ['fabi', 'raul', 'cansin'].includes(person.id)), false)
    if (cutoff >= 3) assert.deepEqual(snapshot.knownAddedToMatches, [{ personId: 'janice', pairKey: 'marta:johannes' }])
    assert.deepEqual(board.getMatchBoardContradictions(snapshot), [], `night ${cutoff}`)
  }
})

test('contradiction diagnostics include overfilled nights, partner overflows, and missing partners', () => {
  const state = createBoard()
  setStages(state, { 'a:x': 'exp-match', 'a:y': 'exp-match', 'b:x': 'no-match', 'b:y': 'no-match', 'b:z': 'no-match' })
  addNight(state, ['a:x', 'a:y'], 1)
  addNight(state, ['b:x', 'b:y'], 1)
  const messages = board.getMatchBoardContradictions(state).map(item => item.message)
  assert.ok(messages.some(message => message.includes('2 positive pairs')))
  assert.ok(messages.some(message => message.includes('only 0 pairs')))
  assert.ok(messages.some(message => message.includes('a has 2 positive partners')))
  assert.ok(messages.some(message => message.includes('b needs 1 partner')))
})

test('the joint solver detects impossible totals that individual night bounds miss', async () => {
  const state = createBoard(['a', 'b'], ['x', 'y'])
  addNight(state, ['a:x', 'b:y'], 1)
  assert.equal(board.isMatchBoardStatePossible(state), true)
  assert.equal(await solver.checkJointMatchBoardState(state), 'impossible')
  assert.deepEqual(await solver.findForcedPairs(state), { kind: 'contradiction' })
})

test('the forced-pair finder returns every proven match and no-match in one batch', async () => {
  for (const matches of [1, 0]) {
    const state = createBoard(['a', 'b'], ['x', 'y'])
    addNight(state, ['a:x'], matches)
    const positive = matches ? ['a:x', 'b:y'] : ['a:y', 'b:x']
    const result = await solver.findForcedPairs(state)
    assert.deepEqual(result, {
      kind: 'found',
      decisions: Object.keys(state.matches).map(pairKey => ({
        pairKey, stage: positive.includes(pairKey) ? 'exp-match' : 'exp-no-match',
      })),
    })
    setStages(state, Object.fromEntries(result.decisions.map(decision => [decision.pairKey, decision.stage])))
    assert.equal(await solver.checkJointMatchBoardState(state), 'possible')
    assert.deepEqual(await solver.findForcedPairs(state), { kind: 'none' })
  }
})

test('the finder does not treat a derived conclusion as an input for its own proof', async () => {
  const state = createBoard(['a', 'b'], ['x', 'y'])
  setStages(state, { 'a:x': 'derived-exp-no-match' })
  assert.deepEqual(await solver.findForcedPairs(state), { kind: 'none' })
})

test('bulk loading preserves confirmed pairings, confirmed exclusions, and saved expectations', () => {
  const state = createBoard(['a', 'b', 'c', 'd'], ['x', 'y', 'z', 'w'])
  setStages(state, { 'a:x': 'match', 'a:z': 'no-match', 'b:y': 'exp-match', 'b:w': 'exp-no-match' })
  const manager = new board.MatchBoardManager(state)
  const before = manager.getSnapshot()
  assert.equal(before.matches['a:y'].stage, 'derived-no-match')
  const decisions = [
    { pairKey: 'a:x', stage: 'exp-no-match' },
    { pairKey: 'a:z', stage: 'exp-match' },
    { pairKey: 'a:y', stage: 'exp-match' },
    { pairKey: 'b:y', stage: 'exp-no-match' },
    { pairKey: 'b:w', stage: 'exp-match' },
    { pairKey: 'c:z', stage: 'exp-match' },
    { pairKey: 'c:w', stage: 'exp-no-match' },
    { pairKey: 'd:z', stage: 'exp-no-match' },
    { pairKey: 'd:w', stage: 'exp-match' },
  ]
  const plan = manager.setExpectedMatchStagesWithPlan(decisions)
  for (const key of ['a:x', 'a:z', 'a:y', 'b:y', 'b:w']) {
    assert.deepEqual(plan.finalSnapshot.matches[key], before.matches[key], key)
  }
  for (const decision of decisions.slice(5)) {
    assert.equal(plan.immediateSnapshot.matches[decision.pairKey].stage, decision.stage)
    assert.equal(plan.finalSnapshot.matches[decision.pairKey].stage, decision.stage)
  }
  const repeated = manager.setExpectedMatchStagesWithPlan(decisions)
  assert.deepEqual(repeated.finalSnapshot, plan.finalSnapshot)
  assert.deepEqual(repeated.derivationSteps, [])
})

test('the bulk finder skips confirmed deductions and historical shared pairs', async () => {
  const state = createBoard()
  setStages(state, { 'a:x': 'match' })
  state.knownAddedToMatches = [{ personId: 'b', pairKey: 'a:x' }]
  const snapshot = new board.MatchBoardManager(state).getSnapshot()
  assert.equal(snapshot.matches['b:x'].stage, 'derived-match')
  const result = await solver.findForcedPairs(snapshot)
  assert.deepEqual(result, { kind: 'none' })
})

test('loading all forced pairs in the current season skips fixed outcomes and leaves no new forced decisions', async () => {
  const manager = new board.MatchBoardManager()
  const { snapshot } = manager.hydrateFromSeasonDatapoints(currentSeasonRecords(), { maxMatchingNight: 7 })
  const result = await solver.findForcedPairs(snapshot)
  assert.equal(result.kind, 'found')
  assert.ok(result.decisions.length > 1)
  for (const decision of result.decisions) {
    assert.ok(['undefined', 'derived-exp-match', 'derived-exp-no-match'].includes(snapshot.matches[decision.pairKey].stage))
  }
  assert.ok(result.decisions.every(decision => decision.pairKey !== 'janice:johannes'))
  const { finalSnapshot } = manager.setExpectedMatchStagesWithPlan(result.decisions)
  for (const decision of result.decisions) assert.equal(finalSnapshot.matches[decision.pairKey].stage, decision.stage)
  assert.deepEqual(board.getMatchBoardContradictions(finalSnapshot), [])
  assert.equal(await solver.checkJointMatchBoardState(finalSnapshot), 'possible')
  assert.deepEqual(await solver.findForcedPairs(finalSnapshot), { kind: 'none' })
  manager.hydrateFromSeasonDatapoints(currentSeasonRecords(), { maxMatchingNight: 7 })
  const restored = manager.setExpectedMatchStagesWithPlan(result.decisions, { skipFixedPairs: false }).finalSnapshot
  for (const decision of result.decisions) assert.equal(restored.matches[decision.pairKey].stage, decision.stage)
  assert.deepEqual(await solver.findForcedPairs(restored), { kind: 'none' }, 'reloading cannot make previously fixed outcomes eligible')
})

test('restoring a saved URL preserves earlier explicit expectations even for fixed pairs', () => {
  const state = createBoard()
  setStages(state, { 'a:x': 'match' })
  state.knownAddedToMatches = [{ personId: 'b', pairKey: 'a:x' }]
  const manager = new board.MatchBoardManager(state)
  const restored = manager.setExpectedMatchStagesWithPlan([
    { pairKey: 'b:x', stage: 'exp-match' },
  ], { skipFixedPairs: false }).finalSnapshot
  assert.equal(restored.matches['b:x'].stage, 'exp-match')
  assert.equal(restored.matches['a:x'].stage, 'match')
  assert.deepEqual(restored.knownAddedToMatches, state.knownAddedToMatches)
})

test('search cancellation and limits never add an unproven decision', async () => {
  const state = createBoard()
  assert.deepEqual(await solver.findForcedPairs(state, { maxNodes: 0 }), { kind: 'limit' })
  const controller = new AbortController()
  controller.abort()
  assert.deepEqual(await solver.findForcedPairs(state, { signal: controller.signal }), { kind: 'cancelled' })
  const forced = createBoard(['a', 'b'], ['x', 'y'])
  addNight(forced, ['a:x'], 1)
  assert.deepEqual(await solver.findForcedPairs(forced, { maxNodes: 2 }), { kind: 'limit' }, 'a partial batch is never returned')
})

test('the joint solver supports both historical and new shared-partner slots', async () => {
  const state = createBoard()
  setStages(state, { 'a:x': 'match' })
  state.knownAddedToMatches = [{ personId: 'b', pairKey: 'a:x' }]
  assert.equal(await solver.checkJointMatchBoardState(state), 'possible')
  state.addedToMatch = { personId: 'y', pairKey: 'a:x' }
  assert.equal(await solver.checkJointMatchBoardState(state), 'possible')
  setStages(state, { 'a:y': 'exp-no-match' })
  assert.equal(await solver.checkJointMatchBoardState(state), 'impossible')
})

test('a known contestant with two partners reserves the double slot before any partner is chosen', async () => {
  const state = createBoard(['a', 'b'], ['x', 'y', 'z'])
  const manager = new board.MatchBoardManager(state)
  const selected = manager.setKnownDoubleMatchPerson('a')
  assert.equal(board.summarizePersonMatchOptions(selected, 'a', 'left').requiredMatchCount, 2)
  assert.equal(board.summarizePersonMatchOptions(selected, 'a', 'left').matchCapacity, 2)
  assert.equal(board.summarizePersonMatchOptions(selected, 'b', 'left').matchCapacity, 1)
  assert.equal(board.getSeasonDegreeOptions(selected).length, 1)
  assert.ok(Object.values(selected.matches).every(pair => pair.stage === 'undefined'), 'no partner is invented')
  assert.equal(await solver.checkJointMatchBoardState(selected), 'possible')
})

test('a known sharing partner must pair with the person who has two active partners, on either side', async () => {
  for (const larger of ['left', 'right']) {
    const state = larger === 'right'
      ? createBoard(['a', 'b'], ['x', 'y', 'z'])
      : createBoard(['a', 'b', 'c'], ['x', 'y'])
    const knownId = larger === 'right' ? 'x' : 'a'
    const valid = larger === 'right' ? ['a:x', 'a:z', 'b:y'] : ['a:x', 'c:x', 'b:y']
    const invalid = larger === 'right' ? ['a:x', 'b:y', 'b:z'] : ['a:x', 'b:y', 'c:y']
    state.knownDoubleMatchPersonId = knownId
    const validState = structuredClone(state)
    setStages(validState, Object.fromEntries(valid.map(key => [key, 'exp-match'])))
    assert.equal(board.isMatchBoardStatePossible(validState), true)
    assert.equal(await solver.checkJointMatchBoardState(validState), 'possible')
    const invalidState = structuredClone(state)
    setStages(invalidState, Object.fromEntries(invalid.map(key => [key, 'exp-match'])))
    assert.equal(board.isMatchBoardStatePossible(invalidState), false)
    assert.equal(await solver.checkJointMatchBoardState(invalidState), 'impossible')
  }
})

test('knowing one sharing participant produces additional deductions and clearing it retracts them', async () => {
  const state = createBoard(['a', 'b'], ['x', 'y', 'z'])
  setStages(state, { 'b:y': 'match' })
  const manager = new board.MatchBoardManager(state)
  assert.equal(manager.getSnapshot().matches['a:z'].stage, 'undefined')
  const known = manager.setKnownDoubleMatchPerson('x')
  assert.equal(known.matches['a:z'].stage, 'derived-match')
  assert.equal(known.matches['b:z'].stage, 'derived-no-match')
  assert.equal(await solver.checkJointMatchBoardState(known), 'possible')
  const cleared = manager.setKnownDoubleMatchPerson(null)
  assert.equal(cleared.matches['a:z'].stage, 'undefined')
  assert.equal(cleared.matches['b:z'].stage, 'undefined')
  assert.equal(cleared.matches['b:y'].stage, 'match')
})

test('double-match deductions based on expected partners remain conditional', () => {
  const state = createBoard(['a', 'b'], ['x', 'y', 'z'])
  state.knownDoubleMatchPersonId = 'x'
  setStages(state, { 'a:x': 'exp-match', 'b:y': 'match' })
  const derived = derive(state)
  assert.equal(derived.matches['a:z'].stage, 'derived-exp-match')
  assert.equal(derived.matches['b:z'].stage, 'derived-exp-no-match')
})

test('known participation limits shared-match choices and preserves the historical double match', async () => {
  const state = createBoard()
  setStages(state, { 'a:x': 'match' })
  state.knownAddedToMatches = [{ personId: 'b', pairKey: 'a:x' }]
  const manager = new board.MatchBoardManager(state)
  const known = manager.setKnownDoubleMatchPerson('y')
  assert.equal(known.knownDoubleMatchPersonId, 'y')
  assert.ok(board.getAddToMatchOptions(known, 'y').some(pair => pair.key === 'a:x'))
  assert.ok(!board.getAddToMatchOptions(known, 'z').some(pair => pair.key === 'a:x'), 'y must be part of the new shared match')
  const added = manager.setAddedToMatch({ personId: 'y', pairKey: 'a:x' })
  assert.equal(added.knownDoubleMatchPersonId, 'y')
  assert.equal(added.matches['b:x'].stage, 'derived-match')
  assert.equal(await solver.checkJointMatchBoardState(added), 'possible')
  const cleared = manager.setKnownDoubleMatchPerson(null)
  assert.deepEqual(cleared.knownAddedToMatches, state.knownAddedToMatches)
  assert.equal(cleared.matches['b:x'].stage, 'derived-match')
})

test('invalid double-match knowledge is diagnosed and selections do not leak into a different cutoff', async () => {
  const state = createBoard(['a', 'b'], ['x', 'y', 'z'])
  state.knownDoubleMatchPersonId = 'missing'
  assert.equal(await solver.checkJointMatchBoardState(state), 'impossible')
  assert.ok(board.getMatchBoardContradictions(state).some(item => item.id === 'known-double-match'))
  const manager = new board.MatchBoardManager()
  manager.hydrateFromSeasonDatapoints(currentSeasonRecords(), { maxMatchingNight: 7 })
  assert.equal(manager.setKnownDoubleMatchPerson('laurenz').knownDoubleMatchPersonId, 'laurenz')
  manager.hydrateFromSeasonDatapoints(currentSeasonRecords(), { maxMatchingNight: 3 })
  assert.equal(manager.setKnownDoubleMatchPerson('laurenz').knownDoubleMatchPersonId, null)
})

test('Laurenz is automatically confirmed from his arrival, without leaking into earlier cutoffs', async () => {
  const records = currentSeasonRecords()
  const manager = new board.MatchBoardManager()
  for (const [cutoff, includeNight, expectedId] of [
    [1, true, null], [3, true, null], [4, true, null],
    [5, false, 'laurenz'], [5, true, 'laurenz'], [7, true, 'laurenz'],
  ]) {
    const { snapshot } = manager.hydrateFromSeasonDatapoints(records, {
      maxMatchingNight: cutoff, includeMaxMatchingNight: includeNight,
    })
    assert.equal(snapshot.knownDoubleMatchPersonId, expectedId, `night ${cutoff}, included ${includeNight}`)
    assert.equal(snapshot.seasonKnownDoubleMatchPersonId, expectedId)
    assert.equal(snapshot.addedToMatch, null, 'no completed shared pairing is chosen')
    assert.equal(await solver.checkJointMatchBoardState(snapshot), 'possible')
    if (cutoff >= 3) assert.deepEqual(snapshot.knownAddedToMatches, [{ personId: 'janice', pairKey: 'marta:johannes' }])
    if (expectedId) {
      assert.equal(manager.setKnownDoubleMatchPerson(null).knownDoubleMatchPersonId, 'laurenz')
      assert.equal(manager.setKnownDoubleMatchPerson('emma').knownDoubleMatchPersonId, 'laurenz')
    }
  }
  const differentSeason = { ...records, pk: '2025-vip' }
  assert.equal(manager.hydrateFromSeasonDatapoints(differentSeason, { maxMatchingNight: 7 }).snapshot.knownDoubleMatchPersonId, null)
})
