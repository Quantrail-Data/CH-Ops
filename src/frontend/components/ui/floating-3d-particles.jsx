import * as React from "react"

import { cn } from "cn"

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

const MOBILE_BREAKPOINT = 768
const SPREAD_FACTOR = 1.2
const MAX_DPR = 2

// Particles with almost the same opacity are drawn together (see drawAll).
const OPACITY_STEP = 0.02
// The canvas pixel scale (see resize).
const CANVAS_SCALE = 0.5
const STEP_TIME_MS = 50

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
  // CHOps: the loop pauses when the tab is hidden, the canvas is off screen
  // or the window is not in focus. While paused (and after the one still
  // frame of reduced motion) no frame is requested at all.
  const stateRef = React.useRef({
    mounted: false,
    isHidden: false,
    isOffscreen: false,
    isBlurred: false,
    reducedMotion: false,
    rafId: null,
    waitTimerId: null,
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
    s.isHidden = document.hidden
    s.isOffscreen = false
    s.isBlurred = !document.hasFocus()

    const isPaused = () => s.isHidden || s.isOffscreen || s.isBlurred
    // Starts the loop if it is not running and there is something to draw.
    const startLoop = () => {
      if (!s.mounted || s.rafId !== null || s.waitTimerId !== null || isPaused()) return
      s.rafId = requestAnimationFrame(tick)
    }

    let width = 0
    let height = 0
    let particles = []
    let staticDirty = true

    const { fov, perspectiveDistance, depthRange } = deriveProjection(depth)

    // Reduced-motion media query (built-in a11y best practice)
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const syncReducedMotion = () => {
      s.reducedMotion = mq.matches
      staticDirty = true
      startLoop()
    }
    syncReducedMotion()

    // CHOps: draws all particles with a few fill calls instead of one each.
    // One color for all; the particles are put in groups of the same opacity
    // (steps of OPACITY_STEP), and each group is one path and one fill. With
    // one color the painting order does not matter, so there is no sort.
    const drawAll = (list) => {
      const groups = new Map()
      for (const p of list) {
        if (p.size * p.projectedScale <= 0) continue
        const level = Math.max(1, Math.round(p.opacity / OPACITY_STEP))
        if (!groups.has(level)) groups.set(level, [])
        groups.get(level).push(p)
      }
      ctx.fillStyle = hexToRgba(colorRef.current, 1)
      for (const [level, group] of groups) {
        ctx.globalAlpha = Math.min(1, level * OPACITY_STEP)
        ctx.beginPath()
        for (const p of group) {
          const r = p.size * p.projectedScale
          ctx.moveTo(p.screenX + r, p.screenY)
          ctx.arc(p.screenX, p.screenY, r, 0, Math.PI * 2)
        }
        ctx.fill()
      }
      ctx.globalAlpha = 1
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
      }
      drawAll(particles)
    }

    // CHOps: draw at most maxFps frames per second, to save CPU and battery.
    const frameTime = 1000 / Math.max(1, maxFps)
    let lastFrame = 0

    // Animation loop: continuous 3D field rotation and buoyant drift
    function tick(now = 0) {
      s.rafId = null
      if (!s.mounted || isPaused()) return

      // Too early: wait for the rest of the frame time with a timer. A new
      // requestAnimationFrame here would wake the page 60 times per second
      // only to skip the frame.
      const timeLeft = frameTime - (now - lastFrame)
      if (timeLeft > 1) {
        s.waitTimerId = setTimeout(() => {
          s.waitTimerId = null
          startLoop()
        }, timeLeft)
        return
      }
      // The particles move the same distance per second at any frame rate.
      // One step is the move of one frame at 20 frames per second.
      const steps = lastFrame === 0 ? 1 : Math.min(3, (now - lastFrame) / STEP_TIME_MS)
      lastFrame = now

      // Reduced motion: paint one static frame, then idle until something
      // invalidates it (resize, or the motion preference being turned off).
      if (s.reducedMotion) {
        if (staticDirty) {
          staticDirty = false
          staticFrame()
        }
        // One still frame is enough; resize or a motion change starts again.
        return
      }

      staticDirty = true

      ctx.clearRect(0, 0, width, height)

      const cx = width / 2
      const cy = height / 2

      for (const p of particles) {
        // Continuous organic rotation around the 3D central axis
        p.angle += p.angularSpeed * steps
        p.y -= drift * steps

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

      drawAll(particles)

      s.rafId = requestAnimationFrame(tick)
    }

    // Resize handling with automatic mobile count scaling
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))

      // CHOps: the canvas has half the pixels in each direction and is
      // stretched to the full size. The dots are tiny and soft, so it looks
      // the same, and each frame clears and paints a quarter of the pixels.
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, MAX_DPR)) * CANVAS_SCALE
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
      startLoop()
    }

    const onVisibilityChange = () => {
      s.isHidden = document.hidden
      startLoop()
    }
    const onWindowBlur = () => {
      s.isBlurred = true
    }
    const onWindowFocus = () => {
      s.isBlurred = false
      startLoop()
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
          if (!entry) return
          s.isOffscreen = !entry.isIntersecting
          startLoop()
        },
        { threshold: 0 }
      )
      ioRef.current.observe(canvas)
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("blur", onWindowBlur)
    window.addEventListener("focus", onWindowFocus)
    mq.addEventListener("change", syncReducedMotion)

    resize()
    startLoop()

    return () => {
      s.mounted = false
      if (s.rafId !== null) {
        cancelAnimationFrame(s.rafId)
        s.rafId = null
      }
      if (s.waitTimerId !== null) {
        clearTimeout(s.waitTimerId)
        s.waitTimerId = null
      }
      ro?.disconnect()
      if (!ro) window.removeEventListener("resize", resize)
      ioRef.current?.disconnect()
      ioRef.current = null
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("blur", onWindowBlur)
      window.removeEventListener("focus", onWindowFocus)
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
