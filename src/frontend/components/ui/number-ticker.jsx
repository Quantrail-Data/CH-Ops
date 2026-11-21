"use client";
import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "motion/react"

import { cn } from "@/lib/utils"

// Number Ticker (Magic UI). Changes for CHOps: the text color comes from the
// page (no fixed black and white), and with "reduced motion" the number
// shows at once without counting. It counts only the first time; a later
// value (for example from polling) shows at once, so the animation loop
// does not run again and again.
function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

export function NumberTicker({
  value,
  startValue = 0,
  direction = "up",
  delay = 0,
  className,
  decimalPlaces = 0,
  ...props
}) {
  const ref = useRef(null)
  const motionValue = useMotionValue(direction === "down" ? value : startValue)
  const springValue = useSpring(motionValue, {
    // Settles in about 2 seconds. The Magic UI values (damping 60,
    // stiffness 100) move very slowly at the end, so the animation loop ran
    // for up to 8 seconds on large numbers.
    damping: 40,
    stiffness: 200,
  })
  const isInView = useInView(ref, { once: true, margin: "0px" })
  const hasCountedRef = useRef(false)

  useEffect(() => {
    let timer = null

    if (prefersReducedMotion()) {
      const shownValue = direction === "down" ? startValue : value
      if (ref.current) {
        ref.current.textContent = Intl.NumberFormat("en-US", {
          minimumFractionDigits: decimalPlaces,
          maximumFractionDigits: decimalPlaces,
        }).format(Number(Number(shownValue).toFixed(decimalPlaces)))
      }
      return undefined
    }

    if (isInView && hasCountedRef.current) {
      const shownValue = direction === "down" ? startValue : value
      motionValue.jump(shownValue)
      springValue.jump(shownValue)
    } else if (isInView) {
      hasCountedRef.current = true
      timer = setTimeout(() => {
        motionValue.set(direction === "down" ? startValue : value)
      }, delay * 1000)
    }

    return () => {
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [motionValue, springValue, isInView, delay, value, direction, startValue, decimalPlaces])

  useEffect(
    () =>
      springValue.on("change", (latest) => {
        if (ref.current) {
          ref.current.textContent = Intl.NumberFormat("en-US", {
            minimumFractionDigits: decimalPlaces,
            maximumFractionDigits: decimalPlaces,
          }).format(Number(latest.toFixed(decimalPlaces)))
        }
      }),
    [springValue, decimalPlaces]
  )

  const finalText = Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(Number(Number(direction === "down" ? startValue : value).toFixed(decimalPlaces)))

  // Screen readers read the final value once (the hidden text), not each
  // number of the count.
  return (
    <span className={cn("tw:inline-block tw:tabular-nums", className)} {...props}>
      <span className="tw:sr-only">{finalText}</span>
      <span ref={ref} aria-hidden="true">
        {startValue}
      </span>
    </span>
  )
}
