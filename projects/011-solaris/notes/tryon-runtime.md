# 真人试穿：Windows 本机运行说明

记录日期：2026-10-06。此文记录0.15.0研究运行环境、操作步骤与真实运行，不把生成完成视为效果或网页全部验收通过。原能力总数保持35/36，C19购物联动仍待接入。

本轮实际安装45个Python包（含FASHN的editable安装包），原安装日志的44项不含该包，实际import与 `uv pip check`通过；主模型、DWPose和人体解析缓存已完成离线SHA核查，4项GPU小张量内核调用通过。首次真实VTON任务已进入采样，但在0/20步发生CUDA内存不足，61.49秒后失败，没有生成图片。调整CPU预处理驻留后，四组真实任务已完成20步，输出均576×768；原衣重建与实拍穿着不一致，三组跨衣缺实穿对照。环境齐备、成功返回图片和质量合格分别判断。

网页接收人物照片与上装照片，通过本机Python服务运行既有FASHN预训练模型。自部署是自己部署与控制流程，不是从零训练或自研全部算法。下载依赖和权重需要访问官方分发站点；实际试穿不使用外部推理API，也不向这些下载站点发送输入照片。

## 目录与固定配置

以下命令在项目目录 `F:\codex_project\1002_codex_project\projects\011-solaris` 内运行。Python使用独立的 `.runtime/tryon/.venv`，不向全局Python安装试穿依赖。

| 项目 | 本轮登记配置 |
| --- | --- |
| Python | Windows x64，3.10；本机解释器为3.10.11 |
| PyTorch / torchvision | 官方Windows CPython3.10 wheel：`torch==2.8.0+cu128`、`torchvision==0.23.0+cu128` |
| FASHN代码 | [官方仓库](https://github.com/fashn-AI/fashn-vton-1.5)，提交 `7c0f10af3f91ad4048fe9729c470a13ef905d25a` |
| 本地代码安装 | `.runtime/tryon/vendor/fashn-vton-1.5`，editable安装 |
| 兼容约束 | `numpy==1.26.4`、`opencv-python==4.11.0.86`、`transformers<5`、`huggingface-hub<1` |
| 解析包装 / ONNX运行时 | `fashn-human-parser==0.1.1`、`onnxruntime-gpu==1.23.2`；姿态与人体解析实际放在CPU |
| 主模型与姿态权重 | `.runtime/tryon/weights/model.safetensors`、`weights/dwpose/yolox_l.onnx`、`weights/dwpose/dw-ll_ucoco_384.onnx` |
| 人体解析缓存 | `.runtime/tryon/hf-cache`，固定模型提交 `1f80c34dbab321c5730dda5c3fea279fd3e97498` |
| 服务 | `http://127.0.0.1:4197`，默认20步、上装、单图、种子42 |
| 本机留存 | `.runtime/tryon/jobs`：规范化输入、元数据、实际输出；日志和PID在 `.runtime/tryon` |

4196端口已有其他Node项目服务，本轮没有停止或修改它，试穿服务改用4197。网页API地址、CSP和后端监听端口须一致；不能只改其中一处。

`.runtime/tryon`只供本机运行，不发布到网页目录或 `_site`。权重、虚拟环境、输入照片、任务结果、下载分块和日志都在运行目录内。需要交付的研究样本和经过核查的生成留档另行选择、登记来源后复制，不能把整个运行目录作为网站素材发布。

## 建立环境和安装依赖

先安装Windows x64 Python3.10和能运行所登记CUDA配置的NVIDIA驱动。以下为新环境的复现命令；已有环境或源码目录应先核对，不能为复现而删除现有任务、照片或本地改动。若没有 `py` 启动器，第一条建环境命令改用已安装Python3.10的绝对路径，例如本机的 `D:\software\python310\python.exe`。

```powershell
Set-Location -LiteralPath 'F:\codex_project\1002_codex_project\projects\011-solaris'
py -3.10 -m venv .runtime/tryon/.venv
$tryonPython = Join-Path (Get-Location) '.runtime/tryon/.venv/Scripts/python.exe'
& $tryonPython -m pip install --upgrade pip setuptools wheel
& $tryonPython -m pip install requests
```

使用项目下载助手读取PyTorch官方索引并校验其SHA-256。它支持分块续传，成功后在 `downloads` 中写出下载证据；不会借用第三方镜像或推理服务。

```powershell
& $tryonPython scripts/download-tryon-runtime.py torch
& $tryonPython scripts/download-tryon-runtime.py vision
& $tryonPython -m pip install '.runtime/tryon/downloads/torch-2.8.0+cu128-cp310-cp310-win_amd64.whl' '.runtime/tryon/downloads/torchvision-0.23.0+cu128-cp310-cp310-win_amd64.whl'
```

随后创建运行目录内的兼容约束文件。约束用于避免editable安装重新选取NumPy2、OpenCV新版本或不兼容的Transformers/Hub主版本；这些范围不是所有将来补丁版本都已验证的保证。

```powershell
@'
torch==2.8.0+cu128
torchvision==0.23.0+cu128
numpy==1.26.4
opencv-python==4.11.0.86
transformers<5
huggingface-hub<1
fashn-human-parser==0.1.1
onnxruntime-gpu==1.23.2
'@ | Set-Content -LiteralPath '.runtime/tryon/constraints.txt' -Encoding ascii

git clone https://github.com/fashn-AI/fashn-vton-1.5.git .runtime/tryon/vendor/fashn-vton-1.5
git -C .runtime/tryon/vendor/fashn-vton-1.5 checkout --detach 7c0f10af3f91ad4048fe9729c470a13ef905d25a
& $tryonPython -m pip install -c .runtime/tryon/constraints.txt 'numpy==1.26.4' 'opencv-python==4.11.0.86' 'transformers<5' 'huggingface-hub<1'
& $tryonPython -m pip install -c .runtime/tryon/constraints.txt -e .runtime/tryon/vendor/fashn-vton-1.5
& $tryonPython -m pip check
```

约束中的Torch CUDA版本应继续来自前述官方wheel。不要改成只执行一次无版本限制的 `pip install torch` 或跟踪FASHN代码最新分支。已有vendor目录不再clone，先用 `git -C ... rev-parse HEAD` 核对登记提交并保留本地修改。

完成安装后可将 `pip freeze` 输出保存到 `.runtime/tryon/pip-freeze.txt`，作为该机器的实际完整版本记录；本文件的兼容范围不能代替完整版本记录。本文没有执行上述重建、安装或模型调用命令。

本轮现有环境实际45个Python包已完成安装，并已完成import和uv依赖一致性核查。上述命令用于复现，不再将FASHN、解析包装或Transformers4标为待安装；它们的成功安装也不意味着模型已经成功生成图片。

## 准备主模型、姿态权重与离线解析缓存

主模型与两个DWPose权重也通过同一助手从官方Hugging Face仓库获取并核对官方LFS SHA-256：

```powershell
& $tryonPython scripts/download-tryon-runtime.py weights
& $tryonPython scripts/download-tryon-runtime.py pose-detector
& $tryonPython scripts/download-tryon-runtime.py pose-estimator
& $tryonPython scripts/prepare-tryon-parser.py --hf-home .runtime/tryon/hf-cache
& $tryonPython scripts/prepare-tryon-parser.py --hf-home .runtime/tryon/hf-cache --verify-only
```

解析缓存助手固定使用 [fashn-ai/fashn-human-parser](https://huggingface.co/fashn-ai/fashn-human-parser) 的提交 `1f80c34dbab321c5730dda5c3fea279fd3e97498`。登记运行文件只有 `config.json` 和 `model.safetensors`；包装代码负责预处理，不额外虚构所需图像处理器文件。

缓存位于 `hf-cache/hub/models--fashn-ai--fashn-human-parser`，包含固定提交的 `snapshots`、权重 `blobs` 和指向该提交的 `refs/main`。Windows可使用硬链接或普通副本，不要求获得符号链接权限。启动脚本明确传入 `--hf-home hf-cache`；直接运行服务的默认路径仍为 `hf-home`，因此手动命令也必须显式指定正确缓存目录。

本轮 `downloads/parser-verified.json` 已记录文件来源、固定提交、配置/张量头和真实HF离线缓存解析核查：在禁用 `socket.connect` 的情况下调用 `hf_hub_download(..., local_files_only=True)`，实际解析到固定快照。该结果只证明文件与离线缓存解析正确，**不证明Torch模型加载、完整推理或人体解析效果通过**。`--verify-only`不下载、不联网；准备命令本身会联网获取官方文件。

以下是本轮已登记下载文件的SHA-256，用于再次复现时比对。主模型和DWPose下载助手目前读取官方 `main` 的文件与哈希；如果官方日后更新，即使新下载通过当时的官方哈希，也不能直接视为与本轮相同的权重。应先对照这里的登记值并记录差异。

| 文件 | 本轮SHA-256 |
| --- | --- |
| `torch-2.8.0+cu128-cp310-cp310-win_amd64.whl` | `43938e9a174c90e5eb9e906532b2f1e21532bbfa5a61b65193b4f54714d34f9e` |
| `torchvision-0.23.0+cu128-cp310-cp310-win_amd64.whl` | `8ec6f2281ef5d52471b01b99eb04243d0c2cccb1972ba43217085025fe5a6c3f` |
| 主 `model.safetensors` | `d6cd38286885bc29fa487ea9383f80ffeb95862e7747c630d42c5d3c05bdd35a` |
| `dwpose/yolox_l.onnx` | `7860ae79de6c89a3c1eb72ae9a2756c0ccfbe04b7791bb5880afabd97855a411` |
| `dwpose/dw-ll_ucoco_384.onnx` | `724f4ff2439ed61afb86fb8a1951ec39c6220682803b4a8bd4f598cd913b1843` |
| 人体解析 `model.safetensors` | `e43c8c8a9b04f28798f0a4630cf18caa2cdb27a0d454fae43a5716e6f7078244` |

原始下载证据保存在 `.runtime/tryon/downloads/*-verified.json`。解析模型配置还核对官方Git blob ID，文件SHA与快照信息见该目录的 `parser-verified.json`。

## 启动与确认

```powershell
& $tryonPython scripts/tryon-probe.py --weights-dir .runtime/tryon/weights --hf-home .runtime/tryon/hf-cache
.\scripts\start-tryon-service.ps1 -Steps 20
Invoke-RestMethod -Uri 'http://127.0.0.1:4197/health'
```

启动脚本使用隐藏进程，写入 `service.pid`、`service.stdout.log`、`service.stderr.log`，并显式选择 `hf-cache`。它检查4197是否已有监听；若有，只报告监听已存在，不会替换或终止该进程。此提示不等于监听者一定是本试穿服务，仍须核对 `/health` 与页面状态。

需要在前台查看完整运行日志时，可使用同一解释器和明确参数运行：

```powershell
& $tryonPython -u scripts/tryon-service.py --port 4197 --weights-dir .runtime/tryon/weights --hf-home .runtime/tryon/hf-cache --jobs-dir .runtime/tryon/jobs --steps 20
```

已经由启动脚本运行时不重复启动前台服务。服务只监听 `127.0.0.1`；本轮网页允许来源为localhost或127.0.0.1的4189、4194、4195端口，不能据此当作公网部署或任意端口通用配置。

`can_submit`检查包、CUDA、权重和解析缓存是否齐备；`pipeline_loaded`说明流水线加载状态。两者都不是生成效果通过。真实任务还须取得成功状态、可解码结果、与输入对应的元数据和人工效果记录。详见 [真人样板计划](real-person-tryon-plan.md) 与 [实拍样本来源](tryon-sources.md)。

## 本机内存安排与内核核查

服务在 `scripts/tryon-service.py` 中使用官方Pipeline的本地子类，沿用官方Euler采样与CFG流程，调整构建、装载、组件设备位置与注意力后端，并记录真实完成步数：先在 `meta` 设备构建TryOnModel，再从CPU读取官方checkpoint，以 `load_state_dict(strict=True, assign=True)`绑定全部参数，确认无未初始化meta张量后转到GPU。这避免先额外建立一份完整float32随机参数，目的是减少系统RAM峰值；不删减模型参数，也不替换成小模型或伪造输出。

登记设备安排为CPU姿态检测、CPU人体解析、CUDA上装生成；本轮GPU路径使用bf16。CPU预处理不意味着允许CPU生成回退。实际硬件、dtype、RAM/显存峰值与耗时应随任务记录，不能从CUDA可用推导所有GPU都能成功运行。

`scripts/tryon-gpu-probe.py`的本轮实际结果已写入 `.runtime/tryon/gpu-kernel-probe.json`：PyTorch2.8.0+cu128、CUDA12.8、RTX4070Laptop、计算能力8.9、cuDNN版本值91002；该PyTorch构建显示Flash未编译。以下4项小张量调用均实际执行且结果为有限值：

| 张量布局 | 后端 | 实际执行 / 有限值 | 探测进程峰值分配 |
| --- | --- | --- | --- |
| contiguous | efficient | 是 / 是 | 2.03MiB |
| contiguous | cuDNN | 是 / 是 | 2.03MiB |
| strided_linear1 | efficient | 是 / 是 | 3.28MiB |
| strided_linear1 | cuDNN | 是 / 是 | 3.28MiB |

这些数字只是小张量探测的进程峰值，不是完整模型显存需求。服务采样现已限制为 `SDPBackend.EFFICIENT_ATTENTION` 单一后端，不提供MATH回退；不把开启该配置当作完整模型已执行的证据。小张量支持不能外推完整模型长度，完整推理与峰值已有以下四组记录，更多输入与真人效果仍须分别核查。本文件只读取已有探测记录，没有重新运行GPU核查。

首次任务失败后，服务加入采样前释放CPU人体解析和姿态网络、下一次输入再重建的安排；CPU ONNX会话关闭 `enable_cpu_mem_arena` 和 `enable_mem_pattern`，线程设置为intra/inter的2/1。此改动保持原姿态计算与官方采样流程，目的是减少预处理模型和内存池的驻留。此安排下四组真实任务已完成，后续任务复用GPU主模型并重新建立CPU预处理。有限运行不证明所有内存问题已修复，也不能仅由首轮错误确定OOM根因。

## 首次真实任务：失败记录

[原始任务元数据](tryon-runs/initial-failed-0702f8eb.json)与[对应stderr记录](tryon-runs/initial-failed-0702f8eb.stderr.log)已保留。任务ID为 `0702f8ebda354a11b07958e6db4ef579`，人物输入是 `person-00055`，目标是 `garment-14627`；这是真实跨衣输入，没有同人同目标衣的独立实拍对照。

运行设置为FASHN VTON1.5、上装、单件商品图处理模式、单张输出、20步、种子42、guidance1.5、bf16与576×864内部模型分辨率。人物和衣物均来自768×1024登记原图，输入SHA可与样本清单对应；处理模式名称不证明衣图拍摄方式经过平铺核验。

任务进入采样后尚未完成任何一步，最终元数据为 `status:failed`、`completed_steps:0`、`total_steps:20`、`elapsed_seconds:61.49`，错误为 `OutOfMemoryError: CUDA out of memory`，没有成功输出或可供效果评审的图片。不能把这次任务称为推理完成、算入成功样本，或把目录原穿着照片作为其结果。后续成功任务分别记录，不覆盖或删除首次失败事实。

## 四次真实完成任务与效果边界

| 任务ID | 输入组合 | 耗时 | 实际输出 |
| --- | --- | --- | --- |
| `101182fc0b9f4663b81bfda3fd666620` | 人物00055 / 衣物14627 | 63.34秒 | 20步，576×768 PNG |
| `0ad56a0218ee4639ad6f2ac38af3cd0b` | 人物14627 / 衣物00055 | 49.58秒 | 20步，576×768 PNG |
| `aa5cad627f3b4c1cae95de9f159241bd` | 人物00055 / 原衣00055重建 | 41.84秒 | 20步，576×768 PNG |
| `55598b6b6418464a833443cc78a24e04` | 人物00055 / 模特穿着14627衣物图 | 52.58秒 | 20步，576×768 PNG |

首个成功任务的PyTorch采样峰值分配2782.73MiB、保留3584.0MiB；另两次为2784.11/3584.0MiB，只统计该进程采样，不含其他程序或系统RAM。内部模型分辨率576×864与实际输出576×768分别登记，不混用。所有输入和输出哈希、任务元数据与图像见[案例清单](../web/tryon/experiments.json)和[运行验收](real-person-tryon-validation.json)。

三个跨衣案例没有同人同目标衣实拍，主要衣款可辨但下装和细节出现变化。原衣重建有同人同原衣照片参照，生成却更贴身平整，褶皱、字样比例及裤腰/纽扣改变，因此不通过真实穿着一致性。它不是另换新衣的实穿三元组。189项产品测试（含8项真人核心）和18项Python后端测试通过；网页比较、放大/平移/复位、选款撤销与导出内容已实际核查；下载写盘、剪贴板一致性和异常专项继续分别记录，四次生成不等于普遍效果或性能通过。

PNG导出预览已实际核查为576×812（原图576×768加44px生成注记）；评审JSON全文已核对并留档，含真实输入组合、任务ID、元数据和缺实拍依据。提供复制/保存入口；内置浏览器自动下载落盘及剪贴板字节一致性未验证。

[真人工作区](../assets/atelier-real-person-workspace.png)、[原衣重建问题](../assets/atelier-real-person-baseline.png)、[带生成注记的导出预览](../assets/atelier-real-person-export-preview.png)、[评审JSON](../assets/atelier-real-person-review.json)和[评审核对窗口](../assets/atelier-real-person-review-dialog.png)保留实际界面与内容。

## 输入留存、许可与交付边界

每个任务会将规范化的 `person.png`、`garment.png`、`metadata.json`及成功后的原始 `result.png`存入 `.runtime/tryon/jobs/<任务ID>/`。图片元数据去除不是照片像素删除；输入和结果会留在磁盘上，没有自动清理承诺。浏览器本机任务关联、进程内队列与磁盘文件是不同层，文件留存不代表服务重启后会自动恢复全部旧任务API或历史。

页面保存的图片应带可见生成标记，原始本机结果和SHA作为推理证据分开保存。不要仅用文件名标识生成性质，也不能把原衣目录照片当作模型输出。用户上传尚属实验输入，不证明任意体型、衣类或拍摄姿态均适用；不判断尺码、舒适或真实布料行为。

许可分别看组件：FASHN主代码/模型登记为Apache-2.0，人体解析模型遵循[NVIDIA SegFormer许可](https://github.com/NVlabs/SegFormer/blob/master/LICENSE)的非商业研究/评估范围，本轮照片为[VITON-HD CC BY-NC 4.0](https://github.com/shadow2496/VITON-HD#license)。主模型许可不能覆盖解析组件、照片、肖像或品牌授权。商业使用需替换受限组件和样本，或取得对应授权；两组研究照片没有可售SKU、库存、价格或跨人换装实拍对照。

运行说明交付后，当前能力清单、C17/C18历史验收、C19待接状态与场景计数保持不变。环境、首次失败与四次真实生成已有记录，已知质量问题公开保留；网页分界比较、放大、平移、复位、选款撤销与导出内容已实际核查；下载写盘、剪贴板一致性和异常专项继续分别记录。
