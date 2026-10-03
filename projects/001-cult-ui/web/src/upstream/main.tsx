import {
  Component,
  useEffect,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "./vendor/components/ui/tooltip";
import { Toaster } from "./vendor/components/ui/toaster";
import { loaders } from "./loaders";
import exampleMetadata from "./examples.json";
import aliases from "./aliases.json";
import "./upstream.css";
import "./preview.css";
import "./fonts.css";

type PreviewState = "loading" | "ready" | "error";
const params = new URLSearchParams(window.location.search);
const requestedName = params.get("name") ?? "shift-card-demo";
const name =
  (aliases as Record<string, string>)[requestedName] ?? requestedName;
const theme = params.get("theme") === "dark" ? "dark" : "light";
const metadata = exampleMetadata.find((example) => example.name === name);
document.documentElement.classList.toggle("dark", theme === "dark");
document.title = `${name} · Cult UI 官方源码预览`;

function report(state: PreviewState, message?: string) {
  document.body.dataset.previewState = state;
  window.parent.postMessage(
    { type: "cult-preview-state", name, state, message },
    window.location.origin,
  );
}
function reportRuntimeIssue(message: string) {
  report("error", message);
  window.dispatchEvent(
    new CustomEvent("cult-preview-runtime-issue", { detail: message }),
  );
}

class PreviewBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    report("error", error.message);
    console.error("Official example failed", name, error, info.componentStack);
  }
  render() {
    if (this.state.error)
      return <PreviewError message={this.state.error.message} />;
    return this.props.children;
  }
}

function PreviewError({ message }: { message: string }) {
  return (
    <div
      className="preview-message preview-error"
      role="alert"
      data-preview-state="error"
    >
      <strong>这个官方示例未能在当前环境运行</strong>
      <p>{name}</p>
      <pre>{message}</pre>
      <p>保留原始源码并准确报告错误，不会自动替换为简化效果。</p>
      {metadata?.source && (
        <a href={metadata.source} target="_blank" rel="noreferrer">
          查看固定版本上游源码 ↗
        </a>
      )}
      <button type="button" onClick={() => window.location.reload()}>
        重新加载
      </button>
    </div>
  );
}

function ReadyMarker() {
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (document.body.dataset.previewState !== "error") report("ready");
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}

function Preview() {
  const [Demo, setDemo] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState("");
  const [runtimeIssue, setRuntimeIssue] = useState("");
  useEffect(() => {
    let cancelled = false;
    const load = loaders[name];
    report("loading");
    if (!load) {
      setError(`未注册示例：${name}`);
      report("error", `未注册示例：${name}`);
      return;
    }
    load()
      .then((module) => {
        const exported = module.default ?? module.TerminalAnimationDemo;
        if (!exported) throw new Error("官方示例没有可渲染的默认导出");
        if (!cancelled) setDemo(() => exported);
      })
      .catch((cause) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (!cancelled) {
          setError(message);
          report("error", message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const handler = (event: Event) =>
      setRoute(String((event as CustomEvent).detail));
    const issueHandler = (event: Event) =>
      setRuntimeIssue(String((event as CustomEvent).detail));
    window.addEventListener("cult-preview-navigation", handler);
    window.addEventListener("cult-preview-runtime-issue", issueHandler);
    return () => {
      window.removeEventListener("cult-preview-navigation", handler);
      window.removeEventListener("cult-preview-runtime-issue", issueHandler);
    };
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver(() =>
      window.parent.postMessage(
        {
          type: "cult-preview-size",
          name,
          height: document.documentElement.scrollHeight,
        },
        window.location.origin,
      ),
    );
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);
  return (
    <ThemeProvider
      forcedTheme={theme}
      attribute="class"
      enableSystem={false}
      disableTransitionOnChange
    >
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={100}>
          <main
            className="upstream-preview"
            data-preview-name={name}
            data-preview-state={
              error || runtimeIssue ? "error" : Demo ? "ready" : "loading"
            }
          >
            {metadata?.kind === "integration" && (
              <div className="preview-integration-label">
                本项目接入示例 · 使用未改写的上游基础组件 API
              </div>
            )}
            <div className="upstream-content">
              {error ? (
                <PreviewError message={error} />
              ) : Demo ? (
                <PreviewBoundary>
                  <Demo />
                  <ReadyMarker />
                </PreviewBoundary>
              ) : (
                <div
                  className="preview-message"
                  role="status"
                  data-preview-state="loading"
                >
                  <span className="preview-spinner" />
                  正在加载原始官方示例…
                </div>
              )}
            </div>
            {route && (
              <div className="preview-route" role="status">
                官方回调请求路由：{route}。此独立预览不包含 Next 应用路由。
              </div>
            )}
            {runtimeIssue && !error && (
              <aside
                className="preview-runtime-issue"
                role="status"
                data-preview-state="error"
              >
                <strong>示例资源或运行发生错误</strong>
                <p>{runtimeIssue}</p>
                <button type="button" onClick={() => window.location.reload()}>
                  重新加载示例
                </button>
              </aside>
            )}
          </main>
          <SonnerToaster theme={theme} />
          <Toaster />
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}

window.addEventListener("error", (event) => {
  if (event.error)
    reportRuntimeIssue(String(event.error.message ?? event.message));
});
window.addEventListener("unhandledrejection", (event) =>
  reportRuntimeIssue(String(event.reason?.message ?? event.reason)),
);
createRoot(document.getElementById("root")!).render(<Preview />);
