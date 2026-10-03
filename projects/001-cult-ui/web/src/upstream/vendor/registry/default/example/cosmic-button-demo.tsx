// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/example/cosmic-button-demo.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
"use client"

import { CosmicButton } from "../ui/cosmic-button.tsx"

export default function CosmicButtonDemo() {
  return (
    <div className="flex justify-center rounded-3xl p-6">
      <div>
        <div className="grid place-items-center">
          <CosmicButton as="button" type="button">
            Cosmic button goes brrr
          </CosmicButton>
        </div>
      </div>
    </div>
  )
}
