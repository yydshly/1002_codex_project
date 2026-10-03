// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/example/direction-aware-tabs-demo.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
"use client"

import { BgAnimateButton } from "../ui/bg-animate-button.tsx"
import { DirectionAwareTabs } from "../ui/direction-aware-tabs.tsx"

const DirectionAwareTabsDemo = ({}) => {
  const tabs = [
    {
      id: 0,
      label: "ocean",
      content: (
        <div className="border-border/50 flex w-full flex-col items-center gap-3 rounded-lg border p-4">
          <BgAnimateButton animation="spin-fast" gradient="ocean">
            Button
          </BgAnimateButton>
          <BgAnimateButton animation="spin" gradient="ocean">
            Button
          </BgAnimateButton>
          <BgAnimateButton animation="spin-slow" gradient="ocean">
            Button
          </BgAnimateButton>
        </div>
      ),
    },
    {
      id: 1,
      label: "forest",
      content: (
        <div className="border-border/50 flex w-full flex-col items-center gap-3 rounded-lg border p-4">
          <BgAnimateButton animation="spin-fast" gradient="forest">
            Button
          </BgAnimateButton>
          <BgAnimateButton animation="spin" gradient="forest">
            Button
          </BgAnimateButton>
          <BgAnimateButton animation="spin-slow" gradient="forest">
            Button
          </BgAnimateButton>
        </div>
      ),
    },
    {
      id: 2,
      label: "default",
      content: (
        <div className="border-border/50 flex w-full flex-col items-center gap-3 border p-4">
          <BgAnimateButton animation="spin-fast" gradient="default">
            Button
          </BgAnimateButton>
          <BgAnimateButton animation="spin" gradient="default">
            Button
          </BgAnimateButton>
          <BgAnimateButton animation="spin-slow" gradient="default">
            Button
          </BgAnimateButton>
        </div>
      ),
    },
    {
      id: 3,
      label: "sunset",
      content: (
        <div className="border-border/50 flex w-full flex-col items-center gap-3 rounded-lg border p-4">
          <BgAnimateButton animation="spin-fast" gradient="sunset">
            Button
          </BgAnimateButton>
          <BgAnimateButton animation="spin" gradient="sunset">
            Button
          </BgAnimateButton>
          <BgAnimateButton animation="spin-slow" gradient="sunset">
            Button
          </BgAnimateButton>
        </div>
      ),
    },
  ]

  return (
    <div className="">
      <DirectionAwareTabs tabs={tabs} />
    </div>
  )
}

export default DirectionAwareTabsDemo
