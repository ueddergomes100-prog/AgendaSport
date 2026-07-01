import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect } from 'react'

export function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const motionValue = useMotionValue(0)
  const rounded = useTransform(motionValue, (latest) => `${Math.round(latest).toLocaleString('pt-BR')}${suffix}`)

  useEffect(() => {
    const controls = animate(motionValue, value, { duration: 0.75, ease: [0.22, 1, 0.36, 1] })
    return () => controls.stop()
  }, [motionValue, value])

  return <motion.span>{rounded}</motion.span>
}
