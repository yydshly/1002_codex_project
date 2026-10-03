// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/example/hover-video-player-demo.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
"use client"

import { motion, useReducedMotion } from "motion/react"

import { cn } from "../../../lib/utils.ts"

import { GradientHeading } from "../ui/gradient-heading.tsx"
import { HoverVideoPlayer } from "../ui/hover-video-player.tsx"

export default function HoverVideoPlayerDemo() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-12 py-12">
      <div className="text-center">
        <GradientHeading>Hover video player</GradientHeading>
      </div>
      <motion.div
        animate={shouldReduceMotion ? "expanded" : "collapsed"}
        className="flex aspect-video w-full max-w-4xl items-center justify-center"
        initial={false}
        whileHover={shouldReduceMotion ? undefined : "expanded"}
      >
        <motion.div
          variants={{
            collapsed: { width: "50%" },
            expanded: { width: "100%" },
          }}
          transition={{
            type: "spring",
            duration: 0.42,
            bounce: 0,
          }}
          className={cn(
            "group relative flex transform-gpu flex-col overflow-hidden rounded-lg",
            "bg-white shadow-sm ring-1 ring-black/5",
            "data-dark:bg-stone-800 data-dark:ring-white/15"
          )}
        >
          <HoverVideoPlayer
            videoSrc="https://player.vimeo.com/video/1037289858"
            thumbnailSrc="./placeholders/newcopy-thumbnail.png"
            enableControls
            style={{
              width: "100%",
              maxWidth: "100vw",
              aspectRatio: "16/9",
            }}
          />
        </motion.div>
      </motion.div>

      <a href="https://www.newcult.co" target="_blank" rel="noreferrer">
        newcopy.ai
      </a>
    </div>
  )
}
