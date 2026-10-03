"""Build the editable SVG/PNG overview and a portable static explanation page.

Only reads existing evidence; does not generate CAD or call a model/service.
"""
from html import escape
import json
from pathlib import Path
import shutil

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web/telescope-demo/overview"
DATA = json.loads((ROOT / "notes/understanding.json").read_text(encoding="utf-8-sig"))
REPORTS = {
    "plate": "validation.json", "enclosure": "enclosure-validation.json",
    "telescope": "telescope-validation.json", "before": "telescope-validation-before-repair.json",
}
EVIDENCE = {key: json.loads((ROOT / "notes" / name).read_text(encoding="utf-8-sig"))
            for key, name in REPORTS.items()}
for key in ("plate", "enclosure", "telescope"):
    assert EVIDENCE[key]["status"] == "pass" and EVIDENCE[key]["checks_failed"] == 0

REGULAR = Path("C:/Windows/Fonts/msyh.ttc")
BOLD = Path("C:/Windows/Fonts/msyhbd.ttc")
if not REGULAR.exists() or not BOLD.exists():
    raise SystemExit("This renderer requires Microsoft YaHei at the documented Windows font paths.")

INK, MUTED, TEAL, AMBER = "#18354a", "#506979", "#126d72", "#966023"
BG, BORDER, SOFT = "#f3f6f5", "#d0deda", "#e6efed"


class Diagram:
    def __init__(self):
        self.width, self.height = 1920, 3380
        self.image = Image.new("RGB", (self.width, self.height), BG)
        self.draw = ImageDraw.Draw(self.image)
        self.nodes = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.width}" height="{self.height}" viewBox="0 0 {self.width} {self.height}" role="img" aria-labelledby="title desc">',
                      '<title id="title">text-to-cad 能力、原理、效果、价值与边界总览</title>',
                      '<desc id="desc">用户提供真实需求；语言模型设计和写代码；插件调用 OpenCascade；保存并验收。涵盖核心能力、扩展工作流、三组实测、配件输入、个人价值与复杂产品瓶颈。</desc>',
                      '<style>text{font-family:"Microsoft YaHei",Arial,sans-serif}</style>']
        self.rect(0, 0, self.width, self.height, BG)

    def rect(self, x, y, w, h, fill="white", radius=18, stroke=None):
        self.draw.rounded_rectangle((x, y, x+w, y+h), radius=radius, fill=fill, outline=stroke, width=2)
        self.nodes.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}"' + (f' stroke="{stroke}" stroke-width="2"' if stroke else '') + '/>')

    def line(self, points, color=BORDER, width=3):
        self.draw.line(points, fill=color, width=width)
        self.nodes.append('<polyline points="' + ' '.join(f'{x},{y}' for x, y in points) + f'" fill="none" stroke="{color}" stroke-width="{width}"/>')

    def arrow(self, x, y, length=38):
        self.line([(x, y), (x+length, y)], TEAL, 4)
        self.line([(x+length-10, y-8), (x+length, y), (x+length-10, y+8)], TEAL, 4)

    def text(self, x, y, text, size=30, color=INK, bold=False, width=None, max_lines=None, spacing=None):
        font = ImageFont.truetype(str(BOLD if bold else REGULAR), size)
        lines = []
        for paragraph in text.split("\n"):
            line = ""
            for char in paragraph:
                if width and font.getlength(line+char) > width and line:
                    if char in '。，、；：！？）】》' and len(line) > 1:
                        lines.append(line[:-1].rstrip()); line = line[-1]+char
                    else:
                        lines.append(line.rstrip()); line = char.lstrip()
                else:
                    line += char
            lines.append(line.rstrip())
        if max_lines is not None:
            assert len(lines) <= max_lines, (text, len(lines), max_lines)
        spacing = spacing or round(size*1.42)
        assert y+spacing*len(lines) < self.height, (y, text)
        for i, line in enumerate(lines):
            self.draw.text((x, y+i*spacing), line, font=font, fill=color, anchor="lt")
            self.nodes.append(f'<text x="{x}" y="{y+i*spacing}" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}" dominant-baseline="text-before-edge">{escape(line)}</text>')
        return len(lines)*spacing

    def section(self, y, number, title, note=None):
        self.text(60, y, number, 34, TEAL, True)
        self.text(135, y-3, title, 42, INK, True)
        if note:
            self.text(135, y+55, note, 26, MUTED)

    def card(self, x, y, w, h, title, body, state=None):
        self.rect(x, y, w, h, stroke=BORDER)
        self.text(x+28, y+25, title, 34, INK, True)
        if state:
            self.text(x+28, y+76, state, 26, AMBER if state.startswith("提供技能") else TEAL)
        self.text(x+28, y+(121 if state else 85), body, 28, MUTED, width=w-56,
                  max_lines=(h-(121 if state else 85)-18)//40, spacing=40)


def build_diagram():
    d = Diagram()
    d.rect(0, 0, 1920, 220, INK, 0)
    d.text(60, 32, "TEXT → CAD  /  006 能力与原理研究", 27, "#aacfcf")
    d.text(60, 85, "从真实需求，到可验证的 CAD", 60, "white", True)
    d.text(60, 170, "语言模型设计与写代码，插件执行，内核计算，保存结果后再测量与修正。", 29, "#d9e6e8")
    d.text(60, 254, "实测：本项目实际运行与检查", 27, TEAL, True)
    d.text(760, 254, "提供：固定版本有工作流，尚未本机实测", 27, AMBER, True)

    d.section(325, "01", "谁负责什么，底层如何执行")
    roles = [
        ("你 · 用户", "提供目标、真实配件\n说明使用与制造条件\n审阅与提出修改"),
        ("我 · 语言模型", "定结构、参数与基准\n写建模与验收代码\n根据失败结果修正"),
        ("插件 · 技能 / cadgen", "技能给出工作约定\ncadgen 构建与导出\n查看器读取并驱动姿态"),
        ("内核 · OpenCascade", "执行曲面与实体运算\n查询尺寸、间隙与干涉\n返回几何和测量结果"),
    ]
    for i, (title, body) in enumerate(roles):
        d.card(60+i*455, 398, 435, 235, title, body)
    chain = ["Python 建模源码", "cadgen", "build123d", "OCP 绑定", "OpenCascade"]
    for i, label in enumerate(chain):
        x = 60+i*368
        d.rect(x, 679, 328, 83, SOFT, 10)
        d.text(x+20, 702, label, 29, TEAL, True)
        if i < 4:
            d.arrow(x+333, 721, 29)
    d.text(60, 786, "保存 CAD → 独立回读与视觉复核 → 对照规格判定 → 失败后修改源码、重新构建", 29, INK)

    d.section(867, "02", "能力分成四组，核心与扩展分开看")
    d.card(60, 938, 885, 270, "几何与参数", "孔、槽、空腔、圆角、凸台、曲面与尺寸变体\n构造顺序、基准和关系保留在建模源码\n可以继续细化，所有算子未逐一实测", "部分实测 · 安装板 / 外壳 / 望远镜")
    d.card(975, 938, 885, 270, "装配与动作", "独立零件、层级、定位、套接与分解展示\n已测方位、仰角与调焦；动画未实测\n树形正向运动学，闭环机构另需求解", "部分实测 · 11 实体 / 3 个自由度")
    d.card(60, 1236, 885, 270, "交付与验收", "STEP / GLB / STL 已输出；3MF 未实测\n尺寸、孔位、体积、间隙与干涉回读\nA3 PDF 工程图已测；DXF 工作流未实测", "部分实测 · CAD / 网格 / 图纸 / 报告")
    d.card(975, 1236, 885, 270, "扩展工作流", "真实配件读取与 step.parts 目录搜索\nDFM / DfAM / SendCutSend 上传前检查\nOrcaSlicer、Bambu、URDF / SRDF / SDF", "提供技能 · 这些扩展尚未本机实测")

    d.section(1558, "03", "达到什么效果，用实际证据说明")
    experiments = [
        ("安装板、变体与销装配", "plate", "孔距、圆角、解析体积\n100 mm 变体与 0.5 mm 间隙"),
        ("电子外壳与上盖", "enclosure", "空腔、螺丝柱、十个通风口\n上盖位置与 0.5 mm 缝隙"),
        ("望远镜概念装配", "telescope", "11 实体、20 mm 调焦、三种运动\n0.25 mm 间隙、12 mm 套接"),
    ]
    for i, (title, key, body) in enumerate(experiments):
        x = 60+i*610
        d.rect(x, 1632, 580, 238, stroke=BORDER)
        d.text(x+24, 1657, title, 31, INK, True)
        d.text(x+24, 1712, f'{EVIDENCE[key]["checks_passed"]} 项通过 / 0 项失败', 35, TEAL, True)
        d.text(x+24, 1780, body, 26, MUTED, width=532, max_lines=2, spacing=37)
    d.text(60, 1900, "望远镜 60° 姿态曾干涉：底板降低 30 mm，原规则重验；保留修正前 6 项失败。", 28, INK)
    d.text(60, 1953, "单件 / 变体 → 装配 / 动作 → 真实配件适配 → 完整功能产品", 31, TEAL, True)
    d.text(60, 2004, "后两层需要实际接口、专业分析与实物测试；本次镜片为占位，光学性能未验证。", 27, MUTED)

    d.section(2080, "04", "你提供哪些资料，设计才有匹配依据")
    inputs = [
        ("真实配件", "型号与版本\n供应商 STEP\n尺寸图、规格书"),
        ("接口与空间", "外形、孔位、轴径\n螺纹与安装面\n套接与避让区域"),
        ("使用与运动", "固定方式与装配方向\n行程、转角和维护空间\n载荷与工作环境"),
        ("制造与验收", "工艺、材料与配合\n生产公差与检查对象\n交付格式和完成标准"),
    ]
    for i, (title, body) in enumerate(inputs):
        d.card(60+i*455, 2154, 435, 230, title, body)
    d.text(60, 2411, "例如：给出真实物镜与镜筒接口 → 设计镜座、压圈、连接件和支架 → 检查匹配与干涉。", 28, INK)

    d.section(2495, "05", "对我们的价值，集中在配套设计与迭代")
    values = [
        ("定制与改造", "为已有配件设计外壳、支架和接口\n把想法转成可讨论的具体装配\n围绕真实规格逐步细化"),
        ("参数复用与修正", "积累模型工厂和零件模板\n改尺寸、重建并测量结果\n提前发现部分结构与运动问题"),
        ("学习与工程交接", "理解需求、代码、几何之间的关系\n保留源码、CAD、图纸和验收证据\n继续接入制造、打印或仿真"),
    ]
    for i, (title, body) in enumerate(values):
        d.card(60+i*610, 2569, 580, 240, title, body)

    d.section(2865, "06", "复杂度的瓶颈，出现在依据、约束与验证")
    limits = [
        ("依据与约束", "真实数据不足时要标明假设。零件增加，会增加接口、运动空间、紧固和误差关系。提供参数能减少猜测，实际配合仍需制造依据。"),
        ("几何与求解", "布尔、圆角、小特征和复杂曲面可能失败。当前运动接口不解通用闭环机构。参数保留在源码；STEP 不携带本项目完整特征历史。"),
        ("工程与验证", "有限姿态采样不证明连续全行程。光学、强度、热、电路与控制需要专业分析和实物测试。检查项数不代表工程成熟度。"),
    ]
    for i, (title, body) in enumerate(limits):
        d.card(60+i*610, 2939, 580, 305, title, body)
    d.text(60, 3280, "固定版本 0.7.10 · 2026-10-04 · 依据官方技能与本项目实测 · 能力说明与检查记录见配套网页", 25, MUTED)
    d.nodes.append('</svg>')
    (ROOT / "assets/text-to-cad-understanding.svg").write_text('\n'.join(d.nodes), encoding="utf-8")
    d.image.save(ROOT / "assets/text-to-cad-understanding.png")


def paragraphs(values, class_name="reading-grid"):
    return f'<div class="{class_name}">' + ''.join(
        f'<article><h3>{escape(v["name"])}</h3><p>{escape(v["detail"])}</p></article>' for v in values) + '</div>'


def build_page():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "assets").mkdir(exist_ok=True)
    (OUT / "evidence").mkdir(exist_ok=True)
    for name in ("text-to-cad-understanding.svg", "text-to-cad-understanding.png", "plate_assembly.png", "enclosure_base.png", "telescope_exploded.png", "telescope_pose_observing.png", "mounting_plate_drawing.png"):
        shutil.copy2(ROOT / "assets" / name, OUT / "assets" / name)
    for name in REPORTS.values():
        shutil.copy2(ROOT / "notes" / name, OUT / "evidence" / name)
    for name in ("telescope-browser-review.json", "telescope-visual-review.json", "telescope-build-log.json", "telescope-target.json"):
        shutil.copy2(ROOT / "notes" / name, OUT / "evidence" / name)
    shutil.copy2(ROOT / "notes/understanding.json", OUT / "evidence/understanding.json")

    roles = ''.join(f'<article><span class="index">0{i+1}</span><h3>{escape(v["name"])}</h3><p>{escape(v["job"])}</p><small>产出：{escape(v["output"])}</small></article>' for i, v in enumerate(DATA["roles"]))
    flow = ''.join(f'<li><b>{escape(v["name"])}</b><span>{escape(v["detail"])}</span></li>' for v in DATA["pipeline"])
    rows = ''.join(f'<tr><th scope="row">{escape(v["name"])}</th><td><p>{escape(v["scope"])}</p><small>依据与覆盖：{escape(v["proof"])}</small></td><td><span class="status {"provided" if "未实测" in v["status"] or "提供技能" in v["status"] else "tested"}">{escape(v["status"])}</span><p>{escape(v["needs"])}</p></td></tr>' for v in DATA["capabilities"])
    effects = ''.join(f'<article><span class="eyebrow">{escape(v["status"])}</span><h3>{escape(v["level"])}</h3><p>{escape(v["result"])}</p><small>{escape(v["basis"])}</small></article>' for v in DATA["effects"])
    inputs = ''.join(f'<tr><th scope="row">{escape(v["name"])}</th><td>{escape(v["example"])}</td><td>{escape(v["purpose"])}</td></tr>' for v in DATA["inputs"])
    corrections = ''.join(f'<tr><th scope="row">{escape(a)}</th><td>{escape(b)}</td></tr>' for a, b in DATA["corrections"])
    sources = ''.join(f'<li><a href="{escape(v["url"])}" target="_blank" rel="noopener">{escape(v["name"])} ↗</a><span>{escape(v["supports"])}</span></li>' for v in DATA["sources"])
    experiments = []
    for title, key, image, body in [
        ("安装板、尺寸变体与销装配", "plate", "plate_assembly.png", "80 / 100 mm 变体、圆角、孔位与 0.5 mm 销孔间隙。"),
        ("电子外壳与上盖", "enclosure", "enclosure_base.png", "空腔、螺丝柱、十个通风口与 0.5 mm 上盖缝隙。"),
        ("望远镜完整过程", "telescope", "telescope_exploded.png", "11 个实体、三个自由度、20 mm 调焦与指定姿态干涉检查。")]:
        experiments.append(f'<article><img src="assets/{image}" alt="{escape(title)}的实际保存模型快照" width="1200" height="900" loading="lazy"><div><h3>{title}</h3><p>{body}</p><strong>{EVIDENCE[key]["checks_passed"]} 项通过 / 0 项失败</strong><a href="evidence/{REPORTS[key]}" target="_blank">读取实际报告 ↗</a></div></article>')

    page = f'''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(DATA["title"])}</title><meta name="description" content="text-to-cad 能力、原理、效果、真实配件输入、个人价值与复杂产品瓶颈，附完整总览图和本项目实测证据。"><link rel="stylesheet" href="style.css"></head>
<body>
<header class="hero"><div class="wrap"><div class="brand">TEXT → CAD <span>006 / 理解与实测 · {DATA["date"]}</span></div><h1>把真实需求，变成可验证的 CAD</h1><p class="lead">{escape(DATA["lead"])}</p><div class="hero-links"><a href="#map">查看一张图总览 ↓</a><a href="#capabilities">查看能力与实测范围 ↓</a><a class="demo-entry" href="#run">打开本机完整演示 ↗</a></div><p class="scope">固定插件版本 {DATA["version"]} · 几何与结构工作流 · 产品功能按对应专业要求另行验证</p></div></header>
<nav class="page-nav" aria-label="内容导航"><div class="wrap"><a href="#map">一张图</a><a href="#principle">原理与分工</a><a href="#capabilities">能力</a><a href="#effects">效果</a><a href="#value">价值</a><a href="#inputs">你提供什么</a><a href="#limits">瓶颈</a><a href="#experiment">实测</a></div></nav>
<main class="wrap">
<section id="map"><div class="section-heading"><span class="eyebrow">01 / 一张图概括我们的理解</span><h2>能力、原理、效果与价值，放在同一条链路里</h2><p>图中“实测”来自本项目保存的文件与报告；“提供”来自固定版本的技能说明；适用方向需要结合实际资料再设计和验证。</p></div><figure class="overview-image"><a href="assets/text-to-cad-understanding.svg" target="_blank" aria-label="在新标签页打开可放大的完整总览图"><img src="assets/text-to-cad-understanding.svg" width="1920" height="3380" alt="text-to-cad 六部分总览：四方职责、执行链路、四组能力、三组实测、实际配件输入、个人价值与复杂产品瓶颈"></a><figcaption><span>点击图像可单独打开、放大阅读。</span><a href="assets/text-to-cad-understanding.png" download>下载 PNG</a><a href="assets/text-to-cad-understanding.svg" download>下载 SVG</a></figcaption></figure></section>
<section id="principle"><div class="section-heading"><span class="eyebrow">02 / 本质与实现原理</span><h2>语言模型负责设计，插件把设计落实到 CAD</h2><p>{escape(DATA["definition"])}</p></div><div class="roles">{roles}</div><ol class="pipeline">{flow}</ol><div class="reading-grid three"><article><h3>代码包含构造方法</h3><p>我定义尺寸、基准、实体特征、位置和装配关系；建模过程可包含拉伸、旋转、布尔、圆角与曲面等操作。参数控制只是这一过程的一部分。</p></article><article><h3>内核计算真实几何</h3><p>OpenCascade 用曲线、曲面和拓扑组成 B-rep 实体。查看器的表面显示来自几何的离散化；尺寸与干涉验收读取保存的 CAD，而非凭截图判定。</p></article><article><h3>参数、姿态、文件各有职责</h3><p>改尺寸需要改源码并重建；运动声明驱动显示姿态。STEP 是交换几何，本项目的完整参数与特征构造留在 Python 中；转移运动模型需保留旁文件。</p></article></div><p class="citation">接口依据：<a href="{DATA["sources"][1]["url"]}">固定版本 CAD 技能</a>、<a href="{DATA["sources"][2]["url"]}">运动声明</a>、<a href="{DATA["sources"][4]["url"]}">OpenCascade 官方说明</a>。</p></section>
<section id="capabilities"><div class="section-heading"><span class="eyebrow">03 / 能力与覆盖</span><h2>核心 CAD 工作流，以及向制造和机器人延伸的技能</h2><p>本机有 13 个技能快照，其中一个用于环境检查。下表按实际用途合并说明；安装技能不等于装齐每个可选依赖，也不等于完成了实测。</p></div><div class="table-scroll"><table class="capability-table"><thead><tr><th>能力</th><th>可以做什么 / 本项目证据</th><th>状态 / 所需依据</th></tr></thead><tbody>{rows}</tbody></table></div><div class="format-strip"><p><b>STEP</b><span>实体与装配交换</span></p><p><b>STL / 3MF</b><span>网格与打印工作流</span></p><p><b>GLB</b><span>三维展示与交换</span></p><p><b>PDF / DXF</b><span>工程图与二维轮廓</span></p><p><b>URDF / SRDF / SDF</b><span>机器人与仿真描述</span></p></div><p class="citation">工作流清单依据：<a href="{DATA["sources"][0]["url"]}">固定版本上游仓库与各技能</a>；状态依据本项目报告，详细边界见下文。</p></section>
<section id="effects"><div class="section-heading"><span class="eyebrow">04 / 可以达到的效果</span><h2>从单件，到装配，再到围绕真实配件的配套设计</h2><p>这次望远镜展示了几何与动作的完整流程。更高层级需要补齐接口和专业验证，演示的外观复杂度不能直接代表能力上限。</p></div><div class="reading-grid">{effects}</div><div class="callout"><h3>望远镜和相机的具体含义</h3><p>可以依据真实物镜、镜筒或相机模块设计镜座、压圈、外壳、支架、连接件、调焦或云台结构，并检查明确的几何关系。光学成像还需镜片处方、材料数据、像差分析；完整相机还涉及传感器、电路、固件、散热和整机测试。CAD 产物承载结构方案，产品性能按这些要求继续验证。</p></div></section>
<section id="value"><div class="section-heading"><span class="eyebrow">05 / 对我们的实际价值</span><h2>把已有配件、反复改型与工程学习接到同一个流程</h2><p>价值集中在有明确目标和接口的定制结构，以及可以保留、修改、复现和验收的项目资产。</p></div>{paragraphs(DATA["value"], "reading-grid three")}</section>
<section id="inputs"><div class="section-heading"><span class="eyebrow">06 / 你提供什么，如何下发目标</span><h2>真实配件资料，让设计有匹配依据</h2><p>尽量提供实际型号、STEP、尺寸图或规格书。图片和口头尺寸也能用于推进，但缺失的尺度、接口和工艺条件要明确记为假设。</p></div><div class="table-scroll"><table><thead><tr><th>资料</th><th>具体例子</th><th>它解决什么</th></tr></thead><tbody>{inputs}</tbody></table></div><div class="brief"><div><h3>可复用的目标模板</h3><p>先给配件和用途，再给接口、工况、制造与验收。数据不足时可以先做概念结构，再逐项替换为实测信息。</p><button id="copy-brief" type="button">复制目标模板</button><span id="copy-status" role="status"></span></div><pre id="brief-template">{escape(DATA["template"])}</pre></div></section>
<section id="limits"><div class="section-heading"><span class="eyebrow">07 / 复杂模型的瓶颈</span><h2>难点会从画形状，扩展到管理约束和证明结果</h2><p>没有足够依据给出“超过多少零件就不能做”的固定上限。能否继续细化，取决于结构是否可描述、资料是否充分、构造是否稳定、关系是否可管理和结果是否能验证。</p></div>{paragraphs(DATA["bottlenecks"], "reading-grid three")}<div class="table-scroll"><table><thead><tr><th>容易形成的理解</th><th>完整理解</th></tr></thead><tbody>{corrections}</tbody></table></div></section>
<section id="experiment"><div class="section-heading"><span class="eyebrow">08 / 实测证据与修正闭环</span><h2>已经完成的三个实验，分别对照自己的规格验收</h2><p>检查项数来自实际报告，用于标明本次执行范围；它们不是通用评测分数，也不代表完整产品的工程成熟度。</p></div><div class="experiments">{''.join(experiments)}</div><div class="repair"><div><h3>望远镜在 60° 时发生干涉</h3><p>第一次运动采样有 {EVIDENCE["before"]["checks_failed"]} 项失败，最大交叠体积 {max(p["maximum_overlap_mm3"] for p in EVIDENCE["before"]["sampled_poses"]):.2f} mm³。我将支架底板降低 30 mm，保留转轴位置、运动范围和验收规则，插件重建后重新回读：537 项通过、0 项失败。</p><p>已检查基准、调焦伸出与三个指定运动姿态；没有证明连续全行程、承载、真实紧固或光学性能。报告的数值容差属于计算判定阈值，不能当作加工精度。</p><div class="inline-links"><a href="evidence/telescope-validation-before-repair.json">修正前报告 ↗</a><a href="evidence/telescope-validation.json">修正后报告 ↗</a><a class="demo-entry" href="#run">查看八步完整演示 ↗</a></div></div><img src="assets/telescope_pose_observing.png" alt="由运动声明驱动的望远镜 observing 姿态：方位35度、仰角25度、调焦10毫米" width="1200" height="900" loading="lazy"></div><details class="drawing"><summary>A3 工程图与其他复核记录</summary><img src="assets/mounting_plate_drawing.png" alt="已实测并视觉复核的安装板 A3 工程图" loading="lazy"><div class="inline-links"><a href="evidence/telescope-build-log.json">实际构建记录 ↗</a><a href="evidence/telescope-browser-review.json">页面与姿态操作记录 ↗</a><a href="evidence/telescope-visual-review.json">模型快照复核 ↗</a><a href="evidence/telescope-target.json">原始目标与假设 ↗</a></div></details></section>
<section id="run"><div class="section-heading"><span class="eyebrow">09 / 本地使用与复现</span><h2>保留源码、模型与证据，继续下一轮设计</h2><p>本机已在用户级安装 text-to-cad 0.7.10；子项目保存独立 Python 环境和技能快照。技能恢复与安装记录见仓库 README。完整演示页回放本次实际过程，内嵌 CAD 查看器可实时交互；网页按钮不会调用语言模型或重新建模。</p></div><pre>cd projects/006-text-to-cad\nuv sync --frozen\n# 首次生成快照需要 Chromium\nuv run --frozen python -m playwright install chromium --only-shell\n# 重建望远镜、验收并生成快照\npwsh -NoProfile -File scripts/run-telescope-demo.ps1\n# 启动网页与 CAD 查看器，打开返回的 demo_url\nuv run --frozen python scripts/serve_telescope_demo.py</pre><p>总览图、图片与报告可在线阅读。实时 CAD 查看与重建需要本地运行时，打印、目录检索和仿真各有额外环境要求；本次未进行物理打印或采购。</p></section>
<section id="sources"><div class="section-heading"><span class="eyebrow">10 / 资料与版本</span><h2>能力描述按固定版本核对，实测结论回到实际报告</h2><p>text-to-cad / cadgen 0.7.10；本项目 build123d 0.11.1；OCP 7.9.3.1.1。官方文档可能随上游更新，项目复现以 uv.lock 和固定技能快照为准。</p></div><ul class="sources">{sources}</ul><p class="citation">{escape(DATA["evidence_scope"])}</p></section>
</main><footer><div class="wrap"><span>006 · text-to-cad 理解与实测</span><a href="evidence/understanding.json" download>下载完整整理数据</a><a href="https://github.com/yydshly/1002_codex_project/tree/main/projects/006-text-to-cad" target="_blank" rel="noopener">项目源码与笔记 ↗</a></div></footer><script src="app.js"></script></body></html>'''
    (OUT / "index.html").write_text(page, encoding="utf-8")


def build_notes():
    lines = [f'# {DATA["title"]}', '', f'整理日期：{DATA["date"]}，Asia/Shanghai；固定版本 {DATA["version"]}。', '',
             '[返回项目](../README.md) · [总览 SVG](../assets/text-to-cad-understanding.svg) · [总览 PNG](../assets/text-to-cad-understanding.png) · [结构化内容](understanding.json)', '', DATA["lead"], '', '## 本质与职责', '', DATA["definition"], '']
    for role in DATA["roles"]:
        lines += [f'- **{role["name"]}**：{role["job"]}；产出 {role["output"]}。']
    for heading, key in [('能力与实测范围','capabilities'), ('可以达到的效果','effects'), ('对我们的价值','value'), ('实际配件输入','inputs'), ('复杂模型瓶颈','bottlenecks')]:
        lines += ['', f'## {heading}', '']
        for item in DATA[key]:
            title = item.get('name', item.get('level'))
            lines += [f'### {title}', '']
            for field in ('scope','status','proof','needs','result','basis','detail','example','purpose'):
                if field in item:
                    labels={'status':'状态','proof':'实测与覆盖','needs':'所需依据','basis':'依据','example':'具体资料','purpose':'用途'}
                    lines += [(labels[field]+'：' if field in labels else '')+item[field], '']
    lines += ['## 可复用的需求模板', '', '```text', DATA['template'], '```', '', '## 实测证据', '',
              '- [安装板报告](validation.json)：409 项通过、0 项失败。', '- [外壳报告](enclosure-validation.json)：721 项通过、0 项失败。', '- [望远镜报告](telescope-validation.json)：537 项通过、0 项失败；[修正前](telescope-validation-before-repair.json)有 6 项失败。', '- [望远镜完整过程](telescope-demo.md)：原始目标、假设、职责、实际执行、修正、复现与边界。', '', '检查项数标明这次执行的范围，不代表完整产品的工程成熟度。有限姿态采样、数值阈值和占位镜片的边界已在页面与报告中说明。', '', '## 理解修正', '']
    for initial, complete in DATA['corrections']:
        lines += [f'- {initial}：{complete}']
    lines += ['', '## 官方资料', '']
    for source in DATA['sources']:
        lines += [f'- [{source["name"]}]({source["url"]})：{source["supports"]}。']
    lines += ['', DATA['evidence_scope'], '']
    (ROOT / 'notes/understanding.md').write_text('\n'.join(lines), encoding='utf-8')


if __name__ == '__main__':
    build_diagram()
    build_page()
    build_notes()
    print(json.dumps({'svg':'assets/text-to-cad-understanding.svg', 'png':'assets/text-to-cad-understanding.png',
                      'page':'web/telescope-demo/overview/index.html', 'size':[1920,3380]}, ensure_ascii=False))
