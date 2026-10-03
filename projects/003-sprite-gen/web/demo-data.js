// 从真实 CLI 输出与验证记录生成；运行 node scripts/sync-demo.mjs 更新。
window.SPRITE_DEMO = {
  "frames": [
    {
      "x": 0,
      "y": 0,
      "w": 128,
      "h": 160
    },
    {
      "x": 128,
      "y": 0,
      "w": 128,
      "h": 160
    },
    {
      "x": 256,
      "y": 0,
      "w": 128,
      "h": 160
    },
    {
      "x": 384,
      "y": 0,
      "w": 128,
      "h": 160
    },
    {
      "x": 512,
      "y": 0,
      "w": 128,
      "h": 160
    },
    {
      "x": 640,
      "y": 0,
      "w": 128,
      "h": 160
    }
  ],
  "cellWidth": 128,
  "cellHeight": 160,
  "sheetWidth": 768,
  "sheetHeight": 160,
  "fps": 6,
  "loop": true,
  "images": {
    "input": "demo/input/keyed-sheet.png",
    "alpha": "demo/output/atlas.png",
    "variant": "demo/output/variants/sunset.png"
  },
  "alphaPercent": 68.5,
  "artifacts": [
    {
      "title": "透明图集 PNG",
      "path": "demo/output/atlas.png"
    },
    {
      "title": "帧坐标 manifest",
      "path": "demo/output/manifest.json"
    },
    {
      "title": "Aseprite JSON",
      "path": "demo/output/aseprite.json"
    },
    {
      "title": "透明 GIF",
      "path": "demo/output/wave.gif"
    },
    {
      "title": "日落配色 PNG",
      "path": "demo/output/variants/sunset.png"
    },
    {
      "title": "紫色配色 PNG",
      "path": "demo/output/variants/violet.png"
    }
  ],
  "stages": [
    {
      "name": "色键抠图",
      "command": "sprite-gen cutout web/demo/input/keyed-sheet.png --out web/demo/output/cutout-sheet.png --key auto"
    },
    {
      "name": "网格切帧",
      "command": "sprite-gen slice-sheet --sheet web/demo/input/keyed-sheet.png --out-dir web/demo/output/frames --chroma-key magenta --grid 3x2 --names frame-00,frame-01,frame-02,frame-03,frame-04,frame-05 --cell-width 128 --cell-height 160 --baseline-y 144 --target-height 123"
    },
    {
      "name": "导入透明帧",
      "command": "sprite-gen unpack-atlas --pngs-dir web/demo/output/frames --state-name wave --out-dir .cache/demo-run --force"
    },
    {
      "name": "组装透明图集",
      "command": "sprite-gen compose-atlas --run-dir .cache/demo-run --atlas atlas.png"
    },
    {
      "name": "图集拆分往返检查",
      "command": "sprite-gen unpack-atlas --atlas web/demo/output/atlas.png --manifest web/demo/output/manifest.json --out-dir .cache/roundtrip-run --force"
    },
    {
      "name": "组装 GIF 预览",
      "command": "sprite-gen compose-gif web/demo/output/frames/frame-00.png web/demo/output/frames/frame-01.png web/demo/output/frames/frame-02.png web/demo/output/frames/frame-03.png web/demo/output/frames/frame-04.png web/demo/output/frames/frame-05.png --output web/demo/output/wave.gif --delay-ticks 17 --manifest-output web/demo/output/gif-manifest.json --contact-output web/demo/output/contact-sheet.png"
    },
    {
      "name": "提取调色清单",
      "command": "sprite-gen recolor-palette --base web/demo/output/atlas.png --out web/demo/output/palette.json"
    },
    {
      "name": "生成两种配色变体",
      "command": "sprite-gen recolor --base web/demo/output/atlas.png --spec web/demo/input/recolor-spec.json --manifest web/demo/output/manifest.json --out-dir web/demo/output/variants"
    },
    {
      "name": "导出 Aseprite 兼容 JSON",
      "command": "sprite-gen export-aseprite --run-dir .cache/demo-run --output exports/aseprite.json"
    },
    {
      "name": "导出逐帧 PNG",
      "command": "sprite-gen export-pngs --run-dir .cache/demo-run --state wave --out-dir web/demo/output/exported-pngs"
    }
  ],
  "scope": "使用独立 Python venv 运行 sprite-gen 2.20.0 的 10 个 CLI 步骤，验证了透明帧、图集矩形、换色透明度及导出结构。"
};
