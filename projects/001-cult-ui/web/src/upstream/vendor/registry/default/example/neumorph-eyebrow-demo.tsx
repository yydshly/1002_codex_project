// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/example/neumorph-eyebrow-demo.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
import { NeumorphEyebrow } from "../ui/neumorph-eyebrow.tsx"

export default function NeumorphEyebrowDemo() {
  return (
    <div className="flex w-full flex-col items-center justify-center space-y-4">
      <NeumorphEyebrow>A milestone in scraping</NeumorphEyebrow>
      <NeumorphEyebrow intent="primary">Primary variant</NeumorphEyebrow>
      <NeumorphEyebrow intent="secondary">Secondary variant</NeumorphEyebrow>
    </div>
  )
}
