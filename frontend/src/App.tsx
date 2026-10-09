import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import {
  DEFAULT_SEASON_PK,
  DATAPOINTS_ENDPOINT,
  SEASON_OPTIONS,
  loadSeasonDatapoints,
  type Datapoint,
  type SeasonKey,
} from './connectors/datapoints'
import {
  applyDerivationStep,
  isPositiveMatchStage,
  MatchBoardManager,
  findFirstPairKey,
  parseSeasonPeople,
  getActivePeople,
  getMatchBoardContradictions,
  type MatchBoardLoadMeta,
  type MatchBoardState,
  type MatchDerivationStep,
  type MatchKey,
  type MatchStage,
  type Person,
  type AddedToMatchMove,
  type ExpectedMatchDecision as ExpectedDecision,
} from './features/matching/match-board'
import { checkJointMatchBoardState, findForcedPairs } from './features/matching/match-solver'
import {
  AddToMatchPersonCard,
  ExpectedDecisionsPanel,
  MatchMatrixPanel,
  SelectedPairCard,
  TimelineEntryCard,
} from './features/matching/match-board-view'

const EMPTY_LOAD_META: MatchBoardLoadMeta = {
  usedFallbackSample: true,
  loadedNightCount: 0,
  loadedMatchBoxCount: 0,
  appliedMatchStateCount: 0,
}

const DEFAULT_MATCHING_NIGHT_VALUE = '10'
const SEASON_KEYS = new Set<string>(SEASON_OPTIONS.map((season) => season.key))

type UrlBoardState = {
  seasonKey: SeasonKey
  maxMatchingNightValue: string
  includeMaxMatchingNight: boolean
  expectedDecisions: ExpectedDecision[]
  addedToMatch: AddedToMatchMove | null
  knownDoubleMatchPersonId: string | null
}

function parseMatchingNightLimit(value: string) {
  const parsedValue = Number.parseInt(value, 10)

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null
}

function parseSeasonKey(value: string | null): SeasonKey {
  return value && SEASON_KEYS.has(value) ? (value as SeasonKey) : DEFAULT_SEASON_PK
}

function parseMatchingNightUrlValue(value: string | null) {
  if (!value) {
    return DEFAULT_MATCHING_NIGHT_VALUE
  }

  if (value.trim().toLowerCase() === 'all') {
    return ''
  }

  const parsedValue = Number.parseInt(value, 10)

  return Number.isFinite(parsedValue) && parsedValue > 0
    ? String(parsedValue)
    : DEFAULT_MATCHING_NIGHT_VALUE
}

function parseIncludeMatchingNightUrlValue(value: string | null) {
  if (!value) {
    return true
  }

  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase())
}

function splitExpectedPairParam(value: string | null) {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((pairKey) => pairKey.trim())
    .map(normalizeExpectedPairKey)
    .filter((pairKey): pairKey is MatchKey => pairKey !== null)
}

function normalizeExpectedPairKey(value: string) {
  const trimmedValue = value.trim()

  return trimmedValue.includes(':') ? (trimmedValue as MatchKey) : null
}

function parseUrlBoardState(): UrlBoardState {
  const params = new URLSearchParams(window.location.search)
  const addedPersonId = params.get('addedPerson')?.trim() || null
  const addedToMatchPairKey = normalizeExpectedPairKey(
    params.get('addedToMatch') ?? '',
  )
  const expectedMatchPairKeys = [
    ...params
      .getAll('expectedMatch')
      .map(normalizeExpectedPairKey)
      .filter((pairKey): pairKey is MatchKey => pairKey !== null),
    ...splitExpectedPairParam(params.get('expectedMatches')),
  ]
  const expectedNoMatchPairKeys = [
    ...params
      .getAll('expectedNoMatch')
      .map(normalizeExpectedPairKey)
      .filter((pairKey): pairKey is MatchKey => pairKey !== null),
    ...splitExpectedPairParam(params.get('expectedNoMatches')),
  ]

  return {
    seasonKey: parseSeasonKey(params.get('season')),
    maxMatchingNightValue: parseMatchingNightUrlValue(
      params.get('matchingNight') ?? params.get('night'),
    ),
    includeMaxMatchingNight: parseIncludeMatchingNightUrlValue(
      params.get('includeMatchingNight'),
    ),
    addedToMatch:
      addedPersonId && addedToMatchPairKey
        ? { personId: addedPersonId, pairKey: addedToMatchPairKey }
        : null,
    knownDoubleMatchPersonId: params.get('knownDoubleMatchPerson')?.trim() || null,
    expectedDecisions: [
      ...expectedMatchPairKeys.map((pairKey) => ({
        pairKey,
        stage: 'exp-match' as const,
      })),
      ...expectedNoMatchPairKeys.map((pairKey) => ({
        pairKey,
        stage: 'exp-no-match' as const,
      })),
    ],
  }
}

function getExpectedDecisionsFromBoard(
  state: MatchBoardState,
): ExpectedDecision[] {
  return Object.values(state.matches)
    .filter(
      (pair): pair is ExpectedDecision & typeof pair =>
        pair.stage === 'exp-match' || pair.stage === 'exp-no-match',
    )
    .map((pair) => ({
      pairKey: pair.key,
      stage: pair.stage,
    }))
    .sort((leftDecision, rightDecision) => {
      const stageDifference = leftDecision.stage.localeCompare(rightDecision.stage)

      return stageDifference || leftDecision.pairKey.localeCompare(rightDecision.pairKey)
    })
}

function updateBoardUrl({
  seasonKey,
  maxMatchingNightValue,
  includeMaxMatchingNight,
  expectedDecisions,
  addedToMatch,
  knownDoubleMatchPersonId,
}: UrlBoardState) {
  const url = new URL(window.location.href)
  const matchingNight = parseMatchingNightLimit(maxMatchingNightValue)
  const expectedMatchPairKeys = expectedDecisions
    .filter((decision) => decision.stage === 'exp-match')
    .map((decision) => decision.pairKey)
  const expectedNoMatchPairKeys = expectedDecisions
    .filter((decision) => decision.stage === 'exp-no-match')
    .map((decision) => decision.pairKey)

  url.searchParams.set('season', seasonKey)

  if (matchingNight) {
    url.searchParams.set('matchingNight', String(matchingNight))
    if (includeMaxMatchingNight) {
      url.searchParams.delete('includeMatchingNight')
    } else {
      url.searchParams.set('includeMatchingNight', 'false')
    }
  } else {
    url.searchParams.set('matchingNight', 'all')
    url.searchParams.delete('includeMatchingNight')
  }

  url.searchParams.delete('night')
  url.searchParams.delete('expectedMatch')
  url.searchParams.delete('expectedNoMatch')

  url.searchParams.delete('doubleMatch')

  if (knownDoubleMatchPersonId) {
    url.searchParams.set('knownDoubleMatchPerson', knownDoubleMatchPersonId)
  } else {
    url.searchParams.delete('knownDoubleMatchPerson')
  }

  if (addedToMatch) {
    url.searchParams.set('addedPerson', addedToMatch.personId)
    url.searchParams.set('addedToMatch', addedToMatch.pairKey)
  } else {
    url.searchParams.delete('addedPerson')
    url.searchParams.delete('addedToMatch')
  }

  if (expectedMatchPairKeys.length > 0) {
    url.searchParams.set('expectedMatches', expectedMatchPairKeys.join(','))
  } else {
    url.searchParams.delete('expectedMatches')
  }

  if (expectedNoMatchPairKeys.length > 0) {
    url.searchParams.set('expectedNoMatches', expectedNoMatchPairKeys.join(','))
  } else {
    url.searchParams.delete('expectedNoMatches')
  }

  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

function App() {
  const [boardManager] = useState(() => new MatchBoardManager())
  const [initialUrlBoardState] = useState(parseUrlBoardState)
  const expectedDecisionsFromUrlRef = useRef(
    initialUrlBoardState.expectedDecisions,
  )
  const addedToMatchFromUrlRef = useRef(
    initialUrlBoardState.addedToMatch,
  )
  const knownDoubleMatchPersonFromUrlRef = useRef(initialUrlBoardState.knownDoubleMatchPersonId)
  const animationSequenceRef = useRef(0)
  const pairSearchAbortRef = useRef<AbortController | null>(null)
  const [isSearchingPair, setIsSearchingPair] = useState(false)
  const [pairSearchMessage, setPairSearchMessage] = useState<string | null>(null)
  const [jointCheck, setJointCheck] = useState<{ state: MatchBoardState; impossible: boolean } | null>(null)
  const [datapoints, setDatapoints] = useState<Datapoint[]>([])
  const [seasonPeople, setSeasonPeople] = useState<Person[]>([])
  const [boardState, setBoardState] = useState<MatchBoardState>(() =>
    boardManager.getSnapshot(),
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isAnimatingInference, setIsAnimatingInference] = useState(false)
  const [highlightedTimelineEntryId, setHighlightedTimelineEntryId] =
    useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null)
  const [selectedSeasonKey, setSelectedSeasonKey] =
    useState<SeasonKey>(initialUrlBoardState.seasonKey)
  const [maxMatchingNightValue, setMaxMatchingNightValue] = useState(
    initialUrlBoardState.maxMatchingNightValue,
  )
  const [includeMaxMatchingNight, setIncludeMaxMatchingNight] = useState(
    initialUrlBoardState.includeMaxMatchingNight,
  )
  const [urlReloadKey, setUrlReloadKey] = useState(0)
  const [boardLoadMeta, setBoardLoadMeta] =
    useState<MatchBoardLoadMeta>(EMPTY_LOAD_META)
  const [selectedPairKey, setSelectedPairKey] = useState<MatchKey | null>(() =>
    findFirstPairKey(boardManager.getSnapshot()),
  )
  const maxMatchingNight = parseMatchingNightLimit(maxMatchingNightValue)
  const effectiveIncludeMaxMatchingNight =
    maxMatchingNight === null ? true : includeMaxMatchingNight
  const hasMatchData =
    boardLoadMeta.loadedNightCount > 0 || boardLoadMeta.loadedMatchBoxCount > 0
  const activeLeftCount = getActivePeople(boardState, 'left').length
  const activeRightCount = getActivePeople(boardState, 'right').length
  const contradictions = !isLoading && (hasMatchData || boardLoadMeta.usedFallbackSample)
    ? getMatchBoardContradictions(boardState) : []
  if (jointCheck?.state === boardState && jointCheck.impossible && contradictions.length === 0) {
    contradictions.push({ id: 'joint-assignment', pairKeys: [],
      message: 'No complete assignment satisfies all matching nights and partner requirements together. Revert an expected decision to resolve the conflict.',
    })
  }
  const matchingNightCutoffLabel =
    maxMatchingNight === null
      ? 'All matching nights'
      : effectiveIncludeMaxMatchingNight
        ? `Through matching night ${maxMatchingNight}`
        : `Through match-box ${maxMatchingNight}`

  function applyBoardSnapshot(
    nextState: MatchBoardState,
    preferredPairKey?: MatchKey,
  ) {
    setBoardState(nextState)
    setSelectedPairKey((current) =>
      preferredPairKey && nextState.matches[preferredPairKey]
        ? preferredPairKey
        : current && nextState.matches[current]
          ? current
          : findFirstPairKey(nextState),
    )
  }

  const applyBoardMovesFromUrl = useCallback(() => {
    boardManager.setKnownDoubleMatchPerson(knownDoubleMatchPersonFromUrlRef.current)
    const snapshot = boardManager.setExpectedMatchStagesWithPlan(
      expectedDecisionsFromUrlRef.current,
      { skipFixedPairs: false },
    ).finalSnapshot

    return addedToMatchFromUrlRef.current
      ? boardManager.setAddedToMatch(addedToMatchFromUrlRef.current)
      : snapshot
  }, [boardManager])

  const clearExpectedDecisions = useCallback(() => {
    let snapshot = boardManager.getSnapshot()

    for (const decision of getExpectedDecisionsFromBoard(snapshot)) {
      snapshot = boardManager.revertMatchStageByKey(decision.pairKey)
    }

    return snapshot
  }, [boardManager])

  const stopInferenceAnimation = useCallback(() => {
    animationSequenceRef.current += 1
    pairSearchAbortRef.current?.abort()
    setIsSearchingPair(false)
    setPairSearchMessage(null)
    setIsAnimatingInference(false)
    setHighlightedTimelineEntryId(null)
  }, [])

  const waitForAnimation = useCallback(async (durationMs: number, sequenceId: number) => {
    if (durationMs <= 0) {
      return animationSequenceRef.current === sequenceId
    }

    await new Promise((resolve) => window.setTimeout(resolve, durationMs))
    return animationSequenceRef.current === sequenceId
  }, [])

  const findTimelineEntryIdForStep = useCallback(
    (snapshot: MatchBoardState, step: MatchDerivationStep) => {
      if (step.sourceMatchingNightId) {
        return step.sourceMatchingNightId
      }

      const matchingNightEntry = snapshot.matchingNights.find((night) =>
        night.pairKeys.includes(step.pairKey),
      )

      if (matchingNightEntry) {
        return matchingNightEntry.id
      }

      const matchBoxEntry = snapshot.matchBoxes.find(
        (matchBox) => matchBox.pairKey === step.pairKey,
      )

      return matchBoxEntry?.id ?? null
    },
    [],
  )

  const getDerivationDelayMs = useCallback((step: MatchDerivationStep) => {
    switch (step.reason) {
      case 'matching-night-clear-match':
      case 'single-remaining-pair':
        return 0
      case 'matching-night-clear-no-match':
      case 'added-to-match-positive':
      case 'added-to-match-exclusion':
      case 'positive-pair-exclusion':
      case 'state-possibility-exclusion':
        return 0
    }
  }, [])

  const runStageChangePlan = useCallback(
    (
      pairKey: MatchKey | undefined,
      plan: ReturnType<MatchBoardManager['setMatchStageByKeyWithPlan']>,
    ) => {
      applyBoardSnapshot(plan.immediateSnapshot, pairKey)

      if (plan.derivationSteps.length === 0) {
        return
      }

      const sequenceId = animationSequenceRef.current + 1
      animationSequenceRef.current = sequenceId
      setIsAnimatingInference(true)

      void (async () => {
        let animatedState = plan.immediateSnapshot

        for (const step of plan.derivationSteps) {
          if (animationSequenceRef.current !== sequenceId) {
            return
          }

          animatedState = applyDerivationStep(animatedState, step)
          applyBoardSnapshot(animatedState, pairKey)

          const delayMs = getDerivationDelayMs(step)

          if (isPositiveMatchStage(step.stage)) {
            const timelineEntryId = findTimelineEntryIdForStep(plan.finalSnapshot, step)
            setHighlightedTimelineEntryId(timelineEntryId)
            const didFinishHighlight = await waitForAnimation(delayMs, sequenceId)

            if (!didFinishHighlight) {
              return
            }

            setHighlightedTimelineEntryId(null)
            continue
          }

          const didFinishDelay = await waitForAnimation(delayMs, sequenceId)

          if (!didFinishDelay) {
            return
          }
        }

        if (animationSequenceRef.current !== sequenceId) {
          return
        }

        applyBoardSnapshot(plan.finalSnapshot, pairKey)
        setHighlightedTimelineEntryId(null)
        setIsAnimatingInference(false)
      })()
    },
    [
      findTimelineEntryIdForStep,
      getDerivationDelayMs,
      waitForAnimation,
    ],
  )

  const setExpectedMatchStage = useCallback(
    (pairKey: MatchKey, stage: MatchStage) => {
      stopInferenceAnimation()

      const plan = boardManager.setMatchStageByKeyWithPlan(pairKey, stage)
      runStageChangePlan(pairKey, plan)
    },
    [boardManager, runStageChangePlan, stopInferenceAnimation],
  )

  const revertExpectedMatchStage = useCallback(
    (pairKey: MatchKey) => {
      stopInferenceAnimation()

      const plan = boardManager.revertMatchStageByKeyWithPlan(pairKey)
      runStageChangePlan(pairKey, plan)
    },
    [
      boardManager,
      runStageChangePlan,
      stopInferenceAnimation,
    ],
  )

  const setAddedToMatch = useCallback(
    (move: AddedToMatchMove | null) => {
      stopInferenceAnimation()

      const plan = boardManager.setAddedToMatchWithPlan(move)
      runStageChangePlan(selectedPairKey ?? undefined, plan)
    },
    [
      boardManager,
      runStageChangePlan,
      selectedPairKey,
      stopInferenceAnimation,
    ],
  )

  const setKnownDoubleMatchPerson = useCallback((personId: string | null) => {
    stopInferenceAnimation()
    const plan = boardManager.setKnownDoubleMatchPersonWithPlan(personId)
    runStageChangePlan(selectedPairKey ?? undefined, plan)
  }, [boardManager, runStageChangePlan, selectedPairKey, stopInferenceAnimation])

  const loadIntoState = useCallback(
    async (signal?: AbortSignal) => {
      stopInferenceAnimation()
      setIsLoading(true)

      try {
        const seasonData = await loadSeasonDatapoints({
          signal,
          pk: selectedSeasonKey,
        })
        const nextBoard = boardManager.hydrateFromSeasonDatapoints(seasonData, {
          maxMatchingNight,
          includeMaxMatchingNight: effectiveIncludeMaxMatchingNight,
        })
        const nextBoardSnapshot = applyBoardMovesFromUrl()

        if (signal?.aborted) {
          return
        }

        setDatapoints(seasonData.items)
        setSeasonPeople(parseSeasonPeople(seasonData))
        applyBoardSnapshot(nextBoardSnapshot)
        setBoardLoadMeta(nextBoard.meta)
        setErrorMessage(null)
        setLastLoadedAt(
          new Intl.DateTimeFormat(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }).format(new Date()),
        )
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        const fallbackBoard = boardManager.hydrateFromDatapoints([], {
          maxMatchingNight,
          includeMaxMatchingNight: effectiveIncludeMaxMatchingNight,
        })
        const fallbackBoardSnapshot = applyBoardMovesFromUrl()

        setDatapoints([])
        setSeasonPeople([])
        applyBoardSnapshot(fallbackBoardSnapshot)
        setBoardLoadMeta(fallbackBoard.meta)
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'The datapoints endpoint could not be reached.',
        )
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false)
        }
      }
    },
    [
      applyBoardMovesFromUrl,
      boardManager,
      effectiveIncludeMaxMatchingNight,
      maxMatchingNight,
      selectedSeasonKey,
      stopInferenceAnimation,
    ],
  )

  function refreshDatapoints() {
    stopInferenceAnimation()
    setIsLoading(true)
    setErrorMessage(null)
    void loadIntoState()
  }

  useEffect(() => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      void loadIntoState(controller.signal)
    }, 0)

    return () => {
      stopInferenceAnimation()
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [loadIntoState, stopInferenceAnimation, urlReloadKey])

  useEffect(() => {
    function handlePopState() {
      stopInferenceAnimation()
      setIsLoading(true)
      const nextUrlBoardState = parseUrlBoardState()

      expectedDecisionsFromUrlRef.current = nextUrlBoardState.expectedDecisions
      addedToMatchFromUrlRef.current = nextUrlBoardState.addedToMatch
      knownDoubleMatchPersonFromUrlRef.current = nextUrlBoardState.knownDoubleMatchPersonId
      setSelectedSeasonKey(nextUrlBoardState.seasonKey)
      setMaxMatchingNightValue(nextUrlBoardState.maxMatchingNightValue)
      setIncludeMaxMatchingNight(nextUrlBoardState.includeMaxMatchingNight)
      setUrlReloadKey((current) => current + 1)
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [stopInferenceAnimation])

  useEffect(() => {
    if (isLoading) {
      return
    }

    const expectedDecisions = getExpectedDecisionsFromBoard(boardState)
    expectedDecisionsFromUrlRef.current = expectedDecisions
    addedToMatchFromUrlRef.current = boardState.addedToMatch
    knownDoubleMatchPersonFromUrlRef.current = boardState.knownDoubleMatchPersonId ?? null
    updateBoardUrl({
      seasonKey: selectedSeasonKey,
      maxMatchingNightValue,
      includeMaxMatchingNight: effectiveIncludeMaxMatchingNight,
      expectedDecisions,
      addedToMatch: boardState.addedToMatch,
      knownDoubleMatchPersonId: boardState.knownDoubleMatchPersonId ?? null,
    })
  }, [
    boardState,
    effectiveIncludeMaxMatchingNight,
    isLoading,
    maxMatchingNightValue,
    selectedSeasonKey,
  ])

  useEffect(() => {
    if (isLoading || isAnimatingInference || !hasMatchData) return
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      void checkJointMatchBoardState(boardState, { signal: controller.signal }).then(result => {
        if (!controller.signal.aborted) setJointCheck({ state: boardState, impossible: result === 'impossible' })
      })
    }, 100)
    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [boardState, hasMatchData, isAnimatingInference, isLoading])

  async function loadAllForcedPairs() {
    if (isLoading || isAnimatingInference || isSearchingPair || contradictions.length > 0) return
    pairSearchAbortRef.current?.abort()
    const controller = new AbortController()
    pairSearchAbortRef.current = controller
    setIsSearchingPair(true)
    setPairSearchMessage(null)
    try {
      const result = await findForcedPairs(boardManager.getSnapshot(), { signal: controller.signal })
      if (controller.signal.aborted || result.kind === 'cancelled') return
      if (result.kind === 'found') {
        stopInferenceAnimation()
        const plan = boardManager.setExpectedMatchStagesWithPlan(result.decisions)
        runStageChangePlan(undefined, plan)
        const matches = result.decisions.filter(decision => decision.stage === 'exp-match').length
        const noMatches = result.decisions.length - matches
        setPairSearchMessage(`Added ${matches} expected ${matches === 1 ? 'match' : 'matches'} and ${noMatches} expected ${noMatches === 1 ? 'no-match' : 'no-matches'}.`)
      } else if (result.kind === 'contradiction') {
        setJointCheck({ state: boardState, impossible: true })
        setPairSearchMessage('Resolve the contradictions before loading forced pairs.')
      } else if (result.kind === 'limit') {
        setPairSearchMessage('The search stopped before all proofs were complete. No decisions were added.')
      } else {
        setPairSearchMessage('No additional unresolved pairs are forced by the current evidence and expectations.')
      }
    } catch {
      if (!controller.signal.aborted) setPairSearchMessage('The search could not finish. No decisions were added.')
    } finally {
      if (pairSearchAbortRef.current === controller) setIsSearchingPair(false)
    }
  }

  function handleSeasonChange(nextSeasonKey: SeasonKey) {
    stopInferenceAnimation()
    expectedDecisionsFromUrlRef.current = []
    addedToMatchFromUrlRef.current = null
    knownDoubleMatchPersonFromUrlRef.current = null
    applyBoardSnapshot(clearExpectedDecisions())
    setIsLoading(true)
    setSelectedSeasonKey(nextSeasonKey)
    updateBoardUrl({
      seasonKey: nextSeasonKey,
      maxMatchingNightValue,
      includeMaxMatchingNight: effectiveIncludeMaxMatchingNight,
      expectedDecisions: [],
      addedToMatch: null,
      knownDoubleMatchPersonId: null,
    })
  }

  function handleMaxMatchingNightChange(nextValue: string) {
    stopInferenceAnimation()
    setIsLoading(true)
    setMaxMatchingNightValue(nextValue)
    updateBoardUrl({
      seasonKey: selectedSeasonKey,
      maxMatchingNightValue: nextValue,
      includeMaxMatchingNight: effectiveIncludeMaxMatchingNight,
      expectedDecisions: getExpectedDecisionsFromBoard(boardState),
      addedToMatch: boardState.addedToMatch,
      knownDoubleMatchPersonId: boardState.knownDoubleMatchPersonId ?? null,
    })
  }

  function handleIncludeMaxMatchingNightToggle() {
    stopInferenceAnimation()
    if (maxMatchingNight === null) {
      return
    }

    const nextValue = !includeMaxMatchingNight

    setIsLoading(true)
    setIncludeMaxMatchingNight(nextValue)
    updateBoardUrl({
      seasonKey: selectedSeasonKey,
      maxMatchingNightValue,
      includeMaxMatchingNight: nextValue,
      expectedDecisions: getExpectedDecisionsFromBoard(boardState),
      addedToMatch: boardState.addedToMatch,
      knownDoubleMatchPersonId: boardState.knownDoubleMatchPersonId ?? null,
    })
  }

  return (
    <main className="app-shell">
      {contradictions.length > 0 ? (
        <aside className="contradiction-alert" role="alert" aria-live="assertive" aria-label="Board contradictions">
          <div className="contradiction-alert__heading">
            <strong>Contradictions</strong>
            <span>{contradictions.length}</span>
          </div>
          <ul>{contradictions.map(contradiction => <li key={contradiction.id}>{contradiction.message}</li>)}</ul>
          <p>Review your expected decisions below. This stays visible until the conflicts are resolved.</p>
        </aside>
      ) : null}
      {!isLoading && seasonPeople.length > 0 ? (
        <section className="candidate-panel" aria-labelledby="candidate-heading">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Current cast</span>
              <h1 id="candidate-heading">Candidates</h1>
            </div>
            <strong className="candidate-count">
              {seasonPeople.length} candidates · {activeLeftCount} active women / {activeRightCount} active men
            </strong>
          </div>
          <div className="candidate-grid">
            {seasonPeople.map((person) => (
              <AddToMatchPersonCard
                key={person.id}
                state={boardState}
                person={person}
                size="lg"
                onSetAddedToMatch={
                  isAnimatingInference ? undefined : setAddedToMatch
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="board-layout">
        <section className="timeline-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Ordered Display</span>
              <h2>Matching nights and match-boxes</h2>
            </div>
            <p className="section-copy">
              Matching nights render their pairs plus the live <code>x/y</code>{' '}
              value and open-match ratio, while each match-box renders a single
              pair.
            </p>
          </div>

          {isLoading ? (
            <div className="empty-state">
              <p>Loading season data...</p>
            </div>
          ) : null}

          {!isLoading && boardState.timeline.length === 0 ? (
            <div className="empty-state">
              <p>
                No matching nights or match-boxes have been published for this
                season yet.
              </p>
            </div>
          ) : null}

          {!isLoading && boardState.timeline.length > 0 ? (
            <div className="timeline-stack">
              {boardState.timeline.map((entry) => (
                <TimelineEntryCard
                  key={`${entry.kind}:${entry.id}`}
                  state={boardState}
                  entry={entry}
                  selectedPairKey={selectedPairKey}
                  highlightedTimelineEntryId={highlightedTimelineEntryId}
                  onSelectPair={setSelectedPairKey}
                  onSetStage={isAnimatingInference ? undefined : setExpectedMatchStage}
                />
              ))}
            </div>
          ) : null}
        </section>

        <section className="board-side-panel">
          <div className="board-side-controls">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Season Setup</span>
                <h2>Choose season</h2>
              </div>
            </div>

            <div className="board-controls" aria-label="Board filters">
              <label className="field-control">
                <span>Season</span>
                <select
                  value={selectedSeasonKey}
                  onChange={(event) =>
                    handleSeasonChange(event.target.value as SeasonKey)
                  }
                >
                  {SEASON_OPTIONS.map((season) => (
                    <option key={season.key} value={season.key}>
                      {season.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-control">
                <span>Use through night</span>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={maxMatchingNightValue}
                  onChange={(event) =>
                    handleMaxMatchingNightChange(event.target.value)
                  }
                />
              </label>
              <label className="field-control field-control--toggle">
                <span>Matching night</span>
                <button
                  type="button"
                  className={[
                    'night-toggle-button',
                    effectiveIncludeMaxMatchingNight
                      ? 'night-toggle-button--active'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={effectiveIncludeMaxMatchingNight}
                  disabled={maxMatchingNight === null}
                  onClick={handleIncludeMaxMatchingNightToggle}
                >
                  {maxMatchingNight === null
                    ? 'All included'
                    : effectiveIncludeMaxMatchingNight
                      ? `Include MN ${maxMatchingNight}`
                      : `Stop before MN ${maxMatchingNight}`}
                </button>
              </label>
            </div>
            <div className="forced-pair-controls">
              <button type="button" className="primary-button" onClick={() => void loadAllForcedPairs()}
                disabled={isLoading || isAnimatingInference || isSearchingPair || contradictions.length > 0 || !hasMatchData}>
                {isSearchingPair ? 'Loading forced pairs…' : 'Load all forced pairs'}
              </button>
              <p className="forced-pair-controls__message" role="status" aria-live="polite">
                {pairSearchMessage ?? 'Add all proven matches and no-matches for unresolved pairings to your expected decisions.'}
              </p>
            </div>
          </div>

          {hasMatchData || boardLoadMeta.usedFallbackSample ? (
            <div className="board-side-columns">
              <section className="board-analysis-row">
                <MatchMatrixPanel
                  state={boardState}
                  selectedPairKey={selectedPairKey}
                  onSelectPair={setSelectedPairKey}
                  onSetStage={isAnimatingInference ? undefined : setExpectedMatchStage}
                />
              </section>

              <section className="board-selected-row">
                <SelectedPairCard
                  state={boardState}
                  pairKey={selectedPairKey}
                  onSelectPair={setSelectedPairKey}
                  onSetStage={isAnimatingInference ? undefined : setExpectedMatchStage}
                />
                <ExpectedDecisionsPanel
                  state={boardState}
                  selectedPairKey={selectedPairKey}
                  onSelectPair={setSelectedPairKey}
                  onRevertStage={
                    isAnimatingInference ? undefined : revertExpectedMatchStage
                  }
                  onSetAddedToMatch={
                    isAnimatingInference ? undefined : setAddedToMatch
                  }
                  onSetKnownDoubleMatchPerson={
                    isAnimatingInference ? undefined : setKnownDoubleMatchPerson
                  }
                />
              </section>
            </div>
          ) : !isLoading && seasonPeople.length > 0 ? (
            <div className="empty-state board-pending-state">
              <p>
                The candidates are ready. The match matrix will appear when the
                first match-box or matching night is published.
              </p>
            </div>
          ) : null}
        </section>
      </section>

      <section className="intro-panel">
        <span className={`status-pill ${errorMessage ? 'error' : 'ready'}`}>
          {isLoading
            ? 'Loading match data'
              : errorMessage
              ? 'Connection issue'
              : boardLoadMeta.usedFallbackSample
                ? 'Showing local sample layout'
                : !hasMatchData && seasonPeople.length > 0
                  ? `${seasonPeople.length} candidates loaded for ${selectedSeasonKey}`
                : `${boardLoadMeta.loadedNightCount} nights and ${boardLoadMeta.loadedMatchBoxCount} match-boxes loaded for ${selectedSeasonKey}`}
        </span>

        <h1>Match board frontend</h1>
        <p className="lead">
          The screen is composed from a reusable person tile and a reusable pair
          tile. Matching nights, match-boxes, and the full 110-match side matrix
          all read their color state from one normalized store.
        </p>

        <div className="hero-actions">
          <button
            type="button"
            className="primary-button"
            onClick={refreshDatapoints}
            disabled={isLoading}
          >
            {isLoading ? 'Refreshing...' : 'Reload season data'}
          </button>
          <p className="timestamp">
            {lastLoadedAt
              ? `Last synced at ${lastLoadedAt}`
              : 'Waiting for the first successful sync'}
          </p>
        </div>

        <div className="info-grid">
          <article className="info-card">
            <span className="info-card__label">Season pk</span>
            <strong>{selectedSeasonKey}</strong>
          </article>
          <article className="info-card">
            <span className="info-card__label">Night cutoff</span>
            <strong>{matchingNightCutoffLabel}</strong>
          </article>
          <article className="info-card">
            <span className="info-card__label">Endpoint</span>
            <strong>{DATAPOINTS_ENDPOINT}</strong>
          </article>
          <article className="info-card">
            <span className="info-card__label">Datapoints read</span>
            <strong>{datapoints.length}</strong>
          </article>
        </div>

        {errorMessage ? (
          <p className="error-banner">{errorMessage}</p>
        ) : (
          <p className="support-copy">
            {seasonPeople.length > 0 && !hasMatchData
              ? 'Candidate profiles are live. Match data will be added here as the season progresses.'
              : 'The board is synchronized with the latest season data.'}
          </p>
        )}
      </section>
    </main>
  )
}

export default App
