import * as React from "react"

import { cn } from "cn"

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

const MOBILE_BREAKPOINT = 768
const SPREAD_FACTOR = 1.2
const MAX_DPR = 2

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "").trim()
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean

  if (!/^[0-9a-f]{6}$/i.test(full)) return `rgba(139,92,246,${alpha})`

  const n = Number.parseInt(full, 16)
  return `rgba(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff},${alpha})`
}

function deriveProjection(depth) {
  const t = Math.max(0, Math.min(1, depth))
  const fov = 800 - t * 600 // [800, 200]
  const perspectiveDistance = 100 + t * 700 // [100, 800]
  // depthRange stays below fov + pd - 1 to ensure positive denominator
  const depthRange = t * Math.min(400, fov + perspectiveDistance - 1)
  return { fov, perspectiveDistance, depthRange }
}

function spawnParticle(width, height, size, opacity) {
  const sizeVariance = size * 0.4
  const opacityVariance = 0.2
  return {
    angle: Math.random() * Math.PI * 2,
    radius: Math.random() * Math.max(width, height) * SPREAD_FACTOR,
    y: (Math.random() - 0.5) * height * 2,
    size: Math.max(0.5, size - sizeVariance + Math.random() * sizeVariance * 2),
    angularSpeed: 0.0015 + Math.random() * 0.001,
    opacity: Math.min(
      1,
      Math.max(
        0,
        opacity - opacityVariance + Math.random() * opacityVariance * 2
      )
    ),
    screenX: 0,
    screenY: 0,
    projectedScale: 1,
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Floating3DParticles({
  quantity = 400,
  color = "#8B5CF6",
  size = 5,
  opacity = 0.3,
  drift = 0.8,
  depth = 0.5,
  maxFps = 60,
  className,
  style,
  ...canvasProps
}) {
  const canvasRef = React.useRef(null)
  const ioRef = React.useRef(null)
  const stateRef = React.useRef({
    mounted: false,
    paused: false,
    reducedMotion: false,
    rafId: null,
  })

  // Read fresh on every frame, so recolouring (e.g. a theme switch) does not
  // tear down the effect and respawn the whole field.
  const colorRef = React.useRef(color)
  React.useEffect(() => {
    colorRef.current = color
  }, [color])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) return

    const s = stateRef.current
    s.mounted = true
    s.paused = false

    let width = 0
    let height = 0
    let particles = []
    let staticDirty = true

    const { fov, perspectiveDistance, depthRange } = deriveProjection(depth)

    // Reduced-motion media query (built-in a11y best practice)
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const syncReducedMotion = () => {
      s.reducedMotion = mq.matches
    }
    syncReducedMotion()

    // Draw single particle
    const draw = (p) => {
      const r = Math.max(0, p.size * p.projectedScale)
      if (r <= 0) return

      ctx.beginPath()
      ctx.fillStyle = hexToRgba(colorRef.current, p.opacity)
      ctx.arc(p.screenX, p.screenY, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // Static frame for reduced motion
    const staticFrame = () => {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      const cy = height / 2

      for (const p of particles) {
        const denom = Math.max(1, fov + perspectiveDistance)
        const scale = fov / denom
        p.screenX = cx + Math.cos(p.angle) * p.radius * scale
        p.screenY = cy + p.y * scale
        p.projectedScale = scale
        draw(p)
      }
    }

    // CHOps: draw at most maxFps frames per second, to save CPU and battery.
    const frameTime = 1000 / Math.max(1, maxFps)
    let lastFrame = 0

    // Animation loop: continuous 3D field rotation and buoyant drift
    const tick = (now = 0) => {
      if (!s.mounted) return

      if (now - lastFrame < frameTime) {
        s.rafId = requestAnimationFrame(tick)
        return
      }
      lastFrame = now

      if (s.paused) {
        s.rafId = requestAnimationFrame(tick)
        return
      }

      // Reduced motion: paint one static frame, then idle until something
      // invalidates it (resize, or the motion preference being turned off).
      if (s.reducedMotion) {
        if (staticDirty) {
          staticDirty = false
          staticFrame()
        }
        s.rafId = requestAnimationFrame(tick)
        return
      }

      staticDirty = true

      ctx.clearRect(0, 0, width, height)

      const cx = width / 2
      const cy = height / 2

      for (const p of particles) {
        // Continuous organic rotation around the 3D central axis
        p.angle += p.angularSpeed
        p.y -= drift

        // Respawn on the opposite edge, whichever one the particle left
        // through, so a negative drift falls instead of draining the field
        if (p.y < -height) {
          p.y = height
          p.radius = Math.random() * Math.max(width, height) * SPREAD_FACTOR
        } else if (p.y > height) {
          p.y = -height
          p.radius = Math.random() * Math.max(width, height) * SPREAD_FACTOR
        }

        // 3D Perspective Projection
        const denom = Math.max(
          1,
          fov + perspectiveDistance + Math.sin(p.angle) * depthRange
        )
        const scale = fov / denom

        p.screenX = cx + Math.cos(p.angle) * p.radius * scale
        p.screenY = cy + p.y * scale
        p.projectedScale = scale
      }

      // Painter's algorithm: draw farthest particles first
      particles.sort((a, b) => a.projectedScale - b.projectedScale)
      for (const p of particles) draw(p)

      s.rafId = requestAnimationFrame(tick)
    }

    // Resize handling with automatic mobile count scaling
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))

      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, MAX_DPR))
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const isMobile = window.innerWidth < MOBILE_BREAKPOINT
      const count = isMobile ? Math.round(quantity * 0.2) : quantity

      particles = Array.from({ length: Math.max(0, count) }, () =>
        spawnParticle(width, height, size, opacity)
      )

      // Canvas was cleared by the width/height reassignment above.
      staticDirty = true
    }

    const onVisibilityChange = () => {
      s.paused = document.hidden
    }

    // ResizeObserver
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null
    if (ro) {
      ro.observe(canvas)
    } else {
      window.addEventListener("resize", resize)
    }

    // IntersectionObserver (built-in performance pause off-screen)
    if (typeof IntersectionObserver !== "undefined") {
      ioRef.current = new IntersectionObserver(
        ([entry]) => {
          if (entry) s.paused = document.hidden || !entry.isIntersecting
        },
        { threshold: 0 }
      )
      ioRef.current.observe(canvas)
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    mq.addEventListener("change", syncReducedMotion)

    resize()
    s.rafId = requestAnimationFrame(tick)

    return () => {
      s.mounted = false
      if (s.rafId !== null) {
        cancelAnimationFrame(s.rafId)
        s.rafId = null
      }
      ro?.disconnect()
      if (!ro) window.removeEventListener("resize", resize)
      ioRef.current?.disconnect()
      ioRef.current = null
      document.removeEventListener("visibilitychange", onVisibilityChange)
      mq.removeEventListener("change", syncReducedMotion)
    }
  }, [quantity, size, opacity, drift, depth, maxFps])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn(
        "tw:pointer-events-none tw:absolute tw:inset-0 tw:h-full tw:w-full",
        className
      )}
      style={style}
      {...canvasProps}
    />
  )
}
