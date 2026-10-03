import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Code2,
  ExternalLink,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { sourceInfo, type Capability } from "../data";
import previewManifest from "../upstream/manifest.json";

type PreviewItem = {
  examples: { name: string; title: string; kind?: string }[];
  status?: string;
};
const previews = previewManifest as Record<string, PreviewItem>;
export const localPreviewCount = Object.values(previews).filter(
  (item) => item.examples.length > 0,
).length;
export const variantCount = Object.values(previews).reduce(
  (sum, item) => sum + item.examples.length,
  0,
);

export default function CatalogDialog({
  item,
  close,
  dark,
  adjacent,
  canNavigate,
}: {
  item: Capability | null;
  close: () => void;
  dark: boolean;
  adjacent: (direction: number) => void;
  canNavigate: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState("preview");
  const [example, setExample] = useState("");
  const [restart, setRestart] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const entry = item ? previews[item.id] : undefined;
  useEffect(() => {
    if (item) {
      setTab("preview");
      setExample(previews[item.id]?.examples[0]?.name ?? "");
      setLoaded(false);
      setCopied(false);
      if (!ref.current?.open) ref.current?.showModal();
    } else ref.current?.close();
  }, [item]);
  useEffect(() => {
    setLoaded(false);
  }, [example, restart, dark]);
  if (!item) return <dialog ref={ref} onClose={close} />;
  const previewUrl = `./component.html?name=${encodeURIComponent(example)}&theme=${dark ? "dark" : "light"}`;
  const command = `npx shadcn@latest add https://www.cult-ui.com/r/${item.registryName || item.id}.json`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <dialog
      className="detail-dialog catalog-dialog"
      ref={ref}
      onCancel={close}
      onClose={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      aria-labelledby="detail-title"
    >
      <div className="detail-content">
        <div className="detail-heading">
          <span className="eyebrow">COMPONENT / {item.category}</span>
          <button
            className="icon-button"
            onClick={close}
            aria-label="关闭组件详情"
          >
            <X size={20} />
          </button>
        </div>
        <div className="catalog-dialog-title">
          <div>
            <h2 id="detail-title">{item.name}</h2>
            <p className="detail-english">{item.english}</p>
          </div>
          <div className="dialog-step">
            <button
              onClick={() => adjacent(-1)}
              disabled={!canNavigate}
              aria-label="上一个组件"
            >
              <ArrowLeft size={17} />
            </button>
            <button
              onClick={() => adjacent(1)}
              disabled={!canNavigate}
              aria-label="下一个组件"
            >
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
        <p className="detail-description">{item.description}</p>
        <div
          className="catalog-detail-tabs"
          role="tablist"
          aria-label="组件详情视图"
        >
          {[
            ["preview", "效果预览", Play],
            ["principle", "实现原理", Code2],
            ["source", "源码与安装", ExternalLink],
          ].map(([id, title, Icon]) => {
            const TabIcon = Icon as typeof Play;
            return (
              <button
                key={id as string}
                role="tab"
                id={`detail-tab-${id}`}
                aria-selected={tab === id}
                aria-controls="catalog-detail-panel"
                tabIndex={tab === id ? 0 : -1}
                onKeyDown={(event) => {
                  const ids = ["preview", "principle", "source"];
                  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    const next =
                      ids[
                        (ids.indexOf(tab) +
                          (event.key === "ArrowRight" ? 1 : 2)) %
                          3
                      ];
                    setTab(next);
                    document.getElementById(`detail-tab-${next}`)?.focus();
                  }
                }}
                onClick={() => setTab(id as string)}
              >
                <TabIcon size={15} />
                {title as string}
              </button>
            );
          })}
        </div>
        <div
          id="catalog-detail-panel"
          role="tabpanel"
          aria-labelledby={`detail-tab-${tab}`}
        >
          {tab === "preview" && (
            <>
              {entry?.examples.length ? (
                <>
                  <div className="preview-toolbar">
                    <label>
                      示例
                      <select
                        aria-label="选择组件示例"
                        value={example}
                        onChange={(event) => setExample(event.target.value)}
                      >
                        {entry.examples.map((option) => (
                          <option key={option.name} value={option.name}>
                            {option.kind === "integration"
                              ? "本项目接入示例"
                              : entry.examples.length === 1
                                ? "默认演示"
                                : option.name.endsWith("-upload")
                                  ? "图片上传示例"
                                  : option.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div>
                      <button
                        onClick={() => setRestart((value) => value + 1)}
                        aria-label="重新播放预览"
                      >
                        <RotateCcw size={15} />
                        重播
                      </button>
                      <a href={previewUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={15} />
                        独立打开
                      </a>
                    </div>
                  </div>
                  <div className="upstream-preview-stage">
                    {!loaded && (
                      <div className="preview-loading" role="status">
                        正在加载组件…
                      </div>
                    )}
                    {example && (
                      <iframe
                        key={`${item.id}-${example}-${restart}-${dark}`}
                        src={previewUrl}
                        title={`${item.english} 官方源码示例`}
                        onLoad={() => setLoaded(true)}
                        allow="clipboard-write; fullscreen"
                        allowFullScreen
                      />
                    )}
                  </div>
                  <p className="detail-note">
                    {entry.examples.find((option) => option.name === example)
                      ?.kind === "integration"
                      ? "本项目用上游原版 API 编写的基础接入示例。"
                      : "固定版本的上游原版组件与官方示例源码。"}
                    图片、路由和主题接口已适配本地运行；外部媒体与模型服务需要联网或另行接入。
                  </p>
                </>
              ) : (
                <div className="preview-unavailable">
                  <p>{entry?.status || "该条目的官方预览请在文档中查看。"}</p>
                  <a
                    href={item.docs || item.source}
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开官方效果 <ExternalLink size={15} />
                  </a>
                </div>
              )}
            </>
          )}
          {tab === "principle" && (
            <>
              <div className="detail-tag-list">
                {item.tags?.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <dl className="detail-facts">
                <div>
                  <dt>如何实现</dt>
                  <dd>{item.mechanism}</dd>
                </div>
                <div>
                  <dt>适合场景</dt>
                  <dd>{item.scenario}</dd>
                </div>
                <div>
                  <dt>依赖与接入</dt>
                  <dd>
                    {item.dependencies?.length
                      ? item.dependencies.join(" · ")
                      : "React · Tailwind CSS；具体子依赖见组件注册表。"}
                  </dd>
                </div>
              </dl>
              <p className="detail-note">
                场景说明是基于组件形态的研究判断。AI
                组件提供界面；推理、鉴权、存储和业务数据由应用接入。
              </p>
            </>
          )}
          {tab === "source" && (
            <>
              <div className="catalog-install">
                <span>在已初始化 shadcn 的 React 项目中运行</span>
                <code>{command}</code>
                <button onClick={copy}>
                  {copied ? <Check size={16} /> : <Code2 size={16} />}
                  {copied ? "已复制" : "复制安装命令"}
                </button>
              </div>
              <dl className="detail-facts">
                <div>
                  <dt>研究版本</dt>
                  <dd>{sourceInfo.commit}</dd>
                </div>
                <div>
                  <dt>分发方式</dt>
                  <dd>
                    shadcn CLI
                    下载注册表、写入源码并安装依赖。组件进入本地项目后，可按需修改。
                  </dd>
                </div>
              </dl>
              <p className="detail-note">
                上面的安装地址跟随官方当前版本；本页预览固定在所注明的研究
                commit。
              </p>
            </>
          )}
        </div>
        <div className="detail-source-actions">
          <a href={item.docs || item.source} target="_blank" rel="noreferrer">
            {item.docs ? "官方文档" : "注册源码"} <ExternalLink size={15} />
          </a>
          <a href={item.source} target="_blank" rel="noreferrer">
            固定版本源码 <ExternalLink size={15} />
          </a>
        </div>
      </div>
    </dialog>
  );
}
