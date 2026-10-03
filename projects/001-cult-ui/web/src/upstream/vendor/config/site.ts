// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/config/site.ts
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
export const siteConfig = {
  /* ───────────────── Brand & positioning ───────────────── */
  name: "Cult UI – Shadcn UI Components, Blocks & Templates",
  description:
    "Open-source Shadcn UI components, animated blocks, and full templates you can copy-paste into any TypeScript/Next.js project.",
  url: "https://www.cult-ui.com",
  ogImage: "https://www.cult-ui.com/og",

  /* ───────────────── Social links ───────────────── */
  links: {
    components: "/docs/components/dynamic-island",
    twitter: "https://x.com/nolansym",
    github: "https://github.com/nolly-studio/cult-ui",
  },
} as const;

export type SiteConfig = typeof siteConfig;
