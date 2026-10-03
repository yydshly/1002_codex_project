import { useState } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../vendor/registry/default/ui/base-select";

// No official standalone example exists. This uses the unchanged upstream
// compound component API, rather than reproducing a visual select from scratch.
export default function BaseSelectIntegration() {
  const [value, setValue] = useState<string | null>("ideas");
  const items = [{value: "ideas", label: "灵感整理"}, {value: "making", label: "制作中"}, {value: "done", label: "已完成"}];
  return <div className="flex min-h-72 w-full flex-col items-center justify-center gap-5 p-6">
    <p className="text-xs text-muted-foreground">本项目接入示例 · 原始 Base Select API</p>
    <Select value={value} onValueChange={setValue} items={items}>
      <SelectTrigger aria-label="选择创作阶段" className="min-w-52"><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup><SelectLabel>创作阶段</SelectLabel>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
    <p className="text-sm text-muted-foreground" aria-live="polite">当前：{items.find(item => item.value === value)?.label}</p>
  </div>;
}
