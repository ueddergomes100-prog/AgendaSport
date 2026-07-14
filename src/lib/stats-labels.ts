import { useEffect, useState } from 'react'

export type PrimaryStatLabel = 'PONTOS' | 'GOLS'

const STORAGE_KEY = 'agendasport-primary-stat-label'

const labels: Record<PrimaryStatLabel, { singular: string; plural: string; short: string; lowerPlural: string }> = {
  PONTOS: { singular: 'Ponto', plural: 'Pontos', short: 'Pts', lowerPlural: 'pontos' },
  GOLS: { singular: 'Gol', plural: 'Gols', short: 'Gols', lowerPlural: 'gols' },
}

export function normalizePrimaryStatLabel(value?: string | null): PrimaryStatLabel {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (!normalized) return 'GOLS'
  return normalized === 'PONTOS' ? 'PONTOS' : 'GOLS'
}

export function getPrimaryStatPreference(): PrimaryStatLabel {
  if (typeof window === 'undefined') return 'GOLS'
  return normalizePrimaryStatLabel(window.localStorage.getItem(STORAGE_KEY))
}

export function setPrimaryStatPreference(value: PrimaryStatLabel) {
  window.localStorage.setItem(STORAGE_KEY, value)
  window.dispatchEvent(new CustomEvent('agendasport-primary-stat-label-change', { detail: value }))
}

export function getPrimaryStatLabels(value: PrimaryStatLabel) {
  return labels[value]
}

export function usePrimaryStatLabel() {
  const [preference, setPreference] = useState<PrimaryStatLabel>(() => getPrimaryStatPreference())

  useEffect(() => {
    function sync(event: Event) {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        setPreference(normalizePrimaryStatLabel(event.detail))
        return
      }
      setPreference(getPrimaryStatPreference())
    }

    window.addEventListener('storage', sync)
    window.addEventListener('agendasport-primary-stat-label-change', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('agendasport-primary-stat-label-change', sync)
    }
  }, [])

  function updatePreference(value: PrimaryStatLabel) {
    const normalized = normalizePrimaryStatLabel(value)
    setPreference(normalized)
    setPrimaryStatPreference(normalized)
  }

  return {
    preference,
    setPreference: updatePreference,
    labels: getPrimaryStatLabels(preference),
  }
}
