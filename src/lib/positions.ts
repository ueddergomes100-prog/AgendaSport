import type { Position } from './types'

export const positionOptions: Position[] = ['LINHA', 'GOLEIRO']

export function normalizePosition(position?: string | null): Position {
  return String(position ?? '').trim().toUpperCase() === 'GOLEIRO' ? 'GOLEIRO' : 'LINHA'
}

export function isGoalkeeperPosition(position?: string | null) {
  return normalizePosition(position) === 'GOLEIRO'
}

export function displayPosition(position?: string | null) {
  return isGoalkeeperPosition(position) ? 'Goleiro' : 'Linha'
}

export function toUpperDbPosition(position?: string | null) {
  return isGoalkeeperPosition(position) ? 'GOLEIRO' : 'LINHA'
}
