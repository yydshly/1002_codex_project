// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/example/halo-toggle-group-demo.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
"use client"

import { useState } from "react"

import { HaloToggleGroup } from "../ui/halo-toggle-group.tsx"

export default function HaloToggleGroupDemo() {
  const [segment, setSegment] = useState("week")
  return (
    <div>
      <section className="space-y-3">
        <h2 className="font-semibold text-foreground text-lg tracking-tight">
          Segmented control
        </h2>
        <p className="text-pretty text-muted-foreground text-sm">
          Single-select toggle group with a spring-driven thumb (same constants
          as <code className="text-foreground">HaloButton</code>
          ).
        </p>
        <HaloToggleGroup
          items={[
            { label: "Day", value: "day" },
            { label: "Week", value: "week" },
            { label: "Month", value: "month" },
          ]}
          onValueChange={setSegment}
          value={segment}
        />
        <p className="text-muted-foreground text-xs tabular-nums">
          Selected: {segment}
        </p>
      </section>
    </div>
  )
}
