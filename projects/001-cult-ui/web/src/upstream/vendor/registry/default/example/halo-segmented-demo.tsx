// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/example/halo-segmented-demo.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
"use client"

import { useState } from "react"

import { HaloSegmented } from "../ui/halo-segmented.tsx"

export default function HaloSegmentedDemo() {
  const [segment, setSegment] = useState("week")

  return (
    <main className="flex w-full flex-col items-center justify-center gap-16">
      <div className="w-full max-w-2xl space-y-10">
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground text-lg tracking-tight">
            Segmented control
          </h2>
          <p className="text-pretty text-muted-foreground text-sm">
            Single-select control: one option is active at a time, with a
            spring-animated thumb that slides between segments.
          </p>
          <HaloSegmented
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
    </main>
  )
}
