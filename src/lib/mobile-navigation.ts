export function buildMobileNavigation<T extends { to: string }>(items: T[], superAdmin: boolean) {
  const preferredPaths = superAdmin
    ? ['/', '/admin']
    : ['/', '/agenda', '/participantes', '/estatisticas']
  const preferred = preferredPaths
    .map((path) => items.find((item) => item.to === path))
    .filter((item): item is T => Boolean(item))
  const fill = items.filter((item) => !preferred.some((preferredItem) => preferredItem.to === item.to))
  const primary = [...preferred, ...fill].slice(0, 4)
  const secondary = items.filter((item) => !primary.some((primaryItem) => primaryItem.to === item.to))

  return { primary, secondary }
}
