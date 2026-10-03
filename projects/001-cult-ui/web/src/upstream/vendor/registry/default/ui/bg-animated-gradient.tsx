// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/ui/bg-animated-gradient.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
"use client"

import React, { useEffect } from "react"
import { motion, useAnimation } from "motion/react"

interface GradientStop {
  color: string
  position: number
}

interface GradientType {
  stops: GradientStop[]
  centerX: number
  centerY: number
}

interface GradientAnimationProps {
  gradients: GradientType[]
  animationDuration: number
  className?: string
}

export const GradientAnimation: React.FC<GradientAnimationProps> = ({
  gradients,
  animationDuration,
  className = "",
}) => {
  const controls = useAnimation()

  useEffect(() => {
    controls.start({
      background: gradients.map(
        (g) =>
          `radial-gradient(circle at ${g.centerX}% ${g.centerY}%, ${g.stops
            .map((s) => `${s.color} ${s.position}%`)
            .join(", ")})`
      ),
      transition: {
        duration: animationDuration,
        repeat: Infinity,
        repeatType: "reverse",
        ease: "linear",
      },
    })
  }, [controls, gradients, animationDuration])

  return (
    <motion.div
      className={`absolute inset-0 h-full w-full ${className}`}
      animate={controls}
    />
  )
}

export default React.memo(GradientAnimation)
