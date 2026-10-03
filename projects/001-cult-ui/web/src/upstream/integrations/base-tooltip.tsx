import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../vendor/registry/default/ui/base-tooltip";

// No official standalone example exists. The popup/trigger/provider all come
// from the authentic upstream primitives, with local explanatory content.
export default function BaseTooltipIntegration() {
  return <div className="flex min-h-72 w-full flex-col items-center justify-center gap-5 p-6">
    <p className="text-xs text-muted-foreground">本项目接入示例 · 原始 Base Tooltip API</p>
    <TooltipProvider delayDuration={100}><Tooltip>
      <TooltipTrigger className="rounded-full border bg-background px-6 py-3 text-sm shadow-sm">悬停或用 Tab 聚焦</TooltipTrigger>
      <TooltipContent>由上游 TooltipContent 渲染的提示</TooltipContent>
    </Tooltip></TooltipProvider>
    <p className="text-sm text-muted-foreground">按 Escape 可关闭提示</p>
  </div>;
}
