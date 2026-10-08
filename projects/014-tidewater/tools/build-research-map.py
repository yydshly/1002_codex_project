"""Build one editable vector research map and an identical PNG from verified content."""
from pathlib import Path
from html import escape
import base64, io, json, math, re
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets'
W, M, GAP = 2520, 72, 24
UW = W - 2*M
FONT = Path('C:/Windows/Fonts/msyh.ttc')
BOLD = Path('C:/Windows/Fonts/msyhbd.ttc')
C = dict(bg='#f5f3ec', ink='#17363a', muted='#536970', line='#c9d3d0', paper='#ffffff',
         green='#166b5c', greenfill='#e4f2eb', blue='#365d86', bluefill='#e9eff7',
         gold='#906319', goldfill='#fbefda', dark='#143e42', pale='#eef2ee')
ops, texts, bounds, sections, visuals = [], [], [], [], []
font_cache = {}
UPSTREAM = ROOT / '.runtime/source/tidewater-4811ba48d795197de5621985f404e765c0b7c0ef'
SCENE = ROOT / 'assets/scene-completion-workbench-v1.png'
SCENE_CROP = (349, 228, 1199, 694)
LAYOUT = ROOT / 'assets/control-model/jobs/96f55ca7-f641-404f-9c1e-15828eb92cc5/view-1.png'
COARSE = ROOT / 'assets/control-model/jobs/96f55ca7-f641-404f-9c1e-15828eb92cc5/view-2.png'

def font(size=26, bold=False):
    key=(size,bold)
    if key not in font_cache: font_cache[key]=ImageFont.truetype(str(BOLD if bold else FONT), size)
    return font_cache[key]

def width(value, size=26, bold=False):
    return font(size,bold).getlength(value)

def wrap(value, max_width, size=26, bold=False):
    result=[]
    for source in value.split('\n'):
        tokens=re.findall(r'[A-Za-z0-9_./-]+|.',source)
        line=[]
        for token in tokens:
            if line and width(''.join(line)+token,size,bold)>max_width:
                if token in '，。；：、？！…）】”’％!?.,;:)>]』':
                    tail=line.pop()
                    if line:result.append(''.join(line))
                    line=[tail]
                else:
                    result.append(''.join(line));line=[]
            line.append(token)
        result.append(''.join(line))
    return result

def rect(x,y,w,h,fill=C['paper'],stroke=C['line'],radius=16,dash=None,sw=1.4):
    ops.append(('rect',x,y,w,h,fill,stroke,radius,dash,sw))

def line(points,color=C['line'],sw=2,dash=None,arrow=False):
    ops.append(('line',points,color,sw,dash,arrow))

def picture(path,x,y,w,h,label,crop=None,mode='cover',matte='#bedfe5'):
    path=Path(path)
    with Image.open(path) as source:
        original=source.convert('RGB')
        if crop:
            if not (0<=crop[0]<crop[2]<=original.width and 0<=crop[1]<crop[3]<=original.height):
                raise ValueError(f'Image crop outside source: {path}')
            original=original.crop(crop)
        rendered=ImageOps.fit(original,(round(w),round(h)),method=Image.Resampling.LANCZOS) if mode=='cover' else ImageOps.contain(original,(round(w),round(h)),method=Image.Resampling.LANCZOS)
        if mode=='contain':
            plate=Image.new('RGB',(round(w),round(h)),matte)
            plate.paste(rendered,((plate.width-rendered.width)//2,(plate.height-rendered.height)//2))
            rendered=plate
        buf=io.BytesIO();rendered.save(buf,format='PNG')
        data=buf.getvalue()
    ops.append(('image',x,y,w,h,data,rendered,label))
    entry={'source':path.relative_to(ROOT).as_posix(),'label':label,'crop':list(crop) if crop else None,'placement':[x,y,w,h],'fit':mode}
    if entry not in visuals:visuals.append(entry)

def wash(x,y,w,h,color,opacity):
    ops.append(('wash',x,y,w,h,color,opacity))

def text(x,y,value,size=26,bold=False,color=C['ink'],max_width=None,lh=None,link=None):
    lines=wrap(value,max_width,size,bold) if max_width else value.split('\n')
    lh=lh or round(size*1.47)
    for i,part in enumerate(lines):
        ops.append(('text',x,y+i*lh,part,size,bold,color,link))
        texts.append(part)
        bounds.append((x,y+i*lh,width(part,size,bold),lh,part))
    return len(lines)*lh

def pill(x,y,label,status='green',size=21):
    pw=width(label,size,True)+28
    rect(x,y,pw,36,C[status+'fill'],None,18)
    text(x+14,y+3,label,size,True,C[status])
    return pw

def section(y,num,title,caption=''):
    sections.append({'number':num,'title':title,'y':y})
    text(M,y,num,29,True,C['green'])
    text(M+64,y-4,title,36,True)
    if caption: text(W-M-width(caption,23),y+4,caption,23,False,C['muted'])
    line([(M,y+53),(W-M,y+53)],C['line'],1.5)
    return y+76

def card(x,y,w,h,title,status=None,kind='green',fill=C['paper'],title_size=31):
    rect(x,y,w,h,fill,C['line'],16)
    title_y=y+23
    if status: pill(x+24,title_y,status,kind); title_y+=54
    used=text(x+24,title_y,title,title_size,True,max_width=w-48)
    return title_y+used+12

def block(x,y,w,title,body,kind='ink',size=26):
    y+=text(x,y,title,size,True,C[kind],w,round(size*1.45))
    if body: y+=text(x,y+4,body,size,False,C['muted'],w,round(size*1.45))+13
    return y

def fit(y,bottom,label):
    if y>bottom: raise ValueError(f'Content overflow in {label}: {y} > {bottom}')

# Actual upstream and prototype frames form the background; text has its own dark plate.
HEADER_H=760
rect(0,0,W,HEADER_H,C['dark'],None,0)
picture(UPSTREAM/'docs/screenshot-beach.jpg',0,0,1248,HEADER_H,'源库作者实景截图：午后海滩')
picture(SCENE,1272,0,1248,HEADER_H,'本地第08步实际候选：三个岛屿与红白灯塔',SCENE_CROP)
wash(0,0,W,286,C['dark'],.88)
wash(0,686,W,74,C['dark'],.90)
text(M,38,'TIDEWATER  /  研究与产品思路总览',25,True,'#b4d9cc')
text(M,85,'从你的图与粗模，到可控的 3D 世界',70,True,'#ffffff')
text(M,183,'用户确定空间意图；模型组织生成与修正；产品让同一份作品可检查、可修改、可恢复、可交付。',31,False,'#e6efea')
text(M,236,'研究基线：2026-10-04  ·  实验汇总：2026-10-05  ·  方向验证成立，任意场景的最终品质仍需验证',23,False,'#bfd4ce')
text(M,701,'源库呈现 · Tidewater 午后海滩 / 作者实景截图',28,True,'#ffffff')
text(1300,701,'我们的演示 · 三岛、湖泊与红白灯塔 / 08 候选',28,True,'#ffffff')

y=HEADER_H+28
pill(M,y,'源码研究事实','blue');pill(M+214,y,'本地已验证','green');pill(M+398,y,'部分实现 / 质量待验','gold')
text(M+719,y+3,'产品设想与待打通能力逐处标注；图中“控制”围绕创作意图，不代表冻结一切生成自由度。',23,False,C['muted'])

# The exact same input and candidate, not an unrelated illustrative scene.
y=section(HEADER_H+96,'00','先回忆我们的场景：同一布局，从绘笔到可观察的 3D','真实文件与网页渲染；不代表最终写实品质')
vw=(UW-2*GAP)/3;vh=590
visual_steps=[
 ('我的绘笔布局',LAYOUT,None,'200 × 150 米；25 个区域 / 对象。\n三个岛屿、湖泊、道路、灯塔与船的位置依据。'),
 ('对应的 3D 粗模',COARSE,None,'同一份空间，先确认轮廓、位置与高度。\n体块用于空间控制，还不是精细内容。'),
 ('模型控制后的候选',SCENE,SCENE_CROP,'保留原布局；组合材质、植被和既有资产。\n红白灯塔来自局部修改；效果仍需验收。')]
for i,(title,path,crop,caption) in enumerate(visual_steps):
    x=M+i*(vw+GAP)
    cy=card(x,y,vw,vh,title,title_size=29)
    picture(path,x+18,cy,vw-36,390,title,crop,mode='contain')
    end=cy+410+text(x+24,cy+410,caption,23,False,C['muted'],vw-48,34)
    fit(end,y+vh-12,title)
    if i<2:line([(x+vw+2,cy+195),(x+vw+GAP-3,cy+195)],C['green'],2.4,arrow=True)
text(M,y+vh+16,'三幅画面共享原对象与空间依据；参考图、粗模与候选各自承担不同职责。上方源库画面展示渲染能力，下方展示我们的控制实验。',23,False,C['muted'])
y+=vh+82

# 1. The conversation is a research path, not an eight-step customer onboarding.
y=section(y,'01','我们如何走到这个产品思路','探索顺序 ≠ 用户必须操作的步骤')
journey=[
 ('追问效果来源','Opus 没有生图能力？\n编码模型编写场景代码\n几何、资源与 GPU\n一起生成实时画面'),
 ('从渲染追问产品','WebGPU 是执行层\n产品还需要作品结构\n可选择、修改与保存\n并能撤销、恢复'),
 ('走向不同的世界','现成海岛是研究起点\n一句话可以表达目标\n具体空间需要依据'),
 ('找到可视化入口','绘笔：布局与关系\n参考图：外观与风格\n可以独立使用\n也可以组合使用'),
 ('把图变成空间','布局 → plan → 粗模\n确认位置、高度与尺度\n图与粗模\n表达同一份空间意图'),
 ('尝试精细内容','PBR / HDRI / 扫描\n物体图 → 精细 GLB\n完成载入与装配\n仍需检查效果质量'),
 ('对齐整场景目标','用户提交完整场景\n模型组织内部步骤\n用户无需\n逐个手动装配物体'),
 ('验证一致性闭环','整场景输入 → 候选\n指定一处 → 局部改\n确认后延续同一作品\n路线可行，品质待验')]
jw=(UW-7*16)/8
for i,(title,body) in enumerate(journey):
    x=M+i*(jw+16)
    cy=card(x,y,jw,300,f'{i+1:02d}  {title}',title_size=26)
    cy+=text(x+20,cy,body,22,False,C['muted'],jw-40,34)
    fit(cy,y+287,title)
    if i<7: line([(x+jw+2,y+150),(x+jw+14,y+150)],C['green'],2.2,arrow=True)
y+=330

# 2. Native engine and three model roles are deliberately separate.
y=section(y,'02','库的能力、呈现与原理','Tidewater 是应用与引擎底座，不是通用生成模型')
cols=[530,820,UW-530-820-2*GAP]
x=M; h=500
cy=card(x,y,cols[0],h,'Tidewater 提供什么','源码事实','blue')
cy=block(x+24,cy,cols[0]-48,'海水与岸线','FFT 波面、岸浪、泡沫、喷溅、尾流、焦散与水下水线。',size=25)
cy=block(x+24,cy,cols[0]-48,'天空、世界与游戏','大气与云、地形与村落、植被与生物；玩家、船、钓鱼、经济和后处理。',size=25)
cy+=text(x+24,cy,'固定基线为浏览器海岛钓鱼应用，\n尚非现成通用编辑器 SDK。',23,False,C['blue'],cols[0]-48,34)
fit(cy,y+h-15,'upstream')
x+=cols[0]+GAP
cy=card(x,y,cols[1],h,'画面如何产生','源码事实 + 当前实现','blue')
cy=block(x+24,cy,cols[1]-48,'代码与资源 → 场景 → GPU → 实时画面','海浪：频谱演化与逆 FFT → 位移、法线、泡沫。\n天空：大气散射 LUT、体积云步进与时间复用。\n几何 / 网格 + 纹理 + 光照 + 帧循环 → 动态 3D。',size=25)
cy=block(x+24,cy,cols[1]-48,'两条渲染实现应分清','上游原生工作台与粗模：自研 WebGPU / WGSL。\n本地 05–08 写实实验：Three.js WebGL2。',size=25)
cy+=text(x+24,cy,'波浪与浮力等为实时图形 / 游戏近似，不代表工程仿真。',23,False,C['blue'],cols[1]-48,34)
fit(cy,y+h-15,'render mechanism')
x+=cols[1]+GAP
cy=card(x,y,cols[2],h,'三种模型角色','职责必须分开','blue')
cy=block(x+24,cy,cols[2]-48,'编码模型｜开发期','编写 JS / WGSL、场景与工具。上游 “built with Opus” 是作者开发描述，不能推断游戏运行时调用它。',size=24)
cy=block(x+24,cy,cols[2]-48,'控制模型｜运行时','理解输入、制定方案、组织修改。本轮实际为 Codex CLI / ChatGPT，未报告具体模型 ID。',size=24)
cy=block(x+24,cy,cols[2]-48,'内容模型｜专用生成','图像模型提供外观参考；TRELLIS.2 / TripoSR 已产出物体网格。生成结果需要验收。',size=24)
fit(cy,y+h-15,'three model roles')
y+=h+30

# 3. The main product architecture; future capabilities have explicit labels.
y=section(y,'03','产品主轴：同一份空间意图，持续生成同一个作品','图像可选；“草图 → 生图 → 3D”是支路，不是必经流程')
pw=(UW-4*GAP)/5; ph=860
main_y=y
panels=[]
for i in range(5): panels.append(M+i*(pw+GAP))
cy=card(panels[0],y,pw,ph,'入口：我如何表达目标','已有入口 + 扩展','green')
cy=block(panels[0]+24,cy,pw-48,'主要空间入口','我的图 / 语义绘笔：\n区域、道路与关键对象。\n对应粗模 / 已有粗模：\n体块、尺度、高度与遮挡。',size=25)
cy=block(panels[0]+24,cy,pw-48,'补充依据｜按需组合','参考图 / 多视角：外观\n文字：目标与修改要求\n已有资产：必须保留的内容\n规则：数量、关系与预算\n地图 / 高程：真实空间\n剧情 / 时间线：行为、镜头',size=25)
cy+=text(panels[0]+24,cy,'当前图片入口为人工标注。\n通用粗模文件导入待扩展。\n透视图片需先解释空间；\n照片像素不是地面坐标。',23,False,C['gold'],pw-48,34)
fit(cy,y+ph-15,'inputs')
cy=card(panels[1],y,pw,ph,'统一依据：一份场景','基础已验证','green',C['greenfill'])
cy=block(panels[1]+24,cy,pw-48,'持续有效的场景结构','稳定对象 ID、坐标与单位\n区域轮廓、位置、数量、尺度\n参考、相机与已确认内容\n此次修改范围、锁定与版本\n资产引用、生成任务与来源',size=25)
cy=block(panels[1]+24,cy,pw-48,'默认守住的决定','已确认空间与对象身份；\n锁定内容、范围外记录。\n源布局变化时拒绝旧候选。',size=25)
cy=block(panels[1]+24,cy,pw-48,'允许创造与补全','未定义的形态、材质、\n背面、装饰与氛围。\n用户允许时也能改结构，\n展示差异后重新确认。',size=25)
cy+=text(panels[1]+24,cy,'空间关系与依赖图需扩展；\n约束为保留用户意图服务。',23,True,C['green'],pw-48,34)
fit(cy,y+ph-15,'source contract')
cy=card(panels[2],y,pw,ph,'控制模型：理解与编排','读取与局部修订已验证','green')
cy=block(panels[2]+24,cy,pw-48,'读取同一份场景','图 / plan / 粗模多视角\n用户目标、上一候选\n修改范围与工具能力',size=25)
cy=block(panels[2]+24,cy,pw-48,'当前已跑通','制定覆盖原 ID 的方案；\n选择支持的形态与材质、\n植被密度、微地形与光照；\n按指定对象做局部修订。',size=25)
cy=block(panels[2]+24,cy,pw-48,'产品目标｜继续扩展','规划新资产与区域细节；\n组织生成 / 建模工具；\n依据验收反馈重新修正；\n说明改动与能力缺口。',kind='blue',size=25)
cy+=text(panels[2]+24,cy,'模型给出方案 / 任务；\n执行器负责状态与检查。\n当前并未自动调用完整\n精细网格生成与修复链。',23,False,C['gold'],pw-48,34)
fit(cy,y+ph-15,'model orchestration')
cy=card(panels[3],y,pw,ph,'工具层：生成并执行','能力逐步扩充','gold')
cy=block(panels[3]+24,cy,pw-48,'当前登记的工具','程序地形、道路与体块；\n材质、植被、微地形；\n既有扫描 / 神经资产复用；\n比例适配、光照与渲染。',size=25)
cy=block(panels[3]+24,cy,pw-48,'专用生成｜已独立验证','图像参考 → 单物体 3D；\n小屋、灯塔、棕榈与船。\n整场景条件驱动新资产\n的连续链尚未打通。',size=25)
cy=block(panels[3]+24,cy,pw-48,'待扩展工具','新网格 / 材质 / 区域建模\n资产搜索、导入与重拓扑\n碰撞、导航、动画与交互\n镜头、事件与玩法组件',kind='blue',size=25)
cy+=text(panels[3]+24,cy,'七类对象 / 区域是当前边界，\n不是最终产品的内容上限。',23,True,C['gold'],pw-48,34)
fit(cy,y+ph-15,'tools')
cy=card(panels[4],y,pw,ph,'输出候选：真实 3D','可观察与修改已验证','green')
cy=block(panels[4]+24,cy,pw-48,'目标候选的组成','几何 + 材质 + 空间布局\n环境 / 光照 + 可选行为\n可旋转、多视角检查、\n可继续编辑的同一场景。',size=25)
cy=block(panels[4]+24,cy,pw-48,'一致性验收的三层','① 忠于输入与空间意图\n② 形态、材质、光照协调\n③ 延续已确认的决定',size=25)
cy=block(panels[4]+24,cy,pw-48,'反馈到原对象 / 区域','对照粗模与外观参考；\n选择问题位置、说明修改；\n只重做受影响的部分，\n再比较、确认或拒绝。',size=25)
cy+=text(panels[4]+24,cy,'结构与范围已有程序检查。\n视觉品质、空间接触与\n跨视角修复仍需补齐。',23,False,C['gold'],pw-48,34)
fit(cy,y+ph-15,'candidate')
for i in range(4):
    a=panels[i]+pw; b=panels[i+1]
    line([(a+2,y+ph/2),(b-3,y+ph/2)],C['green'],2.8,arrow=True)
feedback_y=y+ph+44
line([(panels[4]+pw/2,y+ph),(panels[4]+pw/2,feedback_y),(panels[2]+pw/2,feedback_y),(panels[2]+pw/2,y+ph+4)],C['green'],3,arrow=True)
rect(panels[2]+100,feedback_y-18,900,42,C['bg'],None,0)
text(panels[2]+118,feedback_y-17,'问题 → 绑定原 ID 与修改范围 → 局部修正 → 再验收',25,True,C['green'])
y=feedback_y+71

# 4. The control responsibilities are actionable, not just prompting.
y=section(y,'04','“如何控制”落实为三道关口与一个确认闭环','单靠提示词不构成可控产品；保留意图也不等于禁止新内容')
cw=(UW-2*GAP)/3; ch=430
controls=[
 ('执行前：守住结构与范围','已验证基础','green',[
  ('谁、哪一版、允许改什么','对象 ID、源布局指纹、锁定、字段与数值范围；整组候选先校验，拒绝越界或过期结果。'),
  ('当前局部策略','全局环境与范围外外观记录保持；输入不变，候选独立保存。复杂依赖关系仍需扩展。')]),
 ('执行后：检查空间与效果','人工检查；自动化待扩展','gold',[
  ('空间 / 视觉 / 运行质量','尺度、接触、悬空、穿插、道路可达；参考对照、背面、跨视角、风格、光照与性能。'),
  ('质量不是“生成成功”','网格有效、载入完成和测试通过，不能证明最终写实满意；专业精度需专门验收。')]),
 ('确认后：延续同一个作品','保存恢复已验证','green',[
  ('比较 → 接受 / 拒绝 / 恢复','用户检查候选；满意后确认版本。局部修改读取上一方案；重新生成整片场景作为新候选比较，失败不覆盖已确认结果。'),
  ('更完整的工程管理','继续建设几何 / 纹理 / 动画 / 依赖资源的统一版本、审计、工程导出与协作。')])]
for i,(title,status,kind,parts) in enumerate(controls):
    x=M+i*(cw+GAP);cy=card(x,y,cw,ch,title,status,kind)
    for t,b in parts:cy=block(x+24,cy,cw-48,t,b,size=25)
    fit(cy,y+ch-15,title)
y+=ch+20
rect(M,y,UW,93,C['greenfill'],None,14)
text(M+26,y+16,'用户可以只说一句话；产品内部仍要完成理解、规划、生成、校验、修改与交付。',30,True,C['green'])
text(M+26,y+58,'“直接对标最终效果”是统一任务与验收目标；必要时允许澄清空间歧义，并提供候选，而不是承诺一次成功。',24,False,C['muted'])
y+=121

# 5. Distinguish the concrete deliverables that exist from desired full scene export.
y=section(y,'05','出口：交付什么，才算同一份可用作品','当前 JSON 备份不等于完整通用 3D 工程')
ow=(UW-GAP)/2;oh=370
cy=card(M,y,ow,oh,'现在已有的出口','本地已验证','green')
cy=block(M+24,cy,ow-48,'实时作品与实际文件','可旋转的浏览器 3D、粗模 / 候选对照、PNG 画面；\n原工作台参数 JSON、创作 plan JSON、单对象 GLB；\n08 场景配方 + 输入图片 + 回执 + 来源记录的 JSON。',size=26)
cy+=text(M+24,cy,'旧独立代码候选另有 GLB 导出；08 尚未导出完整场景 GLB。',24,False,C['gold'],ow-48,35)
fit(cy,y+oh-15,'current outputs')
cy=card(M+ow+GAP,y,ow,oh,'面向产品的目标出口','待扩展','blue')
cy=block(M+ow+GAP+24,cy,ow-48,'按用途交付完整结果','可继续编辑的场景工程：几何、纹理、光照、资产与版本；\n资源打包、GLB / glTF 或特定引擎工程；\n交互网页发布 / 嵌入、镜头动画 / 视频、可试玩场景。',size=26)
cy+=text(M+ow+GAP+24,cy,'导出内容、性能与领域规则按使用场景验收。',24,False,C['blue'],ow-48,35)
fit(cy,y+oh-15,'future outputs')
y+=oh+30

# 6. Implementation coverage and proof: no invented score or photoreal claim.
y=section(y,'06','研究原型：已经证明什么，还没有证明什么','能力存在与链路整合、质量稳定性分别验收')
ew=(UW-2*GAP)/3;eh=650
cy=card(M,y,ew,eh,'当前页面的能力演进','已有实验','green')
for title,body in [
 ('01–03｜画布、粗模与编辑','人工图片标注、语义绘笔、真实几何、ID / 位置 / 高度、锁定与本地历史。'),
 ('04–05｜细化与外观','程序沙滩 / 岩石 / 植被；PBR、扫描资源、HDRI、同布局粗模对照。'),
 ('06–07｜神经资产与装配','图片到单物体 GLB、比例归位与来源记录；同类可复用，质量需检查。'),
 ('08｜整场景模型控制','读取整场景输入、完整方案、局部修订、确认保存、刷新恢复与实际导出。')]:cy=block(M+24,cy,ew-48,title,body,size=24)
fit(cy,y+eh-15,'coverage')
x=M+ew+GAP
cy=card(x,y,ew,eh,'第 08 步的真实证据','本地已验证','green')
cy=block(x+24,cy,ew-48,'首轮生成','25 个原实体；1 张绘笔图 + 2 张粗模视角；\n完整原 plan 保留，控制模型真实调用。',size=25)
cy=block(x+24,cy,ew-48,'局部修改','加入修改前候选，共 4 张图片；仅灯塔外观记录变化，其余 24 项与环境完全相同；越界结果曾被拒绝。',size=25)
cy=block(x+24,cy,ew-48,'来源与恢复','确认、刷新恢复、公开导出已检查；55 项相关测试、5 项来源 / 数据检查；有真实任务回执。',size=25)
cy+=text(x+24,cy,'本轮无上传的原始参考图，不能称图片重建。\n记录不变不等于全画面像素不变。',23,False,C['gold'],ew-48,34)
fit(cy,y+eh-15,'evidence')
x+=ew+GAP
cy=card(x,y,ew,eh,'尚未完成的关键链路','待扩展 / 待验证','gold')
cy=block(x+24,cy,ew-48,'从整片粗模到新精细内容','控制模型围绕同一空间调用新资产、材质与区域建模，再归位与检查；不是只挑已有素材。',size=25)
cy=block(x+24,cy,ew-48,'自动空间 / 视觉检查与修复','检测接触、穿插、尺度、跨视角及风格问题，绑定对象后只修受影响部分。',size=25)
cy=block(x+24,cy,ew-48,'完整工程与普遍稳定性','统一资源与版本、任务恢复、导出与发布；跨场景质量、速度、成功率及真实用户需求。',size=25)
cy+=text(x+24,cy,'单图不能唯一恢复隐藏空间；\n任意地形要同步岸线、碰撞与导航等依赖。',23,False,C['gold'],ew-48,34)
fit(cy,y+eh-15,'missing capabilities')
y+=eh+30

# 7. Different products share a core; domain rules and deliverables differ.
y=section(y,'07','产品可扩展方向：共享控制核心，领域约束与出口各不相同','以下为产品设想，不代表已实现或已验证商业需求')
dw=(UW-3*GAP)/4;dh=250
directions=[
 ('场景创作 / 概念设计','控制：布局、形态、风格与局部精修。','出口：可编辑完整场景、多个候选与交互展示。'),
 ('建筑 / 园林 / 展陈预演','控制：空间尺寸、动线、建筑与陈设。','出口：漫游与方案评审；工程精度另行验证。'),
 ('品牌 / 商品 / 活动空间','控制：品牌资产、陈列、热点与外观。','出口：可嵌入的产品展厅、互动网页与活动空间。'),
 ('游戏关卡 / 互动故事','控制：道路、出生点、任务、触发与难度。','出口：可试玩场景；碰撞、导航与完成条件需验收。'),
 ('虚拟拍摄 / 分镜演出','控制：镜头、时间线、动作与环境。','出口：可重放演出、分镜、动画与视频。'),
 ('规则生成 / 方案比较','控制：数量、间距、邻接、可达与预算。','出口：满足约束的多种空间方案与差异比较。'),
 ('真实地图 / 数据空间','控制：坐标、高程、尺度与来源精度。','出口：有数据依据的 3D 空间与可视化；精度需校验。'),
 ('资产组装 / 配置与培训','控制：既有资产身份、组合、流程与行为。','出口：围绕现有资源的世界、配置体验或训练场景。')]
for i,(title,a,b) in enumerate(directions):
    row,col=divmod(i,4);x=M+col*(dw+GAP);yy=y+row*(dh+20)
    cy=card(x,yy,dw,dh,title,title_size=28)
    cy+=text(x+24,cy,a,25,False,C['muted'],dw-48,36)+12
    cy+=text(x+24,cy,b,25,False,C['blue'],dw-48,36)
    fit(cy,yy+dh-12,title)
y+=2*dh+48

# Bottom conclusion and sources are part of the same graph.
rect(M,y,UW,136,C['dark'],None,16)
text(M+28,y+23,'产品价值：让生成围绕用户意图持续发生，并把满意部分延续为同一份 3D 作品。',36,True,'#ffffff')
text(M+28,y+82,'路线可行且初步控制链已验证；最终效果取决于生成工具、资产、空间与视觉验收以及工程交付。',27,False,'#cce0d9')
y+=166
text(M,y,'依据：对话探索 + 固定源码基线 + 实际任务与浏览器记录。状态以 2026-10-05 实验为准；历史文档中的旧阶段边界应按阶段阅读。',22,False,C['muted'])
y+=37
text(M,y,'上游：github.com/dgreenheck/tidewater  ·  commit 4811ba48…  |  本地：notes/research.md · notes/product-design.md · README.md',22,False,C['muted'])
y+=36
text(M,y,'实证：checks/scene-completion-evidence-results.json · checks/scene-completion-browser-results.json · assets/control-model/jobs/',22,False,C['muted'])
H=math.ceil(y+65)

# The same placement operations produce both files. Text stays editable in SVG.
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="title desc">',
 '<title id="title">Tidewater 研究与可控 3D 场景产品思路总览</title>',
 '<desc id="desc">背景展示源库作者的午后海滩截图与本地08实际三岛候选，并以同一份绘笔布局、粗模和候选进行画面对照。一张图汇总八个探索转折、Tidewater能力与原理、三种模型职责、入口、统一空间依据、模型编排与工具执行、一致性验收、出口、实测证据、待验证能力及八个产品扩展方向。</desc>',
 f'<rect width="{W}" height="{H}" fill="{C["bg"]}"/>',
 '<defs><marker id="arrow-green" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M1 1 L6 4 L1 7" fill="none" stroke="#166b5c" stroke-width="1.2"/></marker></defs>']
im=Image.new('RGB',(W,H),C['bg']);draw=ImageDraw.Draw(im)
for op in ops:
    if op[0]=='rect':
        _,x,yy,w,h,fill,stroke,radius,dash,sw=op
        attr=f'fill="{fill or "none"}" stroke="{stroke or "none"}" stroke-width="{sw}"'
        if dash:attr+=f' stroke-dasharray="{dash}"'
        svg.append(f'<rect x="{x:.2f}" y="{yy:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{radius}" {attr}/>')
        draw.rounded_rectangle((x,yy,x+w,yy+h),radius,fill=fill,outline=stroke,width=max(1,round(sw)))
    elif op[0]=='image':
        _,x,yy,w,h,data,rendered,label=op
        encoded=base64.b64encode(data).decode('ascii')
        svg.append(f'<image x="{x:.2f}" y="{yy:.2f}" width="{w:.2f}" height="{h:.2f}" href="data:image/png;base64,{encoded}"><title>{escape(label)}</title></image>')
        im.paste(rendered,(round(x),round(yy)))
    elif op[0]=='wash':
        _,x,yy,w,h,color,opacity=op
        svg.append(f'<rect x="{x:.2f}" y="{yy:.2f}" width="{w:.2f}" height="{h:.2f}" fill="{color}" opacity="{opacity}"/>')
        region=(round(x),round(yy),round(x+w),round(yy+h))
        im.paste(Image.blend(im.crop(region),Image.new('RGB',(region[2]-region[0],region[3]-region[1]),color),opacity),region)
    elif op[0]=='text':
        _,x,yy,value,size,bold,color,link=op
        elem=f'<text x="{x:.2f}" y="{yy:.2f}" dominant-baseline="text-before-edge" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">{escape(value)}</text>'
        svg.append(f'<a href="{escape(link,quote=True)}">{elem}</a>' if link else elem)
        draw.text((x,yy),value,font=font(size,bold),fill=color,anchor='lt')
    else:
        _,points,color,sw,dash,arrow=op
        path='M '+' L '.join(f'{px:.2f} {py:.2f}' for px,py in points)
        attr=f'stroke="{color}" stroke-width="{sw}" fill="none" stroke-linejoin="round"'
        if dash:attr+=f' stroke-dasharray="{dash}"'
        if arrow:attr+=' marker-end="url(#arrow-green)"'
        svg.append(f'<path d="{path}" {attr}/>')
        draw.line(points,fill=color,width=round(sw),joint='curve')
        if arrow:
            px,py=points[-1];ax,ay=points[-2];theta=math.atan2(py-ay,px-ax)
            draw.line([(px-13*math.cos(theta-.55),py-13*math.sin(theta-.55)),(px,py),(px-13*math.cos(theta+.55),py-13*math.sin(theta+.55))],fill=color,width=round(sw))
svg.append('</svg>')
OUT.mkdir(exist_ok=True)
stem='tidewater-product-research-map'
(OUT/f'{stem}.svg').write_text('\n'.join(svg),encoding='utf-8')
im.save(OUT/f'{stem}.png',optimize=True)
(OUT/f'{stem}.txt').write_text('\n'.join(texts),encoding='utf-8')
for x,yy,w,h,value in bounds:
    if x<0 or x+w>W+1 or yy<0 or yy+h>H+1:raise ValueError(f'Canvas text clipping: {value}')
manifest={'format':'tidewater-research-map.v2','date':'2026-10-05','width':W,'height':H,'textLines':len(texts),'sourceBaseline':'4811ba48d795197de5621985f404e765c0b7c0ef','sources':['notes/research.md','notes/product-design.md','README.md','checks/scene-completion-evidence-results.json','checks/scene-completion-browser-results.json'],'visuals':visuals,'sections':sections,'files':[f'{stem}.svg',f'{stem}.png',f'{stem}.txt'],'limits':['Diagram is a source-grounded synthesis, not evidence of every proposed feature being implemented.','Upstream author screenshot and local prototype frames are separately labeled; no final photoreal quality is claimed.','Current model and renderer boundaries are labeled in the diagram.']}
(OUT/f'{stem}.manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
web=ROOT/'web'/'assets'
for ext in ['svg','png']:(web/f'{stem}.{ext}').write_bytes((OUT/f'{stem}.{ext}').read_bytes())
# Keep chapter navigation and image dimensions aligned with the generated layout.
viewer=ROOT/'web/research-map.html'
html=viewer.read_text(encoding='utf-8')
for entry in sections:
    pattern=rf'(data-y=")[0-9]+("[^>]*>{entry["number"]} )'
    html=re.sub(pattern,lambda match:f'{match[1]}{entry["y"]}{match[2]}',html)
html=re.sub(r'(id="map"[^>]*height=")[0-9]+',lambda match:f'{match[1]}{H}',html)
html=re.sub(r'2520 × [0-9]+',f'{W} × {H}',html)
viewer.write_text(html,encoding='utf-8')
print(json.dumps({'width':W,'height':H,'lines':len(texts),'files':manifest['files']},ensure_ascii=False))
