// @ts-nocheck
// Vendored from Cult UI 67a66c6ac1cd240914ba688a907611b3437a7a2b: apps/www/registry/default/example/code-block-demo.tsx
// Integration edits: relative imports/public asset URLs and explicit Next adapters.
import { CodeBlock } from "../ui/code-block.tsx"

function CodeBlockDemo() {
  return (
    <main className=" ">
      <div className="mx-auto space-y-8">
        {/* Multi-tab example */}
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">
            Package Manager Installation
          </h2>
          <CodeBlock
            tabs={[
              {
                label: "npm",
                code: "npm install @acme/ui",
                language: "bash",
              },
              {
                label: "pnpm",
                code: "pnpm add @acme/ui",
                language: "bash",
              },
              {
                label: "yarn",
                code: "yarn add @acme/ui",
                language: "bash",
              },
              {
                label: "bun",
                code: "bun add @acme/ui",
                language: "bash",
              },
            ]}
          />
        </div>

        {/* Single code block example */}
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Single Code Block</h2>
          <CodeBlock
            code={`import { CodeBlock } from '@/components/code-block'

export default function Page() {
  return (
    <CodeBlock
      code="console.log('Hello, world!')"
      language="javascript"
    />
  )
}`}
            language="tsx"
          />
        </div>

        {/* API example */}
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">API Configuration</h2>
          <CodeBlock
            tabs={[
              {
                label: ".env.local",
                code: `NEXT_PUBLIC_API_URL=https://api.example.com
API_SECRET_KEY=your-secret-key`,
                language: "bash",
              },
              {
                label: "config.ts",
                code: `export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  apiKey: process.env.API_SECRET_KEY,
}`,
                language: "typescript",
              },
            ]}
          />
        </div>
      </div>
    </main>
  )
}

export default CodeBlockDemo
