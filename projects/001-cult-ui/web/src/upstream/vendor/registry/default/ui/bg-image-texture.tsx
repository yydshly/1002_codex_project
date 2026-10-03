// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/ui/bg-image-texture.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
import type React from "react"

import { cn } from "../../../lib/utils.ts"

export type TextureVariant =
  | "fabric-of-squares"
  | "grid-noise"
  | "inflicted"
  | "debut-light"
  | "groovepaper"
  | "none"

interface BackgroundImageTextureProps {
  variant?: TextureVariant
  opacity?: number
  className?: string
  children?: React.ReactNode
}

const textureMap: Record<Exclude<TextureVariant, "none">, string> = {
  "fabric-of-squares": "./textures/fabric-of-squares.png",
  "grid-noise": "./textures/grid-noise.png",
  inflicted: "./textures/inflicted.png",
  "debut-light": "./textures/debut-light.png",
  groovepaper: "./textures/groovepaper.png",
}

export function BackgroundImageTexture({
  variant = "fabric-of-squares",
  opacity = 0.5,
  className,
  children,
}: BackgroundImageTextureProps) {
  const textureUrl = variant !== "none" ? textureMap[variant] : null

  return (
    <div className={cn("relative", className)}>
      {textureUrl && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${textureUrl})`,
            backgroundRepeat: "repeat",
            opacity,
          }}
        />
      )}
      {children && <div className="relative">{children}</div>}
    </div>
  )
}
