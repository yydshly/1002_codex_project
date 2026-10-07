# 真人试穿研究样本：来源、原衣参考与缺失对照

核查日期：2026-10-06。本轮仅取得 **2 组 VITON-HD 原衣成对研究样本，共 4 张 768×1024 JPEG，410,536 字节**。素材采集阶段没有下载完整数据集或模型权重，没有用图生工具制作“实拍”；后续真实本机推理另见[运行核查记录](real-person-tryon-validation.json)。原图像素与 JPEG 字节未改，只为本地引用重命名；原始文件、下载地址、SHA-256、源说明和许可保存在 `assets/tryon-research-samples/`。运行图片与公开登记位于 `web/tryon/samples/`。

## 来源核查和许可

[VITON-HD 官方仓库](https://github.com/shadow2496/VITON-HD) 明确材料为研究用途，按 **CC BY-NC 4.0** 提供：非商业使用、署名、说明修改。[原 LICENSE](https://github.com/shadow2496/VITON-HD/blob/main/LICENSE) 已原样归档并复制到运行目录。引用作者为 Seunghwan Choi、Sunghyun Park、Minsoo Lee、Jaegul Choo，论文为 *VITON-HD: High-Resolution Virtual Try-On via Misalignment-Aware Normalization*，CVPR 2021。原许可版权行记载 NeStyle Inc.；本项目没有另授照片商用权。

[VITON-HD 原论文第 3 / 4.1 节](https://arxiv.org/html/2103.16874v2) 说明人物与衣物对来自电商网站，paired 设置是原衣重建，unpaired 才是换另一件衣服。原作者旧 Drive 小样本链接本轮未能逐文件读取；这四张输入原图取自后续论文的两个**官方仓库**，使用固定 commit URL，未复制这些项目的代码或模型：

- [IDM-VTON 官方输入目录](https://github.com/yisol/IDM-VTON/tree/0d5f3ec2d737487a9bb24e4100936ad254780383/gradio_demo/example)：人物 `00055_00.jpg`，衣图 `14627_00.jpg`。
- [OOTDiffusion 官方输入目录](https://github.com/levihsu/OOTDiffusion/tree/13ef0faba266cdde9febc8ad39be2395bbb89d9c/run/examples)：衣图 `00055_00.jpg`，人物 `14627_00.jpg`。

[IDM-VTON 官方 VITON-HD 标签文件](https://github.com/yisol/IDM-VTON/blob/0d5f3ec2d737487a9bb24e4100936ad254780383/vitonhd_test_tagged.json) 同时登记两个编号的 `image` 与 `cloth`、768×1024 尺寸和对应衣类；只保留这两条记录，并逐张肉眼确认同编号衣款。照片的研究许可依据为其 VITON-HD 来源；没有把 IDM-VTON / OOTDiffusion 的代码许可证当照片商用许可证。

`realPhotoConfirmed:true` 的含义限定为**已确认的研究数据集目录照片**，依据是电商采集说明、官方原输入位置、同编号数据标签和视觉匹配，非本项目生成结果。原相机 RAW、EXIF、拍摄合同、模特肖像和商标额外授权没有核验，另记 `cameraOriginalVerified:false`。这不是已获商用授权的服装商品库。

[DressCode 官方仓库](https://github.com/aimagelab/dress-code) 另要求机构邮箱、签署协议，并声明不向私企发放；本轮没有绕过请求流程或下载其图片。没有采用合成 FIT 数据，也没有把未经摄影来源确认的 FASHN 图称真人实拍。

## 两组样本可以验证什么

| 研究编号 | 原衣与原人物 | 可观察的候选问题 | 已有实穿参考 |
| --- | --- | --- | --- |
| `00055_00` | 紫色撞色字样圆领短袖，原人物已经穿该短袖 | 胸前字样保持、撞色领袖、斜肩与短袖轮廓、塞入裤腰与褶皱 | 对应原人物目录图；可用于原衣重建参考 |
| `14627_00` | 黑色搭扣交叉短上衣，原人物已经穿该衣 | V 领、细肩带和搭扣、短下摆、黑色面料低对比、露肤边界 | 对应原人物目录图；可用于原衣重建参考 |

表中问题是照片可观察的验收候选，素材来源核查不等于模型效果通过。实际生成与代理目视初审单独记录；同人同原衣重建已有体型 / 腰部保持及实穿相似性失败的初审项。原图上可见的文字和结构保持原样，不把研究编号虚构成商品 SKU；`realProductSKU` 全部为 `null`，没有价格、尺码表、面料实测或生产纸样。

商品图为白底目录衣图，拍摄方式未核验；它们具有立体轮廓，登记 `photoType:'catalog-product'`，不冒称俯拍 flat-lay。人物图登记 `photoType:'model'`。

为了核查模型的模特穿着商品图输入形式，原 `person-14627.jpg` 同时登记为 `garment-model-14627`：`kind:'garment'`、`photoType:'model'`。这增加一个输入角色，仍然只有四张原照片，没有下载第五张、编辑像素或改变许可。该图是另一位原模特穿黑色上衣的目录参考，不是交叉试穿目标人物实际穿此衣的摄影对照；`source-manifest.json` 明确保存同图双角色关系。

## 对照关系必须这样读

衣图 `garment-00055.jpg` 的原穿着参考为 `person-00055.jpg`；衣图 `garment-14627.jpg` 的原穿着参考为 `person-14627.jpg`。该参考说明**这件原衣在其原模特上是什么样子**。由于原人物输入本身已经穿此衣，这种 paired 对照不是“换衣前、换衣后”的独立摄影三元组。

把 `person-00055` 与 `garment-14627` 交叉，或把 `person-14627` 与 `garment-00055` 交叉，均没有取得**同一输入人物真实穿目标衣**的摄影对照；manifest 明确登记 `crossPersonGroundTruth:false`，两条 pair 的 `samePersonDifferentOutfitGroundTruth` 和 `differentPersonSameGarmentGroundTruth` 均为 false。不得将另一模特的原穿着图、复制的输入图或生成图充当该交叉试穿的实拍 ground truth。

后续若要评估真实换衣效果，仍需补充同一真人、同一目标商品、可复核摄影与使用授权的换衣前后样本。当前两个女性正面目录样本也不足以覆盖多体型、遮挡手臂、侧背面、复杂背景、外套或裤裙。

## 本地登记与完整性

运行 `manifest.json` 顶层为 `{schema, notice, license, samples, pairs}`，包含两个 `person`、两个目录商品 `garment` 和一个复用模特原图的 `garment`，共五个输入角色；每项记录原网址、类别、许可、尺寸、字节数、SHA、真实照片确认依据、空 SKU 和原衣参考。`samples` 目录仍只有四张原 JPEG、一个原许可副本和 manifest，共 **6 个文件**。

源目录保存四张原 JPEG、两条官方标注、四份来源 / 许可文字、下载记录和登记配方；`source-manifest.json` 逐个记录源件与运行件的大小、SHA。核查四张图片能正常解码、尺寸正确、源 / 运行副本逐字节一致、标注两个 ID 完整，以及参考指向正确。没有将素材核查冒充真人试穿效果验收。
