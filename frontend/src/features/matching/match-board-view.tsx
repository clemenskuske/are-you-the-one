import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  MATCH_STAGE_LABELS,
  MATCH_STAGE_ORDER,
  getAddToMatchOptions,
  getAddedToMatchMoves,
  getPersonSide,
  getAddedToMatchSharedPersonId,
  getLargerSide,
  getLargerSidePeople,
  getKnownDoubleMatchOptions,
  isPositiveMatchStage,
  type AddedToMatchMove,
  type MatchBoardState,
  type MatchKey,
  type MatchStage,
  type Person,
  type Side,
  summarizeMatchingNight,
  summarizePersonMatchOptions,
  tallyMatchStages,
} from './match-board'

type PersonCardProps = {
  person: Person
  size?: 'sm' | 'md' | 'lg'
}

type MatchPairButtonProps = {
  state: MatchBoardState
  pairKey: MatchKey
  size?: 'sm' | 'md' | 'lg'
  selected?: boolean
  onClick?: (pairKey: MatchKey) => void
  onSetStage?: (pairKey: MatchKey, stage: MatchStage) => void
}

type MatchMatrixPanelProps = {
  state: MatchBoardState
  selectedPairKey: MatchKey | null
  onSelectPair: (pairKey: MatchKey) => void
  onSetStage?: (pairKey: MatchKey, stage: MatchStage) => void
}

type ExpectedDecisionsPanelProps = {
  state: MatchBoardState
  selectedPairKey: MatchKey | null
  onSelectPair: (pairKey: MatchKey) => void
  onRevertStage?: (pairKey: MatchKey) => void
  onSetAddedToMatch?: (move: AddedToMatchMove | null) => void
  onSetKnownDoubleMatchPerson?: (personId: string | null) => void
}

export function PersonCard({ person, size = 'md' }: PersonCardProps) {
  const hasImage = Boolean(person.imageUrl)
  const hasName = Boolean(person.name)

  return (
    <article
      className={[
        'person-card',
        `person-card--${size}`,
        hasImage ? '' : 'person-card--name-only',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {hasImage ? (
        <img
          className="person-card__image"
          src={person.imageUrl ?? undefined}
          alt={hasName ? person.name : ''}
        />
      ) : null}
      {hasName ? <span className="person-card__name">{person.name}</span> : null}
    </article>
  )
}

export function AddToMatchPersonCard({
  state,
  person,
  size = 'md',
  onSetAddedToMatch,
}: PersonCardProps & {
  state: MatchBoardState
  onSetAddedToMatch?: (move: AddedToMatchMove | null) => void
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [menuAlignment, setMenuAlignment] = useState<'left' | 'center' | 'right'>(
    'center',
  )
  const shellRef = useRef<HTMLDivElement | null>(null)
  const largerSidePeople = getLargerSidePeople(state)
  const isOnLargerSide = largerSidePeople.some(
    (largerSidePerson) => largerSidePerson.id === person.id,
  )
  const isAddedPerson = state.addedToMatch?.personId === person.id
  const canOpenMenu = (isOnLargerSide || isAddedPerson) && typeof onSetAddedToMatch === 'function'
  const targetOptions = getAddToMatchOptions(state, person.id)

  useEffect(() => {
    if (!isMenuOpen) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        shellRef.current &&
        event.target instanceof Node &&
        !shellRef.current.contains(event.target)
      ) {
        setIsMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isMenuOpen])

  function selectMove(move: AddedToMatchMove | null) {
    onSetAddedToMatch?.(move)
    setIsMenuOpen(false)
  }

  function toggleMenu() {
    if (!isMenuOpen && shellRef.current) {
      const bounds = shellRef.current.getBoundingClientRect()
      const menuHalfWidth = Math.min(320, window.innerWidth - 32) / 2

      setMenuAlignment(
        bounds.left + bounds.width / 2 < menuHalfWidth
          ? 'left'
          : window.innerWidth - bounds.right + bounds.width / 2 < menuHalfWidth
            ? 'right'
            : 'center',
      )
    }

    setIsMenuOpen((current) => !current)
  }

  if (!canOpenMenu) {
    const isResolved = getAddedToMatchMoves(state).some(move => move.personId === person.id)
    return <div className={isResolved ? 'candidate-resolved' : undefined}>
      <PersonCard person={person} size={size} />
      {isResolved ? <span className="candidate-resolved__label">Resolved shared match</span> : null}
    </div>
  }

  return (
    <div ref={shellRef} className="candidate-action-shell">
      <button
        type="button"
        className={[
          'candidate-action-button',
          isAddedPerson ? 'candidate-action-button--added' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={
          isAddedPerson
            ? `Manage added match for ${person.name ?? person.id}`
            : `Add ${person.name ?? person.id} to match`
        }
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        title={isAddedPerson ? 'Added to a match' : 'Add to match'}
        onClick={toggleMenu}
      >
        <PersonCard person={person} size={size} />
      </button>

      {isMenuOpen ? (
        <div
          className={`candidate-action-menu candidate-action-menu--${menuAlignment}`}
          role="menu"
          aria-label={`Add ${person.name ?? person.id} to a match`}
        >
          <span className="candidate-action-menu__eyebrow">Add to match</span>
          {isAddedPerson ? (
            <button
              type="button"
              className="candidate-action-menu__remove"
              onClick={() => selectMove(null)}
            >
              Remove from match
            </button>
          ) : targetOptions.length > 0 ? (
            targetOptions.map((targetPair) => (
              <button
                key={targetPair.key}
                type="button"
                onClick={() =>
                  selectMove({ personId: person.id, pairKey: targetPair.key })
                }
              >
                <strong>Add to match</strong>
                <span>{formatPairLabel(state, targetPair.key)}</span>
              </button>
            ))
          ) : (
            <p>Find a match first, then add this contestant to it.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

export function MatchPairButton({
  state,
  pairKey,
  size = 'md',
  selected = false,
  onClick,
  onSetStage,
}: MatchPairButtonProps) {
  const match = state.matches[pairKey]
  const [isStageMenuOpen, setIsStageMenuOpen] = useState(false)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const canChooseExpectedStage =
    match?.stage === 'undefined' && typeof onSetStage === 'function'

  useEffect(() => {
    if (!isStageMenuOpen) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        shellRef.current &&
        event.target instanceof Node &&
        !shellRef.current.contains(event.target)
      ) {
        setIsStageMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isStageMenuOpen])

  if (!match) {
    return null
  }

  const leftPerson = state.leftPeople.find((person) => person.id === match.leftId)
  const rightPerson = state.rightPeople.find(
    (person) => person.id === match.rightId,
  )

  if (!leftPerson || !rightPerson) {
    return null
  }

  function handleClick() {
    onClick?.(pairKey)

    if (!canChooseExpectedStage) {
      setIsStageMenuOpen(false)
      return
    }

    setIsStageMenuOpen((current) => !current)
  }

  function handleStageSelect(stage: MatchStage) {
    onSetStage?.(pairKey, stage)
    setIsStageMenuOpen(false)
  }

  return (
    <div ref={shellRef} className="match-pair-shell">
      <button
        type="button"
        className={[
          'match-pair',
          `match-pair--${match.stage}`,
          `match-pair--${size}`,
          selected ? 'is-selected' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={handleClick}
        title={`${leftPerson.name ?? leftPerson.id} + ${
          rightPerson.name ?? rightPerson.id
        }`}
        aria-expanded={canChooseExpectedStage ? isStageMenuOpen : undefined}
        aria-haspopup={canChooseExpectedStage ? 'menu' : undefined}
      >
        <PersonCard person={leftPerson} size={size === 'lg' ? 'md' : 'sm'} />
        <span className="match-pair__divider" aria-hidden="true">
          +
        </span>
        <PersonCard person={rightPerson} size={size === 'lg' ? 'md' : 'sm'} />
        <span className="match-pair__stage">{MATCH_STAGE_LABELS[match.stage]}</span>
      </button>

      {canChooseExpectedStage && isStageMenuOpen ? (
        <div className="match-pair-menu" role="menu" aria-label="Choose expected state">
          <button
            type="button"
            className="match-pair-menu__button match-pair-menu__button--no-match"
            onClick={() => handleStageSelect('exp-no-match')}
          >
            no-match
          </button>
          <button
            type="button"
            className="match-pair-menu__button match-pair-menu__button--match"
            onClick={() => handleStageSelect('exp-match')}
          >
            match
          </button>
        </div>
      ) : null}
    </div>
  )
}

function MatchStageMenu({
  ariaLabel,
  className = '',
  onSelectStage,
}: {
  ariaLabel: string
  className?: string
  onSelectStage: (stage: MatchStage) => void
}) {
  return (
    <div
      className={['match-pair-menu', className].filter(Boolean).join(' ')}
      role="menu"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="match-pair-menu__button match-pair-menu__button--no-match"
        onClick={() => onSelectStage('exp-no-match')}
      >
        no-match
      </button>
      <button
        type="button"
        className="match-pair-menu__button match-pair-menu__button--match"
        onClick={() => onSelectStage('exp-match')}
      >
        match
      </button>
    </div>
  )
}

function MatchMatrixCell({
  state,
  pairKey,
  selected,
  onSelectPair,
  onSetStage,
}: {
  state: MatchBoardState
  pairKey: MatchKey
  selected: boolean
  onSelectPair: (pairKey: MatchKey) => void
  onSetStage?: (pairKey: MatchKey, stage: MatchStage) => void
}) {
  const match = state.matches[pairKey]
  const [isStageMenuOpen, setIsStageMenuOpen] = useState(false)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const canChooseExpectedStage =
    match?.stage === 'undefined' && typeof onSetStage === 'function'

  useEffect(() => {
    if (!isStageMenuOpen) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        shellRef.current &&
        event.target instanceof Node &&
        !shellRef.current.contains(event.target)
      ) {
        setIsStageMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isStageMenuOpen])

  if (!match) {
    return null
  }

  const leftPerson = state.leftPeople.find((person) => person.id === match.leftId)
  const rightPerson = state.rightPeople.find(
    (person) => person.id === match.rightId,
  )

  if (!leftPerson || !rightPerson) {
    return null
  }

  function handleClick() {
    onSelectPair(pairKey)

    if (!canChooseExpectedStage) {
      setIsStageMenuOpen(false)
      return
    }

    setIsStageMenuOpen((current) => !current)
  }

  function handleStageSelect(stage: MatchStage) {
    onSetStage?.(pairKey, stage)
    setIsStageMenuOpen(false)
  }

  return (
    <div ref={shellRef} className="matrix-cell-shell">
      <button
        type="button"
        className={[
          'matrix-cell',
          `matrix-cell--${match.stage}`,
          selected ? 'is-selected' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={`${leftPerson.name ?? leftPerson.id} + ${
          rightPerson.name ?? rightPerson.id
        }`}
        onClick={handleClick}
        aria-expanded={canChooseExpectedStage ? isStageMenuOpen : undefined}
        aria-haspopup={canChooseExpectedStage ? 'menu' : undefined}
      />

      {canChooseExpectedStage && isStageMenuOpen ? (
        <MatchStageMenu
          ariaLabel="Choose expected state"
          className="match-pair-menu--matrix"
          onSelectStage={handleStageSelect}
        />
      ) : null}
    </div>
  )
}

function MatchMatrixPersonLabel({
  state,
  person,
  side,
  alertLabel,
}: {
  state: MatchBoardState
  person: Person
  side: Side
  alertLabel: string | null
}) {
  const moves = getAddedToMatchMoves(state)
  const isAddedPerson = moves.some(move => move.personId === person.id)
  const isSharedPerson = moves.some(move => getAddedToMatchSharedPersonId(state, move) === person.id)

  const className = [
    'matrix-axis-label',
    `matrix-axis-label--${side === 'left' ? 'row' : 'column'}`,
    alertLabel ? 'matrix-axis-label--warning' : '',
    isAddedPerson ? 'matrix-axis-label--added-person' : '',
    isSharedPerson ? 'matrix-axis-label--shared-person' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const label = (
    <span className={side === 'right' ? 'matrix-axis-label-text' : undefined}>
      {person.name ?? person.id}
    </span>
  )

  return (
    <div
      className={`matrix-axis-label-shell matrix-axis-label-shell--${
        side === 'left' ? 'row' : 'column'
      }`}
    >
      <span
        className={className}
        title={
          alertLabel ??
          (isAddedPerson
            ? 'Added to a match'
            : isSharedPerson
              ? 'Shared by two matches'
              : undefined)
        }
      >
        {label}
      </span>
    </div>
  )
}

export function MatchMatrixPanel({
  state,
  selectedPairKey,
  onSelectPair,
  onSetStage,
}: MatchMatrixPanelProps) {
  const counts = tallyMatchStages(state.matches)
  const matrixGridStyle = {
    '--matrix-column-count': state.rightPeople.length,
  } as CSSProperties
  const leftAlertStateById = new Map(
    state.leftPeople.map((person) => [
      person.id,
      summarizePersonMatchOptions(state, person.id, 'left'),
    ]),
  )
  const rightAlertStateById = new Map(
    state.rightPeople.map((person) => [
      person.id,
      summarizePersonMatchOptions(state, person.id, 'right'),
    ]),
  )

  function getAlertLabel(
    summary:
      | ReturnType<typeof summarizePersonMatchOptions>
      | undefined,
  ) {
    if (!summary) {
      return null
    }

    if (summary.hasMultiplePositiveMatches) {
      return `More than ${summary.matchCapacity} positive partner(s)`
    }

    if (summary.hasNoPossibleMatches) {
      return summary.requiredMatchCount > 1
        ? 'Not enough possible matches'
        : 'No possible match'
    }

    return null
  }

  return (
    <aside className="matrix-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">All {Object.keys(state.matches).length} pairings</span>
          <h2>Color matrix</h2>
        </div>
      </div>

      <div className="matrix-legend">
        {MATCH_STAGE_ORDER.map((stage) => (
          <div key={stage} className="legend-row">
            <span className={`legend-swatch legend-swatch--${stage}`} />
            <span>{MATCH_STAGE_LABELS[stage]}</span>
            <strong>{counts[stage]}</strong>
          </div>
        ))}
      </div>

      <div className="matrix-shell" style={matrixGridStyle}>
        <div className="matrix-head">
          <span className="matrix-spacer" aria-hidden="true" />
          {state.rightPeople.map((person) => (
            <MatchMatrixPersonLabel
              key={person.id}
              state={state}
              person={person}
              side="right"
              alertLabel={getAlertLabel(rightAlertStateById.get(person.id))}
            />
          ))}
        </div>

        <div className="matrix-body">
          {state.leftPeople.map((leftPerson) => (
            <div key={leftPerson.id} className="matrix-row">
              <MatchMatrixPersonLabel
                state={state}
                person={leftPerson}
                side="left"
                alertLabel={getAlertLabel(leftAlertStateById.get(leftPerson.id))}
              />
              {state.rightPeople.map((rightPerson) => {
                const pairKey = `${leftPerson.id}:${rightPerson.id}` as MatchKey

                return (
                  <MatchMatrixCell
                    key={pairKey}
                    state={state}
                    pairKey={pairKey}
                    selected={selectedPairKey === pairKey}
                    onSelectPair={onSelectPair}
                    onSetStage={onSetStage}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}

export function ExpectedDecisionsPanel({
  state,
  selectedPairKey,
  onSelectPair,
  onRevertStage,
  onSetAddedToMatch,
  onSetKnownDoubleMatchPerson,
}: ExpectedDecisionsPanelProps) {
  const leftPeopleById = new Map(state.leftPeople.map((person) => [person.id, person]))
  const rightPeopleById = new Map(
    state.rightPeople.map((person) => [person.id, person]),
  )
  const expectedMatchPairs = Object.values(state.matches)
    .filter((pair) => pair.stage === 'exp-match')
    .sort((leftPair, rightPair) => leftPair.key.localeCompare(rightPair.key))
  const expectedNoMatchPairs = Object.values(state.matches)
    .filter((pair) => pair.stage === 'exp-no-match')
    .sort((leftPair, rightPair) => leftPair.key.localeCompare(rightPair.key))
  const largerSide = getLargerSide(state)
  const addedMoves = getAddedToMatchMoves(state)
  const knownDoubleOptions = getKnownDoubleMatchOptions(state)
  const knownDoublePerson = knownDoubleOptions.find(person => person.id === state.knownDoubleMatchPersonId)
  const baselineLargerSide = getLargerSide({ ...state, addedToMatch: null })

  function renderExpectedDecisionRow(pairKey: MatchKey, stage: 'exp-match' | 'exp-no-match') {
    const pair = state.matches[pairKey]

    if (!pair) {
      return null
    }

    const leftPerson = leftPeopleById.get(pair.leftId)
    const rightPerson = rightPeopleById.get(pair.rightId)
    const pairLabel = `${leftPerson?.name ?? pair.leftId} + ${
      rightPerson?.name ?? pair.rightId
    }`

    return (
      <div
        key={pair.key}
        className={[
          'decision-row',
          selectedPairKey === pair.key ? 'decision-row--selected' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <button
          type="button"
          className="decision-row__pair"
          onClick={() => onSelectPair(pair.key)}
        >
          {pairLabel}
        </button>
        <span className={`decision-chip decision-chip--${stage}`}>
          {stage === 'exp-match' ? 'match' : 'no-match'}
        </span>
        <button
          type="button"
          className="decision-row__revert"
          onClick={() => onRevertStage?.(pair.key)}
          disabled={!onRevertStage}
        >
          Revert
        </button>
      </div>
    )
  }

  return (
    <aside className="decision-panel-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Manual Decisions</span>
          <h2>Manage moves</h2>
        </div>
      </div>

      <section className="decision-panel">
        {knownDoubleOptions.length > 0 ? (
          <section className="decision-group decision-group--added-to-match">
            <label className="field-control">
              <span>Known double-match participant</span>
              <select aria-label="Known double-match participant"
                value={state.knownDoubleMatchPersonId ?? ''}
                disabled={!onSetKnownDoubleMatchPerson || Boolean(state.seasonKnownDoubleMatchPersonId)}
                onChange={event => onSetKnownDoubleMatchPerson?.(event.target.value || null)}>
                <option value="">Not yet known</option>
                {knownDoubleOptions.map(person => (
                  <option key={person.id} value={person.id}>{person.name ?? person.id}</option>
                ))}
              </select>
            </label>
            {state.seasonKnownDoubleMatchPersonId ? (
              <span className="decision-chip decision-chip--added-to-match">Confirmed season fact</span>
            ) : null}
            <p className="decision-group__empty">
              {knownDoublePerson
                ? getPersonSide(state, knownDoublePerson.id) === baselineLargerSide
                  ? `${knownDoublePerson.name ?? knownDoublePerson.id} shares their partner with another contestant. Their partner can stay unknown.`
                  : `${knownDoublePerson.name ?? knownDoublePerson.id} has two partners. Both partners can stay unknown.`
                : 'Select the contestant whose involvement is confirmed. You can choose their partners later.'}
            </p>
          </section>
        ) : null}
        {largerSide || addedMoves.length > 0 ? (
          <section className="decision-group decision-group--added-to-match">
            <div className="decision-group__head">
              <div>
                <span className="decision-group__eyebrow">Season rule</span>
                <h3>Shared matches</h3>
              </div>
              <strong>{addedMoves.length}</strong>
            </div>
            {addedMoves.map(move => {
              const personSide = getPersonSide(state, move.personId)
              const person = (personSide === 'left' ? state.leftPeople : state.rightPeople).find(item => item.id === move.personId)
              const known = (state.knownAddedToMatches ?? []).some(item => item.personId === move.personId)
              return (
                <div key={move.personId} className="decision-row decision-row--added-to-match">
                  <span className="decision-row__pair">
                    <strong>{person?.name ?? move.personId}</strong>
                    <span aria-hidden="true"> → </span>
                    {formatPairLabel(state, move.pairKey)}
                  </span>
                  <span className="decision-chip decision-chip--added-to-match">{known ? 'resolved' : 'expected'}</span>
                  {!known ? <button type="button" className="decision-row__revert"
                    onClick={() => onSetAddedToMatch?.(null)} disabled={!onSetAddedToMatch}>Remove</button> : null}
                </div>
              )
            })}
            {largerSide ? <p className="decision-group__empty">
              Choose an active contestant from the larger group above to add them to a known match.
            </p> : null}
          </section>
        ) : null}

        {expectedMatchPairs.length === 0 && expectedNoMatchPairs.length === 0 ? (
          <div className="empty-state decision-panel__empty">
            <p>No expected match decisions have been set yet.</p>
          </div>
        ) : (
          <div className="decision-groups">
            <section className="decision-group">
              <div className="decision-group__head">
                <h3>Expected matches</h3>
                <strong>{expectedMatchPairs.length}</strong>
              </div>
              <div className="decision-list">
                {expectedMatchPairs.length > 0 ? (
                  expectedMatchPairs.map((pair) =>
                    renderExpectedDecisionRow(pair.key, 'exp-match'),
                  )
                ) : (
                  <p className="decision-group__empty">No expected matches.</p>
                )}
              </div>
            </section>

            <section className="decision-group">
              <div className="decision-group__head">
                <h3>Expected no matches</h3>
                <strong>{expectedNoMatchPairs.length}</strong>
              </div>
              <div className="decision-list">
                {expectedNoMatchPairs.length > 0 ? (
                  expectedNoMatchPairs.map((pair) =>
                    renderExpectedDecisionRow(pair.key, 'exp-no-match'),
                  )
                ) : (
                  <p className="decision-group__empty">No expected no matches.</p>
                )}
              </div>
            </section>
          </div>
        )}
      </section>
    </aside>
  )
}

export function SelectedPairCard({
  state,
  pairKey,
  onSelectPair,
  onSetStage,
}: {
  state: MatchBoardState
  pairKey: MatchKey | null
  onSelectPair: (pairKey: MatchKey) => void
  onSetStage?: (pairKey: MatchKey, stage: MatchStage) => void
}) {
  if (!pairKey) {
    return (
      <section className="selected-pair-card">
        <span className="eyebrow">Selected Pair</span>
        <h2>No pair selected</h2>
      </section>
    )
  }

  const match = state.matches[pairKey]

  if (!match) {
    return null
  }

  const derivationPrerequisites = match.derivationPrerequisites.filter(
    (prerequisite) => Boolean(state.matches[prerequisite.pairKey]),
  )

  return (
    <section className="selected-pair-card">
      <span className="eyebrow">Selected Pair</span>
      <h2>{MATCH_STAGE_LABELS[match.stage]}</h2>
      <MatchPairButton
        state={state}
        pairKey={pairKey}
        size="lg"
        selected
        onSetStage={onSetStage}
      />
      {match.derivationText ? (
        <div className="selected-pair-card__derivation">
          <DerivationText text={match.derivationText} />
          {derivationPrerequisites.length > 0 ? (
            <div className="selected-pair-card__prerequisites">
              <span>Derived beforehand</span>
              <ul>
                {derivationPrerequisites.map((prerequisite) => (
                  <li key={prerequisite.pairKey}>
                    <button
                      type="button"
                      className={[
                        'selected-pair-card__prerequisite-button',
                        isPositiveMatchStage(prerequisite.stage)
                          ? 'selected-pair-card__prerequisite-button--match'
                          : 'selected-pair-card__prerequisite-button--no-match',
                      ].join(' ')}
                      onClick={() => onSelectPair(prerequisite.pairKey)}
                    >
                      <span>{formatPairLabel(state, prerequisite.pairKey)}</span>
                      <strong>{MATCH_STAGE_LABELS[prerequisite.stage]}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function DerivationText({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const bulletItems: string[] = []

  function flushBulletItems() {
    if (bulletItems.length === 0) {
      return
    }

    blocks.push(
      <ul key={`list-${blocks.length}`} className="selected-pair-card__deduction-list">
        {bulletItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>,
    )
    bulletItems.length = 0
  }

  for (const line of text.split('\n')) {
    const trimmedLine = line.trim()

    if (!trimmedLine) {
      flushBulletItems()
      continue
    }

    if (trimmedLine.startsWith('- ')) {
      bulletItems.push(trimmedLine.slice(2))
      continue
    }

    flushBulletItems()
    blocks.push(<p key={`text-${blocks.length}`}>{trimmedLine}</p>)
  }

  flushBulletItems()

  return <>{blocks}</>
}

function formatPairLabel(state: MatchBoardState, pairKey: MatchKey) {
  const match = state.matches[pairKey]

  if (!match) {
    return pairKey
  }

  const leftPerson = state.leftPeople.find((person) => person.id === match.leftId)
  const rightPerson = state.rightPeople.find((person) => person.id === match.rightId)

  return `${leftPerson?.name ?? match.leftId} + ${rightPerson?.name ?? match.rightId}`
}

export function TimelineEntryCard({
  state,
  entry,
  selectedPairKey,
  highlightedTimelineEntryId,
  onSelectPair,
  onSetStage,
}: {
  state: MatchBoardState
  entry: MatchBoardState['timeline'][number]
  selectedPairKey: MatchKey | null
  highlightedTimelineEntryId: string | null
  onSelectPair: (pairKey: MatchKey) => void
  onSetStage?: (pairKey: MatchKey, stage: MatchStage) => void
}) {
  if (entry.kind === 'matching-night') {
    const night = state.matchingNights.find((item) => item.id === entry.id)

    if (!night) {
      return null
    }

    const {
      openMatchCount,
      positivePairCount,
      undefinedPairCount,
      unresolvedOpenMatchCount,
      hasTooManyOpenMatches,
    } = summarizeMatchingNight(state, night)

    return (
      <article
        className={[
          'timeline-card',
          hasTooManyOpenMatches ? 'timeline-card--warning' : '',
          highlightedTimelineEntryId === entry.id ? 'timeline-card--alert' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="timeline-card__head">
          <div>
            <span className="eyebrow">Matching Night</span>
            <h2>{night.label}</h2>
          </div>
          <div className="timeline-card__metrics">
            <strong className="score-chip">
              {night.matches}/{night.total}
            </strong>
            <strong className="score-chip score-chip--secondary">
              {openMatchCount}/{undefinedPairCount} open
            </strong>
          </div>
        </div>

        <div className="pair-strip">
          {night.pairKeys.map((pairKey) => (
            <MatchPairButton
              key={pairKey}
              state={state}
              pairKey={pairKey}
              selected={selectedPairKey === pairKey}
              onClick={onSelectPair}
              onSetStage={onSetStage}
            />
          ))}
        </div>

        {hasTooManyOpenMatches ? (
          <div className="timeline-card__warning" role="status" aria-live="polite">
            {night.matches} matches need {positivePairCount + undefinedPairCount}{' '}
            possible pairs, so this night is short by {unresolvedOpenMatchCount}.
          </div>
        ) : null}
      </article>
    )
  }

  const matchBox = state.matchBoxes.find((item) => item.id === entry.id)

  if (!matchBox) {
    return null
  }

  return (
    <article
      className={[
        'timeline-card',
        'timeline-card--box',
        highlightedTimelineEntryId === entry.id ? 'timeline-card--alert' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="timeline-card__head">
        <div>
          <span className="eyebrow">Match-Box</span>
          <h2>{matchBox.label}</h2>
        </div>
      </div>

      <div className="pair-strip pair-strip--single">
        <MatchPairButton
          state={state}
          pairKey={matchBox.pairKey}
          selected={selectedPairKey === matchBox.pairKey}
          onClick={onSelectPair}
          onSetStage={onSetStage}
        />
      </div>
    </article>
  )
}
