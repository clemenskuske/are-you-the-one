type SeasonRule = {
  doubleMatchParticipant: { personId: string; fromMatchingNight: number }
}

export const SEASON_RULES: Record<string, SeasonRule | undefined> = {
  '2026-vip': {
    doubleMatchParticipant: { personId: 'laurenz', fromMatchingNight: 5 },
  },
}
