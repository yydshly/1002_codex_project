(() => {
  'use strict';

  const viewer = document.getElementById('effect-map-viewer');
  if (!viewer) return;

  const image = document.getElementById('map-image');
  const imageLink = document.getElementById('map-image-link');
  const openLink = document.getElementById('map-open-current');
  const viewport = document.getElementById('map-viewport');
  const description = document.getElementById('map-view-description');
  const switcher = viewer.querySelector('.map-switcher');
  const buttons = [...switcher.querySelectorAll('button[data-map-view]')];
  const zoom = document.getElementById('map-zoom');

  const views = {
    source: {
      file: './assets/atelier-understanding-map-source.svg',
      label: '源效果分区',
      alt: 'Solaris 源效果分区：13 个公开媒体场景的 14 张论文原过程图或官方封面；另列只有公开文字的条目。图像来自发布者，不是本项目实测原模型。',
      description: '当前：源效果。13 个公开媒体场景，包含 14 张论文过程图或官方封面；在图内向下滚动查看全部场景。'
    },
    ours: {
      file: './assets/atelier-understanding-map-ours.svg',
      label: '我们的效果分区',
      alt: 'ATELIER 效果分区：11 个既有实际场景截图，独立桌灯研究与真人生成外观参考两个补充入口；每个场景分别标注功能、验证目标与限制。',
      description: '当前：我们的效果。11 个已有场景，加独立桌灯研究与真人参考；在图内向下滚动查看全部效果，正文可进入各个实际页面。'
    },
    full: {
      file: './assets/atelier-understanding-map.svg',
      label: '完整汇总图',
      alt: 'Solaris 与 ATELIER 完整理解图：左右两组清晰效果、公开源能力、生成原理、我们已有功能、11 个场景、两个补充研究、使用场景、个人价值与证据边界。',
      description: '当前：完整汇总图。左侧是源效果，右侧是我们的效果，下方是完整理解；细看图片可切换到单侧分区、选择放大或打开原图。'
    }
  };

  function selectView(name) {
    const view = views[name];
    if (!view) return;
    viewer.dataset.mapView = name;
    image.src = view.file;
    image.alt = view.alt;
    imageLink.href = view.file;
    imageLink.setAttribute('aria-label', `打开${view.label}矢量原图`);
    openLink.href = view.file;
    openLink.textContent = `打开${view.label}原图 ↗`;
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mapView === name)));
    description.textContent = view.description;
    viewport.scrollTop = 0;
    viewport.scrollLeft = 0;
  }

  buttons.forEach(button => button.addEventListener('click', () => selectView(button.dataset.mapView)));
  switcher.addEventListener('keydown', event => {
    const index = buttons.indexOf(event.target);
    if (index === -1) return;
    const next = event.key === 'ArrowRight' ? (index + 1) % buttons.length
      : event.key === 'ArrowLeft' ? (index + buttons.length - 1) % buttons.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
    if (next === -1) return;
    event.preventDefault();
    buttons[next].focus();
    selectView(buttons[next].dataset.mapView);
  });
  zoom.addEventListener('change', () => {
    if (!['100', '125', '150', '200'].includes(zoom.value)) return;
    viewer.dataset.zoom = zoom.value;
    description.textContent = `${views[viewer.dataset.mapView].description} 当前尺寸：${zoom.value === '100' ? '适应宽度' : `${zoom.value}%` }。`;
  });

  switcher.hidden = false;
  zoom.closest('label').hidden = false;
})();
