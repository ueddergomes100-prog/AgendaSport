declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        tenant_id: string | null
        role: string
        permissions?: Record<string, boolean> | null
      }
    }
  }
}

export {}
