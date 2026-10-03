"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  AnimatePresence,
  motion,
  useAnimationFrame,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useSystemReducedMotion as useReducedMotion } from "../motion-preference";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Compass,
  Home,
  Layers3,
  Leaf,
  Pause,
  Play,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Sprout,
  Upload,
  type LucideIcon,
} from "lucide-react";

type DemoProps = { className?: string };
const widgetClass = (name: string, extra?: string) =>
  ["demo-widget", name, extra].filter(Boolean).join(" ");

/**
 * Research reproductions, not verbatim upstream components.
 * The examples keep Cult UI's demonstrated interaction mechanisms, while adding
 * local SVG artwork, keyboard/touch controls, and reduced-motion handling.
 */

function PlantArtwork() {
  const gradientId = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 220 230" aria-hidden="true" className="plant-artwork">
      <defs>
        <linearGradient id={`${gradientId}-leaf`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#b6d97d" />
          <stop offset="1" stopColor="#477457" />
        </linearGradient>
        <linearGradient id={`${gradientId}-pot`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#ece7dc" />
          <stop offset="0.5" stopColor="#fffdf7" />
          <stop offset="1" stopColor="#d8d3c8" />
        </linearGradient>
      </defs>
      <ellipse cx="110" cy="213" rx="65" ry="8" fill="#3d5745" opacity="0.12" />
      <path
        d="M109 161 Q111 108 105 62 M111 121 Q81 91 60 80 M109 137 Q143 101 161 98 M108 96 Q129 65 149 52"
        fill="none"
        stroke="#496d49"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <g fill={`url(#${gradientId}-leaf)`}>
        <path d="M106 80 C74 71 70 36 85 17 C112 28 126 54 106 80Z" />
        <path d="M101 106 C66 110 37 85 37 61 C70 57 92 74 101 106Z" />
        <path d="M111 98 C118 64 144 39 170 42 C172 75 148 94 111 98Z" />
        <path d="M110 145 C135 108 167 93 190 107 C178 140 147 150 110 145Z" />
        <path d="M105 147 C70 150 48 132 47 110 C79 103 99 120 105 147Z" />
      </g>
      <g fill="none" stroke="#d1e9b5" strokeWidth="1.4" opacity="0.65">
        <path d="M104 73 Q95 44 86 26 M95 98 Q67 77 45 66 M120 88 Q144 63 161 48 M121 137 Q151 115 179 110 M97 140 Q74 122 55 115" />
      </g>
      <path
        d="M71 159 H149 L140 206 Q110 223 80 206Z"
        fill={`url(#${gradientId}-pot)`}
      />
      <ellipse cx="110" cy="159" rx="39" ry="8" fill="#e3ded3" />
      <ellipse cx="110" cy="158" rx="33" ry="4.5" fill="#615848" />
      <path
        d="M87 172 L91 201 M102 172 L104 209 M119 172 L118 209 M134 172 L130 201"
        stroke="#d7d0c3"
        strokeWidth="1"
      />
    </svg>
  );
}

export function ShiftCardDemo({ className }: DemoProps) {
  const [expanded, setExpanded] = useState(false);
  const reduced = useReducedMotion();
  const id = useId();
  const artworkId = `${id}-plant`;
  const sharedTransition = reduced
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 290, damping: 28 };

  // Upstream: hover state + AnimatePresence; its demo shares a layoutId between
  // large and small images. Here a button controls the same transition, and an
  // SVG replaces external imagery. The details use natural height, not 194px.
  return (
    <div className={widgetClass("shift-demo", className)}>
      <motion.article
        layout
        transition={sharedTransition}
        className={`shift-card${expanded ? " is-expanded" : ""}`}
      >
        <div className="shift-card-header">
          <div className="shift-card-heading">
            <span className="shift-kicker">
              <Leaf size={12} /> SLOW GROWTH
            </span>
            <h3>给灵感一点生长空间</h3>
          </div>
          {expanded && (
            <motion.div
              layoutId={artworkId}
              transition={sharedTransition}
              className="shift-plant-small"
            >
              <PlantArtwork />
            </motion.div>
          )}
        </div>
        {!expanded && (
          <motion.div
            layoutId={artworkId}
            transition={sharedTransition}
            className="shift-plant-large"
          >
            <PlantArtwork />
          </motion.div>
        )}
        <div id={`${id}-details`} className="shift-details-shell">
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                className="shift-details"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.28 }}
              >
                <p>从一个小想法开始，让每次轻盈的互动，都成为产品的记忆点。</p>
                <div className="shift-detail-row">
                  <Sprout size={15} />
                  <span>今天，又向前生长了一点</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button
          type="button"
          className="shift-toggle"
          aria-expanded={expanded}
          aria-controls={`${id}-details`}
          onClick={() => setExpanded((value) => !value)}
        >
          <span>{expanded ? "收起这份灵感" : "展开这份灵感"}</span>
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
          >
            <ChevronDown size={16} />
          </motion.span>
        </button>
      </motion.article>
      <p className="demo-note shift-tip">
        点击卡片按钮，观察同一株植物的位置与尺寸变化
      </p>
    </div>
  );
}

const textPresets = [
  { id: "fade", label: "淡入" },
  { id: "spring", label: "弹簧" },
  { id: "rise", label: "上移" },
] as const;
type TextPreset = (typeof textPresets)[number]["id"];

export function TextAnimateDemo({ className }: DemoProps) {
  const [preset, setPreset] = useState<TextPreset>("rise");
  const [replay, setReplay] = useState(0);
  const reduced = useReducedMotion();
  const lines = ["让界面", "轻轻呼吸"];

  // Upstream splits text into spans and staggers Motion variants. This example
  // supplies an accessible full title, explicit replay, and a no-motion path.
  return (
    <div className={widgetClass("text-demo", className)}>
      <div className="text-preview">
        <span className="text-kicker">WORDS IN MOTION</span>
        <h3
          className="text-heading"
          aria-label="让界面，轻轻呼吸"
          key={`${preset}-${replay}`}
        >
          {lines.map((line, lineIndex) => (
            <span className="text-line" key={line} aria-hidden="true">
              {Array.from(line).map((letter, index) => (
                <motion.span
                  className="text-letter"
                  key={`${lineIndex}-${index}`}
                  initial={
                    reduced
                      ? false
                      : {
                          opacity: 0,
                          y:
                            preset === "fade"
                              ? 0
                              : preset === "spring"
                                ? 16
                                : 48,
                          scale: preset === "spring" ? 0.7 : 1,
                        }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : preset === "spring"
                        ? {
                            type: "spring",
                            damping: 11,
                            stiffness: 220,
                            delay: (lineIndex * 3 + index) * 0.07,
                          }
                        : {
                            duration: 0.5,
                            ease: [0.22, 1, 0.36, 1],
                            delay: (lineIndex * 3 + index) * 0.065,
                          }
                  }
                >
                  {letter}
                </motion.span>
              ))}
            </span>
          ))}
        </h3>
        <p className="text-subtitle">逐字展开，留一点恰好的节奏。</p>
      </div>
      <div className="demo-controls text-presets" aria-label="文字动画预设">
        {textPresets.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`preset-button${preset === option.id ? " is-active" : ""}`}
            aria-pressed={preset === option.id}
            onClick={() => setPreset(option.id)}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          className="icon-button text-replay"
          onClick={() => setReplay((value) => value + 1)}
          aria-label="重新播放文字动画"
          title="重新播放"
        >
          <RotateCcw size={15} />
        </button>
      </div>
      <p className="demo-note">切换预设或重新播放，比较同一句话的三种节奏</p>
    </div>
  );
}

const dockItems: {
  id: string;
  label: string;
  icon: LucideIcon;
  tone: string;
}[] = [
  { id: "home", label: "首页", icon: Home, tone: "sage" },
  { id: "search", label: "搜索", icon: Search, tone: "sky" },
  { id: "spaces", label: "空间", icon: Layers3, tone: "sand" },
  { id: "explore", label: "探索", icon: Compass, tone: "rose" },
  { id: "settings", label: "设置", icon: Settings2, tone: "lilac" },
];

function DockItem({
  item,
  mouseX,
  active,
  select,
  reduced,
}: {
  item: (typeof dockItems)[number];
  mouseX: MotionValue<number>;
  active: boolean;
  select: () => void;
  reduced: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const distance = useTransform(mouseX, (value) => {
    const bounds = ref.current?.getBoundingClientRect();
    return bounds ? value - bounds.left - bounds.width / 2 : Infinity;
  });
  const size = useTransform(distance, [-96, 0, 96], [44, 66, 44]);
  const springSize = useSpring(size, {
    mass: 0.18,
    stiffness: 260,
    damping: 22,
  });
  const Icon = item.icon;
  return (
    <motion.button
      ref={ref}
      type="button"
      className={`dock-item dock-${item.tone}${active ? " is-active" : ""}`}
      style={{
        width: reduced ? 44 : springSize,
        height: reduced ? 44 : springSize,
      }}
      aria-label={item.label}
      aria-pressed={active}
      onFocus={() => {
        const bounds = ref.current?.getBoundingClientRect();
        if (bounds) mouseX.set(bounds.left + bounds.width / 2);
      }}
      onBlur={() => mouseX.set(Infinity)}
      onClick={select}
    >
      <Icon aria-hidden="true" />
      <span className="dock-tooltip" aria-hidden="true">
        {item.label}
      </span>
      <span className="dock-active-dot" aria-hidden="true" />
    </motion.button>
  );
}

export function DockDemo({ className }: DemoProps) {
  const mouseX = useMotionValue(Infinity);
  const reduced = Boolean(useReducedMotion());
  const [selected, setSelected] = useState("home");

  // The upstream documentation confirms mouseX MotionValue and spring-driven
  // magnification. This is a compact reimplementation of proximity-to-size
  // mapping, with clientX and viewport bounds in the same coordinate system.
  return (
    <div className={widgetClass("dock-demo", className)}>
      <div className="dock-preview">
        <div className="dock-desktop-mark">
          <Layers3 size={32} />
          <span>YOUR LITTLE WORKSPACE</span>
        </div>
        <div
          className="dock-panel"
          role="group"
          aria-label="工作区快捷操作"
          onPointerMove={(event) => {
            if (event.pointerType !== "touch") mouseX.set(event.clientX);
          }}
          onPointerLeave={() => mouseX.set(Infinity)}
        >
          {dockItems.map((item) => (
            <DockItem
              key={item.id}
              item={item}
              mouseX={mouseX}
              active={selected === item.id}
              select={() => setSelected(item.id)}
              reduced={reduced}
            />
          ))}
        </div>
        <p className="dock-caption" aria-live="polite">
          当前选择 · {dockItems.find((item) => item.id === selected)?.label}
        </p>
      </div>
      <p className="demo-note">
        移动指针感受邻近放大；也可用 Tab 和 Enter 选择
      </p>
    </div>
  );
}

const tabs = [
  {
    label: "灵感",
    icon: Sparkles,
    title: "把想法，放进下一步",
    description: "捕捉一个小念头，开启一段新旅程。",
    progress: 34,
    meta: "3 个灵感，等待发芽",
    tone: "sage",
  },
  {
    label: "制作",
    icon: Layers3,
    title: "让每一处细节成形",
    description: "在尝试与打磨之间，找到舒服的节奏。",
    progress: 68,
    meta: "2 个方案，正在打磨",
    tone: "sky",
  },
  {
    label: "发布",
    icon: Upload,
    title: "准备好，与世界见面",
    description: "把悉心完成的作品，交到用户手里。",
    progress: 100,
    meta: "1 个作品，准备出发",
    tone: "sand",
  },
] as const;

export function TabsDemo({ className }: DemoProps) {
  const [selected, setSelected] = useState(0);
  const [direction, setDirection] = useState(1);
  const reduced = useReducedMotion();
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const tab = tabs[selected];
  const Icon = tab.icon;

  function changeTab(next: number, focus = false) {
    setDirection(next >= selected ? 1 : -1);
    setSelected(next);
    if (focus) buttons.current[next]?.focus();
  }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    let next: number | undefined;
    if (event.key === "ArrowRight") next = (selected + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      next = (selected - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      changeTab(next, true);
    }
  }

  // Research reproduction of direction-aware tabs: one shared-layout indicator
  // and direction-dependent panel transforms. Content is local study copy.
  return (
    <div className={widgetClass("tabs-demo", className)}>
      <div className="tabs-preview">
        <div className="tabs-list" role="tablist" aria-label="创作阶段">
          {tabs.map((item, index) => (
            <button
              key={item.label}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${index}`}
              aria-controls={`${id}-panel`}
              aria-selected={selected === index}
              tabIndex={selected === index ? 0 : -1}
              className={`tabs-trigger${selected === index ? " is-active" : ""}`}
              onClick={() => changeTab(index)}
              onKeyDown={onKeyDown}
            >
              {selected === index && (
                <motion.span
                  className="tabs-highlight"
                  layoutId={`${id}-highlight`}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 350, damping: 30 }
                  }
                />
              )}
              <span className="tabs-label">{item.label}</span>
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-tab-${selected}`}
          tabIndex={0}
          className="tabs-panel"
        >
          <AnimatePresence initial={false} mode="wait" custom={direction}>
            <motion.div
              key={selected}
              custom={direction}
              variants={{
                enter: (dir: number) => ({
                  opacity: reduced ? 1 : 0,
                  x: reduced ? 0 : dir * 22,
                }),
                center: { opacity: 1, x: 0 },
                leave: (dir: number) => ({
                  opacity: reduced ? 1 : 0,
                  x: reduced ? 0 : dir * -22,
                }),
              }}
              initial="enter"
              animate="center"
              exit="leave"
              transition={{ duration: reduced ? 0 : 0.18 }}
              className="tab-copy"
            >
              <div className={`tab-visual tab-${tab.tone}`}>
                <Icon size={29} strokeWidth={1.5} />
              </div>
              <h3>{tab.title}</h3>
              <p>{tab.description}</p>
              <div className="tab-progress" aria-hidden="true">
                <motion.div
                  className="tab-progress-fill"
                  initial={false}
                  animate={{ width: `${tab.progress}%` }}
                  transition={{ duration: reduced ? 0 : 0.3 }}
                />
              </div>
              <span className="tab-meta">{tab.meta}</span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <p className="demo-note">从左到右，再从右到左，内容会跟随切换方向</p>
    </div>
  );
}

export function BorderBeamDemo({ className }: DemoProps) {
  const [playing, setPlaying] = useState(true);
  const [fast, setFast] = useState(false);
  const reduced = useReducedMotion();
  const running = playing && !reduced;
  const rotation = useMotionValue(0);
  useAnimationFrame((_, delta) => {
    if (running)
      rotation.set(
        (rotation.get() + (delta * 360) / (fast ? 2500 : 7000)) % 360,
      );
  });

  // CSS mechanism illustration, not the upstream implementation. Current Cult
  // UI BorderBeamCard wraps the npm border-beam package. Here a conic gradient
  // is exposed at the border by CSS and rotated with a MotionValue.
  return (
    <div className={widgetClass("beam-demo", className)}>
      <div className="beam-preview">
        <div className="beam-card">
          <motion.div
            aria-hidden="true"
            className="beam-ring"
            style={{
              rotate: reduced ? 0 : rotation,
              background:
                "conic-gradient(from 0deg, transparent 0deg, transparent 275deg, #80af9b 310deg, #cbeacf 340deg, transparent 360deg)",
            }}
          />
          <div className="beam-content">
            <div className="beam-icon">
              <Sparkles size={24} strokeWidth={1.5} />
            </div>
            <span className="beam-kicker">A LITTLE RADIANCE</span>
            <h3>让边界，有一点光</h3>
            <p>细微的流动，也能让重要内容被看见。</p>
            <div className="beam-detail">
              <span /> Made for the details
            </div>
          </div>
        </div>
      </div>
      <div className="demo-controls beam-controls">
        <button
          type="button"
          className="preset-button"
          disabled={Boolean(reduced)}
          onClick={() => setPlaying((value) => !value)}
          aria-label={playing ? "暂停边框动画" : "播放边框动画"}
        >
          {running ? <Pause size={13} /> : <Play size={13} />}{" "}
          {reduced ? "减少动效已开启" : playing ? "暂停" : "播放"}
        </button>
        <button
          type="button"
          className={`preset-button${fast ? " is-active" : ""}`}
          disabled={Boolean(reduced)}
          aria-pressed={fast}
          onClick={() => setFast((value) => !value)}
        >
          {fast ? "快速 · 2.5 秒" : "舒缓 · 7 秒"}
        </button>
      </div>
      <p className="demo-note">调整速度，观察边框光束的注意力强度</p>
    </div>
  );
}

const initialTasks = [
  { id: "ideas", title: "整理产品灵感", tag: "设计", tone: "sage", column: 0 },
  { id: "copy", title: "打磨首屏文案", tag: "内容", tone: "sand", column: 0 },
  { id: "motion", title: "制作交互动效", tag: "动效", tone: "sky", column: 1 },
  {
    id: "mobile",
    title: "检查移动端体验",
    tag: "检查",
    tone: "lilac",
    column: 2,
  },
];
const columns = ["想法", "进行中", "已完成"];
const dragType = "application/x-cult-study-task";

export function KanbanDemo({ className }: DemoProps) {
  const [tasks, setTasks] = useState(initialTasks);
  const [dropColumn, setDropColumn] = useState<number | null>(null);
  const [status, setStatus] = useState("把一个小任务，向前推进一步。");
  const reduced = useReducedMotion();
  const id = useId();
  const focusTargets = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  useEffect(() => {
    if (pendingFocus) {
      focusTargets.current[pendingFocus]?.focus();
      setPendingFocus(null);
    }
  }, [pendingFocus, tasks]);

  function moveTask(
    taskId: string,
    column: number,
    focusDirection?: "left" | "right",
  ) {
    const task = tasks.find((item) => item.id === taskId);
    if (
      !task ||
      column < 0 ||
      column >= columns.length ||
      task.column === column
    )
      return;
    setTasks((current) =>
      current.map((item) => (item.id === taskId ? { ...item, column } : item)),
    );
    setStatus(`「${task.title}」已移至${columns[column]}。`);
    setDropColumn(null);
    if (focusDirection)
      setPendingFocus(
        `${taskId}-${column === 0 ? "right" : column === 2 ? "left" : focusDirection}`,
      );
  }

  // Research reproduction of a Kanban interaction, not Cult UI's DnD engine.
  // Native drag/drop serves desktop; labeled buttons serve keyboard and touch.
  // Tasks remain local to the page; Motion layout animates column changes.
  return (
    <div className={widgetClass("kanban-demo", className)}>
      <div className="kanban-preview">
        <div className="kanban-toolbar">
          <span>
            <span className="kanban-project-dot" /> 一个小项目
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="重置看板任务"
            title="重置看板"
            onClick={() => {
              setTasks(initialTasks);
              setStatus("看板已重置。");
            }}
          >
            <RotateCcw size={14} />
          </button>
        </div>
        <div className="kanban-board">
          {columns.map((label, column) => (
            <section
              key={label}
              className={`kanban-column${dropColumn === column ? " is-drop-target" : ""}`}
              aria-label={`${label}任务`}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes(dragType)) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropColumn(column);
                }
              }}
              onDragLeave={(event) => {
                if (
                  !event.currentTarget.contains(
                    event.relatedTarget as Node | null,
                  )
                )
                  setDropColumn(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                moveTask(event.dataTransfer.getData(dragType), column);
                setDropColumn(null);
              }}
            >
              <div className="kanban-column-header">
                <h3>
                  <span className={`kanban-dot kanban-dot-${column}`} />
                  {label}
                </h3>
                <span className="kanban-count">
                  {tasks.filter((task) => task.column === column).length}
                </span>
              </div>
              <div className="kanban-column-body">
                {tasks
                  .filter((task) => task.column === column)
                  .map((task) => (
                    <motion.div
                      key={task.id}
                      layout
                      layoutId={`${id}-kanban-${task.id}`}
                      className="kanban-card-wrap"
                      transition={{ duration: reduced ? 0 : 0.25 }}
                    >
                      <article
                        className="kanban-card"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData(dragType, task.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDropColumn(null)}
                      >
                        <span className={`kanban-tag kanban-tag-${task.tone}`}>
                          {task.tag}
                        </span>
                        <h4>{task.title}</h4>
                        <div className="kanban-card-footer">
                          <span
                            className="kanban-assignee"
                            aria-label="负责人：小林"
                          >
                            林
                          </span>
                          {column === 2 && (
                            <Check
                              size={13}
                              className="kanban-done"
                              aria-label="已完成"
                            />
                          )}
                          <div className="kanban-move-controls">
                            <button
                              ref={(node) => {
                                focusTargets.current[`${task.id}-left`] = node;
                              }}
                              type="button"
                              className="kanban-move"
                              disabled={column === 0}
                              onClick={() =>
                                moveTask(task.id, column - 1, "left")
                              }
                              aria-label={`将${task.title}移至${columns[Math.max(0, column - 1)]}`}
                              title="向左移动"
                            >
                              <ArrowLeft size={12} />
                            </button>
                            <button
                              ref={(node) => {
                                focusTargets.current[`${task.id}-right`] = node;
                              }}
                              type="button"
                              className="kanban-move"
                              disabled={column === 2}
                              onClick={() =>
                                moveTask(task.id, column + 1, "right")
                              }
                              aria-label={`将${task.title}移至${columns[Math.min(2, column + 1)]}`}
                              title="向右移动"
                            >
                              <ArrowRight size={12} />
                            </button>
                          </div>
                        </div>
                      </article>
                    </motion.div>
                  ))}
                {!tasks.some((task) => task.column === column) && (
                  <div className="kanban-empty">
                    拖到这里
                    <br />
                    或使用卡片箭头
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
      <p className="demo-note kanban-status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
