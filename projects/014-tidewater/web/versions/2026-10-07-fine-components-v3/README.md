# 我的精细 3D 场景

解压整个目录，在该目录运行下列任意一种命令：

    node serve.mjs
    python start.py

然后用现代浏览器打开 http://127.0.0.1:4200/ 。需要本机已有 Node.js 或 Python，且浏览器支持 WebGL 2。运行不安装依赖，不请求模型服务或互联网。浏览器对 file:// 的模块限制使直接双击 index.html 不适用。

## 文件

- index.html / portable-scene.js：独立网页浏览器，保留动态水面与本地环境。
- scene.glb：可在 Blender 或支持 glTF 2.0 的工具中编辑的静态场景快照。
- scene.json：原始布局、模型外观方案、模型编写的精细部件、镜头与真实任务记录。
- inputs/：本次模型读取的布局图与粗模视图；未提供输入视图时不包含该目录。
- delivery-manifest.json：文件 SHA-256、来源对象和 GLB 重新解析检查。
- realistic/：同一版本的渲染器、Three.js、HDR、PBR 材质与扫描模型；全部在项目内。

精细部件由控制模型编写几何参数，通过受约束执行器装配。它不是神经模型生成的任意网格。写实品质需要实际画面验收。
GLB 是静态快照，自定义地形混合、水面着色器、天空和船体动态不以浏览器程序形态保留。具体近似记录于 delivery-manifest.json；网页项目保留运行时呈现。

## 许可证与来源

Three.js：MIT，见 realistic/vendor/LICENSE。版本 0.180.0。
既有摄影材质、HDR 和扫描资产：Poly Haven CC0 1.0，作者、资源页面和许可链接见 realistic/assets/manifest.json。
CC0 完整法律文本：https://creativecommons.org/publicdomain/zero/1.0/legalcode 。
模型任务来源保留在 scene.json 的 receipt / geometryReceipt；本地资源的来源信息不代表它们由模型生成。
