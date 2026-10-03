// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/example/loading-carousel-demo.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
"use client"

import React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card.tsx"

import { LoadingCarousel } from "../ui/loading-carousel.tsx"

export default function LoadingCarouselDemo() {
  return (
    <div className="w-full space-y-8 p-4">
      <div className="w-full">
        <CardHeader>
          <CardTitle>Default LoadingCarousel</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingCarousel />
        </CardContent>
      </div>

      <div className="w-full">
        <CardHeader>
          <CardTitle>Wide Aspect Ratio with Top Text</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingCarousel
            aspectRatio="wide"
            textPosition="top"
            showIndicators={false}
          />
        </CardContent>
      </div>

      <div className="w-full">
        <CardHeader>
          <CardTitle>Background Tips + Gradient</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingCarousel
            aspectRatio="wide"
            backgroundTips={true}
            backgroundGradient={true}
          />
        </CardContent>
      </div>

      <div className="w-full">
        <CardHeader>
          <CardTitle>Custom Interval and Navigation</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingCarousel autoplayInterval={2000} showNavigation={true} />
        </CardContent>
      </div>

      <div className="w-full">
        <CardHeader>
          <CardTitle>Shuffled Tips with Custom Interval</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingCarousel
            shuffleTips={true}
            autoplayInterval={3000}
            showProgress={false}
          />
        </CardContent>
      </div>

      <div className="w-full">
        <CardHeader>
          <CardTitle>Square Aspect Ratio with Background Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingCarousel
            aspectRatio="square"
            backgroundTips={true}
            backgroundGradient={true}
          />
        </CardContent>
      </div>
    </div>
  )
}
