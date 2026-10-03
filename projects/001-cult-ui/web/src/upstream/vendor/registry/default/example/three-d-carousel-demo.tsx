// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/example/three-d-carousel-demo.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
import ThreeDPhotoCarousel from "../ui/three-d-carousel.tsx"

export default function ThreeDPhotoCarouselDemo() {
  return (
    <div className="w-full max-w-4xl">
      <div className="flex min-h-[500px] flex-col justify-center space-y-4 rounded-lg border border-dashed">
        <div className="p-2">
          <ThreeDPhotoCarousel />
        </div>
      </div>
    </div>
  )
}
