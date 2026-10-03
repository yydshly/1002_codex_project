// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/example/halo-switch-demo.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
"use client"

import { useState } from "react"

import { HaloSwitch } from "../ui/halo-switch.tsx"

export default function HaloSwitchDemo() {
  const [notifyOn, setNotifyOn] = useState(true)
  const [compact, setCompact] = useState(false)

  return (
    <main className="flex w-full flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-10">
        <section className="space-y-3">
          <h2 className="font-semibold text-foreground text-lg tracking-tight">
            Default
          </h2>
          <p className="text-pretty text-muted-foreground text-sm">
            Toggles on and off with a spring-animated thumb and an enlarged tap
            target for easier touch use.
          </p>
          <div className="flex items-center gap-4">
            <HaloSwitch
              checked={notifyOn}
              onCheckedChange={setNotifyOn}
              translucent
            />
            <span className="text-muted-foreground text-sm">
              Notifications {notifyOn ? "on" : "off"}
            </span>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold text-foreground text-lg tracking-tight">
            Small
          </h2>
          <p className="text-pretty text-muted-foreground text-sm">
            A smaller footprint for dense toolbars and compact settings rows.
          </p>
          <div className="flex items-center gap-4">
            <HaloSwitch
              checked={compact}
              onCheckedChange={setCompact}
              size="sm"
              translucent
            />
            <span className="text-muted-foreground text-sm">
              Compact mode {compact ? "on" : "off"}
            </span>
          </div>
        </section>
      </div>
    </main>
  )
}
