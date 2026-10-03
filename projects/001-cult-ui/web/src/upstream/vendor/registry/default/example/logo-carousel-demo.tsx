// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/example/logo-carousel-demo.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
"use client"

import React from "react"

import { GradientHeading } from "../ui/gradient-heading.tsx"
import LogoCarousel from "../ui/logo-carousel.tsx"

export default function LogoCarouselDemo() {
  return (
    <div className="space-y-8 py-24">
      <div className="mx-auto flex w-full max-w-screen-lg flex-col items-center space-y-8">
        <div className="text-center">
          <GradientHeading variant="secondary">
            The best are already here
          </GradientHeading>
          <a href="https://www.newcult.co" target="_blank">
            <GradientHeading size="xxl">Join new cult</GradientHeading>
          </a>
        </div>

        <LogoCarousel columnCount={3} />
      </div>
    </div>
  )
}
