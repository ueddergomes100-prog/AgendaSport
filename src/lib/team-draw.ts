import type { TeamDraw, TeamDrawPlayer, TeamDrawTeam } from './types'
import { isGoalkeeperPosition } from './positions'
import { compareTextPtBr } from './utils'

const teamLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const HIGH_SCORE_THRESHOLD = 8
const ELITE_SCORE_THRESHOLD = 9
const MAX_OPTIMIZATION_PASSES = 80
const EPSILON = 0.0001

type TeamMetrics = {
  score: number
  size: number
  goalkeepers: number
  highScores: number
  eliteScores: number
}

function playerSort(left: TeamDrawPlayer, right: TeamDrawPlayer) {
  const scoreDiff = right.technical_score - left.technical_score
  if (scoreDiff !== 0) return scoreDiff
  const goalkeeperDiff = Number(isGoalkeeperPosition(right.primary_position)) - Number(isGoalkeeperPosition(left.primary_position))
  if (goalkeeperDiff !== 0) return goalkeeperDiff
  return compareTextPtBr(left.name, right.name)
}

function score(players: TeamDrawPlayer[]) {
  return players.reduce((total, player) => total + player.technical_score, 0)
}

function createTeams(teamCount: number, targetSize: number): TeamDrawTeam[] {
  return Array.from({ length: teamCount }, (_, index) => ({
    id: `team-${index + 1}`,
    name: `Equipe ${teamLetters[index] ?? index + 1}`,
    players: [],
    score: 0,
    targetSize,
  }))
}

function metrics(team: TeamDrawTeam): TeamMetrics {
  return team.players.reduce<TeamMetrics>(
    (acc, player) => {
      acc.score += player.technical_score
      acc.size += 1
      if (isGoalkeeperPosition(player.primary_position)) acc.goalkeepers += 1
      if (player.technical_score >= HIGH_SCORE_THRESHOLD) acc.highScores += 1
      if (player.technical_score >= ELITE_SCORE_THRESHOLD) acc.eliteScores += 1
      return acc
    },
    { score: 0, size: 0, goalkeepers: 0, highScores: 0, eliteScores: 0 },
  )
}

function spread(values: number[]) {
  if (!values.length) return 0
  return Math.max(...values) - Math.min(...values)
}

function distributionPenalty(values: number[]) {
  if (!values.length) return 0
  const average = values.reduce((total, value) => total + value, 0) / values.length
  return values.reduce((total, value) => total + (value - average) ** 2, 0)
}

function evaluateTeams(teams: TeamDrawTeam[]) {
  const allMetrics = teams.map(metrics)
  const scores = allMetrics.map((item) => item.score)
  const sizes = allMetrics.map((item) => item.size)
  const goalkeepers = allMetrics.map((item) => item.goalkeepers)
  const highScores = allMetrics.map((item) => item.highScores)
  const eliteScores = allMetrics.map((item) => item.eliteScores)

  return (
    distributionPenalty(scores) * 20 +
    spread(scores) * 120 +
    distributionPenalty(highScores) * 180 +
    spread(highScores) * 260 +
    distributionPenalty(eliteScores) * 220 +
    spread(eliteScores) * 320 +
    distributionPenalty(goalkeepers) * 110 +
    spread(goalkeepers) * 160 +
    distributionPenalty(sizes) * 500 +
    spread(sizes) * 1000
  )
}

function selectedPlayers(players: TeamDrawPlayer[], capacity: number, teamCount: number) {
  const orderedGoalkeepers = players.filter((player) => isGoalkeeperPosition(player.primary_position)).sort(playerSort)
  const orderedLines = players.filter((player) => !isGoalkeeperPosition(player.primary_position)).sort(playerSort)
  const selectedGoalkeepers = orderedGoalkeepers.slice(0, Math.min(orderedGoalkeepers.length, teamCount, capacity))
  const selectedGoalkeeperIds = new Set(selectedGoalkeepers.map((player) => player.id))
  const remaining = [...orderedGoalkeepers.filter((player) => !selectedGoalkeeperIds.has(player.id)), ...orderedLines].sort(playerSort)
  const selected = [...selectedGoalkeepers, ...remaining.slice(0, Math.max(0, capacity - selectedGoalkeepers.length))]
  const selectedIds = new Set(selected.map((player) => player.id))
  const unassigned = players.filter((player) => !selectedIds.has(player.id)).sort(playerSort)

  return { selected, unassigned }
}

function orderedForVariant(players: TeamDrawPlayer[], variant: number) {
  const goalkeepers = players.filter((player) => isGoalkeeperPosition(player.primary_position)).sort(playerSort)
  const lines = players.filter((player) => !isGoalkeeperPosition(player.primary_position)).sort(playerSort)

  if (variant % 4 === 1) return interleaveByStrength(goalkeepers, lines)
  if (variant % 4 === 2) return [...goalkeepers, ...serpentineOrder(lines)]
  if (variant % 4 === 3) return serpentineOrder([...goalkeepers, ...lines])
  return [...goalkeepers, ...lines]
}

function interleaveByStrength(goalkeepers: TeamDrawPlayer[], lines: TeamDrawPlayer[]) {
  const result: TeamDrawPlayer[] = []
  const max = Math.max(goalkeepers.length, lines.length)
  for (let index = 0; index < max; index += 1) {
    if (goalkeepers[index]) result.push(goalkeepers[index])
    if (lines[index]) result.push(lines[index])
  }
  return result
}

function serpentineOrder(players: TeamDrawPlayer[]) {
  const result: TeamDrawPlayer[] = []
  let left = 0
  let right = players.length - 1
  while (left <= right) {
    result.push(players[left])
    if (left !== right) result.push(players[right])
    left += 1
    right -= 1
  }
  return result
}

function draftInitialTeams(players: TeamDrawPlayer[], teamCount: number, targetSize: number, variant: number) {
  const teams = createTeams(teamCount, targetSize)
  const ordered = orderedForVariant(players, variant)

  ordered.forEach((player, playerIndex) => {
    const availableTeams = rotate(teams.filter((team) => team.players.length < targetSize), playerIndex + variant)
    let bestTeam = availableTeams[0]
    let bestScore = Number.POSITIVE_INFINITY

    availableTeams.forEach((team) => {
      team.players.push(player)
      const nextScore = evaluateTeams(teams)
      team.players.pop()

      if (nextScore < bestScore - EPSILON) {
        bestScore = nextScore
        bestTeam = team
        return
      }

      if (Math.abs(nextScore - bestScore) <= EPSILON && bestTeam) {
        const currentMetrics = metrics(team)
        const bestMetrics = metrics(bestTeam)
        if (
          currentMetrics.score < bestMetrics.score ||
          (currentMetrics.score === bestMetrics.score && currentMetrics.highScores < bestMetrics.highScores) ||
          (currentMetrics.score === bestMetrics.score && currentMetrics.highScores === bestMetrics.highScores && currentMetrics.size < bestMetrics.size)
        ) {
          bestTeam = team
        }
      }
    })

    bestTeam?.players.push(player)
  })

  return teams
}

function rotate<T>(items: T[], offset: number) {
  if (!items.length) return items
  const normalized = offset % items.length
  return [...items.slice(normalized), ...items.slice(0, normalized)]
}

function optimizeSwaps(teams: TeamDrawTeam[]) {
  let bestScore = evaluateTeams(teams)
  let pass = 0
  let improved = true

  while (improved && pass < MAX_OPTIMIZATION_PASSES) {
    improved = false
    pass += 1

    for (let leftTeamIndex = 0; leftTeamIndex < teams.length; leftTeamIndex += 1) {
      for (let rightTeamIndex = leftTeamIndex + 1; rightTeamIndex < teams.length; rightTeamIndex += 1) {
        const leftTeam = teams[leftTeamIndex]
        const rightTeam = teams[rightTeamIndex]

        for (let leftPlayerIndex = 0; leftPlayerIndex < leftTeam.players.length; leftPlayerIndex += 1) {
          for (let rightPlayerIndex = 0; rightPlayerIndex < rightTeam.players.length; rightPlayerIndex += 1) {
            const leftPlayer = leftTeam.players[leftPlayerIndex]
            const rightPlayer = rightTeam.players[rightPlayerIndex]
            leftTeam.players[leftPlayerIndex] = rightPlayer
            rightTeam.players[rightPlayerIndex] = leftPlayer

            const nextScore = evaluateTeams(teams)
            if (nextScore < bestScore - EPSILON) {
              bestScore = nextScore
              improved = true
            } else {
              leftTeam.players[leftPlayerIndex] = leftPlayer
              rightTeam.players[rightPlayerIndex] = rightPlayer
            }
          }
        }
      }
    }
  }

  return teams
}

function buildBestTeams(players: TeamDrawPlayer[], teamCount: number, targetSize: number) {
  let bestTeams = createTeams(teamCount, targetSize)
  let bestScore = Number.POSITIVE_INFINITY
  const variants = Math.max(8, teamCount * 4)

  for (let variant = 0; variant < variants; variant += 1) {
    const teams = optimizeSwaps(draftInitialTeams(players, teamCount, targetSize, variant))
    const candidateScore = evaluateTeams(teams)
    if (candidateScore < bestScore - EPSILON) {
      bestScore = candidateScore
      bestTeams = teams
    }
  }

  return bestTeams
}

export function buildBalancedTeams(players: TeamDrawPlayer[], teamCount = 2, playersPerTeam = Math.ceil(players.length / 2)): TeamDraw {
  const normalizedTeamCount = Math.max(2, Math.min(8, Math.floor(teamCount || 2)))
  const targetSize = Math.max(1, Math.floor(playersPerTeam || 1))
  const capacity = normalizedTeamCount * targetSize
  const { selected, unassigned } = selectedPlayers(players, capacity, normalizedTeamCount)
  const teams = buildBestTeams(selected, normalizedTeamCount, targetSize)

  return summarizeDraw(teams, unassigned)
}

export function summarizeDraw(teams: TeamDrawTeam[], unassigned: TeamDrawPlayer[] = []): TeamDraw {
  const scoredTeams = teams.map((team) => ({
    ...team,
    players: [...team.players].sort(playerSort),
    score: score(team.players),
  }))
  const scores = scoredTeams.map((team) => team.score)
  const maxScore = scores.length ? Math.max(...scores) : 0
  const minScore = scores.length ? Math.min(...scores) : 0
  const scoreSpread = maxScore - minScore

  return {
    teams: scoredTeams,
    unassigned: [...unassigned].sort(playerSort),
    scoreSpread,
    percentageDiff: (scoreSpread / Math.max(maxScore, 1)) * 100,
  }
}
