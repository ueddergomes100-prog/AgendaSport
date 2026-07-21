export type MatchStatsDraftRow = {
  playerId: string
  present: boolean
  goals: number
  assists: number
  wins?: number
  draws?: number
  losses?: number
}

function draftKey(matchId: string) {
  return `agendasport:match-stats-draft:${matchId}`
}

export function readMatchStatsDrafts(matchId: string): Record<string, MatchStatsDraftRow> {
  if (!matchId) return {}
  try {
    const value = window.localStorage.getItem(draftKey(matchId))
    return value ? JSON.parse(value) as Record<string, MatchStatsDraftRow> : {}
  } catch {
    return {}
  }
}

export function writeMatchStatsDraft(matchId: string, row: MatchStatsDraftRow) {
  if (!matchId) return
  try {
    const drafts = readMatchStatsDrafts(matchId)
    drafts[row.playerId] = row
    window.localStorage.setItem(draftKey(matchId), JSON.stringify(drafts))
  } catch {
    // The server save still runs when browser storage is unavailable.
  }
}

export function clearMatchStatsDraft(matchId: string, playerId?: string) {
  if (!matchId) return
  try {
    if (!playerId) {
      window.localStorage.removeItem(draftKey(matchId))
      return
    }

    const drafts = readMatchStatsDrafts(matchId)
    delete drafts[playerId]
    if (Object.keys(drafts).length) window.localStorage.setItem(draftKey(matchId), JSON.stringify(drafts))
    else window.localStorage.removeItem(draftKey(matchId))
  } catch {
    // No cleanup is needed when browser storage is unavailable.
  }
}
