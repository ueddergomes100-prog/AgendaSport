import type { PermissionKey, Profile } from './types'

export function hasModuleAccess(profile: Profile, permission?: PermissionKey) {
  if (!permission) return true
  if (profile.role === 'SUPER_ADMIN') return true
  if (profile.role === 'ADMINISTRADOR') return true

  const permissions = profile.permissions ?? {}
  const hasExplicitPermissionSet = Object.keys(permissions).length > 0
  if (!hasExplicitPermissionSet) return permission === 'confirmations' || permission === 'stats'

  return Boolean(permissions[permission])
}
