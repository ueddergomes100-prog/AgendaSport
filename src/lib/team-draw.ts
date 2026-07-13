import type { TeamDraw, TeamDrawPlayer, TeamDrawTeam } from './types'
import { isGoalkeeperPosition } from './positions'

const teamLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function playerWeight(player: TeamDrawPlayer) {
  const goalkeeperBonus = isGoalkeeperPosition(player.primary_position) ? 2 : 0
  return player.technical_score * 10 + goalkeeperBonus
}

function score(players: TeamDrawPlayer[]) {
  return players.reduce((total, player) => total + player.technical_score, 0)
}

function countGoalkeepers(players: TeamDrawPlayer[]) {
  return players.filter((player) => isGoalkeeperPosition(player.primary_position)).length
}

function teamPenalty(team: TeamDrawTeam, candidate: TeamDrawPlayer) {
  const goalkeeperPenalty = isGoalkeeperPosition(candidate.primary_position) ? countGoalkeepers(team.players) * 16 : 0
  const lineBalancePenalty = !isGoalkeeperPosition(candidate.primary_position) ? Math.max(0, team.players.length - countGoalkeepers(team.players)) * 0.25 : 0
  return score(team.players) * 1.4 + team.players.length * 2 + goalkeeperPenalty + lineBalancePenalty
}

export function buildBalancedTeams(players: TeamDrawPlayer[], teamCount = 2, playersPerTeam = Math.ceil(players.length / 2)): TeamDraw {
  const normalizedTeamCount = Math.max(2, Math.min(8, Math.floor(teamCount || 2)))
  const targetSize = Math.max(1, Math.floor(playersPerTeam || 1))
  const teams: TeamDrawTeam[] = Array.from({ length: normalizedTeamCount }, (_, index) => ({
    id: `team-${index + 1}`,
    name: `Equipe ${teamLetters[index] ?? index + 1}`,
    players: [],
    score: 0,
    targetSize,
  }))
  const unassigned: TeamDrawPlayer[] = []
  const ordered = [...players].sort((a, b) => playerWeight(b) - playerWeight(a))

  ordered.forEach((player) => {
    const availableTeams = teams.filter((team) => team.players.length < targetSize)
    if (!availableTeams.length) {
      unassigned.push(player)
      return
    }

    const [bestTeam] = availableTeams.sort((a, b) => {
      const penaltyDiff = teamPenalty(a, player) - teamPenalty(b, player)
      if (penaltyDiff !== 0) return penaltyDiff
      const scoreDiff = score(a.players) - score(b.players)
      if (scoreDiff !== 0) return scoreDiff
      return a.players.length - b.players.length
    })
    bestTeam.players.push(player)
  })

  return summarizeDraw(teams, unassigned)
}

export function summarizeDraw(teams: TeamDrawTeam[], unassigned: TeamDrawPlayer[] = []): TeamDraw {
  const scoredTeams = teams.map((team) => ({ ...team, score: score(team.players) }))
  const scores = scoredTeams.map((team) => team.score)
  const maxScore = Math.max(...scores, 1)
  const minScore = Math.min(...scores, 0)
  const scoreSpread = maxScore - minScore

  return {
    teams: scoredTeams,
    unassigned,
    scoreSpread,
    percentageDiff: (scoreSpread / maxScore) * 100,
  }
}
