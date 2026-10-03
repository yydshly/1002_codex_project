// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/example/merging-bubbles-demo.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
"use client"

import {
  MergingBubbles,
  NextLogo,
  VercelLogo,
} from "../ui/merging-bubbles.tsx"

function MergingBubblesDemo() {
  return (
    <div className="flex flex-col items-center gap-8 p-6">
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">Small</p>
        <MergingBubbles
          size="sm"
          startIcon={<NextLogo />}
          endIcon={<VercelLogo />}
        />
      </div>
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">Medium</p>
        <MergingBubbles
          size="md"
          startIcon={<NextLogo />}
          endIcon={<VercelLogo />}
        />
      </div>
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">Large</p>
        <MergingBubbles
          size="lg"
          startIcon={<NextLogo />}
          endIcon={<VercelLogo />}
        />
      </div>
    </div>
  )
}

export default MergingBubblesDemo
