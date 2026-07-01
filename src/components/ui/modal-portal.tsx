import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return children
  return createPortal(children, document.body)
}
