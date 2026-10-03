// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/example/security-checkpoint-demo.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
"use client"

import { SecurityCheckpoint } from "../ui/security-checkpoint.tsx"

function SecurityCheckpointDemo() {
  return (
    <div className="flex min-h-[240px] w-full items-center justify-center">
      <SecurityCheckpoint />
    </div>
  )
}

export default SecurityCheckpointDemo
