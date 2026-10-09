import {
  DEFAULT_SEASON_PK,
  type Datapoint,
  type SeasonDatapoints,
} from '../../connectors/datapoints'
import {
  getMatchCountDeductions,
  isConfirmedNegativeStage,
} from './match-count-rules'
import { SEASON_RULES } from './season-rules'

export const LEFT_GROUP_LABEL = 'females'
export const RIGHT_GROUP_LABEL = 'males'

export const MATCH_STAGE_ORDER = [
  'match',
  'derived-match',
  'exp-match',
  'derived-exp-match',
  'undefined',
  'exp-no-match',
  'derived-exp-no-match',
  'no-match',
  'derived-no-match',
] as const

export type MatchStage = (typeof MATCH_STAGE_ORDER)[number]
export type MatchKey = `${string}:${string}`

export type ExpectedMatchDecision = {
  pairKey: MatchKey
  stage: 'exp-match' | 'exp-no-match'
}

export function canSaveForcedPair(stage: MatchStage) {
  return stage === 'undefined' || stage === 'derived-exp-match' || stage === 'derived-exp-no-match'
}

export type Person = {
  id: string
  name?: string
  imageUrl?: string | null
}

export type MatchRecord = {
  key: MatchKey
  leftId: string
  rightId: string
  stage: MatchStage
  derivationText: string | null
  derivationPrerequisites: MatchDerivationReference[]
}

export type MatchingNight = {
  id: string
  label: string
  pairKeys: MatchKey[]
  matches: number
  total: number
  matchingNight: number | null
}

export type MatchBox = {
  id: string
  label: string
  pairKey: MatchKey
  matchingNight: number | null
}

export type TimelineEntry =
  | { kind: 'matching-night'; id: string }
  | { kind: 'match-box'; id: string }

export type AddedToMatchMove = {
  personId: string
  pairKey: MatchKey
}

export type MatchBoardState = {
  leftPeople: Person[]
  rightPeople: Person[]
  addedToMatch: AddedToMatchMove | null
  knownAddedToMatches?: AddedToMatchMove[]
  knownDoubleMatchPersonId?: string | null
  seasonKnownDoubleMatchPersonId?: string | null
  matches: Record<MatchKey, MatchRecord>
  matchingNights: MatchingNight[]
  matchBoxes: MatchBox[]
  timeline: TimelineEntry[]
}

export type MatchBoardLoadMeta = {
  usedFallbackSample: boolean
  loadedNightCount: number
  loadedMatchBoxCount: number
  appliedMatchStateCount: number
}

export type MatchBoardLoadResult = {
  snapshot: MatchBoardState
  meta: MatchBoardLoadMeta
}

export type MatchBoardHydrationOptions = {
  maxMatchingNight?: number | null
  includeMaxMatchingNight?: boolean
}

export type DerivedMatchStage =
  | 'derived-match'
  | 'derived-no-match'
  | 'derived-exp-match'
  | 'derived-exp-no-match'

export type MatchDerivationReason =
  | 'added-to-match-positive'
  | 'added-to-match-exclusion'
  | 'matching-night-clear-match'
  | 'matching-night-clear-no-match'
  | 'positive-pair-exclusion'
  | 'single-remaining-pair'
  | 'state-possibility-exclusion'

export type MatchDerivationStep = {
  pairKey: MatchKey
  stage: DerivedMatchStage
  reason: MatchDerivationReason
  sourceMatchingNightId: string | null
  derivationText: string
  derivationPrerequisites: MatchDerivationReference[]
}

export type MatchDerivationReference = {
  pairKey: MatchKey
  stage: DerivedMatchStage
}

type HypotheticalDerivationResult = {
  state: MatchBoardState
  derivationSteps: MatchDerivationStep[]
}

type DerivationTextMeta = Pick<
  MatchDerivationStep,
  'reason' | 'sourceMatchingNightId'
> & {
  blockingPairKey?: MatchKey
  addedPersonId?: string
  blockingPairKeys?: MatchKey[]
  requiredPersonId?: string
  requiredPersonSide?: Side
  requiredMatchCount?: number
  dependsOnAddedToMatch?: boolean
  resolvedDoubleMatchPersonId?: string
  oppositeAssumption?: {
    stage: 'exp-match' | 'exp-no-match'
    result: HypotheticalDerivationResult
  }
}

export type MatchStageChangePlan = {
  immediateSnapshot: MatchBoardState
  derivationSteps: MatchDerivationStep[]
  finalSnapshot: MatchBoardState
}

export const MATCH_STAGE_LABELS: Record<MatchStage, string> = {
  match: 'Match',
  'derived-match': 'Derived match',
  undefined: 'Undefined',
  'no-match': 'No match',
  'derived-no-match': 'Derived no match',
  'exp-match': 'Expected match',
  'derived-exp-match': 'Derived expected match',
  'exp-no-match': 'Expected no match',
  'derived-exp-no-match': 'Derived expected no match',
}

const POSITIVE_MATCH_STAGES = new Set<MatchStage>([
  'match',
  'derived-match',
  'exp-match',
  'derived-exp-match',
])

const NEGATIVE_MATCH_STAGES = new Set<MatchStage>([
  'no-match',
  'derived-no-match',
  'exp-no-match',
  'derived-exp-no-match',
])

const EXPECTED_MATCH_STAGES = new Set<MatchStage>([
  'exp-match',
  'exp-no-match',
  'derived-exp-match',
  'derived-exp-no-match',
])

const IMAGES_BUCKET_NAME = 'ayto-images'

const SAMPLE_LEFT_PEOPLE: Person[] = Array.from({ length: 11 }, (_, index) => ({
  id: `group-a-${String(index + 1).padStart(2, '0')}`,
  name: `A${String(index + 1).padStart(2, '0')}`,
}))

const SAMPLE_RIGHT_PEOPLE: Person[] = Array.from({ length: 10 }, (_, index) => ({
  id: `group-b-${String(index + 1).padStart(2, '0')}`,
  name: `B${String(index + 1).padStart(2, '0')}`,
}))

const SAMPLE_MATCH_STAGE_SEEDS = [
  ['group-a-01', 'group-b-01', 'match'],
  ['group-a-02', 'group-b-02', 'exp-match'],
  ['group-a-03', 'group-b-03', 'no-match'],
  ['group-a-04', 'group-b-04', 'derived-match'],
  ['group-a-05', 'group-b-05', 'exp-no-match'],
  ['group-a-06', 'group-b-07', 'no-match'],
  ['group-a-07', 'group-b-08', 'match'],
  ['group-a-08', 'group-b-03', 'exp-match'],
  ['group-a-09', 'group-b-10', 'exp-no-match'],
  ['group-a-10', 'group-b-06', 'match'],
  ['group-a-11', 'group-b-09', 'derived-exp-match'],
  ['group-a-02', 'group-b-07', 'derived-no-match'],
  ['group-a-05', 'group-b-08', 'derived-exp-no-match'],
] as const satisfies ReadonlyArray<readonly [string, string, MatchStage]>

const SAMPLE_MATCHING_NIGHTS: MatchingNight[] = [
  {
    id: 'night-01',
    label: 'Matching Night 1',
    pairKeys: [
      createMatchKey('group-a-01', 'group-b-01'),
      createMatchKey('group-a-02', 'group-b-02'),
      createMatchKey('group-a-03', 'group-b-03'),
      createMatchKey('group-a-04', 'group-b-04'),
      createMatchKey('group-a-05', 'group-b-05'),
    ],
    matches: 2,
    total: 5,
    matchingNight: 1,
  },
  {
    id: 'night-02',
    label: 'Matching Night 2',
    pairKeys: [
      createMatchKey('group-a-06', 'group-b-07'),
      createMatchKey('group-a-07', 'group-b-08'),
      createMatchKey('group-a-08', 'group-b-03'),
      createMatchKey('group-a-09', 'group-b-10'),
      createMatchKey('group-a-10', 'group-b-06'),
      createMatchKey('group-a-11', 'group-b-09'),
    ],
    matches: 3,
    total: 6,
    matchingNight: 2,
  },
]

const SAMPLE_MATCH_BOXES: MatchBox[] = [
  {
    id: 'match-box-01',
    label: 'Match-Box 1',
    pairKey: createMatchKey('group-a-06', 'group-b-07'),
    matchingNight: 1,
  },
  {
    id: 'match-box-02',
    label: 'Match-Box 2',
    pairKey: createMatchKey('group-a-10', 'group-b-06'),
    matchingNight: 2,
  },
]

const SAMPLE_TIMELINE: TimelineEntry[] = [
  { kind: 'match-box', id: 'match-box-01' },
  { kind: 'matching-night', id: 'night-01' },
  { kind: 'match-box', id: 'match-box-02' },
  { kind: 'matching-night', id: 'night-02' },
]

type PairIds = {
  leftId: string
  rightId: string
}

type ParsedSeasonBoard = {
  state: MatchBoardState
  appliedMatchStateCount: number
}

type ParsedPersonRecord = {
  person: Person
  side: Side | null
}

export type Side = 'left' | 'right'

export function createMatchKey(leftId: string, rightId: string): MatchKey {
  return `${leftId}:${rightId}`
}

export function createInitialMatchBoardState(): MatchBoardState {
  const matches = createEmptyMatchMap(SAMPLE_LEFT_PEOPLE, SAMPLE_RIGHT_PEOPLE)

  for (const [leftId, rightId, stage] of SAMPLE_MATCH_STAGE_SEEDS) {
    const key = createMatchKey(leftId, rightId)
    matches[key] = {
      ...matches[key],
      stage,
      derivationText: null,
      derivationPrerequisites: [],
    }
  }

  return {
    leftPeople: clonePeople(SAMPLE_LEFT_PEOPLE),
    rightPeople: clonePeople(SAMPLE_RIGHT_PEOPLE),
    addedToMatch: null,
    matches,
    matchingNights: cloneMatchingNights(SAMPLE_MATCHING_NIGHTS),
    matchBoxes: cloneMatchBoxes(SAMPLE_MATCH_BOXES),
    timeline: cloneTimeline(SAMPLE_TIMELINE),
  }
}

function createEmptyMatchBoardState(): MatchBoardState {
  return {
    leftPeople: [],
    rightPeople: [],
    addedToMatch: null,
    matches: {},
    matchingNights: [],
    matchBoxes: [],
    timeline: [],
  }
}

export function tallyMatchStages(matches: MatchBoardState['matches']) {
  const counts = MATCH_STAGE_ORDER.reduce(
    (accumulator, stage) => ({
      ...accumulator,
      [stage]: 0,
    }),
    {} as Record<MatchStage, number>,
  )

  for (const match of Object.values(matches)) {
    counts[match.stage] += 1
  }

  return counts
}

export function summarizeMatchingNight(
  state: MatchBoardState,
  night: MatchingNight,
) {
  const priorPositiveMatchBoxCount = countPriorPositiveMatchBoxesForNight(
    state,
    night,
  )
  let visiblePositivePairCount = 0
  let undefinedPairCount = 0

  for (const pairKey of new Set(night.pairKeys)) {
    const pair = state.matches[pairKey]

    if (!pair) {
      continue
    }

    if (POSITIVE_MATCH_STAGES.has(pair.stage)) {
      visiblePositivePairCount += 1
      continue
    }

    if (pair.stage === 'undefined') {
      undefinedPairCount += 1
    }
  }

  const positivePairCount =
    priorPositiveMatchBoxCount + visiblePositivePairCount
  const unresolvedOpenMatchCount = Math.max(
    0,
    night.matches - positivePairCount - undefinedPairCount,
  )

  return {
    positivePairCount,
    priorPositiveMatchBoxCount,
    visiblePositivePairCount,
    undefinedPairCount,
    openMatchCount: Math.max(0, night.matches - positivePairCount),
    unresolvedOpenMatchCount,
    hasTooManyOpenMatches: unresolvedOpenMatchCount > 0,
  }
}

export function summarizePersonMatchOptions(
  state: MatchBoardState,
  personId: string,
  side: Side,
) {
  const personPairs = Object.values(state.matches).filter((pair) =>
    side === 'left' ? pair.leftId === personId : pair.rightId === personId,
  )
  const positivePairCount = personPairs.filter((pair) =>
    POSITIVE_MATCH_STAGES.has(pair.stage),
  ).length
  const possiblePairCount = personPairs.filter(
    (pair) => !NEGATIVE_MATCH_STAGES.has(pair.stage),
  ).length
  const requiredMatchCount = getRequiredMatchCount(state, personId, side)
  const matchCapacity = getMatchCapacity(state, personId, side)

  return {
    positivePairCount,
    possiblePairCount,
    requiredMatchCount,
    matchCapacity,
    isAddedToMatchPerson: getAddedToMatchMoves(state).some(move => move.personId === personId),
    isSharedMatchPerson: getAddedToMatchMoves(state).some(move =>
      getAddedToMatchSharedPersonId(state, move) === personId,
    ),
    hasMultiplePositiveMatches: positivePairCount > matchCapacity,
    hasNoPossibleMatches: possiblePairCount < requiredMatchCount,
  }
}

export function getPersonSide(state: MatchBoardState, personId: string): Side | null {
  if (state.leftPeople.some(person => person.id === personId)) return 'left'
  if (state.rightPeople.some(person => person.id === personId)) return 'right'
  return null
}

export function getAddedToMatchMoves(state: MatchBoardState) {
  const moves = new Map<string, AddedToMatchMove>()
  for (const move of [
    ...(state.knownAddedToMatches ?? []),
    ...(state.addedToMatch ? [state.addedToMatch] : []),
  ]) {
    if (!moves.has(move.personId)) moves.set(move.personId, move)
  }
  return [...moves.values()]
}

export function getActivePeople(state: MatchBoardState, side: Side) {
  const resolvedIds = new Set(getAddedToMatchMoves(state).map(move => move.personId))
  const people = side === 'left' ? state.leftPeople : state.rightPeople
  return people.filter(person => !resolvedIds.has(person.id))
}

export function getSmallerSide(state: MatchBoardState): Side | null {
  const difference = getActivePeople(state, 'left').length - getActivePeople(state, 'right').length
  if (Math.abs(difference) !== 1) return null
  return difference < 0 ? 'left' : 'right'
}

export function getLargerSide(state: MatchBoardState): Side | null {
  const smallerSide = getSmallerSide(state)
  return smallerSide === null ? null : smallerSide === 'left' ? 'right' : 'left'
}

function getSmallerSidePeople(state: MatchBoardState) {
  const side = getSmallerSide(state)
  return side ? getActivePeople(state, side) : []
}

export function getLargerSidePeople(state: MatchBoardState) {
  const side = getLargerSide(state)
  return side ? getActivePeople(state, side) : []
}

export function getKnownDoubleMatchOptions(state: MatchBoardState) {
  const baseline = { ...state, addedToMatch: null }
  return getSmallerSide(baseline)
    ? [...getActivePeople(baseline, 'left'), ...getActivePeople(baseline, 'right')]
    : []
}

function isKnownDoubleMatchCompatible(state: MatchBoardState) {
  const personId = state.knownDoubleMatchPersonId
  if (!personId) return true
  if (!getKnownDoubleMatchOptions(state).some(person => person.id === personId)) return false
  const move = state.addedToMatch
  if (!move) return true
  const target = state.matches[move.pairKey]
  return move.personId === personId || target?.leftId === personId || target?.rightId === personId
}

function getKnownDoubleMatchCentre(state: MatchBoardState) {
  const personId = state.knownDoubleMatchPersonId
  if (!personId) return null
  const smallerSide = getSmallerSide(state)
  if (!smallerSide) return null
  if (getPersonSide(state, personId) === smallerSide) return personId
  const possiblePartners = smallerSide === 'left' ? state.leftPeople : state.rightPeople
  for (const partner of possiblePartners) {
    const key = smallerSide === 'left' ? createMatchKey(partner.id, personId) : createMatchKey(personId, partner.id)
    const pair = state.matches[key]
    if (pair && POSITIVE_MATCH_STAGES.has(pair.stage) && isActivePair(state, pair)) return partner.id
  }
  return null
}

export function getAddedPairKey(
  state: MatchBoardState,
  move: AddedToMatchMove | null = state.addedToMatch,
): MatchKey | null {
  if (!move) return null
  const targetPair = state.matches[move.pairKey]
  const side = getPersonSide(state, move.personId)
  if (!targetPair || !side) return null
  const targetPersonId = side === 'left' ? targetPair.leftId : targetPair.rightId
  if (targetPersonId === move.personId) return null
  return side === 'left'
    ? createMatchKey(move.personId, targetPair.rightId)
    : createMatchKey(targetPair.leftId, move.personId)
}

export function getAddedToMatchSharedPersonId(
  state: MatchBoardState,
  move: AddedToMatchMove | null = state.addedToMatch ?? state.knownAddedToMatches?.[0] ?? null,
) {
  if (!move) return null
  const targetPair = state.matches[move.pairKey]
  const side = getPersonSide(state, move.personId)
  if (!targetPair || !side) return null
  return side === 'left' ? targetPair.rightId : targetPair.leftId
}

function isActivePair(state: MatchBoardState, pair: MatchRecord) {
  return !getAddedToMatchMoves(state).some(move =>
    move.personId === pair.leftId || move.personId === pair.rightId,
  )
}

export function getAddToMatchOptions(
  state: MatchBoardState,
  personId: string,
) {
  state = { ...state, addedToMatch: null }
  const largerSide = getLargerSide(state)
  const smallerSide = getSmallerSide(state)

  if (
    !largerSide ||
    !smallerSide ||
    !getLargerSidePeople(state).some((person) => person.id === personId)
  ) {
    return []
  }

  const positivePairs = Object.values(state.matches).filter((pair) =>
    POSITIVE_MATCH_STAGES.has(pair.stage),
  )
  const resolvedSharedPersonId = findDoubleMatchPersonFromPositivePairs(
    state,
    smallerSide,
  )

  return positivePairs.filter((targetPair) => {
    if (!isActivePair(state, targetPair)) return false
    const targetLargerPersonId =
      largerSide === 'left' ? targetPair.leftId : targetPair.rightId

    if (targetLargerPersonId === personId) {
      return false
    }

    const move = { personId, pairKey: targetPair.key }
    const addedPairKey = getAddedPairKey(state, move)
    const addedPair = addedPairKey ? state.matches[addedPairKey] : null
    const sharedPersonId =
      smallerSide === 'left' ? targetPair.leftId : targetPair.rightId

    if (state.knownDoubleMatchPersonId && ![
      personId, targetPair.leftId, targetPair.rightId,
    ].includes(state.knownDoubleMatchPersonId)) return false

    if (
      !addedPair ||
      NEGATIVE_MATCH_STAGES.has(addedPair.stage) ||
      (resolvedSharedPersonId && resolvedSharedPersonId !== sharedPersonId)
    ) {
      return false
    }

    return positivePairs.every((positivePair) => {
      const positivePairLargerPersonId =
        largerSide === 'left' ? positivePair.leftId : positivePair.rightId

      return (
        positivePairLargerPersonId !== personId ||
        positivePair.key === addedPairKey
      )
    })
  })
}

function normalizeAddedToMatch(
  state: MatchBoardState,
  move: AddedToMatchMove | null,
) {
  if (!move) {
    return null
  }

  return getAddToMatchOptions(state, move.personId).some(
    (targetPair) => targetPair.key === move.pairKey,
  )
    ? { ...move }
    : null
}

function getBaseRequiredMatchCount(
  state: MatchBoardState,
  personId: string,
  side: Side,
) {
  return 1 + getAddedToMatchMoves(state).filter(move =>
    getPersonSide(state, move.personId) !== side && getAddedToMatchSharedPersonId(state, move) === personId,
  ).length
}

function getRequiredMatchCount(state: MatchBoardState, personId: string, side: Side) {
  const base = getBaseRequiredMatchCount(state, personId, side)
  if (!state.knownDoubleMatchPersonId) return base
  return base + (getKnownDoubleMatchCentre(state) === personId ? 1 : 0)
}

function getMatchCapacity(state: MatchBoardState, personId: string, side: Side) {
  if (getAddedToMatchMoves(state).some(move => move.personId === personId)) return 1
  const baseCapacity = getBaseRequiredMatchCount(state, personId, side)
  if (getSmallerSide(state) !== side) return baseCapacity
  const doublePersonId = findDoubleMatchPersonFromPositivePairs(state, side)
  return baseCapacity + (!doublePersonId || doublePersonId === personId ? 1 : 0)
}

function findDoubleMatchPersonFromPositivePairs(state: MatchBoardState, side: Side) {
  const knownCentre = getKnownDoubleMatchCentre(state)
  if (knownCentre && getPersonSide(state, knownCentre) === side) return knownCentre
  const counts = new Map<string, number>()
  for (const pair of Object.values(state.matches)) {
    if (!POSITIVE_MATCH_STAGES.has(pair.stage) || !isActivePair(state, pair)) continue
    const id = side === 'left' ? pair.leftId : pair.rightId
    const count = (counts.get(id) ?? 0) + 1
    counts.set(id, count)
    if (count >= 2) return id
  }
  return null
}

function getFactsOnlyState(state: MatchBoardState): MatchBoardState {
  return {
    ...state,
    addedToMatch: null,
    matches: Object.fromEntries(Object.entries(state.matches).map(([key, pair]) => [
      key,
      EXPECTED_MATCH_STAGES.has(pair.stage) ? { ...pair, stage: 'undefined' } : pair,
    ])) as MatchBoardState['matches'],
  }
}

export function getSeasonDegreeOptions(state: MatchBoardState) {
  const leftSize = getActivePeople(state, 'left').length
  const rightSize = getActivePeople(state, 'right').length
  if (Math.abs(leftSize - rightSize) > 1 || !isKnownDoubleMatchCompatible(state)) return []
  const smallerSide = getSmallerSide(state)
  const knownId = state.knownDoubleMatchPersonId
  const knownSide = knownId ? getPersonSide(state, knownId) : null
  const candidates = smallerSide
    ? knownId && knownSide === smallerSide ? [knownId] : getSmallerSidePeople(state).map(person => person.id)
    : [null]
  return candidates.map(doublePersonId => ({
    left: new Map(state.leftPeople.map(person => [person.id,
      getBaseRequiredMatchCount(state, person.id, 'left') + (person.id === doublePersonId ? 1 : 0),
    ])),
    right: new Map(state.rightPeople.map(person => [person.id,
      getBaseRequiredMatchCount(state, person.id, 'right') + (person.id === doublePersonId ? 1 : 0),
    ])),
    requiredPairKeys: knownId && doublePersonId && knownSide !== smallerSide
      ? [smallerSide === 'left' ? createMatchKey(doublePersonId, knownId) : createMatchKey(knownId, doublePersonId)]
      : [],
  }))
}

export function isMatchBoardStatePossible(state: MatchBoardState) {
  if (Math.abs(getActivePeople(state, 'left').length - getActivePeople(state, 'right').length) > 1) {
    return false
  }

  if (!areMatchingNightCountsPossible(state)) {
    return false
  }

  return canCompleteSeasonMatching(state)
}

export type MatchBoardContradiction = {
  id: string
  message: string
  pairKeys: MatchKey[]
}

export function getMatchBoardContradictions(state: MatchBoardState): MatchBoardContradiction[] {
  const contradictions: MatchBoardContradiction[] = []
  if (!isKnownDoubleMatchCompatible(state)) {
    contradictions.push({ id: 'known-double-match', pairKeys: [],
      message: 'The known double-match participant must belong to the uneven active groups and be included in the selected shared match.',
    })
  }
  const leftSize = getActivePeople(state, 'left').length
  const rightSize = getActivePeople(state, 'right').length
  if (Math.abs(leftSize - rightSize) > 1) {
    contradictions.push({ id: 'active-roster', pairKeys: [],
      message: `The active groups have ${leftSize} women and ${rightSize} men. Their difference is larger than the supported extra-partner slot.`,
    })
  }
  for (const night of state.matchingNights) {
    const pairs = getMatchingNightPairs(state, night)
    const positives = pairs.filter(pair => POSITIVE_MATCH_STAGES.has(pair.stage))
    const possibles = pairs.filter(pair => !NEGATIVE_MATCH_STAGES.has(pair.stage))
    let message: string | null = null
    if (!Number.isInteger(night.matches) || night.matches < 0) {
      message = `${formatMatchingNightName(night)} has an invalid match total.`
    } else if (positives.length > night.matches) {
      message = `${formatMatchingNightName(night)} has ${positives.length} positive pairs but only ${night.matches} reported matches.`
    } else if (possibles.length < night.matches) {
      message = `${formatMatchingNightName(night)} needs ${night.matches} matches, but only ${possibles.length} pairs remain possible.`
    }
    if (message) contradictions.push({ id: night.id, message, pairKeys: pairs.map(pair => pair.key) })
  }
  for (const side of ['left', 'right'] as const) {
    const people = side === 'left' ? state.leftPeople : state.rightPeople
    for (const person of people) {
      const summary = summarizePersonMatchOptions(state, person.id, side)
      let message: string | null = null
      if (summary.hasMultiplePositiveMatches) {
        message = `${person.name ?? person.id} has ${summary.positivePairCount} positive partners but can have at most ${summary.matchCapacity}.`
      } else if (summary.hasNoPossibleMatches) {
        message = `${person.name ?? person.id} needs ${summary.requiredMatchCount} partner(s), but only ${summary.possiblePairCount} remain possible.`
      }
      if (message) contradictions.push({ id: `person-${person.id}`, message,
        pairKeys: Object.values(state.matches).filter(pair => side === 'left' ? pair.leftId === person.id : pair.rightId === person.id).map(pair => pair.key),
      })
    }
  }
  for (const move of getAddedToMatchMoves(state)) {
    const addedKey = getAddedPairKey(state, move)
    if (!addedKey || !state.matches[addedKey] || NEGATIVE_MATCH_STAGES.has(state.matches[addedKey].stage) ||
      NEGATIVE_MATCH_STAGES.has(state.matches[move.pairKey]?.stage)) {
      contradictions.push({ id: `shared-${move.personId}`, pairKeys: addedKey ? [move.pairKey, addedKey] : [move.pairKey],
        message: `The shared match for ${formatPersonName(state, move.personId, getPersonSide(state, move.personId) ?? 'left')} conflicts with a no-match or a missing contestant.`,
      })
    }
  }
  if (contradictions.length === 0 && !canCompleteSeasonMatching(state)) {
    contradictions.push({ id: 'assignment', pairKeys: [],
      message: 'The remaining pairings cannot give every contestant their required partners. Revert an expected decision to resolve the conflict.',
    })
  }
  return contradictions
}

export function getDisplayPairKeys(state: MatchBoardState) {
  const keys = new Set<MatchKey>()

  for (const night of state.matchingNights) {
    for (const pairKey of night.pairKeys) {
      keys.add(pairKey)
    }
  }

  for (const matchBox of state.matchBoxes) {
    keys.add(matchBox.pairKey)
  }

  return [...keys]
}

export function findFirstPairKey(state: MatchBoardState) {
  const [visiblePair] = getDisplayPairKeys(state)

  if (visiblePair) {
    return visiblePair
  }

  const [fallbackPair] = Object.keys(state.matches)
  return (fallbackPair as MatchKey | undefined) ?? null
}

function deriveMatchBoardState(state: MatchBoardState) {
  const { matches } = runDerivationPasses(state)

  return {
    ...state,
    matches,
  }
}

// These local rules reach a fixed point before the trial-assumption pass runs.
const BASIC_DERIVATION_RULES = [
  applyAddedToMatchDerivations,
  applyMatchingNightDerivations,
  applyPositivePairExclusions,
  applySingleRemainingPairDerivations,
] as const

export function deriveBasicMatchBoardState(state: MatchBoardState) {
  return {
    ...state,
    matches: runDerivationPasses(state, false, false).matches,
  }
}

function runDerivationPasses(
  state: MatchBoardState,
  collectSteps = false,
  includePossibilityDerivations = true,
): {
  matches: MatchBoardState['matches']
  derivationSteps: MatchDerivationStep[]
} {
  const matches = cloneMatches(state.matches)
  const derivationSteps: MatchDerivationStep[] = []

  while (true) {
    let changed = false

    for (const applyRule of BASIC_DERIVATION_RULES) {
      const currentState = { ...state, matches }

      // Conflicting inputs are a contradiction, not a reason to flip outcomes.
      if (!areBasicCountsPossible(currentState)) {
        return { matches, derivationSteps }
      }

      changed = applyRule(
        currentState,
        matches,
        derivationSteps,
        collectSteps,
      ) || changed
    }

    if (!changed && includePossibilityDerivations) {
      changed = applyStatePossibilityDerivations(
        { ...state, matches },
        matches,
        derivationSteps,
        collectSteps,
      )
    }

    if (!changed) {
      return { matches, derivationSteps }
    }
  }
}

function areBasicCountsPossible(state: MatchBoardState) {
  if (
    !isKnownDoubleMatchCompatible(state) ||
    Math.abs(getActivePeople(state, 'left').length - getActivePeople(state, 'right').length) > 1 ||
    !areMatchingNightCountsPossible(state)
  ) {
    return false
  }

  for (const side of ['left', 'right'] as const) {
    const people = side === 'left' ? state.leftPeople : state.rightPeople

    for (const person of people) {
      const options = summarizePersonMatchOptions(state, person.id, side)

      if (options.hasMultiplePositiveMatches || options.hasNoPossibleMatches) {
        return false
      }
    }
  }

  return true
}

function applyAddedToMatchDerivations(
  state: MatchBoardState,
  matches: MatchBoardState['matches'],
  derivationSteps: MatchDerivationStep[],
  collectSteps: boolean,
) {
  let changed = false
  for (const move of getAddedToMatchMoves(state)) {
    const known = (state.knownAddedToMatches ?? []).some(item =>
      item.personId === move.personId && item.pairKey === move.pairKey,
    )
    const currentState = { ...state, matches }
    let targetPair = matches[move.pairKey]
    const addedKey = getAddedPairKey(currentState, move)
    if (!targetPair || !addedKey || !matches[addedKey]) continue

    if (known) {
      changed = updateDerivedStage(matches, targetPair.key, 'derived-match', {
        reason: 'added-to-match-positive', sourceMatchingNightId: null,
        addedPersonId: move.personId,
      }, derivationSteps, collectSteps, currentState) || changed
      targetPair = matches[move.pairKey]
    }
    if (!POSITIVE_MATCH_STAGES.has(targetPair.stage)) continue

    changed = updateDerivedStage(matches, addedKey, known ? 'derived-match' : 'derived-exp-match', {
      reason: 'added-to-match-positive', sourceMatchingNightId: null,
      blockingPairKey: targetPair.key, addedPersonId: move.personId,
    }, derivationSteps, collectSteps, currentState) || changed

    const side = getPersonSide(currentState, move.personId)
    for (const pair of Object.values(matches)) {
      const belongs = side === 'left' ? pair.leftId === move.personId : pair.rightId === move.personId
      if (!belongs || pair.key === addedKey) continue
      changed = updateDerivedStage(matches, pair.key, known ? 'derived-no-match' : 'derived-exp-no-match', {
        reason: 'added-to-match-exclusion', sourceMatchingNightId: null,
        blockingPairKey: addedKey, requiredPersonId: move.personId,
        requiredPersonSide: side ?? undefined, dependsOnAddedToMatch: !known,
      }, derivationSteps, collectSteps, currentState) || changed
    }
  }
  return changed
}

function applyMatchingNightDerivations(
  state: MatchBoardState,
  matches: MatchBoardState['matches'],
  derivationSteps: MatchDerivationStep[],
  collectSteps: boolean,
) {
  let changed = false

  for (const night of state.matchingNights) {
    const nightPairs = getMatchingNightPairs({ ...state, matches }, night)
    const deductions = getMatchCountDeductions(nightPairs, {
      required: night.matches,
      capacity: night.matches,
    })

    for (const deduction of deductions) {
      changed = updateDerivedStage(
        matches,
        deduction.pairKey,
        deduction.stage,
        {
          reason: deduction.reason === 'required-matches'
            ? 'matching-night-clear-match'
            : 'matching-night-clear-no-match',
          sourceMatchingNightId: night.id,
          blockingPairKeys: deduction.supportingPairKeys,
        },
        derivationSteps,
        collectSteps,
        state,
      ) || changed
    }
  }

  return changed
}

function applyPositivePairExclusions(
  state: MatchBoardState,
  matches: MatchBoardState['matches'],
  derivationSteps: MatchDerivationStep[],
  collectSteps: boolean,
) {
  let changed = false
  const currentState = {
    ...state,
    matches,
  }
  const pairsBySide = indexPairsByPerson(matches)
  const factsState = getFactsOnlyState(currentState)

  for (const side of ['left', 'right'] as const) {
    for (const [personId, personPairs] of pairsBySide[side]) {
      const positivePairs = personPairs.filter((pair) =>
        POSITIVE_MATCH_STAGES.has(pair.stage),
      )

      if (positivePairs.length === 0) {
        continue
      }

      const matchCapacity = getMatchCapacity(currentState, personId, side)

      if (positivePairs.length < matchCapacity) {
        continue
      }

      const capacityDependsOnExpectedState = matchCapacity < getMatchCapacity(factsState, personId, side)
      const dependsOnAddedToMatch = capacityDependsOnExpectedState && Boolean(currentState.addedToMatch)
      const resolvedDoubleMatchPersonId = getSmallerSide(currentState) === side
        ? findDoubleMatchPersonFromPositivePairs(currentState, side) : null
      const resolvedDoubleMatchPairs = resolvedDoubleMatchPersonId && resolvedDoubleMatchPersonId !== personId
        ? (pairsBySide[side].get(resolvedDoubleMatchPersonId) ?? []).filter(pair =>
            POSITIVE_MATCH_STAGES.has(pair.stage) && isActivePair(currentState, pair),
          ) : []
      const deductions = getMatchCountDeductions(personPairs, {
        required: 0,
        capacity: matchCapacity,
        dependsOnExpectedState: capacityDependsOnExpectedState,
      }).filter(deduction => deduction.reason === 'match-capacity')

      for (const deduction of deductions) {
        const blockingPairKeys = [
          ...deduction.supportingPairKeys,
          ...resolvedDoubleMatchPairs.map(pair => pair.key),
        ]

        changed = updateDerivedStage(
          matches,
          deduction.pairKey,
          deduction.stage,
          {
            reason: 'positive-pair-exclusion',
            sourceMatchingNightId: null,
            blockingPairKey: blockingPairKeys[0],
            blockingPairKeys,
            requiredPersonId: personId,
            requiredPersonSide: side,
            dependsOnAddedToMatch,
            resolvedDoubleMatchPersonId:
              resolvedDoubleMatchPersonId ?? undefined,
          },
          derivationSteps,
          collectSteps,
          currentState,
        ) || changed
      }
    }
  }

  return changed
}

function applySingleRemainingPairDerivations(
  state: MatchBoardState,
  matches: MatchBoardState['matches'],
  derivationSteps: MatchDerivationStep[],
  collectSteps: boolean,
) {
  let changed = false
  const currentState = { ...state, matches }
  const factsState = getFactsOnlyState(currentState)
  const pairsBySide = indexPairsByPerson(matches)

  for (const side of ['left', 'right'] as const) {
    const people = side === 'left' ? state.leftPeople : state.rightPeople

    for (const person of people) {
      changed =
        applySingleRemainingPairForPerson(
          person.id,
          side,
          currentState,
          factsState,
          pairsBySide[side].get(person.id) ?? [],
          derivationSteps,
          collectSteps,
        ) || changed
    }
  }

  return changed
}

function applyStatePossibilityDerivations(
  state: MatchBoardState,
  matches: MatchBoardState['matches'],
  derivationSteps: MatchDerivationStep[],
  collectSteps: boolean,
) {
  const currentState = {
    ...state,
    matches,
  }

  if (!isMatchBoardStatePossible(currentState)) {
    return false
  }

  for (const pair of Object.values(matches)) {
    if (pair.stage !== 'undefined') {
      continue
    }

    const positiveState = deriveHypotheticalState(currentState, pair.key, 'exp-match')
    const negativeState = deriveHypotheticalState(
      currentState,
      pair.key,
      'exp-no-match',
    )
    const canBePositive = isMatchBoardStatePossible(positiveState.state)
    const canBeNegative = isMatchBoardStatePossible(negativeState.state)

    if (!canBePositive && canBeNegative) {
      const nextStage = getPossibilityExclusionStage(currentState, 'negative')

      return updateDerivedStage(
        matches,
        pair.key,
        nextStage,
        {
          reason: 'state-possibility-exclusion',
          sourceMatchingNightId: null,
          oppositeAssumption: {
            stage: 'exp-match',
            result: positiveState,
          },
        },
        derivationSteps,
        collectSteps,
        currentState,
      )
    }

    if (canBePositive && !canBeNegative) {
      const nextStage = getPossibilityExclusionStage(currentState, 'positive')

      return updateDerivedStage(
        matches,
        pair.key,
        nextStage,
        {
          reason: 'state-possibility-exclusion',
          sourceMatchingNightId: null,
          oppositeAssumption: {
            stage: 'exp-no-match',
            result: negativeState,
          },
        },
        derivationSteps,
        collectSteps,
        currentState,
      )
    }
  }

  return false
}

function getPossibilityExclusionStage(
  state: MatchBoardState,
  outcome: 'positive' | 'negative',
): DerivedMatchStage {
  const hasExpectedState =
    Boolean(state.addedToMatch) ||
    Object.values(state.matches).some((pair) =>
      EXPECTED_MATCH_STAGES.has(pair.stage),
    )

  if (outcome === 'positive') {
    return hasExpectedState ? 'derived-exp-match' : 'derived-match'
  }

  return hasExpectedState ? 'derived-exp-no-match' : 'derived-no-match'
}

function deriveHypotheticalState(
  state: MatchBoardState,
  pairKey: MatchKey,
  stage: 'exp-match' | 'exp-no-match',
): HypotheticalDerivationResult {
  const pair = state.matches[pairKey]

  if (!pair) {
    return {
      state,
      derivationSteps: [],
    }
  }

  const assumedState = {
    ...state,
    matches: {
      ...state.matches,
      [pairKey]: {
        ...pair,
        stage,
      },
    },
  }
  const derivationResult = runDerivationPasses(assumedState, true, false)

  return {
    state: {
      ...assumedState,
      matches: derivationResult.matches,
    },
    derivationSteps: derivationResult.derivationSteps,
  }
}

function applySingleRemainingPairForPerson(
  personId: string,
  side: Side,
  state: MatchBoardState,
  factsState: MatchBoardState,
  personPairs: MatchRecord[],
  derivationSteps: MatchDerivationStep[],
  collectSteps: boolean,
) {
  const { matches } = state
  const requiredMatchCount = getRequiredMatchCount(state, personId, side)
  const dependsOnAddedToMatch = requiredMatchCount > getRequiredMatchCount({ ...state, addedToMatch: null }, personId, side)
  const dependsOnExpectedState = requiredMatchCount > getRequiredMatchCount(factsState, personId, side)
  const deductions = getMatchCountDeductions(personPairs, {
    required: requiredMatchCount,
    capacity: personPairs.length,
    dependsOnExpectedState,
  }).filter(deduction => deduction.reason === 'required-matches')
  let changed = false

  for (const deduction of deductions) {
    changed = updateDerivedStage(
      matches,
      deduction.pairKey,
      deduction.stage,
      {
        reason: 'single-remaining-pair',
        sourceMatchingNightId: null,
        blockingPairKeys: deduction.supportingPairKeys,
        requiredPersonId: personId,
        requiredPersonSide: side,
        requiredMatchCount,
        dependsOnAddedToMatch,
      },
      derivationSteps,
      collectSteps,
      state,
    ) || changed
  }

  return changed
}

function indexPairsByPerson(matches: MatchBoardState['matches']) {
  const pairsBySide = {
    left: new Map<string, MatchRecord[]>(),
    right: new Map<string, MatchRecord[]>(),
  }

  for (const pair of Object.values(matches)) {
    const leftPairs = pairsBySide.left.get(pair.leftId) ?? []
    const rightPairs = pairsBySide.right.get(pair.rightId) ?? []

    leftPairs.push(pair)
    rightPairs.push(pair)
    pairsBySide.left.set(pair.leftId, leftPairs)
    pairsBySide.right.set(pair.rightId, rightPairs)
  }

  return pairsBySide
}

function areMatchingNightCountsPossible(state: MatchBoardState) {
  for (const night of state.matchingNights) {
    const nightPairs = getMatchingNightPairs(state, night)
    const positivePairCount = nightPairs.filter(pair =>
      POSITIVE_MATCH_STAGES.has(pair.stage),
    ).length
    const possiblePairCount = nightPairs.filter(pair =>
      !NEGATIVE_MATCH_STAGES.has(pair.stage),
    ).length

    if (
      !Number.isInteger(night.matches) ||
      night.matches < 0 ||
      positivePairCount > night.matches ||
      possiblePairCount < night.matches
    ) {
      return false
    }
  }

  return true
}

export function getMatchingNightPairs(state: MatchBoardState, night: MatchingNight) {
  const pairKeys = new Set(night.pairKeys)

  for (const matchBox of state.matchBoxes) {
    const pair = state.matches[matchBox.pairKey]

    if (
      pair &&
      isMatchBoxKnownByMatchingNight(matchBox, night) &&
      pair.stage === 'match'
    ) {
      pairKeys.add(pair.key)
    }
  }

  return getExistingPairs(state.matches, [...pairKeys])
}

function countPriorPositiveMatchBoxesForNight(
  state: MatchBoardState,
  night: MatchingNight,
) {
  const visiblePairKeys = new Set(night.pairKeys)
  return getMatchingNightPairs(state, night).filter(pair =>
    !visiblePairKeys.has(pair.key),
  ).length
}

function canCompleteSeasonMatching(state: MatchBoardState) {
  if (state.addedToMatch && !normalizeAddedToMatch(state, state.addedToMatch)) return false
  for (const move of getAddedToMatchMoves(state)) {
    const addedKey = getAddedPairKey(state, move)
    if (!addedKey || !state.matches[addedKey] || NEGATIVE_MATCH_STAGES.has(state.matches[addedKey].stage) ||
      NEGATIVE_MATCH_STAGES.has(state.matches[move.pairKey]?.stage)) return false
  }
  return getSeasonDegreeOptions(state).some(degrees => canCompleteMatchingWithDegrees(state, degrees))
}

function canCompleteMatchingWithDegrees(
  state: MatchBoardState,
  degrees: ReturnType<typeof getSeasonDegreeOptions>[number],
) {
  if (degrees.requiredPairKeys.length > 0) {
    state = { ...state, matches: { ...state.matches } }
    for (const key of degrees.requiredPairKeys) {
      const pair = state.matches[key]
      if (!pair || NEGATIVE_MATCH_STAGES.has(pair.stage)) return false
      state.matches[key] = { ...pair, stage: 'match' }
    }
  }
  const leftRequiredDegrees = degrees.left
  const rightRequiredDegrees = degrees.right
  const leftRemainingDegrees = new Map(leftRequiredDegrees)
  const rightRemainingDegrees = new Map(rightRequiredDegrees)

  for (const pair of Object.values(state.matches)) {
    if (!POSITIVE_MATCH_STAGES.has(pair.stage)) {
      continue
    }

    const leftRemainingDegree = leftRemainingDegrees.get(pair.leftId)
    const rightRemainingDegree = rightRemainingDegrees.get(pair.rightId)

    if (
      leftRemainingDegree === undefined ||
      rightRemainingDegree === undefined ||
      leftRemainingDegree <= 0 ||
      rightRemainingDegree <= 0
    ) {
      return false
    }

    leftRemainingDegrees.set(pair.leftId, leftRemainingDegree - 1)
    rightRemainingDegrees.set(pair.rightId, rightRemainingDegree - 1)
  }

  const remainingLeftMatchCount = sumMapValues(leftRemainingDegrees)
  const remainingRightMatchCount = sumMapValues(rightRemainingDegrees)

  if (remainingLeftMatchCount !== remainingRightMatchCount) {
    return false
  }

  if (remainingLeftMatchCount === 0) {
    return true
  }

  return getMaximumRemainingMatchCount(
    state,
    leftRemainingDegrees,
    rightRemainingDegrees,
  ) === remainingLeftMatchCount
}

function sumMapValues(values: Map<string, number>) {
  let total = 0

  for (const value of values.values()) {
    total += value
  }

  return total
}

function getMaximumRemainingMatchCount(
  state: MatchBoardState,
  leftRemainingDegrees: Map<string, number>,
  rightRemainingDegrees: Map<string, number>,
) {
  const sourceNode = '__source__'
  const sinkNode = '__sink__'
  const residualCapacity = new Map<string, Map<string, number>>()

  function addEdge(fromNode: string, toNode: string, capacity: number) {
    if (capacity <= 0) {
      return
    }

    const fromEdges = residualCapacity.get(fromNode) ?? new Map<string, number>()
    const toEdges = residualCapacity.get(toNode) ?? new Map<string, number>()

    fromEdges.set(toNode, (fromEdges.get(toNode) ?? 0) + capacity)
    toEdges.set(fromNode, toEdges.get(fromNode) ?? 0)
    residualCapacity.set(fromNode, fromEdges)
    residualCapacity.set(toNode, toEdges)
  }

  for (const [personId, remainingDegree] of leftRemainingDegrees) {
    addEdge(sourceNode, `left:${personId}`, remainingDegree)
  }

  for (const pair of Object.values(state.matches)) {
    if (
      POSITIVE_MATCH_STAGES.has(pair.stage) ||
      NEGATIVE_MATCH_STAGES.has(pair.stage)
    ) {
      continue
    }

    addEdge(`left:${pair.leftId}`, `right:${pair.rightId}`, 1)
  }

  for (const [personId, remainingDegree] of rightRemainingDegrees) {
    addEdge(`right:${personId}`, sinkNode, remainingDegree)
  }

  let maximumFlow = 0

  while (true) {
    const parentByNode = new Map<string, string | null>([[sourceNode, null]])
    const queue = [sourceNode]

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const fromNode = queue[queueIndex]

      for (const [toNode, capacity] of residualCapacity.get(fromNode) ?? []) {
        if (capacity <= 0 || parentByNode.has(toNode)) {
          continue
        }

        parentByNode.set(toNode, fromNode)
        queue.push(toNode)

        if (toNode === sinkNode) {
          break
        }
      }

      if (parentByNode.has(sinkNode)) {
        break
      }
    }

    if (!parentByNode.has(sinkNode)) {
      return maximumFlow
    }

    let pathCapacity = Number.POSITIVE_INFINITY
    let currentNode = sinkNode

    while (currentNode !== sourceNode) {
      const parentNode = parentByNode.get(currentNode)

      if (!parentNode) {
        return maximumFlow
      }

      pathCapacity = Math.min(
        pathCapacity,
        residualCapacity.get(parentNode)?.get(currentNode) ?? 0,
      )
      currentNode = parentNode
    }

    currentNode = sinkNode

    while (currentNode !== sourceNode) {
      const parentNode = parentByNode.get(currentNode)

      if (!parentNode) {
        return maximumFlow
      }

      const parentEdges = residualCapacity.get(parentNode)
      const currentEdges = residualCapacity.get(currentNode)

      if (!parentEdges || !currentEdges) {
        return maximumFlow
      }

      parentEdges.set(
        currentNode,
        (parentEdges.get(currentNode) ?? 0) - pathCapacity,
      )
      currentEdges.set(
        parentNode,
        (currentEdges.get(parentNode) ?? 0) + pathCapacity,
      )
      currentNode = parentNode
    }

    maximumFlow += pathCapacity
  }
}

function updateDerivedStage(
  matches: MatchBoardState['matches'],
  pairKey: MatchKey,
  nextStage: DerivedMatchStage,
  stepMeta: DerivationTextMeta,
  derivationSteps: MatchDerivationStep[],
  collectSteps: boolean,
  state?: MatchBoardState,
) {
  const pair = matches[pairKey]

  if (
    !pair ||
    pair.stage === nextStage ||
    isDirectMatchStage(pair.stage) ||
    isExplicitExpectedMatchStage(pair.stage)
  ) {
    return false
  }

  if (pair.stage !== 'undefined' && !haveSameMatchOutcome(pair.stage, nextStage)) {
    return false
  }

  if (
    haveSameMatchOutcome(pair.stage, nextStage) &&
    getStageCertaintyRank(pair.stage) >= getStageCertaintyRank(nextStage)
  ) {
    return false
  }

  const derivationText = createDerivationText(pair, nextStage, stepMeta, {
    state,
    matches,
  })
  const derivationPrerequisites = createDerivationPrerequisites(
    pair,
    nextStage,
    stepMeta,
    {
      state,
      matches,
    },
  )

  matches[pairKey] = {
    ...pair,
    stage: nextStage,
    derivationText,
    derivationPrerequisites,
  }

  if (collectSteps) {
    derivationSteps.push({
      pairKey,
      stage: nextStage,
      reason: stepMeta.reason,
      sourceMatchingNightId: stepMeta.sourceMatchingNightId,
      derivationText,
      derivationPrerequisites,
    })
  }

  return true
}

function createDerivationText(
  pair: MatchRecord,
  nextStage: DerivedMatchStage,
  stepMeta: DerivationTextMeta,
  context: {
    state?: MatchBoardState
    matches: MatchBoardState['matches']
  },
) {
  const outcomeText = isPositiveMatchStage(nextStage)
    ? 'a match'
    : 'not a match'
  const currentState = context.state
    ? {
        ...context.state,
        matches: context.matches,
      }
    : null

  switch (stepMeta.reason) {
    case 'added-to-match-positive': {
      const targetPair =
        stepMeta.blockingPairKey && context.matches[stepMeta.blockingPairKey]

      if (!currentState || !targetPair) {
        return `This pair was derived as ${outcomeText} because the extra contestant was added to an existing match.`
      }

      return `This pair was derived as ${outcomeText} because ${formatPersonName(
        currentState,
        stepMeta.addedPersonId ?? currentState.addedToMatch?.personId ?? '',
        getPersonSide(currentState, stepMeta.addedPersonId ?? '') ?? 'left',
      )} was added to ${formatPair(currentState, targetPair)}.`
    }
    case 'added-to-match-exclusion': {
      const addedPair =
        stepMeta.blockingPairKey && context.matches[stepMeta.blockingPairKey]

      if (!currentState || !addedPair) {
        return `This pair was derived as ${outcomeText} because the added contestant shares the partner from one match and cannot match anyone else.`
      }

      return `This pair was derived as ${outcomeText} because the added contestant joins ${formatPair(
        currentState,
        addedPair,
      )}; every other pairing for that contestant is a no-match.`
    }
    case 'matching-night-clear-match': {
      const night = currentState
        ? getMatchingNightById(currentState, stepMeta.sourceMatchingNightId)
        : null

      if (!night || !currentState) {
        return `This pair was derived as ${outcomeText} because the remaining undefined pairs exactly fill the still-open match count.`
      }

      const nightPairs = getMatchingNightPairs(currentState, night)
      const expected = EXPECTED_MATCH_STAGES.has(nextStage)
      const possiblePairs = nightPairs.filter(nightPair => expected
        ? !NEGATIVE_MATCH_STAGES.has(nightPair.stage)
        : !isConfirmedNegativeStage(nightPair.stage),
      )
      const negativePairs = getExistingPairs(
        context.matches,
        stepMeta.blockingPairKeys ?? [],
      )
      const exclusionText = negativePairs.length > 0
        ? ` The ruled-out pairs are ${formatPairList(currentState, negativePairs)}.`
        : ''

      return `This pair was derived as ${outcomeText} because ${formatMatchingNightName(
        night,
      )} needs ${night.matches} matches and only ${possiblePairs.length} pairs remain possible: ${formatPairList(
        currentState,
        possiblePairs,
      )}.${exclusionText} Every remaining possible pair must therefore be a match.`
    }
    case 'matching-night-clear-no-match': {
      const night = currentState
        ? getMatchingNightById(currentState, stepMeta.sourceMatchingNightId)
        : null

      if (!night || !currentState) {
        return `This pair was derived as ${outcomeText} because the known positive pairs already account for every match in that matching night.`
      }

      const positivePairs = getExistingPairs(
        context.matches,
        stepMeta.blockingPairKeys ?? [],
      )

      return `This pair was derived as ${outcomeText} because in ${formatMatchingNightName(
        night,
      )} these ${positivePairs.length} positive pairs already account for all ${night.matches} matches: ${formatPairList(
        currentState,
        positivePairs,
      )}. Every other pair in that night must therefore be a no-match.`
    }
    case 'positive-pair-exclusion': {
      const blockingPairs = (
        stepMeta.blockingPairKeys ??
        (stepMeta.blockingPairKey ? [stepMeta.blockingPairKey] : [])
      )
        .map((pairKey) => context.matches[pairKey])
        .filter((blockingPair): blockingPair is MatchRecord => Boolean(blockingPair))

      if (blockingPairs.length === 0 || !currentState) {
        return `This pair was derived as ${outcomeText} because one candidate has already reached their allowed number of positive matches.`
      }

      const personSide = stepMeta.requiredPersonSide ??
        (blockingPairs[0].leftId === pair.leftId ? 'left' : 'right')
      const personId = stepMeta.requiredPersonId ??
        (personSide === 'left' ? pair.leftId : pair.rightId)
      const matchCapacity = getMatchCapacity(currentState, personId, personSide)
      const personPositivePairs = blockingPairs.filter((blockingPair) =>
        personSide === 'left'
          ? blockingPair.leftId === personId
          : blockingPair.rightId === personId,
      )
      const addedToMatchTarget = currentState.addedToMatch
        ? context.matches[currentState.addedToMatch.pairKey]
        : null
      const addedToMatchContext =
        stepMeta.dependsOnAddedToMatch && addedToMatchTarget
          ? ` the extra contestant is added to ${formatPair(
              currentState,
              addedToMatchTarget,
            )}, which fills the shared match slot, so`
          : ''
      const resolvedDoubleMatchContext = stepMeta.resolvedDoubleMatchPersonId
        ? ` ${formatPersonName(
            currentState,
            stepMeta.resolvedDoubleMatchPersonId,
            personSide,
          )} ${currentState.knownDoubleMatchPersonId
            ? 'occupies the double-match slot'
            : 'already has both matches and therefore fills the shared-match slot'}, so`
        : ''

      return `This pair was derived as ${outcomeText} because${addedToMatchContext}${resolvedDoubleMatchContext} ${formatPersonName(
        currentState,
        personId,
        personSide,
      )} already has ${matchCapacity === 1 ? 'their match' : 'both matches'}: ${formatPairList(
        currentState,
        personPositivePairs,
      )}.`
    }
    case 'single-remaining-pair': {
      if (!currentState || !stepMeta.requiredPersonId || !stepMeta.requiredPersonSide) {
        return `This pair was derived as ${outcomeText} because one candidate still needs a match and has no other possible pair left.`
      }

      const requiredMatchCount = stepMeta.requiredMatchCount ?? 1
      const negativePairs = getExistingPairs(
        context.matches,
        stepMeta.blockingPairKeys ?? [],
      )
      const negativePairKeys = new Set(negativePairs.map(negativePair => negativePair.key))
      const possiblePairs = Object.values(context.matches).filter(candidatePair =>
        !negativePairKeys.has(candidatePair.key) &&
        (stepMeta.requiredPersonSide === 'left'
          ? candidatePair.leftId === stepMeta.requiredPersonId
          : candidatePair.rightId === stepMeta.requiredPersonId),
      )
      const exclusionText = negativePairs.length > 0
        ? ` Every other pairing is ruled out: ${formatPairList(currentState, negativePairs)}.`
        : ''

      return `This pair was derived as ${outcomeText} because ${formatPersonName(
        currentState,
        stepMeta.requiredPersonId,
        stepMeta.requiredPersonSide,
      )} needs ${requiredMatchCount === 1 ? 'one match' : `${requiredMatchCount} matches, including their shared match`}, and only ${possiblePairs.length} possible partner(s) remain: ${formatPairList(
        currentState,
        possiblePairs,
      )}.${exclusionText}`
    }
    case 'state-possibility-exclusion':
      if (!currentState || !stepMeta.oppositeAssumption) {
        return `This pair was derived as ${outcomeText} because assuming the opposite and rerunning the deduction rules makes the board impossible under the season's matching rules.`
      }

      return createPossibilityExclusionText(
        currentState,
        pair,
        outcomeText,
        stepMeta.oppositeAssumption,
      )
  }
}

function createDerivationPrerequisites(
  pair: MatchRecord,
  nextStage: DerivedMatchStage,
  stepMeta: DerivationTextMeta,
  context: {
    state?: MatchBoardState
    matches: MatchBoardState['matches']
  },
): MatchDerivationReference[] {
  const currentState = context.state
    ? {
        ...context.state,
        matches: context.matches,
      }
    : null

  if (stepMeta.blockingPairKeys) {
    return getDerivedReferences(
      getExistingPairs(context.matches, stepMeta.blockingPairKeys).filter(
        supportingPair => supportingPair.key !== pair.key,
      ),
    )
  }

  switch (stepMeta.reason) {
    case 'added-to-match-positive':
    case 'added-to-match-exclusion': {
      const blockingPair =
        stepMeta.blockingPairKey && context.matches[stepMeta.blockingPairKey]

      return blockingPair ? getDerivedReferences([blockingPair]) : []
    }
    case 'matching-night-clear-match': {
      if (!currentState) {
        return []
      }

      const night = getMatchingNightById(currentState, stepMeta.sourceMatchingNightId)

      if (!night) {
        return []
      }

      return getDerivedReferences(
        getExistingPairs(context.matches, night.pairKeys).filter(
          (nightPair) => nightPair.key !== pair.key,
        ),
      )
    }
    case 'matching-night-clear-no-match': {
      if (!currentState) {
        return []
      }

      const night = getMatchingNightById(currentState, stepMeta.sourceMatchingNightId)

      if (!night) {
        return []
      }

      return getDerivedReferences(
        getExistingPairs(context.matches, night.pairKeys).filter(
          (nightPair) =>
            nightPair.key !== pair.key &&
            POSITIVE_MATCH_STAGES.has(nightPair.stage),
        ),
      )
    }
    case 'positive-pair-exclusion': {
      const blockingPairs = (
        stepMeta.blockingPairKeys ??
        (stepMeta.blockingPairKey ? [stepMeta.blockingPairKey] : [])
      )
        .map((pairKey) => context.matches[pairKey])
        .filter((blockingPair): blockingPair is MatchRecord => Boolean(blockingPair))

      return getDerivedReferences(blockingPairs)
    }
    case 'single-remaining-pair': {
      if (!stepMeta.requiredPersonId || !stepMeta.requiredPersonSide) {
        return []
      }

      return getDerivedReferences([
        ...getNegativePairsForPerson(
          context.matches,
          stepMeta.requiredPersonId,
          stepMeta.requiredPersonSide,
          pair.key,
        ),
        ...Object.values(context.matches).filter(
          (candidatePair) =>
            candidatePair.key !== pair.key &&
            POSITIVE_MATCH_STAGES.has(candidatePair.stage) &&
            (stepMeta.requiredPersonSide === 'left'
              ? candidatePair.leftId === stepMeta.requiredPersonId
              : candidatePair.rightId === stepMeta.requiredPersonId),
        ),
      ])
    }
    case 'state-possibility-exclusion': {
      if (!stepMeta.oppositeAssumption) {
        return []
      }

      const importantPairKeys = new Set(
        getImportantPairsForImpossibleState(
          stepMeta.oppositeAssumption.result.state,
          nextStage,
        ).map((importantPair) => importantPair.key),
      )

      return getDerivedReferences(
        Object.values(context.matches).filter((candidatePair) =>
          importantPairKeys.has(candidatePair.key),
        ),
      )
    }
  }
}

function getDerivedReferences(pairs: MatchRecord[]): MatchDerivationReference[] {
  const references = new Map<MatchKey, MatchDerivationReference>()

  for (const pair of pairs) {
    if (!isDerivedMatchStage(pair.stage)) {
      continue
    }

    references.set(pair.key, {
      pairKey: pair.key,
      stage: pair.stage,
    })
  }

  return [...references.values()]
}

function getImportantPairsForImpossibleState(
  state: MatchBoardState,
  nextStage: DerivedMatchStage,
) {
  const matchingNightPairs = getImportantMatchingNightContradictionPairs(state)

  if (matchingNightPairs) {
    return matchingNightPairs
  }

  const duplicatePositivePairs = getDuplicatePositiveContradictionPairs(state)

  if (duplicatePositivePairs.length > 0) {
    return duplicatePositivePairs
  }

  if (!isPositiveMatchStage(nextStage)) {
    return Object.values(state.matches).filter((candidatePair) =>
      NEGATIVE_MATCH_STAGES.has(candidatePair.stage),
    )
  }

  return []
}

function getImportantMatchingNightContradictionPairs(state: MatchBoardState) {
  for (const night of state.matchingNights) {
    const nightPairs = getMatchingNightPairs(state, night)
    const positivePairs = nightPairs.filter((nightPair) =>
      POSITIVE_MATCH_STAGES.has(nightPair.stage),
    )
    const possiblePairs = nightPairs.filter(
      (nightPair) => !NEGATIVE_MATCH_STAGES.has(nightPair.stage),
    )
    const minimumMatchCount = positivePairs.length
    const maximumMatchCount = possiblePairs.length

    if (minimumMatchCount > night.matches) {
      return positivePairs
    }

    if (maximumMatchCount < night.matches) {
      return nightPairs.filter((nightPair) =>
        NEGATIVE_MATCH_STAGES.has(nightPair.stage),
      )
    }
  }

  return null
}

function getDuplicatePositiveContradictionPairs(state: MatchBoardState) {
  for (const side of ['left', 'right'] as const) {
    const people = side === 'left' ? state.leftPeople : state.rightPeople

    for (const person of people) {
      const positivePairs = Object.values(state.matches).filter(
        (pair) =>
          POSITIVE_MATCH_STAGES.has(pair.stage) &&
          (side === 'left'
            ? pair.leftId === person.id
            : pair.rightId === person.id),
      )
      const matchCapacity = getMatchCapacity(state, person.id, side)

      if (positivePairs.length > matchCapacity) {
        return positivePairs.slice(0, matchCapacity + 1)
      }
    }
  }

  return []
}

function createPossibilityExclusionText(
  state: MatchBoardState,
  pair: MatchRecord,
  outcomeText: string,
  oppositeAssumption: NonNullable<DerivationTextMeta['oppositeAssumption']>,
) {
  const assumptionText =
    oppositeAssumption.stage === 'exp-match'
      ? `If ${formatPair(state, pair)} would have been a pair`
      : `If ${formatPair(state, pair)} would not have been a pair`
  const chainText = formatHypotheticalChain(
    oppositeAssumption.result.state,
    pair,
    oppositeAssumption.stage,
    oppositeAssumption.result.derivationSteps,
  )
  const contradictionText = explainImpossibleState(oppositeAssumption.result.state)

  if (!chainText) {
    return `This pair was derived as ${outcomeText}. ${assumptionText}, the board would be impossible because ${contradictionText}.`
  }

  return `This pair was derived as ${outcomeText}. ${assumptionText}, then ${chainText}.\nThis makes the board impossible because ${contradictionText}.`
}

function formatHypotheticalChain(
  state: MatchBoardState,
  assumedPair: MatchRecord,
  assumedStage: 'exp-match' | 'exp-no-match',
  derivationSteps: MatchDerivationStep[],
) {
  const summarizedExclusionChain = summarizePositiveAssumptionExclusionChain(
    state,
    assumedPair,
    assumedStage,
    derivationSteps,
  )

  return formatHypotheticalSteps(
    state,
    summarizedExclusionChain?.remainingSteps ?? derivationSteps,
  )
    .filter(Boolean)
    .reduce<string[]>((stepTexts, stepText) => {
      if (stepText) {
        stepTexts.push(stepText)
      }

      return stepTexts
    }, summarizedExclusionChain ? [summarizedExclusionChain.summary] : [])
    .join('.\nThen ')
}

function summarizePositiveAssumptionExclusionChain(
  state: MatchBoardState,
  assumedPair: MatchRecord,
  assumedStage: 'exp-match' | 'exp-no-match',
  derivationSteps: MatchDerivationStep[],
) {
  if (assumedStage !== 'exp-match') {
    return null
  }

  const directExclusionSteps = derivationSteps.filter((step) => {
    const stepPair = state.matches[step.pairKey]

    return (
      step.reason === 'positive-pair-exclusion' &&
      stepPair &&
      !isPositiveMatchStage(step.stage) &&
      (stepPair.leftId === assumedPair.leftId ||
        stepPair.rightId === assumedPair.rightId)
    )
  })

  if (directExclusionSteps.length < 2) {
    return null
  }

  const remainingSteps = derivationSteps.filter(
    (step) =>
      !directExclusionSteps.some(
        (directExclusionStep) => directExclusionStep.pairKey === step.pairKey,
      ),
  )

  return {
    summary: `${formatPersonName(
      state,
      assumedPair.leftId,
      'left',
    )} has no other pair and ${formatPersonName(
      state,
      assumedPair.rightId,
      'right',
    )} has no other pair`,
    remainingSteps,
  }
}

function formatHypotheticalSteps(
  state: MatchBoardState,
  derivationSteps: MatchDerivationStep[],
) {
  const stepTexts: string[] = []

  for (let index = 0; index < derivationSteps.length; index += 1) {
    const step = derivationSteps[index]
    const groupedNightNoMatchSteps = getGroupedNightNoMatchSteps(
      state,
      derivationSteps,
      index,
    )

    if (groupedNightNoMatchSteps.length > 1) {
      const night = getMatchingNightById(
        state,
        step.sourceMatchingNightId,
      )
      const pairs = groupedNightNoMatchSteps
        .map((groupedStep) => state.matches[groupedStep.pairKey])
        .filter((pair): pair is MatchRecord => Boolean(pair))

      stepTexts.push(
        `in ${formatMatchingNightName(
          night,
        )}, all matches are determined:\n${pairs
          .map((groupedPair) => `- ${formatPair(state, groupedPair)} is no-match`)
          .join('\n')}`,
      )
      index += groupedNightNoMatchSteps.length - 1
      continue
    }

    const pair = state.matches[step.pairKey]

    if (!pair) {
      continue
    }

    const outcome = isPositiveMatchStage(step.stage)
      ? 'would have to be a match'
      : 'would have to be no-match'
    const source = step.sourceMatchingNightId
      ? `in ${formatMatchingNightName(
          getMatchingNightById(state, step.sourceMatchingNightId),
        )}, `
      : ''

    stepTexts.push(`${source}${formatPair(state, pair)} ${outcome}`)
  }

  return stepTexts
}

function getGroupedNightNoMatchSteps(
  state: MatchBoardState,
  derivationSteps: MatchDerivationStep[],
  startIndex: number,
) {
  const firstStep = derivationSteps[startIndex]

  if (
    firstStep.reason !== 'matching-night-clear-no-match' ||
    !firstStep.sourceMatchingNightId ||
    isPositiveMatchStage(firstStep.stage) ||
    !state.matches[firstStep.pairKey]
  ) {
    return []
  }

  const groupedSteps: MatchDerivationStep[] = []

  for (let index = startIndex; index < derivationSteps.length; index += 1) {
    const step = derivationSteps[index]

    if (
      step.reason !== firstStep.reason ||
      step.sourceMatchingNightId !== firstStep.sourceMatchingNightId ||
      isPositiveMatchStage(step.stage) ||
      !state.matches[step.pairKey]
    ) {
      break
    }

    groupedSteps.push(step)
  }

  return groupedSteps
}

function explainImpossibleState(state: MatchBoardState) {
  if (Math.abs(getActivePeople(state, 'left').length - getActivePeople(state, 'right').length) > 1) {
    return 'the active groups differ by more than one person'
  }

  const matchingNightReason = explainImpossibleMatchingNightCounts(state)

  if (matchingNightReason) {
    return matchingNightReason
  }

  const duplicatePositiveReason = explainDuplicatePositivePair(state)

  if (duplicatePositiveReason) {
    return duplicatePositiveReason
  }

  return "there is no complete assignment left that satisfies every candidate and the season's add-to-match rule"
}

function explainImpossibleMatchingNightCounts(state: MatchBoardState) {
  for (const night of state.matchingNights) {
    const nightPairs = getMatchingNightPairs(state, night)
    const positivePairs = nightPairs.filter((nightPair) =>
      POSITIVE_MATCH_STAGES.has(nightPair.stage),
    )
    const possiblePairs = nightPairs.filter(
      (nightPair) => !NEGATIVE_MATCH_STAGES.has(nightPair.stage),
    )
    const minimumMatchCount = positivePairs.length
    const maximumMatchCount = possiblePairs.length
    const nightName = formatMatchingNightName(night)

    if (minimumMatchCount > night.matches) {
      return `${nightName} needs ${night.matches} match(es), but ${minimumMatchCount} are already positive: ${formatPairList(
        state,
        positivePairs,
      )}`
    }

    if (maximumMatchCount < night.matches) {
      return `${nightName} needs ${night.matches} match(es), but only ${maximumMatchCount} pair(s) can still be positive: ${formatPairList(
        state,
        possiblePairs,
      )}`
    }
  }

  return null
}

function explainDuplicatePositivePair(state: MatchBoardState) {
  for (const side of ['left', 'right'] as const) {
    const people = side === 'left' ? state.leftPeople : state.rightPeople

    for (const person of people) {
      const positivePairs = Object.values(state.matches).filter(
        (pair) =>
          POSITIVE_MATCH_STAGES.has(pair.stage) &&
          (side === 'left'
            ? pair.leftId === person.id
            : pair.rightId === person.id),
      )
      const matchCapacity = getMatchCapacity(state, person.id, side)

      if (positivePairs.length > matchCapacity) {
        return `${formatPersonName(
          state,
          person.id,
          side,
        )} would have ${positivePairs.length} positive pairs, but is allowed ${matchCapacity}: ${formatPairList(
          state,
          positivePairs,
        )}`
      }
    }
  }

  return null
}

function getNegativePairsForPerson(
  matches: MatchBoardState['matches'],
  personId: string,
  side: Side,
  exceptPairKey: MatchKey,
) {
  return Object.values(matches).filter((candidatePair) => {
    if (candidatePair.key === exceptPairKey) {
      return false
    }

    const matchesPerson =
      side === 'left'
        ? candidatePair.leftId === personId
        : candidatePair.rightId === personId

    return matchesPerson && NEGATIVE_MATCH_STAGES.has(candidatePair.stage)
  })
}

function getMatchingNightById(
  state: MatchBoardState,
  matchingNightId: string | null,
) {
  return (
    state.matchingNights.find((night) => night.id === matchingNightId) ?? null
  )
}

function formatMatchingNightName(night: MatchingNight | null) {
  if (!night) {
    return 'that matching night'
  }

  if (typeof night.matchingNight === 'number') {
    return `MN ${night.matchingNight}`
  }

  return night.label || 'that matching night'
}

function formatPairList(state: MatchBoardState, pairs: MatchRecord[]) {
  if (pairs.length === 0) {
    return 'none'
  }

  return pairs.map((pair) => formatPair(state, pair)).join(', ')
}

function formatPair(state: MatchBoardState, pair: MatchRecord) {
  return `${formatPersonName(state, pair.leftId, 'left')} + ${formatPersonName(
    state,
    pair.rightId,
    'right',
  )}`
}

function formatPersonName(state: MatchBoardState, personId: string, side: Side) {
  const people = side === 'left' ? state.leftPeople : state.rightPeople
  const person = people.find((candidate) => candidate.id === personId)

  return person?.name || personId
}

export function applyDerivationStep(
  state: MatchBoardState,
  step: MatchDerivationStep,
) {
  const match = state.matches[step.pairKey]

  if (!match) {
    return state
  }

  return {
    ...state,
    matches: {
      ...state.matches,
      [step.pairKey]: {
        ...match,
        stage: step.stage,
        derivationText: step.derivationText,
        derivationPrerequisites: step.derivationPrerequisites,
      },
    },
  }
}

export function isPositiveMatchStage(stage: MatchStage) {
  return POSITIVE_MATCH_STAGES.has(stage)
}

function getExistingPairs(
  matches: MatchBoardState['matches'],
  pairKeys: MatchKey[],
) {
  return [...new Set(pairKeys)]
    .map((pairKey) => matches[pairKey])
    .filter((pair): pair is MatchRecord => Boolean(pair))
}

function isDerivedMatchStage(stage: MatchStage): stage is DerivedMatchStage {
  return (
    stage === 'derived-match' ||
    stage === 'derived-no-match' ||
    stage === 'derived-exp-match' ||
    stage === 'derived-exp-no-match'
  )
}

function isExplicitExpectedMatchStage(stage: MatchStage) {
  return stage === 'exp-match' || stage === 'exp-no-match'
}

function isDirectMatchStage(stage: MatchStage) {
  return stage === 'match' || stage === 'no-match'
}

function removeDerivedMatchStages(state: MatchBoardState, preserveConfirmed = false): MatchBoardState {
  const shouldClear = (stage: MatchStage) => isDerivedMatchStage(stage) &&
    (!preserveConfirmed || EXPECTED_MATCH_STAGES.has(stage))
  const matches = Object.fromEntries(
    Object.entries(state.matches).map(([pairKey, pair]) => [
      pairKey,
      {
        ...pair,
        stage: shouldClear(pair.stage) ? 'undefined' : pair.stage,
        derivationText: shouldClear(pair.stage) ? null : pair.derivationText,
        derivationPrerequisites: shouldClear(pair.stage)
          ? []
          : pair.derivationPrerequisites,
      },
    ]),
  ) as MatchBoardState['matches']

  return {
    ...state,
    matches,
  }
}

function haveSameMatchOutcome(leftStage: MatchStage, rightStage: MatchStage) {
  return (
    (POSITIVE_MATCH_STAGES.has(leftStage) && POSITIVE_MATCH_STAGES.has(rightStage)) ||
    (NEGATIVE_MATCH_STAGES.has(leftStage) && NEGATIVE_MATCH_STAGES.has(rightStage))
  )
}

function getStageCertaintyRank(stage: MatchStage) {
  if (stage === 'match' || stage === 'no-match') {
    return 3
  }

  if (stage === 'derived-match' || stage === 'derived-no-match') {
    return 2
  }

  if (stage === 'derived-exp-match' || stage === 'derived-exp-no-match') {
    return 1
  }

  return 0
}

function compareMatchingNights(leftNight: MatchingNight, rightNight: MatchingNight) {
  const matchingNightDifference =
    compareMatchingNightOrder(leftNight.matchingNight, rightNight.matchingNight)

  if (matchingNightDifference !== 0) {
    return matchingNightDifference
  }

  return leftNight.label.localeCompare(rightNight.label)
}

function compareMatchBoxes(leftMatchBox: MatchBox, rightMatchBox: MatchBox) {
  const matchingNightDifference = compareMatchingNightOrder(
    leftMatchBox.matchingNight,
    rightMatchBox.matchingNight,
  )

  if (matchingNightDifference !== 0) {
    return matchingNightDifference
  }

  return leftMatchBox.label.localeCompare(rightMatchBox.label)
}

function compareMatchingNightOrder(
  leftMatchingNight: number | null,
  rightMatchingNight: number | null,
) {
  return (
    (leftMatchingNight ?? Number.MAX_SAFE_INTEGER) -
    (rightMatchingNight ?? Number.MAX_SAFE_INTEGER)
  )
}

function buildOrderedTimeline(
  items: Datapoint[],
  matchingNights: MatchingNight[],
  matchBoxes: MatchBox[],
) {
  const knownNightIds = new Set(matchingNights.map((night) => night.id))
  const knownMatchBoxIds = new Set(matchBoxes.map((matchBox) => matchBox.id))
  const nightOrder = new Map(
    matchingNights.map((night, index) => [
      night.id,
      { matchingNight: night.matchingNight, index },
    ]),
  )
  const matchBoxOrder = new Map(
    matchBoxes.map((matchBox, index) => [
      matchBox.id,
      { matchingNight: matchBox.matchingNight, index },
    ]),
  )

  return items
    .reduce<Array<TimelineEntry & { sourceIndex: number }>>(
      (entries, item, sourceIndex) => {
        const type =
          typeof item.fields.type === 'string'
            ? item.fields.type.trim().toLowerCase()
            : ''

        if (type === 'matching-night' && knownNightIds.has(item.sk)) {
          entries.push({ kind: 'matching-night', id: item.sk, sourceIndex })
        }

        if (type === 'match-box' && knownMatchBoxIds.has(item.sk)) {
          entries.push({ kind: 'match-box', id: item.sk, sourceIndex })
        }

        return entries
      },
      [],
    )
    .sort((leftEntry, rightEntry) => {
      const leftOrder =
        leftEntry.kind === 'matching-night'
          ? nightOrder.get(leftEntry.id)
          : matchBoxOrder.get(leftEntry.id)
      const rightOrder =
        rightEntry.kind === 'matching-night'
          ? nightOrder.get(rightEntry.id)
          : matchBoxOrder.get(rightEntry.id)

      const matchingNightDifference = compareMatchingNightOrder(
        leftOrder?.matchingNight ?? null,
        rightOrder?.matchingNight ?? null,
      )

      if (matchingNightDifference !== 0) {
        return matchingNightDifference
      }

      if (leftEntry.kind !== rightEntry.kind) {
        return leftEntry.kind === 'match-box' ? -1 : 1
      }

      const typeIndexDifference = (leftOrder?.index ?? 0) - (rightOrder?.index ?? 0)

      if (typeIndexDifference !== 0) {
        return typeIndexDifference
      }

      return leftEntry.sourceIndex - rightEntry.sourceIndex
    })
    .map((entry) => ({
      kind: entry.kind,
      id: entry.id,
    }))
}

export class MatchBoardManager {
  private state: MatchBoardState

  constructor(seed: MatchBoardState = createInitialMatchBoardState()) {
    this.state = deriveMatchBoardState(cloneMatchBoardState(seed))
  }

  getSnapshot() {
    return cloneMatchBoardState(this.state)
  }

  setKnownDoubleMatchPersonWithPlan(personId: string | null): MatchStageChangePlan {
    const knownId = this.state.seasonKnownDoubleMatchPersonId ??
      (getKnownDoubleMatchOptions(this.state).some(person => person.id === personId) ? personId : null)
    if ((this.state.knownDoubleMatchPersonId ?? null) === knownId) {
      const snapshot = this.getSnapshot()
      return { immediateSnapshot: snapshot, derivationSteps: [], finalSnapshot: snapshot }
    }
    const baseState = removeDerivedMatchStages(this.state, !this.state.knownDoubleMatchPersonId && Boolean(knownId))
    const immediateState = { ...baseState, knownDoubleMatchPersonId: knownId }
    const derivationResult = runDerivationPasses(immediateState, true)
    this.state = { ...immediateState, matches: derivationResult.matches }
    return {
      immediateSnapshot: cloneMatchBoardState(immediateState),
      derivationSteps: derivationResult.derivationSteps,
      finalSnapshot: this.getSnapshot(),
    }
  }

  setKnownDoubleMatchPerson(personId: string | null) {
    return this.setKnownDoubleMatchPersonWithPlan(personId).finalSnapshot
  }

  setAddedToMatchWithPlan(
    move: AddedToMatchMove | null,
  ): MatchStageChangePlan {
    const baseState = {
      ...removeDerivedMatchStages(this.state),
      addedToMatch: null,
    }
    const baselineState = move ? deriveMatchBoardState(baseState) : baseState
    const nextAddedToMatch = normalizeAddedToMatch(baselineState, move)
    const immediateState = {
      ...baseState,
      addedToMatch: nextAddedToMatch,
    }
    const derivationResult = runDerivationPasses(immediateState, true)
    const finalState = {
      ...immediateState,
      matches: derivationResult.matches,
    }

    this.state = finalState

    return {
      immediateSnapshot: cloneMatchBoardState(immediateState),
      derivationSteps: derivationResult.derivationSteps,
      finalSnapshot: this.getSnapshot(),
    }
  }

  setAddedToMatch(move: AddedToMatchMove | null) {
    return this.setAddedToMatchWithPlan(move).finalSnapshot
  }

  setMatchStageByKeyWithPlan(key: MatchKey, stage: MatchStage): MatchStageChangePlan {
    return this.setMatchStagesWithPlan([{ pairKey: key, stage }])
  }

  setExpectedMatchStagesWithPlan(
    decisions: ExpectedMatchDecision[],
    { skipFixedPairs = true }: { skipFixedPairs?: boolean } = {},
  ): MatchStageChangePlan {
    // Check the current board before clearing deductions so confirmed outcomes
    // and existing expectations cannot be overwritten by a bulk load.
    const changes = decisions.filter(decision => {
      const currentMatch = this.state.matches[decision.pairKey]
      return currentMatch && (!skipFixedPairs || canSaveForcedPair(currentMatch.stage))
    })
    // Restoring a saved URL keeps its explicit decisions. If it overrides a
    // source fact, recompute that fact's deductions as in a single-pair edit.
    const overridesSourceFact = changes.some(decision => {
      const stage = this.state.matches[decision.pairKey].stage
      return stage === 'match' || stage === 'no-match'
    })
    return this.setMatchStagesWithPlan(changes, !overridesSourceFact)
  }

  private setMatchStagesWithPlan(
    decisions: { pairKey: MatchKey; stage: MatchStage }[],
    preserveConfirmedDeductions = false,
  ): MatchStageChangePlan {
    const changes = decisions.filter(decision => this.state.matches[decision.pairKey])
    if (changes.length === 0) {
      const snapshot = this.getSnapshot()
      return { immediateSnapshot: snapshot, derivationSteps: [], finalSnapshot: snapshot }
    }
    // Adding constraints preserves deductions from the unchanged source facts.
    const baseState = removeDerivedMatchStages(this.state, preserveConfirmedDeductions)
    const immediateState = {
      ...baseState,
      matches: { ...baseState.matches },
    }
    for (const { pairKey, stage } of changes) {
      immediateState.matches[pairKey] = {
        ...immediateState.matches[pairKey],
        stage,
        derivationText: null,
        derivationPrerequisites: [],
      }
    }
    const requestedMove = immediateState.addedToMatch
    const stateWithoutMove = { ...immediateState, addedToMatch: null }
    const baselineState = requestedMove
      ? deriveMatchBoardState(stateWithoutMove)
      : stateWithoutMove
    const normalizedImmediateState = {
      ...immediateState,
      addedToMatch: normalizeAddedToMatch(baselineState, requestedMove),
    }
    const derivationResult = runDerivationPasses(normalizedImmediateState, true)
    const finalState = {
      ...normalizedImmediateState,
      matches: derivationResult.matches,
    }

    this.state = finalState

    return {
      immediateSnapshot: cloneMatchBoardState(normalizedImmediateState),
      derivationSteps: derivationResult.derivationSteps,
      finalSnapshot: this.getSnapshot(),
    }
  }

  setMatchStageByKey(key: MatchKey, stage: MatchStage) {
    return this.setMatchStageByKeyWithPlan(key, stage).finalSnapshot
  }

  revertMatchStageByKeyWithPlan(key: MatchKey): MatchStageChangePlan {
    const baseState = removeDerivedMatchStages(this.state)
    const currentMatch = baseState.matches[key]

    if (!currentMatch) {
      const snapshot = this.getSnapshot()

      return {
        immediateSnapshot: snapshot,
        derivationSteps: [],
        finalSnapshot: snapshot,
      }
    }

    const immediateState = {
      ...baseState,
      matches: {
        ...baseState.matches,
        [key]: {
          ...currentMatch,
          stage: 'undefined',
          derivationText: null,
          derivationPrerequisites: [],
        },
      },
    }
    const requestedMove = immediateState.addedToMatch
    const stateWithoutMove = { ...immediateState, addedToMatch: null }
    const baselineState = requestedMove
      ? deriveMatchBoardState(stateWithoutMove)
      : stateWithoutMove
    const normalizedImmediateState = {
      ...immediateState,
      addedToMatch: normalizeAddedToMatch(baselineState, requestedMove),
    }
    const derivationResult = runDerivationPasses(normalizedImmediateState, true)
    const finalState = {
      ...normalizedImmediateState,
      matches: derivationResult.matches,
    }

    this.state = finalState

    return {
      immediateSnapshot: cloneMatchBoardState(normalizedImmediateState),
      derivationSteps: derivationResult.derivationSteps,
      finalSnapshot: this.getSnapshot(),
    }
  }

  revertMatchStageByKey(key: MatchKey) {
    return this.revertMatchStageByKeyWithPlan(key).finalSnapshot
  }

  hydrateFromSeasonDatapoints(
    records: SeasonDatapoints,
    options?: MatchBoardHydrationOptions,
  ): MatchBoardLoadResult {
    const parsed = buildBoardFromSeasonDatapoints(records, options)

    if (!parsed) {
      if (records.people.length > 0) {
        this.state = createEmptyMatchBoardState()

        return {
          snapshot: this.getSnapshot(),
          meta: {
            usedFallbackSample: false,
            loadedNightCount: 0,
            loadedMatchBoxCount: 0,
            appliedMatchStateCount: 0,
          },
        }
      }

      this.state = createInitialMatchBoardState()

      return {
        snapshot: this.getSnapshot(),
        meta: {
          usedFallbackSample: true,
          loadedNightCount: 0,
          loadedMatchBoxCount: 0,
          appliedMatchStateCount: 0,
        },
      }
    }

    this.state = deriveMatchBoardState(parsed.state)

    return {
      snapshot: this.getSnapshot(),
      meta: {
        usedFallbackSample: false,
        loadedNightCount: parsed.state.matchingNights.length,
        loadedMatchBoxCount: parsed.state.matchBoxes.length,
        appliedMatchStateCount: parsed.appliedMatchStateCount,
      },
    }
  }

  hydrateFromDatapoints(
    datapoints: Datapoint[],
    options?: MatchBoardHydrationOptions,
  ): MatchBoardLoadResult {
    return this.hydrateFromSeasonDatapoints(
      {
        pk: DEFAULT_SEASON_PK,
        items: datapoints,
        people: [],
        matchingNights: [],
        matchBoxes: [],
        addedToMatches: [],
        other: datapoints,
      },
      options,
    )
  }
}

export function parseSeasonPeople(records: SeasonDatapoints): Person[] {
  return sortPeople(
    records.people.flatMap((record) => {
      const parsedPerson = parsePersonRecord(record, records.pk)

      return parsedPerson ? [parsedPerson.person] : []
    }),
  )
}

function buildBoardFromSeasonDatapoints(
  records: SeasonDatapoints,
  options?: MatchBoardHydrationOptions,
): ParsedSeasonBoard | null {
  const leftPeopleById = new Map<string, Person>()
  const rightPeopleById = new Map<string, Person>()
  const peopleByLookupKey = new Map<string, Person>()

  for (const record of records.people) {
    const parsedPerson = parsePersonRecord(record, records.pk)

    if (!parsedPerson) {
      continue
    }

    registerPersonLookup(peopleByLookupKey, record, parsedPerson.person)

    if (parsedPerson.side) {
      const targetMap =
        parsedPerson.side === 'left' ? leftPeopleById : rightPeopleById

      targetMap.set(parsedPerson.person.id, parsedPerson.person)
    }
  }

  const resolvePersonId = (personId: string) =>
    peopleByLookupKey.get(normalizePersonLookupKey(personId))?.id ?? personId
  const sidesById = new Map<string, Side>()
  for (const record of records.matchingNights) {
    for (const pair of parsePairsField(record.fields.pairs)) {
      sidesById.set(resolvePersonId(pair.leftId), 'left')
      sidesById.set(resolvePersonId(pair.rightId), 'right')
    }
  }
  for (const record of records.matchBoxes) {
    const leftId = pickString(unwrapDynamoValue(record.fields.female))
    const rightId = pickString(unwrapDynamoValue(record.fields.male))
    if (leftId) sidesById.set(resolvePersonId(leftId), 'left')
    if (rightId) sidesById.set(resolvePersonId(rightId), 'right')
  }
  const stageUpdates = new Map<MatchKey, MatchStage>()
  let matchingNights = records.matchingNights
    .map((record, index) =>
      parseMatchingNightRecord(record, index, resolvePersonId),
    )
    .filter((night): night is MatchingNight => night !== null)
    .filter((night) =>
      isMatchingNightIncluded(
        night.matchingNight,
        options?.maxMatchingNight,
        options?.includeMaxMatchingNight ?? true,
      ),
    )
    .sort(compareMatchingNights)

  const matchBoxes = records.matchBoxes
    .map((record, index) =>
      parseMatchBoxRecord(
        record,
        index,
        stageUpdates,
        options?.maxMatchingNight,
        resolvePersonId,
      ),
    )
    .filter((matchBox): matchBox is MatchBox => matchBox !== null)
    .sort(compareMatchBoxes)
  const knownAddedToMatches = records.addedToMatches
    .map((record) =>
      parseAddedToMatchRecord(
        record,
        options?.maxMatchingNight,
        resolvePersonId,
      ),
    )
    .filter((move): move is AddedToMatchMove => move !== null)

  matchingNights = includeConfirmedMatchBoxPairsInMatchingNights(
    matchingNights,
    matchBoxes,
    stageUpdates,
  )

  const allReferencedPairs = [
    ...matchingNights.flatMap((night) => night.pairKeys),
    ...matchBoxes.map((matchBox) => matchBox.pairKey),
    ...knownAddedToMatches.map(move => move.pairKey),
  ]

  for (const pairKey of allReferencedPairs) {
    const pairIds = splitPairKey(pairKey)

    if (!pairIds) {
      continue
    }

    ensurePersonForSide(leftPeopleById, peopleByLookupKey, pairIds.leftId)
    ensurePersonForSide(rightPeopleById, peopleByLookupKey, pairIds.rightId)
  }

  for (const record of records.matchingNights) {
    const matchingNight =
      pickNumber(record.fields['matching-night']) ?? extractOrdinal(record.sk)

    if (
      !isMatchingNightIncluded(
        matchingNight,
        options?.maxMatchingNight,
        options?.includeMaxMatchingNight ?? true,
      )
    ) {
      continue
    }

    for (const singleId of parseStringListField(record.fields.singles)) {
      const resolvedId = resolvePersonId(singleId)
      const side = sidesById.get(resolvedId) ?? inferSideFromPersonId(resolvedId) ?? 'left'
      ensurePersonForSide(side === 'left' ? leftPeopleById : rightPeopleById, peopleByLookupKey, resolvedId)
    }
  }

  for (const move of knownAddedToMatches) {
    const side = sidesById.get(move.personId)
    if (side) ensurePersonForSide(side === 'left' ? leftPeopleById : rightPeopleById, peopleByLookupKey, move.personId)
  }

  const leftPeople = sortPeople([...leftPeopleById.values()])
  const rightPeople = sortPeople([...rightPeopleById.values()])

  if (
    leftPeople.length === 0 ||
    rightPeople.length === 0 ||
    (matchingNights.length === 0 && matchBoxes.length === 0)
  ) {
    return null
  }

  const matches = createEmptyMatchMap(leftPeople, rightPeople)
  let appliedMatchStateCount = 0

  for (const [pairKey, stage] of stageUpdates) {
    if (!matches[pairKey]) {
      continue
    }

    matches[pairKey] = {
      ...matches[pairKey],
      stage,
      derivationText: null,
      derivationPrerequisites: [],
    }
    appliedMatchStateCount += 1
  }

  const timeline = buildOrderedTimeline(records.items, matchingNights, matchBoxes)
  const stateWithoutStoredMove: MatchBoardState = {
    leftPeople,
    rightPeople,
    addedToMatch: null,
    matches,
    matchingNights,
    matchBoxes,
    timeline,
  }
  const state = { ...stateWithoutStoredMove, knownAddedToMatches }
  const knownParticipant = SEASON_RULES[records.pk]?.doubleMatchParticipant
  const seasonKnownDoubleMatchPersonId = knownParticipant &&
    isWithinMatchingNightLimit(knownParticipant.fromMatchingNight, options?.maxMatchingNight) &&
    getKnownDoubleMatchOptions(state).some(person => person.id === knownParticipant.personId)
    ? knownParticipant.personId : null
  return {
    state: {
      ...state,
      knownDoubleMatchPersonId: seasonKnownDoubleMatchPersonId,
      seasonKnownDoubleMatchPersonId,
    },
    appliedMatchStateCount,
  }
}

function createEmptyMatchMap(leftPeople: Person[], rightPeople: Person[]) {
  const matches: Record<MatchKey, MatchRecord> = {}

  for (const leftPerson of leftPeople) {
    for (const rightPerson of rightPeople) {
      const key = createMatchKey(leftPerson.id, rightPerson.id)
      matches[key] = {
        key,
        leftId: leftPerson.id,
        rightId: rightPerson.id,
        stage: 'undefined',
        derivationText: null,
        derivationPrerequisites: [],
      }
    }
  }

  return matches
}

function includeConfirmedMatchBoxPairsInMatchingNights(
  matchingNights: MatchingNight[],
  matchBoxes: MatchBox[],
  stageUpdates: Map<MatchKey, MatchStage>,
) {
  const confirmedMatchBoxes = matchBoxes.filter(
    (matchBox) => stageUpdates.get(matchBox.pairKey) === 'match',
  )

  if (confirmedMatchBoxes.length === 0) {
    return matchingNights
  }

  return matchingNights.map((night) => {
    const pairKeys = new Set(night.pairKeys)

    for (const matchBox of confirmedMatchBoxes) {
      if (!isMatchBoxKnownByMatchingNight(matchBox, night)) {
        continue
      }

      pairKeys.add(matchBox.pairKey)
    }

    const expandedPairKeys = [...pairKeys]

    return {
      ...night,
      pairKeys: expandedPairKeys,
      total: expandedPairKeys.length,
    }
  })
}

function isMatchBoxKnownByMatchingNight(
  matchBox: MatchBox,
  night: MatchingNight,
) {
  if (matchBox.matchingNight === null || night.matchingNight === null) {
    return matchBox.matchingNight === night.matchingNight
  }

  return matchBox.matchingNight <= night.matchingNight
}

function parsePersonRecord(
  record: Datapoint,
  seasonPk: string,
): ParsedPersonRecord | null {
  const personId = record.sk
  const side = inferSideFromPersonId(personId)

  if (!personId) {
    return null
  }

  return {
    side,
    person: {
      id: personId,
      name: pickString(record.fields.name) ?? personId,
      imageUrl: resolvePersonImageUrl(record.fields.image, seasonPk),
    },
  }
}

function registerPersonLookup(
  peopleByLookupKey: Map<string, Person>,
  record: Datapoint,
  person: Person,
) {
  for (const value of [record.sk, record.fields.name, person.name, person.id]) {
    if (typeof value !== 'string') {
      continue
    }

    const key = normalizePersonLookupKey(value)

    if (key) {
      peopleByLookupKey.set(key, person)
    }
  }
}

function resolvePersonImageUrl(value: unknown, seasonPk: string) {
  const imageValue = normalizeOptionalString(value)

  if (!imageValue) {
    return null
  }

  if (/^(?:https?:)?\/\//i.test(imageValue) || /^(?:data|blob):/i.test(imageValue)) {
    return imageValue
  }

  if (/^s3:\/\//i.test(imageValue)) {
    return convertS3UrlToHttps(imageValue)
  }

  const seasonPrefix = seasonPk
  const normalizedKey = normalizeS3ObjectKey(imageValue)

  if (!normalizedKey) {
    return null
  }

  const keyWithSeasonPrefix =
    seasonPrefix && !normalizedKey.startsWith(`${seasonPrefix}/`)
      ? `${seasonPrefix}/${normalizedKey}`
      : normalizedKey

  return createS3HttpsUrl(IMAGES_BUCKET_NAME, keyWithSeasonPrefix)
}

function convertS3UrlToHttps(value: string) {
  const match = value.trim().match(/^s3:\/\/([^/]+)\/(.+)$/i)

  if (!match) {
    return value
  }

  const [, bucketName, key] = match
  return createS3HttpsUrl(bucketName, key)
}

function createS3HttpsUrl(bucketName: string, key: string) {
  return `https://${bucketName}.s3.amazonaws.com/${encodeS3ObjectKey(key)}`
}

function normalizeS3ObjectKey(value: string) {
  return value.trim().replace(/^\/+/, '').replace(/^\.\/+/, '')
}

function encodeS3ObjectKey(key: string) {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function parseMatchingNightRecord(
  record: Datapoint,
  index: number,
  resolvePersonId: (personId: string) => string,
) {
  if (isSoldRecord(record.fields)) {
    return null
  }

  const pairs = parsePairsField(record.fields.pairs)
  const pairKeys = pairs.map(({ leftId, rightId }) =>
    createMatchKey(resolvePersonId(leftId), resolvePersonId(rightId)),
  )

  if (pairKeys.length === 0) {
    return null
  }

  const ordinal =
    pickNumber(record.fields['matching-night']) ?? extractOrdinal(record.sk)

  return {
    id: record.sk,
    label: `Matching Night ${ordinal ?? index + 1}`,
    pairKeys,
    matches: pickNumber(record.fields.matches) ?? 0,
    total: pairKeys.length,
    matchingNight: ordinal,
  }
}

function parseMatchBoxRecord(
  record: Datapoint,
  index: number,
  stageUpdates: Map<MatchKey, MatchStage>,
  maxMatchingNight?: number | null,
  resolvePersonId: (personId: string) => string = (personId) => personId,
) {
  const rawLeftId = pickString(unwrapDynamoValue(record.fields.female))
  const rawRightId = pickString(unwrapDynamoValue(record.fields.male))

  if (!rawLeftId || !rawRightId) {
    return null
  }

  const leftId = resolvePersonId(rawLeftId)
  const rightId = resolvePersonId(rawRightId)
  const pairKey = createMatchKey(leftId, rightId)
  const ordinal =
    pickNumber(record.fields['match-box']) ?? extractOrdinal(record.sk)
  const matchingNight =
    pickNumber(record.fields['matching-night']) ?? ordinal

  if (!isWithinMatchingNightLimit(matchingNight, maxMatchingNight)) {
    return null
  }

  const stage = normalizeMatchBoxResult(record.fields.result)

  if (stage) {
    stageUpdates.set(pairKey, stage)
  }

  return {
    id: record.sk,
    label: `Match-Box ${ordinal ?? index + 1}`,
    pairKey,
    matchingNight,
  }
}

function parseAddedToMatchRecord(
  record: Datapoint,
  maxMatchingNight: number | null | undefined,
  resolvePersonId: (personId: string) => string,
): AddedToMatchMove | null {
  const matchingNight =
    pickNumber(record.fields['matching-night']) ?? extractOrdinal(record.sk)

  if (!isWithinMatchingNightLimit(matchingNight, maxMatchingNight)) {
    return null
  }

  const rawAddedPersonId = pickString(
    unwrapDynamoValue(record.fields['added-person']),
    unwrapDynamoValue(record.fields.person),
  )
  const rawTargetLeftId = pickString(
    unwrapDynamoValue(record.fields['target-left']),
    unwrapDynamoValue(record.fields.female),
  )
  const rawTargetRightId = pickString(
    unwrapDynamoValue(record.fields['target-right']),
    unwrapDynamoValue(record.fields.male),
  )

  if (!rawAddedPersonId || !rawTargetLeftId || !rawTargetRightId) {
    return null
  }

  return {
    personId: resolvePersonId(rawAddedPersonId),
    pairKey: createMatchKey(
      resolvePersonId(rawTargetLeftId),
      resolvePersonId(rawTargetRightId),
    ),
  }
}

function isSoldRecord(fields: Record<string, unknown>) {
  if (unwrapDynamoValue(fields.sold) === true) {
    return true
  }

  const result = pickString(unwrapDynamoValue(fields.result))
  return result === 'sold' || result === 'verkauft'
}

function isWithinMatchingNightLimit(
  matchingNight: number | null,
  maxMatchingNight: number | null | undefined,
) {
  if (
    typeof maxMatchingNight !== 'number' ||
    !Number.isFinite(maxMatchingNight)
  ) {
    return true
  }

  if (matchingNight === null) {
    return true
  }

  return matchingNight <= maxMatchingNight
}

function isMatchingNightIncluded(
  matchingNight: number | null,
  maxMatchingNight: number | null | undefined,
  includeMaxMatchingNight: boolean,
) {
  if (
    typeof maxMatchingNight !== 'number' ||
    !Number.isFinite(maxMatchingNight)
  ) {
    return true
  }

  if (matchingNight === null) {
    return true
  }

  return includeMaxMatchingNight
    ? matchingNight <= maxMatchingNight
    : matchingNight < maxMatchingNight
}

function parsePairsField(value: unknown): PairIds[] {
  const parsedValue = parseStructuredValue(value)

  if (!Array.isArray(parsedValue)) {
    return []
  }

  return parsedValue
    .map((entry) => parsePairEntry(entry))
    .filter((pair): pair is PairIds => pair !== null)
}

function parseStringListField(value: unknown): string[] {
  const parsedValue = parseStructuredValue(value)

  if (!Array.isArray(parsedValue)) {
    const singleValue = pickString(parsedValue)
    return singleValue ? [singleValue] : []
  }

  return parsedValue.flatMap((entry) => {
    const stringValue = pickString(unwrapDynamoValue(entry))
    return stringValue ? [stringValue] : []
  })
}

function parsePairEntry(value: unknown): PairIds | null {
  const unwrapped = unwrapDynamoValue(value)

  if (typeof unwrapped === 'string') {
    return splitPairKey(unwrapped)
  }

  if (!isObject(unwrapped)) {
    return null
  }

  const nested = isObject(unwrapped.M) ? unwrapDynamoValue(unwrapped.M) : unwrapped

  if (!isObject(nested)) {
    return null
  }

  const leftId = pickString(
    nested.female,
    nested.leftId,
    nested.left,
    nested.personA,
  )
  const rightId = pickString(
    nested.male,
    nested.rightId,
    nested.right,
    nested.personB,
  )

  if (!leftId || !rightId) {
    return null
  }

  return { leftId, rightId }
}

function parseStructuredValue(value: unknown): unknown {
  const unwrapped = unwrapDynamoValue(value)

  if (typeof unwrapped !== 'string') {
    return unwrapped
  }

  const trimmed = unwrapped.trim()

  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
    return unwrapped
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return unwrapped
  }
}

function unwrapDynamoValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => unwrapDynamoValue(entry))
  }

  if (!isObject(value)) {
    return value
  }

  const keys = Object.keys(value)

  if (keys.length === 1) {
    const [key] = keys

    if (key === 'S' || key === 'N' || key === 'BOOL' || key === 'NULL') {
      return value[key]
    }

    if (key === 'M') {
      return unwrapDynamoValue(value.M)
    }

    if (key === 'L' && Array.isArray(value.L)) {
      return value.L.map((entry) => unwrapDynamoValue(entry))
    }
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      unwrapDynamoValue(nestedValue),
    ]),
  )
}

function ensurePersonForSide(
  map: Map<string, Person>,
  peopleByLookupKey: Map<string, Person>,
  id: string,
) {
  if (map.has(id)) {
    return
  }

  const person = peopleByLookupKey.get(normalizePersonLookupKey(id))
  map.set(id, person ?? { id, name: id })
}

function sortPeople(people: Person[]) {
  return [...people].sort((leftPerson, rightPerson) => {
    const leftOrdinal = extractOrdinal(leftPerson.id) ?? Number.MAX_SAFE_INTEGER
    const rightOrdinal = extractOrdinal(rightPerson.id) ?? Number.MAX_SAFE_INTEGER
    const numberDifference = leftOrdinal - rightOrdinal

    if (numberDifference !== 0) {
      return numberDifference
    }

    return leftPerson.id.localeCompare(rightPerson.id)
  })
}

function clonePeople(people: Person[]) {
  return people.map((person) => ({ ...person }))
}

function cloneMatchingNights(nights: MatchingNight[]) {
  return nights.map((night) => ({
    ...night,
    pairKeys: [...night.pairKeys],
  }))
}

function cloneMatchBoxes(matchBoxes: MatchBox[]) {
  return matchBoxes.map((matchBox) => ({ ...matchBox }))
}

function cloneTimeline(timeline: TimelineEntry[]) {
  return timeline.map((entry) => ({ ...entry }))
}

function cloneMatches(matches: MatchBoardState['matches']) {
  return Object.fromEntries(
    Object.entries(matches).map(([key, match]) => [
      key,
      {
        ...match,
        derivationPrerequisites: match.derivationPrerequisites.map(
          (prerequisite) => ({ ...prerequisite }),
        ),
      },
    ]),
  ) as MatchBoardState['matches']
}

function cloneMatchBoardState(state: MatchBoardState): MatchBoardState {
  return {
    leftPeople: clonePeople(state.leftPeople),
    rightPeople: clonePeople(state.rightPeople),
    addedToMatch: state.addedToMatch ? { ...state.addedToMatch } : null,
    knownAddedToMatches: state.knownAddedToMatches?.map(move => ({ ...move })),
    knownDoubleMatchPersonId: state.knownDoubleMatchPersonId ?? null,
    seasonKnownDoubleMatchPersonId: state.seasonKnownDoubleMatchPersonId ?? null,
    matches: cloneMatches(state.matches),
    matchingNights: cloneMatchingNights(state.matchingNights),
    matchBoxes: cloneMatchBoxes(state.matchBoxes),
    timeline: cloneTimeline(state.timeline),
  }
}

function splitPairKey(value: string) {
  const normalized = value
    .trim()
    .replace(/\s*(?:->|\/|,|\|)\s*/g, ':')
    .replace(/\s*:\s*/g, ':')

  if (!normalized.includes(':')) {
    return null
  }

  const [leftId, rightId] = normalized.split(':')

  if (!leftId || !rightId) {
    return null
  }

  return { leftId, rightId }
}

function normalizeMatchBoxResult(value: unknown): MatchStage | null {
  const unwrapped = unwrapDynamoValue(value)

  if (typeof unwrapped === 'boolean') {
    return unwrapped ? 'match' : 'no-match'
  }

  if (typeof unwrapped === 'number' && Number.isFinite(unwrapped)) {
    if (unwrapped > 0) {
      return 'match'
    }

    if (unwrapped < 0) {
      return 'no-match'
    }

    return null
  }

  const stringValue = normalizeOptionalString(unwrapped)

  if (!stringValue) {
    return null
  }

  const normalized = normalizeMatchStageToken(stringValue)

  if (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'y' ||
    normalized === 'match'
  ) {
    return 'match'
  }

  if (
    normalized === '-1' ||
    normalized === 'false' ||
    normalized === 'no' ||
    normalized === 'n' ||
    normalized === 'no-match'
  ) {
    return 'no-match'
  }

  return null
}

function normalizeMatchStageToken(value: string) {
  return value
    .toLowerCase()
    .replace(/^'+/, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
}

function normalizePersonLookupKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[._]+/g, ' ')
    .replace(/[-\s]+/g, ' ')
    .trim()
}

function inferSideFromPersonId(personId: string): Side | null {
  const normalized = personId.trim().toLowerCase()

  if (/(^|[^a-z])f\d+$/.test(normalized) || /female/.test(normalized)) {
    return 'left'
  }

  if (/(^|[^a-z])m\d+$/.test(normalized) || /male/.test(normalized)) {
    return 'right'
  }

  if (/f\d+$/.test(normalized)) {
    return 'left'
  }

  if (/m\d+$/.test(normalized)) {
    return 'right'
  }

  return null
}

function pickString(...values: unknown[]) {
  return (
    values.find(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    ) ?? null
  )
}

function normalizeOptionalString(value: unknown) {
  const stringValue = pickString(value)
  return stringValue ?? null
}

function pickNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value.replace(/^'+/, ''))

      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }

  return null
}

function extractOrdinal(value: string) {
  const match = value.match(/(\d+)(?!.*\d)/)
  return match ? Number(match[1]) : null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
