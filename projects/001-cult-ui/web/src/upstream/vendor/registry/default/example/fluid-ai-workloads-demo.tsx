// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/example/fluid-ai-workloads-demo.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
"use client"

import { FluidAIWorkloads } from "../ui/fluid-ai-workloads.tsx"

function FluidAIWorkloadsDemo() {
  return (
    <div className="flex items-center justify-center p-6">
      <div className="max-w-full overflow-hidden rounded-lg bg-card p-6">
        <FluidAIWorkloads height={200} width={400} />
      </div>
    </div>
  )
}

export default FluidAIWorkloadsDemo
