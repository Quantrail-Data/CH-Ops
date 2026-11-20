import { cn } from "@/lib/utils"

// Border Beam (Magic UI): a short light that moves along the border of its
// parent. The parent needs position: relative and a border radius.
//
// Changes for CHOps: a CSS animation (border-beam in global.css) moves the
// light, not motion/react. The Magic UI version runs a JavaScript animation
// loop without end; the CSS version runs in the browser's animation engine.
// The light stops with reduced motion and with the Background animation
// switch (the "motion-off" class on <html>).
export const BorderBeam = ({
  className,
  size = 50,
  delay = 0,
  duration = 6,
  colorFrom = "var(--accent)",
  colorTo = "var(--chart-2)",
  style,
  reverse = false,
  initialOffset = 0,
  borderWidth = 1,
}) => {
  return (
    <div
      aria-hidden="true"
      className="border-beam tw:pointer-events-none tw:absolute tw:inset-0 tw:rounded-[inherit] tw:border-(length:--border-beam-width) tw:border-transparent tw:mask-[linear-gradient(transparent,transparent),linear-gradient(#000,#000)] tw:mask-intersect tw:[mask-clip:padding-box,border-box]"
      style={{ "--border-beam-width": `${borderWidth}px` }}
    >
      <div
        className={cn(
          "border-beam-light tw:absolute tw:aspect-square",
          "tw:bg-linear-to-l tw:from-(--color-from) tw:via-(--color-to) tw:to-transparent",
          className
        )}
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          "--color-from": colorFrom,
          "--color-to": colorTo,
          "--beam-start": `${initialOffset}%`,
          "--beam-end": `${100 + initialOffset}%`,
          animationDuration: `${duration}s`,
          animationDelay: `${-delay}s`,
          animationDirection: reverse ? "reverse" : "normal",
          ...style,
        }}
      />
    </div>
  )
}
