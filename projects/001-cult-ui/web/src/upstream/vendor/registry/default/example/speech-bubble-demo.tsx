// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/example/speech-bubble-demo.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
"use client"

import { SpeechBubble } from "../ui/speech-bubble.tsx"

function SpeechBubbleDemo() {
  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <SpeechBubble>Hello, how are you?</SpeechBubble>
      <SpeechBubble showCursor={false}>No cursor variant</SpeechBubble>
    </div>
  )
}

export default SpeechBubbleDemo
