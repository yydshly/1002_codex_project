// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/example/organic-card-small-demo.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
"use client"

import { OrganicCardSmall } from "../ui/organic-card-small.tsx"

export default function OrganicCardSmallDemo() {
  return (
    <div>
      <div className="mx-auto max-w-3xl px-4 sm:px-0">
        <OrganicCardSmall
          category="Engineering"
          date="Apr 2, 2026"
          href="#"
          image="https://images.unsplash.com/photo-1677442136019-21780ecad995?w=670&h=208&fit=crop"
          imageAlt="AI neural network visualization"
          title="Building scalable AI infrastructure for enterprise"
        />
      </div>
    </div>
  )
}
