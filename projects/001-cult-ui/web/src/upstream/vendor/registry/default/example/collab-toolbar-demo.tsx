// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/example/collab-toolbar-demo.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
"use client"

import { CollabToolbar } from "../ui/collab-toolbar.tsx"

const avatars = [
  { name: "Jane Doe", imageUrl: "https://i.pravatar.cc/100?img=12" },
  { name: "Alex Kim", imageUrl: "https://i.pravatar.cc/100?img=32" },
  { name: "Sam Taylor", imageUrl: "https://i.pravatar.cc/100?img=68" },
]

function CollabToolbarDemo() {
  return (
    <div className="flex items-center justify-center p-6">
      <CollabToolbar
        groups={[["phone", "desktop", "chat"], "avatars", ["upload", "menu"]]}
        avatars={avatars}
      />
    </div>
  )
}

export default CollabToolbarDemo
