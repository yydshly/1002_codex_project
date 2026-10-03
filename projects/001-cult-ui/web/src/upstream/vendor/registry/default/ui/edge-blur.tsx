// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/ui/edge-blur.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
"use client"

interface EdgeBlurProps {
  position?: "top" | "bottom"
  height?: number
}

export function EdgeBlur({ position = "bottom", height = 75 }: EdgeBlurProps) {
  const blurLayers = [1, 2, 3, 6, 12]

  const isTop = position === "top"

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 isolate z-40 ${isTop ? "top-0" : "bottom-0"}`}
      style={{ height }}
    >
      {blurLayers.map((blur) => (
        <div
          key={blur}
          className="absolute inset-0"
          style={{
            backdropFilter: `blur(${blur}px)`,
            WebkitBackdropFilter: `blur(${blur}px)`,
            maskImage: `linear-gradient(to ${isTop ? "bottom" : "top"}, black, transparent)`,
            WebkitMaskImage: `linear-gradient(to ${isTop ? "bottom" : "top"}, black, transparent)`,
          }}
        />
      ))}
    </div>
  )
}

// Convenience exports for specific positions
export function TopBlur({ height = 75 }: { height?: number }) {
  return <EdgeBlur position="top" height={height} />
}

export function BottomBlur({ height = 75 }: { height?: number }) {
  return <EdgeBlur position="bottom" height={height} />
}
