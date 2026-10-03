"""Render a source-grounded, single-image map of all 137 Cult UI components."""

import json
import math
import re
from html import escape
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / "web/src/catalog.json").read_text(encoding="utf-8-sig"))
OUT = ROOT / "assets"
WIDTH = 1560
MARGIN = 56
GAP = 24
PAPER = "#F2F5F1"
INK = "#173B3D"
TEXT = "#243C3E"
MUTED = "#526565"
LINE = "#D3DDD6"
WHITE = "#FFFFFF"
GREEN = "#DCEADC"
GOLD = "#EACB85"
FONT = Path("C:/Windows/Fonts/msyh.ttc")
BOLD = Path("C:/Windows/Fonts/msyhbd.ttc")
FONTS = {}

MECHANISMS = {
    "AI 输入": ("状态与输入事件；部分用 Base UI、Paper Warp 和原生文件拖放", "AI 聊天、附件上传、提示词复用"),
    "AI 生成界面": ("受控状态、SVG、Motion 切换；代码高亮与剪贴板等专项实现", "结构化回答、投票、代码与执行过程展示"),
    "应用与工作台": ("React 数据状态、原生拖放、SVG 图表与 Motion 布局过渡", "项目管理、指标面板、编辑器工具栏"),
    "表单控件": ("Base UI 等控件原语处理行为；CSS 与部分 Motion 呈现反馈", "设置、筛选、资料编辑、模型选择"),
    "反馈与状态": ("进度状态、Sonner 消息队列；Motion 进入退出与尺寸过渡", "上传等待、成功失败通知、任务进度"),
    "导航与浮层": ("状态与浮层原语；方向判断、尺寸测量、指针距离映射与弹簧", "快捷入口、内容切换、移动抽屉、快速输入"),
    "引导与流程": ("Context 同步步骤；校验、Dialog / Drawer 与 Motion 视图切换", "首次使用、注册、个性化设置、功能导览"),
    "按钮": ("CSS 叠层、阴影和 SVG 轮廓；部分依赖 border-beam / metal-fx", "主要操作、升级入口、提交与复制"),
    "卡片": ("React 组合插槽、分层装饰；部分用 Motion 悬停、展开与过渡", "产品列表、作品集、模板资源、结果面板"),
    "落地页": ("部分用 Paper WebGL；sticky 与滚动观察，轮播状态与媒体渲染", "产品官网、发布页、长页功能介绍"),
    "插画": ("SVG 节点、连线与路径动画；COBE 渲染可旋转的 WebGL 地球", "架构说明、基础设施、部署区域、能力介绍"),
    "媒体与设备模型": ("内容插槽、CSS 设备外壳与三维透视；Motion 拖动、video / API", "产品截图、移动应用、作品集、视频图库"),
    "背景与视觉效果": ("按组件使用 CSS 滤镜 / 遮罩、Canvas 帧绘制、WebGL 像素采样", "首屏背景、视觉分区、图库、导航遮罩"),
    "文字排版": ("文字拆分与 Motion 错峰 / 弹簧；时间状态、像素字体与遮罩", "标题强调、欢迎文案、指标变化、品牌表达"),
    "补充注册项": ("Motion 渐变关键帧；Base UI 选择与提示原语", "动态背景、下拉筛选、工具栏提示"),
}


def font(size, bold=False):
    key = size, bold
    if key not in FONTS:
        FONTS[key] = ImageFont.truetype(str(BOLD if bold else FONT), size)
    return FONTS[key]


def measure(s, size=24, bold=False):
    return font(size, bold).getlength(s)


def wrap(s, width, size=24, bold=False):
    result, line = [], ""
    tokens = re.findall(r"[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*|[^A-Za-z0-9]", s)
    for char in tokens:
        if char == "\n":
            result.append(line)
            line = ""
        elif line and measure(line + char, size, bold) > width:
            result.append(line)
            line = char.lstrip()
        else:
            line += char
    if line:
        result.append(line)
    return result


def wrap_items(items, width, size=23):
    result, line = [], ""
    for item in items:
        proposed = line + " · " + item if line else item
        if line and measure(proposed, size) > width:
            result.append(line)
            line = item
        else:
            line = proposed
    if line:
        result.append(line)
    return result


categories = CATALOG["categories"][1:]
components = CATALOG["capabilities"]
assert len(components) == 137
assert len(categories) == 15
assert set(categories) == set(MECHANISMS)
assert len({x["id"] for x in components}) == 137
CW = (WIDTH - MARGIN * 2 - GAP * 2) / 3
cards = []
for category in categories:
    items = [x for x in components if x["category"] == category]
    names = wrap_items([x["name"] for x in items], CW - 44)
    mechanism, scene = MECHANISMS[category]
    ml = wrap(mechanism, CW - 44, 22)
    sl = wrap(scene, CW - 44, 22)
    height = 24 + 42 + 16 + len(names) * 34 + 22 + 30 + len(ml) * 32 + 16 + 30 + len(sl) * 32 + 24
    cards.append({"category": category, "items": items, "names": names, "mechanism": ml, "scene": sl, "height": height})

row_heights = [max(x["height"] for x in cards[i:i + 3]) for i in range(0, 15, 3)]
CATALOG_Y = 886
BOTTOM_Y = CATALOG_Y + sum(row_heights) + GAP * 4 + 58
HEIGHT = math.ceil(BOTTOM_Y + 1000)
img = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
draw = ImageDraw.Draw(img)
svg = []


def rect(x, y, w, h, fill, radius=0, stroke=None, sw=1):
    xy = (round(x), round(y), round(x + w), round(y + h))
    if radius:
        draw.rounded_rectangle(xy, radius, fill=fill, outline=stroke, width=sw)
    else:
        draw.rectangle(xy, fill=fill, outline=stroke, width=sw)
    svg.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{radius}" fill="{fill}"' + (f' stroke="{stroke}" stroke-width="{sw}"' if stroke else "") + "/>")


def text(s, x, y, size=24, color=TEXT, bold=False):
    draw.text((round(x), round(y)), s, font=font(size, bold), fill=color, anchor="lt")
    svg.append(f'<text x="{x:.1f}" y="{y:.1f}" dominant-baseline="text-before-edge" fill="{color}" font-size="{size}" font-weight="{600 if bold else 400}">{escape(s)}</text>')


def lines(ls, x, y, size=24, color=TEXT, bold=False, lh=34):
    for i, s in enumerate(ls):
        text(s, x, y + i * lh, size, color, bold)
    return y + len(ls) * lh


def arrow(x1, y, x2, color=INK, width=3):
    draw.line((round(x1), round(y), round(x2), round(y)), fill=color, width=width)
    draw.polygon([(round(x2), round(y)), (round(x2 - 9), round(y - 6)), (round(x2 - 9), round(y + 6))], fill=color)
    svg.append(f'<path d="M{x1:.1f},{y:.1f} H{x2:.1f} M{x2 - 9:.1f},{y - 6:.1f} L{x2:.1f},{y:.1f} L{x2 - 9:.1f},{y + 6:.1f}" fill="none" stroke="{color}" stroke-width="{width}"/>')


def section(n, title, y, note=None):
    rect(MARGIN, y, 52, 44, INK, 12)
    text(n, MARGIN + 10, y + 8, 25, WHITE, True)
    text(title, MARGIN + 70, y + 4, 34, INK, True)
    if note:
        text(note, MARGIN, y + 57, 23, MUTED)


# Library identity and accurate inventory scope.
rect(0, 0, WIDTH, 254, INK)
rect(MARGIN, 40, 12, 22, GOLD, 3)
text("CULT UI / 能力 · 原理 · 场景 · 选用", MARGIN + 27, 37, 24, GREEN)
text("Cult UI 全能力地图", MARGIN, 84, 62, WHITE, True)
text("可按需复制、直接修改的 React 组件与视觉效果源码集合", MARGIN, 171, 29, WHITE)
text("137", WIDTH - MARGIN - 218, 65, 72, GOLD, True)
text("个有效 UI 组件", WIDTH - MARGIN - 218, 151, 26, GREEN)
text("134 文档项 + 3 补充项", WIDTH - MARGIN - 292, 199, 23, GREEN)

# Distribution and rendering are separate, connected concepts.
section("01", "底层怎么工作", 290)
flow = [
    ("shadcn Registry", "声明源码与依赖"),
    ("复制到 React 项目", "TSX / CSS 可自行修改"),
    ("参数 · 数据 · 状态", "事件驱动界面变化"),
    ("按组件选择技术", "浏览器绘制与执行动效"),
    ("组成自己的产品", "接入真实 API 与业务"),
]
fw = (WIDTH - MARGIN * 2 - 36 * 4) / 5
for i, (title, detail) in enumerate(flow):
    x = MARGIN + i * (fw + 36)
    rect(x, 356, fw, 100, WHITE, 14, LINE)
    text(title, x + 17, 374, 24, INK, True)
    text(detail, x + 17, 411, 21, MUTED)
    if i < 4:
        arrow(x + fw + 7, 406, x + fw + 29)

tech = [
    ("结构与行为", ["React / TypeScript", "Props、State、Context、事件", "Radix / Base UI 等提供", "控件、浮层、焦点与键盘行为"]),
    ("样式与几何", ["Tailwind CSS / CSS / SVG", "布局、主题、渐变、纹理", "阴影、滤镜、遮罩、路径", "二维变换与 CSS 三维透视"]),
    ("动效与交互", ["Motion、CSS 动画等", "弹簧、错峰、进入退出", "共享布局、指针、拖拽", "滚动观察与计时状态"]),
    ("像素与 GPU 渲染", ["Canvas 2D / WebGL / Shader", "帧绘制、像素采样、材质", "Paper Design、COBE", "Three.js 等专项渲染依赖"]),
]
tw = (WIDTH - MARGIN * 2 - GAP * 3) / 4
for i, (title, body) in enumerate(tech):
    x = MARGIN + i * (tw + GAP)
    rect(x, 481, tw, 212, WHITE, 16, LINE)
    rect(x, 481, tw, 6, "#7EAD96", 2)
    text(title, x + 20, 505, 28, INK, True)
    lines(body, x + 20, 551, 23, TEXT, lh=32)
text("实例：Dock = 指针距离 + 弹簧；3D 轮播 = CSS 透视 + 拖拽；镜头模糊 = Three.js + Shader。", MARGIN, 713, 23, MUTED)

# Every canonical UI component appears exactly once below.
section("02", "有哪些方向、效果与用途", 773, "完整列出 137 个组件名称；各类“原理”概括该方向的代表实现，并非每项都使用同一技术。")
y = CATALOG_Y
for row, rh in enumerate(row_heights):
    for col in range(3):
        c = cards[row * 3 + col]
        x = MARGIN + col * (CW + GAP)
        rect(x, y, CW, rh, WHITE, 17, LINE)
        text(c["category"], x + 22, y + 23, 28, INK, True)
        label = f'{len(c["items"]):02d} 项'
        text(label, x + CW - measure(label, 23) - 22, y + 27, 23, MUTED)
        yy = lines(c["names"], x + 22, y + 80, 23, TEXT, lh=34)
        yy += 22
        text("原理", x + 22, yy, 21, MUTED, True)
        yy = lines(c["mechanism"], x + 22, yy + 30, 22, TEXT, lh=32)
        yy += 16
        text("场景", x + 22, yy, 21, MUTED, True)
        lines(c["scene"], x + 22, yy + 30, 22, TEXT, lh=32)
    y += rh + GAP

# Value and a concrete future-use decision, personalized to the research project.
section("03", "对你的意义：研究成果如何变成开发资产", BOTTOM_Y)
pw = (WIDTH - MARGIN * 2 - GAP) / 2
py = BOTTOM_Y + 74
rect(MARGIN, py, pw, 294, WHITE, 17, LINE)
rect(MARGIN + pw + GAP, py, pw, 294, WHITE, 17, LINE)
text("现在得到什么", MARGIN + 24, py + 24, 29, INK, True)
text("以后什么情况下用", MARGIN + pw + GAP + 24, py + 24, 29, INK, True)
value = [
    ("选型地图", "从页面任务找到效果、原理与源码。"),
    ("开发素材", "复用外观与交互，再改成自己的主题和内容。"),
    ("学习样本", "理解状态如何变成动画、反馈与图形。"),
    ("研究资产", "本地演示可持续比较，积累自己的组件经验。"),
]
uses = [
    ("官网 / 作品集", "首屏、卡片、文字、插画、设备展示。"),
    ("AI / SaaS 产品", "输入、建议、回答、进度与通知。"),
    ("管理工作台", "表单、标签、浮层、看板与指标。"),
    ("原型 / 交互学习", "快速验证效果，读取并改造真实源码。"),
]
for i, (label, body) in enumerate(value):
    yy = py + 77 + i * 50
    text(label, MARGIN + 24, yy, 24, INK, True)
    text(body, MARGIN + 154, yy + 2, 23, TEXT)
for i, (label, body) in enumerate(uses):
    xx = MARGIN + pw + GAP + 24
    yy = py + 77 + i * 50
    text(label, xx, yy, 24, INK, True)
    text(body, xx + 182, yy + 2, 23, TEXT)

dy = py + 326
section("04", "后期选用路径", dy)
steps = ["已有 React 页面任务", "找到匹配的组件", "看示例 / 源码 / 依赖", "按需复制并接业务", "验收后维护本地源码"]
for i, s in enumerate(steps):
    x = MARGIN + i * (fw + 36)
    rect(x, dy + 72, fw, 82, GREEN, 12)
    text(f"{i + 1}", x + 15, dy + 85, 23, MUTED, True)
    text(s, x + 15, dy + 117, 21, INK, True)
    if i < 4:
        arrow(x + fw + 7, dy + 112, x + fw + 29)
text("适合：界面与效果恰好匹配，想提高产品细节；优先挑少量组件，调整配色、内容、行为与动效强度。", MARGIN, dy + 179, 24, TEXT)
text("接入时关注：素材与字体、移动端与触屏、键盘操作、减少动效偏好，以及 Canvas / WebGL 的运行成本。", MARGIN, dy + 220, 23, MUTED)

by = dy + 270
rect(MARGIN, by, WIDTH - MARGIN * 2, 122, INK, 16)
text("能力边界", MARGIN + 24, by + 19, 27, GOLD, True)
text("AI 组件交付输入与结果界面；模型调用、Agent 执行、数据保存、权限及多人同步需要应用接入。", MARGIN + 24, by + 58, 24, WHITE)
text("整体视觉与叙事需要设计和组合；沉浸式全屏 3D、粒子场景、游戏等还需要专门的图形开发能力。", MARGIN + 24, by + 93, 23, GREEN)

fy = by + 152
text("统计口径：固定版本 67a66c6；134 个官方文档项 + 3 个补充注册项 = 137；17 个旧别名不重复计数。", MARGIN, fy, 21, MUTED)
text("来源：nolly-studio/cult-ui 的组件导航、Registry 与真实源码 · MIT · 2026-10-03 核对", MARGIN, fy + 34, 21, MUTED)
text("阅读方式：先看定位与原理，再按方向找组件，最后按自己的页面任务决定是否使用。", MARGIN, fy + 70, 22, INK, True)

used_height = math.ceil(fy + 124)
assert used_height <= HEIGHT
img = img.crop((0, 0, WIDTH, used_height))
OUT.mkdir(parents=True, exist_ok=True)
png_path = OUT / "cult-ui-capability-map.png"
svg_path = OUT / "cult-ui-capability-map.svg"
img.save(png_path, optimize=True)
svg_path.write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{used_height}" viewBox="0 0 {WIDTH} {used_height}" role="img" aria-labelledby="map-title map-description" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif">\n'
    '<title id="map-title">Cult UI 全能力地图</title>\n'
    '<desc id="map-description">137 个有效 React UI 组件的完整分类、名称、底层实现、应用场景、个人价值和选用路径。统计基于固定版本 67a66c6。</desc>\n'
    f'<rect width="100%" height="100%" fill="{PAPER}"/>\n'
    + "\n".join(svg)
    + "\n</svg>\n",
    encoding="utf-8",
)
print(json.dumps({"png": str(png_path), "svg": str(svg_path), "width": WIDTH, "height": used_height, "components": len(components), "groups": len(categories), "rowHeights": row_heights}, ensure_ascii=True))
