import type { DerivedMatchStage, MatchKey, MatchRecord } from './match-board'

export type MatchCountBounds = {
  required: number
  capacity: number
  dependsOnExpectedState?: boolean
}

export type MatchCountDeduction = {
  pairKey: MatchKey
  stage: DerivedMatchStage
  reason: 'required-matches' | 'match-capacity'
  supportingPairKeys: MatchKey[]
}

export function isPositiveStage(stage: MatchRecord['stage']) {
  return stage === 'match' || stage === 'derived-match' ||
    stage === 'exp-match' || stage === 'derived-exp-match'
}

export function isNegativeStage(stage: MatchRecord['stage']) {
  return stage === 'no-match' || stage === 'derived-no-match' ||
    stage === 'exp-no-match' || stage === 'derived-exp-no-match'
}

export function isExpectedStage(stage: MatchRecord['stage']) {
  return stage === 'exp-match' || stage === 'derived-exp-match' ||
    stage === 'exp-no-match' || stage === 'derived-exp-no-match'
}

export function isConfirmedPositiveStage(stage: MatchRecord['stage']) {
  return isPositiveStage(stage) && !isExpectedStage(stage)
}

export function isConfirmedNegativeStage(stage: MatchRecord['stage']) {
  return isNegativeStage(stage) && !isExpectedStage(stage)
}

// The same count rules govern a Matching Night and a person's partner slots.
// Check facts first so an independent proof can upgrade an expected deduction.
export function getMatchCountDeductions(
  pairs: MatchRecord[],
  bounds: MatchCountBounds,
): MatchCountDeduction[] {
  const uniquePairs = [...new Map(pairs.map(pair => [pair.key, pair])).values()]
  const positivePairs = uniquePairs.filter(pair => isPositiveStage(pair.stage))
  const negativePairs = uniquePairs.filter(pair => isNegativeStage(pair.stage))

  if (
    !Number.isInteger(bounds.required) ||
    !Number.isInteger(bounds.capacity) ||
    bounds.required < 0 ||
    bounds.required > bounds.capacity ||
    positivePairs.length > bounds.capacity ||
    uniquePairs.length - negativePairs.length < bounds.required
  ) {
    return []
  }

  const deductions = new Map<MatchKey, MatchCountDeduction>()

  for (const expected of [false, true]) {
    if (!expected && bounds.dependsOnExpectedState) {
      continue
    }

    const positives = expected ? positivePairs : uniquePairs.filter(pair =>
      isConfirmedPositiveStage(pair.stage),
    )
    const negatives = expected ? negativePairs : uniquePairs.filter(pair =>
      isConfirmedNegativeStage(pair.stage),
    )
    const atCapacity = positives.length === bounds.capacity
    const allPossibleRequired = uniquePairs.length - negatives.length === bounds.required

    for (const pair of uniquePairs) {
      if (deductions.has(pair.key)) {
        continue
      }

      // Inputs stay authoritative. Derived outcomes never change sign.
      const canBePositive = pair.stage === 'undefined' ||
        (!expected && pair.stage === 'derived-exp-match')
      const canBeNegative = pair.stage === 'undefined' ||
        (!expected && pair.stage === 'derived-exp-no-match')

      if (allPossibleRequired && canBePositive) {
        deductions.set(pair.key, {
          pairKey: pair.key,
          stage: expected ? 'derived-exp-match' : 'derived-match',
          reason: 'required-matches',
          supportingPairKeys: negatives.map(negative => negative.key),
        })
      } else if (atCapacity && canBeNegative) {
        deductions.set(pair.key, {
          pairKey: pair.key,
          stage: expected ? 'derived-exp-no-match' : 'derived-no-match',
          reason: 'match-capacity',
          supportingPairKeys: positives.map(positive => positive.key),
        })
      }
    }
  }

  return [...deductions.values()]
}
