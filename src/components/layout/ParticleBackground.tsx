import { useEffect, useRef } from 'react'

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
}

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return
    const targetCanvas = canvas
    const ctx = context

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const particles: Particle[] = []
    let frame = 0
    let animationFrame = 0
    let width = 0
    let height = 0
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)

    function resize() {
      width = window.innerWidth
      height = window.innerHeight
      targetCanvas.width = Math.floor(width * pixelRatio)
      targetCanvas.height = Math.floor(height * pixelRatio)
      targetCanvas.style.width = `${width}px`
      targetCanvas.style.height = `${height}px`
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

      particles.length = 0
      const count = Math.min(74, Math.max(34, Math.floor((width * height) / 26000)))
      for (let index = 0; index < count; index += 1) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.28,
          vy: (Math.random() - 0.5) * 0.28,
          size: Math.random() * 1.9 + 0.8,
        })
      }
    }

    function draw() {
      frame += 1
      ctx.clearRect(0, 0, width, height)

      const isDark = document.documentElement.classList.contains('dark')
      const dotColor = isDark ? 'rgba(133, 239, 172, 0.48)' : 'rgba(8, 122, 76, 0.34)'
      const lineColor = isDark ? 'rgba(34, 211, 238, 0.16)' : 'rgba(8, 122, 76, 0.13)'

      particles.forEach((particle) => {
        if (!reducedMotion) {
          particle.x += particle.vx
          particle.y += particle.vy
        }

        if (particle.x < -20) particle.x = width + 20
        if (particle.x > width + 20) particle.x = -20
        if (particle.y < -20) particle.y = height + 20
        if (particle.y > height + 20) particle.y = -20

        ctx.beginPath()
        ctx.fillStyle = dotColor
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.fill()
      })

      for (let a = 0; a < particles.length; a += 1) {
        for (let b = a + 1; b < particles.length; b += 1) {
          const first = particles[a]
          const second = particles[b]
          const dx = first.x - second.x
          const dy = first.y - second.y
          const distance = Math.hypot(dx, dy)
          if (distance > 132) continue

          ctx.beginPath()
          ctx.strokeStyle = lineColor
          ctx.globalAlpha = (1 - distance / 132) * 0.85
          ctx.lineWidth = 1
          ctx.moveTo(first.x, first.y)
          ctx.lineTo(second.x, second.y)
          ctx.stroke()
          ctx.globalAlpha = 1
        }
      }

      if (!reducedMotion) {
        const trailX = (frame * 0.42) % (width + 220) - 110
        const gradient = ctx.createLinearGradient(trailX - 120, 0, trailX + 120, height)
        gradient.addColorStop(0, 'rgba(255,255,255,0)')
        gradient.addColorStop(0.5, isDark ? 'rgba(34,211,238,0.08)' : 'rgba(242,183,5,0.08)')
        gradient.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = gradient
        ctx.fillRect(trailX - 120, 0, 240, height)
      }

      animationFrame = window.requestAnimationFrame(draw)
    }

    resize()
    draw()
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      window.cancelAnimationFrame(animationFrame)
    }
  }, [])

  return <canvas ref={canvasRef} className="particle-canvas" aria-hidden="true" />
}
