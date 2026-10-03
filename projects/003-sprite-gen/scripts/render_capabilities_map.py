"""Render a source-grounded Chinese sprite-gen infographic with Pillow.

This draws a new explanatory diagram. Source illustrations are read-only.
Run with the subproject's existing .venv/Scripts/python.exe.
"""
from __future__ import annotations

from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "assets" / "capabilities-principles-map.png"
W, H = 3840, 2880
BG = "#F7F5EF"
INK = "#172C45"
MUTED = "#56677A"
LINE = "#D8E1E4"
TEAL = "#087F85"
TEAL_LIGHT = "#E7F4F1"
PURPLE = "#7950B6"
PURPLE_LIGHT = "#F0EAF8"
BLUE = "#356EB2"
BLUE_LIGHT = "#EBF2FC"
AMBER = "#A26915"
AMBER_LIGHT = "#FFF7E8"
WHITE = "#FFFFFF"

image = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(image)
font_cache = {}
layout_checks = []


def font(size=30, bold=False):
    key = size, bold
    if key not in font_cache:
        path = Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc")
        font_cache[key] = ImageFont.truetype(str(path), size)
    return font_cache[key]


def wrap(text, max_width, size=30, bold=False):
    f = font(size, bold)
    result = []
    for para in text.split("\n"):
        line = ""
        for ch in para:
            if line and draw.textlength(line + ch, font=f) > max_width:
                result.append(line)
                line = ch
            else:
                line += ch
        result.append(line)
    return result


def text(text_value, x, y, width, size=30, color=INK, bold=False, gap=11, max_height=None):
    lines = wrap(text_value, width, size, bold)
    line_h = size + gap
    height = len(lines) * line_h
    if max_height is not None and height > max_height:
        raise ValueError(f"Text overflow: {text_value!r} requires {height}px, available {max_height}px")
    layout_checks.append((text_value, x, y, width, height))
    for idx, line in enumerate(lines):
        draw.text((x, y + idx * line_h), line, font=font(size, bold), fill=color)
    return height


def center(value, x, y, width, size=28, color=INK, bold=False):
    tw = draw.textlength(value, font=font(size, bold))
    draw.text((x + (width - tw) / 2, y), value, font=font(size, bold), fill=color)


def box(x, y, w, h, fill=WHITE, outline=LINE, radius=28, stroke=2):
    draw.rounded_rectangle((x, y, x + w, y + h), radius, fill=fill, outline=outline, width=stroke)


def pill(value, x, y, color=TEAL, fill=TEAL_LIGHT, size=27, width=None):
    # Round up and retain a few spare pixels: floor rounding can wrap a final
    # Latin letter below a single-line legend pill.
    width = width or math.ceil(draw.textlength(value, font=font(size, True))) + 44
    box(x, y, width, size + 24, fill, None, 20)
    text(value, x + 20, y + 8, width - 40, size, color, True, gap=0)
    return width


def arrow(x1, y1, x2, y2, color=TEAL, width=6, head=18):
    draw.line((x1, y1, x2, y2), fill=color, width=width)
    angle = math.atan2(y2 - y1, x2 - x1)
    pts = [(x2, y2)]
    for sign in (-1, 1):
        pts.append((x2 - head * math.cos(angle) + sign * head * 0.6 * math.sin(angle),
                    y2 - head * math.sin(angle) - sign * head * 0.6 * math.cos(angle)))
    draw.polygon(pts, fill=color)


def dashed_box(x, y, w, h, fill=AMBER_LIGHT, color="#CC9B51"):
    box(x, y, w, h, fill=fill, outline=None, radius=24)
    inset = 12
    for xx in range(x + inset, x + w - inset, 24):
        draw.line((xx, y, min(xx + 12, x + w - inset), y), fill=color, width=3)
        draw.line((xx, y + h, min(xx + 12, x + w - inset), y + h), fill=color, width=3)
    for yy in range(y + inset, y + h - inset, 24):
        draw.line((x, yy, x, min(yy + 12, y + h - inset)), fill=color, width=3)
        draw.line((x + w, yy, x + w, min(yy + 12, y + h - inset)), fill=color, width=3)


def crop_alpha(im):
    im = im.convert("RGBA")
    bounds = im.getchannel("A").getbbox()
    return im.crop(bounds) if bounds else im


def fox_frame(index=0):
    with Image.open(ROOT / "web/media/attack-fox-hood.gif") as im:
        im.seek(index)
        return crop_alpha(im.copy())


FOX = [fox_frame(n) for n in (0, 7, 14, 21)]
ROBOTS = [crop_alpha(Image.open(ROOT / f"web/demo/output/frames/frame-{n:02}.png")) for n in range(6)]


def sprite(im, x, y, w, h):
    copy = im.copy()
    copy.thumbnail((int(w), int(h)), Image.Resampling.NEAREST)
    image.paste(copy, (int(x + (w - copy.width) / 2), int(y + h - copy.height)), copy)


def body_deformation_example(im, amount=1.10):
    """Small body-only illustrative warp; preserve head and feet exactly.

    This is a diagram annotation rather than an execution of sprite-gen breathe.
    Bounds refer to the geometric robot's cropped torso, excluding its head.
    """
    out = im.copy().convert("RGBA")
    x0, x1 = int(im.width * .18), int(im.width * .71)
    y0, y1 = int(im.height * .45), int(im.height * .76)
    part = im.crop((x0, y0, x1, y1))
    extra = int(part.width * (amount - 1))
    stretched = part.resize((part.width + extra, part.height), Image.Resampling.NEAREST)
    out.paste(stretched, (x0 - extra // 2, y0), stretched)
    return out


def checker(x, y, w, h, cell=18):
    box(x, y, w, h, fill="#F0F3F4", outline=LINE, radius=12)
    for yy in range(y + 4, y + h - 4, cell):
        for xx in range(x + 4, x + w - 4, cell):
            if ((xx - x) // cell + (yy - y) // cell) % 2 == 0:
                draw.rectangle((xx, yy, min(xx + cell, x + w - 4), min(yy + cell, y + h - 4)), fill="#E2E9EB")


def strip(frames, x, y, w, h, color="#ECF4F3", count=4):
    gap = 10
    cell = (w - gap * (count - 1)) / count
    for n in range(count):
        xx = x + int(n * (cell + gap))
        box(xx, y, int(cell), h, color, LINE, 12)
        sprite(frames[n % len(frames)], xx + 5, y + 5, cell - 10, h - 12)


def film(x, y, w, h):
    box(x, y, w, h, fill="#293B51", outline=None, radius=14)
    for xx in range(x + 10, x + w - 8, 28):
        draw.rounded_rectangle((xx, y + 6, xx + 14, y + 18), 3, fill=BG)
        draw.rounded_rectangle((xx, y + h - 18, xx + 14, y + h - 6), 3, fill=BG)
    sprite(FOX[1], x + 18, y + 22, w - 36, h - 44)
    draw.polygon([(x + w - 48, y + h / 2 - 15), (x + w - 48, y + h / 2 + 15), (x + w - 22, y + h / 2)], fill=WHITE)


def forest(x, y, w, h, with_fox=False):
    box(x, y, w, h, fill="#DDEDE4", outline="#B8D2C3", radius=14)
    draw.rectangle((x + 2, y + h * .72, x + w - 2, y + h - 3), fill="#A5C7AA")
    for n, rel in enumerate((.12, .30, .57, .79, .93)):
        tx = x + w * rel
        bottom = y + h * .73
        th = h * (.52 if n % 2 else .65)
        draw.rectangle((tx - w * .014, bottom - th * .6, tx + w * .014, bottom), fill="#7A7857")
        draw.polygon(((tx, bottom - th), (tx - w * .105, bottom - th * .28), (tx + w * .105, bottom - th * .28)), fill="#6DAD8B")
        draw.polygon(((tx, bottom - th * .76), (tx - w * .13, bottom - th * .06), (tx + w * .13, bottom - th * .06)), fill="#398668")
    if with_fox:
        draw.ellipse((x + w * .41, y + h * .79, x + w * .79, y + h * .93), fill="#7F9F87")
        sprite(FOX[0], x + w * .37, y + h * .37, w * .45, h * .55)
        arrow(x + w * .22, y + h * .88, x + w * .43, y + h * .88, color=TEAL, width=4, head=12)


def section_title(number, value, x, y, size=44):
    box(x, y + 6, 50, 50, fill=INK, outline=None, radius=15)
    center(str(number), x, y + 10, 50, size=29, color=WHITE, bold=True)
    text(value, x + 72, y, 3500, size, INK, True, gap=0)


def route_card(x, number, title, subtitle, accent, soft):
    box(x, 340, 1180, 800, WHITE, LINE, 32)
    draw.rounded_rectangle((x, 340, x + 1180, 352), 6, fill=accent)
    text(f"{number} {title}", x + 38, 376, 1104, 42, INK, True, max_height=60)
    text(subtitle, x + 38, 446, 1104, 31, MUTED, max_height=50)


# Header and legend.
text("sprite-gen 能力与原理全景图", 96, 65, 3300, 82, INK, True, gap=0)
text("2D 动画素材生产与整理：模型生成画面，代码加工资源，再合成角色与场景", 100, 178, 3560, 39, INK, gap=0)
text("按动作来源理解为三类；上游组织为两条生成管线与独立处理工具", 100, 240, 2150, 30, MUTED, gap=0)
lx = 2420
for caption, col, soft in [("紫：外部 AI", PURPLE, PURPLE_LIGHT), ("青：库内算法", TEAL, TEAL_LIGHT), ("蓝：人工整理", BLUE, BLUE_LIGHT), ("橙虚线：扩展设想", AMBER, AMBER_LIGHT)]:
    lx += pill(caption, lx, 239, col, soft, 26) + 18

# Three input / motion-source routes.
x1, x2, x3 = 96, 1330, 2564
route_card(x1, "①", "视频模型生成动作", "输入：单张角色图＋动作描述＋画布规格", PURPLE, PURPLE_LIGHT)
route_card(x2, "②", "代码形变与已有素材组装", "输入：静态图／已有帧／图集／视频", TEAL, TEAL_LIGHT)
route_card(x3, "③", "图像模型直接画多姿势", "输入：角色参考图＋动作、姿势与帧数要求", PURPLE, PURPLE_LIGHT)

# Route 1 illustration: a static character and requested action, movie, frames.
checker(x1 + 38, 524, 173, 140)
sprite(FOX[0], x1 + 43, 528, 163, 131)
box(x1 + 225, 535, 285, 110, PURPLE_LIGHT, None, 18)
text("原地挥刀\n回到待机", x1 + 252, 550, 245, 31, PURPLE, True, gap=9)
arrow(x1 + 526, 594, x1 + 578, 594, PURPLE)
film(x1 + 594, 524, 199, 140)
arrow(x1 + 808, 594, x1 + 856, 594)
strip(FOX, x1 + 873, 524, 267, 140, count=3)
center("角色图＋动作文字", x1 + 38, 681, 472, 27, MUTED)
center("MP4 视频", x1 + 594, 681, 199, 27, MUTED)
center("连续帧", x1 + 873, 681, 267, 27, MUTED)
pill("外部视频模型：Grok Imagine", x1 + 38, 739, PURPLE, PURPLE_LIGHT, 31, 1104)
text("生成 MP4 视频；视频中的动作由模型产生", x1 + 58, 800, 1064, 31, INK, gap=0)
box(x1 + 38, 854, 1104, 113, TEAL_LIGHT, None, 18)
text("FFmpeg 拆帧 → 色键去背景 →\n截取循环或完整单次动作", x1 + 58, 866, 1064, 32, TEAL, True, gap=13)
text("输出：透明动作帧、GIF、WebP、帧条带", x1 + 38, 997, 1104, 32, INK, True, max_height=50)
pill("动作来源：外部视频模型", x1 + 38, 1070, PURPLE, PURPLE_LIGHT, 28)

# Route 2: static-image deformation and assembly of supplied poses.
checker(x2 + 38, 524, 160, 140)
sprite(ROBOTS[0], x2 + 43, 528, 150, 131)
arrow(x2 + 214, 594, x2 + 269, 594)
sprite(ROBOTS[0], x2 + 278, 529, 99, 130)
sprite(body_deformation_example(ROBOTS[0]), x2 + 386, 529, 99, 130)
text("↕", x2 + 480, 560, 40, 45, TEAL, True, gap=0)
strip(ROBOTS, x2 + 570, 524, 570, 140, count=6)
center("单个姿势", x2 + 38, 681, 160, 27, MUTED)
center("身体形变示意", x2 + 270, 681, 280, 27, MUTED)
center("已经画好的动作帧", x2 + 570, 681, 570, 27, MUTED)
box(x2 + 38, 739, 1104, 96, TEAL_LIGHT, None, 18)
text("单个姿势＋呼吸参数 → 挤压与拉伸\n→ 待机呼吸", x2 + 58, 748, 1064, 31, TEAL, True, gap=10)
box(x2 + 38, 851, 1104, 96, TEAL_LIGHT, None, 18)
text("已有动作帧＋顺序与帧率 → 编排播放\n→ 多帧动画", x2 + 58, 860, 1064, 31, TEAL, True, gap=10)
text("已有视频也可拆帧；透明输出需可识别色键背景", x2 + 38, 971, 1104, 28, MUTED, gap=0)
text("复杂走路、攻击姿势需已有素材或另行生成", x2 + 38, 1018, 1104, 30, INK, True, gap=0)
pill("动作来源：已有姿势或有限形变规则", x2 + 38, 1070, TEAL, TEAL_LIGHT, 28)

# Route 3: reference, image provider, a multi-pose sheet.
checker(x3 + 38, 524, 192, 140)
sprite(FOX[0], x3 + 44, 529, 180, 129)
arrow(x3 + 248, 594, x3 + 313, 594, PURPLE)
box(x3 + 330, 535, 288, 111, PURPLE_LIGHT, None, 18)
center("图像模型", x3 + 330, 550, 288, 32, PURPLE, True)
center("按姿势要求画图", x3 + 330, 599, 288, 26, PURPLE)
arrow(x3 + 636, 594, x3 + 702, 594, PURPLE)
for n in range(6):
    xx, yy = x3 + 724 + (n % 3) * 139, 513 + (n // 3) * 82
    box(xx, yy, 128, 73, "#F5EEF9", LINE, 9)
    sprite(FOX[n % 4], xx + 4, yy + 3, 120, 67)
center("角色参考图", x3 + 38, 681, 192, 27, MUTED)
center("动作、姿势与帧数", x3 + 330, 681, 288, 27, MUTED)
center("多姿势图片（示意）", x3 + 724, 681, 406, 27, MUTED)
pill("外部图像模型：Codex / Grok / OpenAI", x3 + 38, 739, PURPLE, PURPLE_LIGHT, 29, 1104)
text("直接生成多姿势图片", x3 + 58, 800, 1064, 31, INK, gap=0)
box(x3 + 38, 854, 1104, 113, TEAL_LIGHT, None, 18)
text("透明处理 → 姿势提取 →\n对齐与选帧", x3 + 58, 866, 1064, 32, TEAL, True, gap=13)
text("输出：动作帧、GIF、PNG 图集＋JSON", x3 + 38, 997, 1104, 32, INK, True, max_height=50)
pill("动作来源：模型画出的多张姿势；不经过视频", x3 + 38, 1070, PURPLE, PURPLE_LIGHT, 27)

# A shared bracket rather than a mandatory linear pipeline.
for xx in (x1 + 590, x2 + 590, x3 + 590):
    draw.line((xx, 1140, xx, 1167), fill="#8AADB0", width=4)
draw.line((x1 + 590, 1167, x3 + 590, 1167), fill="#8AADB0", width=4)
arrow(W // 2, 1167, W // 2, 1190, "#8AADB0", 4, 12)
section_title(4, "共同加工层：按需组合的加工工具", 96, 1200)
text("各路线按素材选择步骤，并非每次全部执行；把候选素材整理成可用资源", 168, 1260, 3430, 30, MUTED, gap=0)

shared = [
    ("透明处理", "原生 Alpha 或色键；\n清理混色边缘与溢色", TEAL, TEAL_LIGHT, "alpha"),
    ("切帧与对齐", "网格切图／连通区域；\n统一画布和锚点", TEAL, TEAL_LIGHT, "grid"),
    ("像素修复", "测量网格、边界吸附；\n共享调色板、身体对齐", TEAL, TEAL_LIGHT, "pixel"),
    ("时序与循环", "帧差找周期、检查接缝；\n可选 RIFE 插帧修复", TEAL, TEAL_LIGHT, "loop"),
    ("人工整理", "选帧、调序、像素编辑；\n移动缩放，保存规则", BLUE, BLUE_LIGHT, "edit"),
    ("后期与变体", "批量换色；预拆部件\n按对齐规则进行图层合成", TEAL, TEAL_LIGHT, "layers"),
    ("批量规格", "动作×方向；尺寸、帧数、\nfps、loop、参考锚点", TEAL, TEAL_LIGHT, "batch"),
    ("质量检查", "空帧、边缘、抖动、运动\n与接触；保留报告", TEAL, TEAL_LIGHT, "qa"),
]
cw, ch, cg = 890, 155, 28
for idx, (title, body, col, soft, icon) in enumerate(shared):
    xx, yy = 96 + (idx % 4) * (cw + cg), 1310 + (idx // 4) * 175
    box(xx, yy, cw, ch, WHITE, LINE, 22)
    box(xx + 22, yy + 24, 78, 78, soft, None, 19)
    # Compact code-native icons; they signal processing families without adding clutter.
    if icon in ("grid", "pixel", "batch"):
        for a in range(3):
            for b in range(3):
                draw.rounded_rectangle((xx + 36 + 17 * a, yy + 38 + 17 * b, xx + 47 + 17 * a, yy + 49 + 17 * b), 2, fill=col)
    elif icon == "layers":
        for a in range(3):
            draw.polygon(((xx + 35, yy + 60 + a * 9), (xx + 60, yy + 47 + a * 9), (xx + 85, yy + 60 + a * 9), (xx + 60, yy + 74 + a * 9)), fill=soft, outline=col, width=3)
    elif icon == "loop":
        draw.arc((xx + 35, yy + 38, xx + 86, yy + 89), 20, 320, fill=col, width=5)
        arrow(xx + 73, yy + 40, xx + 85, yy + 49, col, 4, 10)
    elif icon == "qa":
        draw.line((xx + 38, yy + 64, xx + 55, yy + 80, xx + 85, yy + 46), fill=col, width=7)
    elif icon == "edit":
        draw.line((xx + 39, yy + 82, xx + 82, yy + 39), fill=col, width=10)
        draw.polygon(((xx + 32, yy + 89), (xx + 36, yy + 74), (xx + 47, yy + 85)), fill=col)
    else:
        draw.ellipse((xx + 38, yy + 39, xx + 82, yy + 83), outline=col, width=5)
        draw.line((xx + 60, yy + 40, xx + 60, yy + 82), fill=col, width=4)
    text(title, xx + 123, yy + 15, 730, 35, col, True, gap=0)
    text(body, xx + 123, yy + 66, 735, 29, INK, gap=8, max_height=85)

# Downstream scene composition: existing motion + a background + placement rules.
scene_x, scene_y, scene_w, scene_h = 96, 1700, 2314, 455
out_x, out_w = 2440, 1304
box(scene_x, scene_y, scene_w, scene_h, WHITE, LINE, 28)
box(out_x, scene_y, out_w, scene_h, WHITE, LINE, 28)
text("背景与场景合成：三条路线的动画都能接入", scene_x + 34, scene_y + 26, scene_w - 68, 42, INK, True, gap=0)
text("输入：角色动画＋背景图＋scene.json", scene_x + 34, scene_y + 92, scene_w - 68, 32, INK, gap=0)
text("设置：位置、速度、层级、镜头、视差、光照（投影阴影）", scene_x + 34, scene_y + 139, scene_w - 68, 30, MUTED, gap=0)

sy = scene_y + 207
strip(FOX, scene_x + 34, sy, 320, 110, count=3)
center("狐狸动作帧（示意）", scene_x + 34, sy + 121, 320, 26, MUTED)
text("＋", scene_x + 371, sy + 30, 55, 45, TEAL, True, gap=0)
forest(scene_x + 440, sy, 235, 110)
center("森林背景", scene_x + 440, sy + 121, 235, 26, MUTED)
text("＋", scene_x + 698, sy + 30, 55, 45, TEAL, True, gap=0)
box(scene_x + 764, sy, 326, 110, TEAL_LIGHT, None, 14)
text("位置 x、y\n速度 → 向右", scene_x + 797, sy + 10, 268, 31, TEAL, True, gap=9)
center("scene.json", scene_x + 764, sy + 121, 326, 26, MUTED)
arrow(scene_x + 1120, sy + 55, scene_x + 1213, sy + 55, TEAL, 6, 20)
forest(scene_x + 1241, sy - 6, 454, 127, with_fox=True)
center("角色进入背景并移动", scene_x + 1241, sy + 131, 454, 26, MUTED)
text("每一帧：选角色帧\n＋更新位置\n＋叠加背景与阴影", scene_x + 1744, sy - 7, 500, 30, TEAL, True, gap=10)
text("输出：场景 PNG 帧、带背景 GIF / MP4；透明层可导出 PNG", scene_x + 34, scene_y + 367, scene_w - 68, 31, INK, True, gap=0)
text("背景合成负责摆放与移动；肢体动作由输入素材提供。另有背景 tile 拼接工具。", scene_x + 34, scene_y + 413, scene_w - 68, 27, MUTED, gap=0)

text("最终可以交付什么", out_x + 34, scene_y + 26, out_w - 68, 42, INK, True, gap=0)
outputs = [
    ("动图", "透明 GIF / WebP"),
    ("素材", "PNG 帧序列、PNG 图集＋JSON"),
    ("JSON", "帧矩形、动作名、时长、fps、loop"),
    ("引擎导出", "Aseprite 兼容 JSON＋PNG，面向 Phaser / Flame"),
    ("应用", "2D 游戏、桌面宠物、贴纸、短场景演示"),
]
oy = scene_y + 103
for label, value in outputs:
    lab_w = 159
    text(label, out_x + 34, oy, lab_w, 30, TEAL, True, gap=0)
    hh = text(value, out_x + 208, oy, out_w - 246, 30, INK, gap=8)
    oy += max(46, hh) + 8

# Technology band.
box(96, 2200, 3648, 140, INK, None, 25)
text("底层技术", 130, 2220, 270, 40, WHITE, True, gap=0)
text("Python CLI 与工作流｜Pillow 图像与 Alpha｜NumPy 像素与帧差｜FFmpeg 拆帧与编码｜浏览器整理器｜可选 RIFE", 414, 2222, 3270, 31, "#E9F1F4", gap=0)
text("生成模型由外部服务提供；库负责调用、组织与后处理。模型接口另支持视频延长／编辑、生成中间帧。", 414, 2284, 3270, 28, "#BBD1DD", gap=0)

# Explicitly future work, with dashed frames.
section_title(5, "可扩展方向 · 以下需要新增开发与验证", 96, 2390)
extensions = [
    ("更多生成后端", "新增云端或本地图像、\n视频模型适配器"),
    ("更强动作约束", "姿态与轨迹条件；\n跨方向一致性检查"),
    ("更丰富程序动画", "骨骼、IK、弹性形变、\n动作混合"),
    ("生产管理界面", "任务队列、恢复、成本统计、\n素材版本"),
    ("引擎与交互", "Unity / Godot 接入；\n状态机、实时控制与物理"),
]
ew, eg = 708, 27
for n, (title, body) in enumerate(extensions):
    xx = 96 + n * (ew + eg)
    dashed_box(xx, 2460, ew, 200)
    text(f"0{n + 1}", xx + 27, 2485, 64, 32, AMBER, True, gap=0)
    text(title, xx + 114, 2480, ew - 141, 35, INK, True, gap=0)
    text(body, xx + 32, 2550, ew - 64, 30, MUTED, gap=12, max_height=96)

# Source and boundaries at readable, export-safe size.
draw.line((96, 2704, 3744, 2704), fill=LINE, width=2)
text("GIF 是播放格式；动作由模型、已有帧或形变规则产生。绿幕是透明策略之一。复杂动作与角色一致性需人工验收。", 96, 2721, 3648, 28, INK, gap=0)
text("本机实测：六姿势机器人图，9 个不同 CLI 处理命令；未调用 AI，未实测场景或游戏引擎。Aseprite 导出为 JSON＋PNG。", 96, 2766, 3648, 27, MUTED, gap=0)
text("依据：github.com/aldegad/sprite-gen · v2.20.0 · commit d993e53 · 2026-10-03", 96, 2811, 3648, 27, MUTED, gap=0)

for value, xx, yy, width, height in layout_checks:
    if xx < 0 or yy < 0 or xx + width > W or yy + height > H:
        raise ValueError(f"Canvas overflow for {value!r}: {(xx, yy, width, height)}")

DEST.parent.mkdir(parents=True, exist_ok=True)
image.save(DEST, optimize=True, dpi=(160, 160))
print(f"Saved {DEST} ({W} × {H}); checked {len(layout_checks)} text blocks.")
