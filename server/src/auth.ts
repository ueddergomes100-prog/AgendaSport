import type { NextFunction, Request, Response } from 'express'
import { anonSupabase } from './supabase.js'
import { adminSupabase } from './supabase.js'

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Token ausente.' })

  const { data, error } = await anonSupabase.auth.getUser(token)
  if (error || !data.user) return res.status(401).json({ error: 'Token invalido.' })

  const { data: profile, error: profileError } = await adminSupabase
    .from('profiles')
    .select('id, tenant_id, role, permissions')
    .eq('id', data.user.id)
    .single()

  if (profileError && profileError.message.includes('permissions')) {
    const { data: legacyProfile, error: legacyProfileError } = await adminSupabase
      .from('profiles')
      .select('id, tenant_id, role')
      .eq('id', data.user.id)
      .single()
    if (legacyProfileError || !legacyProfile) return res.status(403).json({ error: 'Perfil nao encontrado.' })
    req.user = legacyProfile
    return next()
  }

  if (profileError || !profile) return res.status(403).json({ error: 'Perfil nao encontrado.' })
  req.user = profile
  return next()
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Acesso restrito ao SUPER_ADMIN.' })
  return next()
}
