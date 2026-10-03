window.SPRITE_DATA = {
  commit: 'd993e5300b4255111e8ee0e29779caea1b3b97bd',
  repo: 'https://github.com/aldegad/sprite-gen',
  groups: { A:'图像图集', B:'视频循环', C:'素材整理', D:'后处理', E:'辅助与检查', S:'场景合成' },
  heroes: {
    fox: { file:'attack-fox-hood.gif', alt:'上游狐狸兜帽角色攻击动画', caption:'上游透明攻击 GIF：视频模型产生动作，库处理与导出。本页播放现成文件，未在本机生成这只狐狸；原始输入与提示词未完整归档。' },
    slime: { file:'attack-slime.gif', alt:'上游史莱姆角色攻击动画', caption:'史莱姆的攻击循环展示不同身体形态的生成与提取效果。它是上游公开结果，不能据此推断任意角色的生成成功率。' },
    furniture: { file:'demo-furniture.gif', alt:'上游家具素材的筛选、摆放与编辑界面录屏', caption:'上游家具素材编辑录屏：把已生成的物件导入 curation 界面，再选择和调整。本例展示素材编辑界面。' }
  },
  pipelines: {
    A: { title:'A · 图像到运行时图集', description:'每个动作生成一行姿态，再用确定性算法提取并打包。筛帧编辑是可选步骤。', badge:'一张参考图 + 动作规格', stages:[
      {name:'准备规格', command:'prepare', kind:'确定性处理', input:'base.png + 动作 / 帧数 / 尺寸', output:'sprite-request.json\n布局参考图 + 分动作提示词', principle:'统一记录画布尺寸、安全边距、帧数、播放速度与色键，生成阶段和输出阶段共享同一份规格。布局图帮助模型控制各帧间距。', doc:'sprite_gen/gen/prepare.py', example:'sprite-gen prepare --out-dir run --character-id hero --base-image base.png'},
      {name:'生成动作行', command:'gen / gen-set', kind:'外部 AI 调用', input:'提示词 + 布局图 + 角色 / 方向锚点', output:'raw/<state>.png', principle:'外部图像模型按动作输出姿态。方向性流程使用已接受的 idle 锚点约束身份；配对方向可附动作参考。角色细节由参考条件与提示词约束，仍需人工检查。', doc:'docs/directional-anchor-workflow.md', example:'sprite-gen gen-set --run-dir run --provider codex'},
      {name:'清理与提帧', command:'extract', kind:'确定性处理', input:'动作行 + sprite-request.json', output:'frames/<state>/frame-N.png\nframes-manifest.json', principle:'检测并去除色键，分解边缘混色；通过连通区域定位姿态，再裁切、缩放、对齐。默认不在提取失败时悄悄改用网格切割。', doc:'sprite_gen/frames/extract.py', example:'sprite-gen extract --run-dir run'},
      {name:'筛选与调整', command:'curation', kind:'可选人工编辑', input:'透明帧 + 播放预览', output:'curation.json', principle:'在 webview 中挑选、重排、变换或编辑像素。原始帧保留，编辑写入 sidecar；最终合成时统一应用，便于回退和重做。', doc:'docs/curation.md', example:'sprite-gen curation --run-dir run'},
      {name:'组装图集', command:'compose-atlas', kind:'确定性处理', input:'透明帧 + 可选 curation.json', output:'sprite-sheet-alpha.png\nmanifest.json.frame_layout', principle:'把播放序列写进标准图集，记录绝对矩形、帧数、fps 和 loop。引擎读取明确的坐标；动作是否自然仍由预览与动作 QA 判断。', doc:'docs/run-contract.md', example:'sprite-gen compose-atlas --run-dir run'}
    ]},
    B: { title:'B · 视频到透明循环', description:'由视频模型产生连续运动，再逐帧处理并选择衔接自然的周期或单次动作。', badge:'一张静态图 + 运动状态', stages:[
      {name:'准备运动画布', command:'video-canvas', kind:'确定性处理', input:'平坦背景静态图 + 动作状态', output:'canvas.png + 画布报告', principle:'跳跃保留头顶空间，攻击保留武器前后空间。原图构图影响视频构图；按状态扩展画布，并将可识别的背景规范成一致色键。', doc:'docs/video-pipeline.md', example:'sprite-gen video-canvas --help'},
      {name:'生成连续运动', command:'video', kind:'外部 AI 调用', input:'画布图 + 原地运动提示', output:'clip.mp4 + 生成报告', principle:'Grok Imagine 将静态图变为连续运动。提示要求保持方向、原地移动和返回起始姿态，但模型可能转向、变形或离开画布。', doc:'docs/video.md', example:'sprite-gen video --help'},
      {name:'解码与透明清理', command:'video-frames', kind:'FFmpeg + 图像处理', input:'clip.mp4', output:'raw/*.png + keyed/*.png\n提帧 / 色键检查报告', principle:'FFmpeg 解码视频帧，抠图引擎逐帧去背景，并检查主体是否触边、色键是否残留。视频压缩已损失的细轮廓颜色无法保证完全恢复。', doc:'docs/chroma-alpha.md', example:'sprite-gen video-frames --help'},
      {name:'寻找动作周期', command:'video-loop', kind:'测量与选择', input:'透明帧序列', output:'cycle/ + strip.png / strip.json\n透明 GIF + WebP', principle:'计算不同时间间隔的全局帧差，先找重复周期，再选择接缝。检查接缝相对帧间变化的比例；跳跃和攻击也可识别准备—动作—恢复的单次片段。', doc:'sprite_gen/video/loop.py', example:'sprite-gen video-set --base side=still.png --states idle,jump,attack --out-dir set/'}
    ]},
code: {title:'② 代码形变与已有素材组装',description:'动作来自已有姿势或有限形变。按素材选择导入、呼吸、编排与输出；场景也可使用另外两条路线的产物。',badge:'已有素材 / 静态图 + 配置',stages:[
      {name:'导入已有素材',command:'unpack-atlas / slice-sheet',kind:'确定性处理',input:'静态 PNG / 姿势图 / PNG 帧 / 图集',output:'统一 run 目录与透明帧',principle:'根据已有文件与声明布局恢复帧。输入姿势已经画好；步骤负责拆分、组织与记录，不会推算新的复杂姿态。已有视频可用 video-frames 解码，透明提取需可识别色键背景。',doc:'docs/curation.md',example:'sprite-gen unpack-atlas --pngs-dir pngs --out-dir run'},
      {name:'配置呼吸或帧序列',command:'curation / breathe 配置',kind:'有限形变 / 人工整理',input:'静态姿势或已有帧 + 顺序 / 帧率 / 呼吸参数',output:'curation.json + sprite-request.json',principle:'呼吸按周期轻微挤压、拉伸身体并保护头部和脚端；多帧则选择、排序、变换。breathe 是配置字段，由 compose 烘焙，不是独立 CLI 命令。图层需要预拆部件与对齐规则。',doc:'docs/breathing.md',example:'sprite-gen curation --run-dir run\n# 配置 states.idle.breathe 与播放序列'},
      {name:'组装动图与资源',command:'compose-atlas / compose-gif',kind:'确定性处理',input:'帧序列 + 变换 + fps / loop',output:'透明 GIF / PNG 图集 + JSON',principle:'烘焙选择与形变，把帧按明确时长编排。GIF 解码器或精灵图播放器按时间切换图片；动作来自输入姿势或有限形变规则。',doc:'docs/run-contract.md',example:'sprite-gen compose-atlas --run-dir run\nsprite-gen compose-gif frame-00.png frame-01.png --output wave.gif'},
      {name:'搭配背景合成场景',command:'scene-render',kind:'可选场景合成',input:'已有角色动画 + 背景图 + scene.json',output:'PNG 帧 / 带背景 GIF、MP4',principle:'逐帧选角色图片、按速度更新位置，叠加背景、相机视差与投影阴影。画面位置移动不产生新的肢体姿势。场景 GIF / MP4 需不透明背景，透明层可导出 PNG。',doc:'docs/scene.md',example:'sprite-gen scene-render --spec scene.json --out-dir render --formats png,gif,mp4'}
    ]},

    pixel: { title:'像素风的确定性修复', description:'整理 AI 像素风的块尺寸、边界与颜色。输入仍需具备可辨认的像素结构。', badge:'可选 pixel_unfake', stages:[
      {name:'测量网格', command:'pitch / phase', kind:'数值测量', input:'每帧透明姿态', output:'每帧块宽 + 网格偏移\n行级共识 + 警告', principle:'测量每帧颜色边界所暗示的像素块尺寸。每帧估计处于共识族内时保留自己的值；偏离较大或检测失败时用跨帧共识纠错，并记录警告。', doc:'sprite_gen/frames/extract.py', example:'在 sprite-request.json 中显式配置 fit.pixel_unfake'},
      {name:'吸附真实边界', command:'snap / vote', kind:'确定性处理', input:'块宽 + 颜色边界', output:'逻辑像素图', principle:'把网格切线拉到实际颜色边界，每个块投票选择代表颜色。最小块宽约束防止相邻切线挤到同一条边界，细节保护规则尽量保住黑色眼睛和轮廓。', doc:'docs/pixel-unfake.md', example:'sprite-gen extract --run-dir run'},
      {name:'对齐与统一色彩', command:'register / palette', kind:'确定性处理', input:'逻辑像素帧', output:'帧间对齐 + 共享调色板', principle:'以稳定身体区域做帧间配准，降低内容边界变化引起的抖动；共享调色板减少帧间颜色闪烁。像素路径将透明度二值化。', doc:'docs/pixel-unfake.md', example:'调整 fit.align_x / fit.align_y / fit.palette_size'},
      {name:'整数放大与放置', command:'integer placement', kind:'确定性处理', input:'逻辑像素帧 + cell 规格', output:'标准画布透明帧', principle:'用整数倍 nearest 放大并以整数偏移放置，保留硬边像素。不能凭空补回不存在的细节，也不保证任意插画能自动变为优秀像素画。', doc:'docs/pixel-unfake.md', example:'完成 extract 后进入 curation / compose-atlas'}
    ]}
  },
  capabilities: [
    {title:'准备动作规格',group:'A',commands:['prepare'],description:'生成统一 request、布局参考图和各动作提示词，控制帧数、画布与安全边距。',doc:'docs/run-contract.md'},
    {title:'图像与动作行生成',group:'A',commands:['gen','gen-set'],description:'接入 Codex、Grok 或显式 OpenAI API，参考角色与布局生成图片或动作行。需要外部服务。',doc:'docs/gen.md',state:'外部模型'},
    {title:'方向身份锚点',group:'A',commands:['anchor'],description:'以已接受的方向 idle 图为身份来源，给配对动作提供一致的角色参考。方向和细节仍需检查。',doc:'docs/directional-anchor-workflow.md'},
    {title:'姿态区域提取',group:'A',commands:['extract'],description:'去除色键并按连通区域找出姿态，裁切、缩放和对齐成标准透明帧。',doc:'sprite_gen/frames/extract.py'},
    {title:'人工筛帧编辑',group:'A',commands:['curation'],description:'预览、选择、排序、微调和像素编辑。修改记录在 sidecar，最终烘焙时统一应用。',doc:'docs/curation.md'},
    {title:'运行时图集组装',group:'A',commands:['compose-atlas'],description:'输出透明大图与绝对帧矩形、fps、loop 等描述，让运行时明确读取每一帧。',doc:'docs/run-contract.md'},
    {title:'按运动扩展画布',group:'B',commands:['video-canvas'],description:'为跳跃、攻击等状态留出顶部和前后空间，规范平坦背景色键。',doc:'docs/video-pipeline.md'},
    {title:'静态图生成视频',group:'B',commands:['video'],description:'Grok Imagine 生成连续运动；使用自己的登录或 API 凭据。生成动作与方向不保证成功。',doc:'docs/video.md',state:'外部模型'},
    {title:'视频逐帧透明清理',group:'B',commands:['video-frames'],description:'解码 MP4，逐帧色键处理，记录主体触边与背景残留等检查结果。',doc:'docs/video-pipeline.md'},
    {title:'周期与单次动作选择',group:'B',commands:['video-loop'],description:'测量全局重复周期、选择接缝，或截取准备—动作—恢复；输出透明 GIF / WebP / strip。',doc:'sprite_gen/video/loop.py'},
    {title:'多动作批处理与周期对齐',group:'B',commands:['video-set','video-cycle-align'],description:'按方向 × 动作运行整套流程。跨方向周期对齐及部分步态修补可用 RIFE，需要额外环境。',doc:'docs/loop-repair.md',state:'依赖扩展'},
    {title:'独立图片抠图',group:'C',commands:['cutout'],description:'对白色背景或绿 / 品红色键做透明处理，输出检查图；可消费外部工具的图片。',doc:'docs/chroma-alpha.md',state:'本机已验证'},
    {title:'现成网格图切帧',group:'C',commands:['slice-sheet'],description:'按照声明的网格提取各单元，可做背景清理；用于已有的多图素材表。',doc:'docs/sheet-slicing.md',state:'本机已验证'},
    {title:'拆图集重新编辑',group:'C',commands:['unpack-atlas'],description:'将现有图集与布局，或逐帧 PNG 导入可筛帧的 run 目录。',doc:'docs/curation.md',state:'本机已验证'},
    {title:'像素风网格修复',group:'D',commands:['extract / fit.pixel_unfake'],description:'每帧测量与行级共识纠错、边界吸附、调色板共享和整数放大，整理 AI 像素结构。',doc:'docs/pixel-unfake.md'},
    {title:'确定性配色变体',group:'D',commands:['recolor-palette','recolor'],description:'从图集建立颜色清单，再按明确的调色映射批量烘焙配色；固定输入与配置可重复。',doc:'docs/recolor.md',state:'本机已验证'},
    {title:'静态待机呼吸',group:'D',commands:['curation.breathe','compose-atlas'],description:'在 curation 中配置按身体结构分配的 squash & stretch 呼吸变化，由图集组装步骤烘焙到帧。',doc:'docs/breathing.md'},
    {title:'声明式分层合成',group:'D',commands:['compose-layers'],description:'按已声明的部件轨道和堆叠关系合成。该能力需要符合 rig / layer 合约的输入。',doc:'docs/layer-tracks.md'},
    {title:'播放循环与 GIF 组装',group:'D',commands:['compose-cycle','compose-gif'],description:'按已选择帧的顺序与变换生成可观看的循环预览，辅助动作验收。',doc:'docs/curation.md'},
    {title:'逐帧与引擎描述导出',group:'D',commands:['export-pngs','export-aseprite'],description:'导出透明逐帧 PNG 或 Aseprite 兼容 JSON。Phaser / Flame 有映射方式，需实际引擎验收。',doc:'docs/engine-export.md',state:'本机已验证'},
    {title:'可重复背景平铺',group:'E',commands:['background-tile'],description:'把已有背景整理成重复 strip / tile，提供接缝测量；场景结构仍要人工看。',doc:'docs/asset-tools.md'},
    {title:'从脚部锚点投影阴影',group:'E',commands:['shadow'],description:'根据透明轮廓、脚部锚点和光照投影阴影；可独立输出，也用于场景渲染。',doc:'docs/asset-tools.md'},
    {title:'动作与接触测量',group:'E',commands:['inspect-motion'],description:'查看时间、重复姿态和接触证据。脚部不明确时，不能把启发式测量当作确定落地事实。',doc:'docs/asset-tools.md'},
    {title:'质量检查与修正提示',group:'E',commands:['inspect','score','preview','correction-loop'],description:'测量帧数、颜色、重复、变化和抖动，给出问题与修正提示；仍须观看实际动作。',doc:'docs/qa-motion.md'},
    {title:'复杂方向人形走跑',group:'A',commands:['walk','run / state'],description:'精确脚接触与相位对称属于需要动作 QA 的实验范围；状态名不是独立 CLI 命令。',doc:'docs/states-and-frames.md',state:'实验 / 需验收'},
    {title:'已有素材场景合成',group:'S',commands:['scene-render'],description:'按 scene.json 放置素材、命名平面、相机与光照，输出 PNG 帧、MP4 或 GIF。',doc:'docs/scene.md'},
    {title:'场景摆放与运动检查',group:'S',commands:['scene-inspect'],description:'检查素材位置、画布和运动条件，保留场景与放置元数据。源素材无需被重新生成。',doc:'docs/scene.md'}
  ],
  scenarios: [
    {label:'2D GAME / PROTOTYPE',title:'独立游戏与短动作原型',description:'已有人物设计，希望快速获得待机、跳跃、攻击或挥手等可读动作。先用少量帧建立完整流程，再看实际动作。',recommendation:'从 A 管线起步：<code>prepare → gen-set → extract → compose-atlas</code>'},
    {label:'MASCOT / MOTION',title:'吉祥物与透明动画素材',description:'为网页、桌面角色或视频包装制作透明循环。连续运动可选择视频管线，输出后检查色边、姿态变化和循环接缝。',recommendation:'从 B 管线起步：<code>video-set</code>，再人工验收 GIF / WebP'},
    {label:'ASSET / PROCESSING',title:'已有 AI 素材的清理与整理',description:'图片已生成，需要抠背景、切网格、整理成图集、重新筛帧或换色。独立处理工具可绕过生成服务。',recommendation:'组合 <code>cutout · slice-sheet · unpack-atlas · recolor</code>'},
    {label:'SCENE / COMPOSITION',title:'展示场景与素材样片',description:'将已有背景、人物循环和物件摆入场景，配合光照、阴影与相机运动输出视频。收益取决于素材匹配与场景配置。',recommendation:'准备 <code>scene.json</code>，运行 <code>scene-render / scene-inspect</code>'}
  ],
  sources: [
    ['项目概览','README.md'],['实现架构','docs/architecture.md'],['工作流与交付','docs/run-contract.md'],['图像生成后端','docs/gen.md'],['视频与循环','docs/video-pipeline.md'],['色键与透明边缘','docs/chroma-alpha.md'],['像素风修复','docs/pixel-unfake.md'],['方向参考锚点','docs/directional-anchor-workflow.md'],['筛帧与编辑','docs/curation.md'],['确定性换色','docs/recolor.md'],['动作与帧数边界','docs/states-and-frames.md'],['动作 QA','docs/qa-motion.md'],['引擎导出','docs/engine-export.md'],['独立资产工具','docs/asset-tools.md'],['场景规范','docs/scene.md'],['模块与管线映射','sprite_gen/_modules.py'],['姿态提取源码','sprite_gen/frames/extract.py'],['周期检测源码','sprite_gen/video/loop.py']
  ]
};
