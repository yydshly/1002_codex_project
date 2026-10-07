const $ = id => document.getElementById(id);

export function serializeWorkspaceBundle(bundle, maxBytes = 12 * 1024 * 1024) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw Error('备份大小限制无效。');
  const encoder = new TextEncoder();
  let text = JSON.stringify(bundle, null, 2), compact = false;
  if (typeof text !== 'string') throw Error('没有可导出的备份内容。');
  let bytes = encoder.encode(text).length;
  if (bytes > maxBytes) {
    text = JSON.stringify(bundle); compact = true;
    bytes = encoder.encode(text).length;
  }
  if (bytes > maxBytes) throw Error(`备份内容超过 ${maxBytes.toLocaleString('zh-CN')} 字节，未生成文件；请分别使用工作台备份。`);
  return { text, bytes, compact };
}

export function initializeWorkspaceBackup({ storage, beforeOpen, onRestored }) {
  const dialog = $('workspace-dialog');
  let servicePromise, service, workspaces = [], limit = 12 * 1024 * 1024;
  let previewMode = false, blocked = false, entries = [], epoch = 0;
  const urls = new Map();

  async function coordinator() {
    servicePromise ??= import('./workspace.js').then(module => {
      workspaces = module.WORKSPACES;
      limit = module.MAX_WORKSPACE_BYTES;
      service = module.createWorkspaceBackup(storage);
      return service;
    }).catch(error => { servicePromise = undefined; throw error; });
    return servicePromise;
  }
  function clearLink(id) {
    const link = $(id);
    if (urls.has(id)) URL.revokeObjectURL(urls.get(id).url);
    urls.delete(id); link.removeAttribute('href'); link.hidden = true;
    $(id === 'workspace-download' ? 'workspace-export-info' : 'workspace-before-info').hidden = true;
  }
  function sizeLabel(bytes) {
    const readable = bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
      : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${bytes} B`;
    return `${readable}（${bytes.toLocaleString('zh-CN')} 字节）`;
  }
  function readableError(error, fallback) {
    return typeof error?.message === 'string' && /[\u3400-\u9fff]/u.test(error.message) ? error.message : fallback;
  }
  function filename(kind, createdAt) {
    return `atelier-${kind}-${createdAt.slice(0, 19).replaceAll(':', '-')}Z.json`;
  }
  function fileLink(id, text, name, label) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    if (blob.size > limit) throw Error(`当前文件为 ${sizeLabel(blob.size)}，超过12 MiB上限，未生成下载；请分别备份工作台。`);
    const url = URL.createObjectURL(blob);
    clearLink(id);
    urls.set(id, { url, name, bytes: blob.size });
    $(id).href = url; $(id).download = name; $(id).hidden = false;
    const info = $(id === 'workspace-download' ? 'workspace-export-info' : 'workspace-before-info');
    info.textContent = `${label}：${name} · ${sizeLabel(blob.size)}`; info.hidden = false;
  }
  function selection() {
    return [...$('workspace-rows').querySelectorAll('input:checked:not(:disabled)')].map(input => input.dataset.id);
  }
  function updateApply() {
    const count = selection().length;
    $('workspace-apply').disabled = !previewMode || blocked || !count;
    $('workspace-apply').textContent = count ? `恢复所选 ${count} 个工作台` : '恢复所选工作台';
  }
  function renderRows(next) {
    entries = next; $('workspace-rows').replaceChildren();
    for (const item of entries) {
      const row = document.createElement('tr');
      const name = document.createElement('td'), content = document.createElement('td'), action = document.createElement('td');
      if (previewMode) {
        const label = document.createElement('label'), input = document.createElement('input'), text = document.createElement('span');
        input.type = 'checkbox'; input.dataset.id = item.id; input.setAttribute('aria-label', `恢复：${item.name}`);
        input.disabled = item.status !== 'saved' || !item.changed || blocked;
        input.checked = item.status === 'saved' && item.changed && !blocked;
        input.addEventListener('change', updateApply); text.textContent = item.name; label.append(input, text); name.append(label);
      } else name.textContent = item.name;
      const size = item.bytes >= 1024 * 1024 ? `${(item.bytes / (1024 * 1024)).toFixed(1)} MiB`
        : item.bytes >= 1024 ? `${Math.ceil(item.bytes / 1024)} KiB` : `${item.bytes} B`;
      content.textContent = item.status === 'empty' ? (previewMode ? '文件未包含已保存内容' : '当前版本未保存') : item.status === 'saved' ? `已保存 · ${size}` : `原记录需检查 · ${size}`;
      if (item.message && item.status !== 'saved') { const note = document.createElement('small'); note.textContent = item.message; content.append(note); }
      if (!previewMode) action.textContent = item.status === 'saved' ? '可恢复' : item.status === 'empty' ? '保持空项' : '仅保留原文';
      else if (item.status !== 'saved') action.textContent = item.status === 'empty' ? '本机保持' : '不能恢复';
      else { action.textContent = item.changed ? '将使用文件内容' : '与本机一致'; action.className = item.changed ? 'workspace-different' : 'workspace-same'; }
      row.append(name, content, action); $('workspace-rows').append(row);
    }
    const saved = entries.filter(item => item.status === 'saved').length;
    const invalid = entries.filter(item => item.status === 'invalid').length;
    const changed = entries.filter(item => item.status === 'saved' && item.changed).length;
    $('workspace-summary').textContent = previewMode
      ? `${saved} 个可恢复记录 · ${changed} 个与本机不同${invalid ? ` · ${invalid} 个原记录需检查` : ''}`
      : `${saved} / 10 份存档已保存 · 九个工作台与精选陈列${invalid ? ` · ${invalid} 个原记录仅保留原文` : ''}`;
    updateApply();
  }
  function message(text) { $('workspace-message').textContent = text; }
  function resetView() {
    previewMode = false; blocked = false;
    $('workspace-restore-panel').hidden = true;
    $('workspace-file-name').hidden = true;
    $('workspace-content-heading').textContent = '本机已保存内容';
    $('workspace-file').value = '';
    const hasText = Boolean($('workspace-text').value);
    if (!hasText) $('workspace-text-panel').open = false;
    $('workspace-text-status').textContent = hasText
      ? '原文本仍保留；读取或检查成功后才更新下载文件。'
      : '读取本机保存或打开文件后，可查看完整文本。';
    $('workspace-before-download').textContent = '先下载恢复前的本机备份';
    clearLink('workspace-download'); clearLink('workspace-before-download');
    renderRows([]); message('');
  }
  async function capture() {
    const request = ++epoch; resetView();
    $('workspace-summary').textContent = '正在汇总本机已保存的工作台…';
    try {
      const controller = await coordinator(); if (request !== epoch) return;
      const result = controller.capture();
      if (!result.ok) { if (result.entries) renderRows(result.entries); $('workspace-summary').textContent = '没有生成整套备份'; message(result.message || '本机记录无法读取，请保留各工作台的独立备份。'); return; }
      const exported = serializeWorkspaceBundle(result.bundle, limit);
      fileLink('workspace-download', exported.text, filename('workspaces', result.bundle.createdAt), '本机已保存内容');
      $('workspace-download').textContent = '下载整套备份';
      $('workspace-text').value = exported.text;
      $('workspace-text-status').textContent = '已读取本机保存；下载文件与下方完整文本相同。';
      renderRows(result.entries);
      message('先下载，再从下载列表找到文件；用“打开整套备份文件”重新检查。检查不写入存档；空项、返回检查点、试衣和真人任务不会被补成默认方案。');
    } catch (error) {
      if (request !== epoch) return;
      $('workspace-summary').textContent = '没有生成整套备份';
      message(`未完成读取或导出：${readableError(error, '备份工具暂时无法读取或导出，请重试。')} 当前文本仍保留，可复制另存；本机存档没有被修改。`);
    }
  }
  $('workspace-backup').addEventListener('click', () => {
    beforeOpen?.(); dialog.showModal(); void capture();
  });
  $('workspace-refresh').addEventListener('click', () => { void capture(); });
  async function openText(read, name) {
    const request = ++epoch; resetView(); previewMode = true; blocked = true;
    $('workspace-file-name').textContent = `正在检查：${name}`; $('workspace-file-name').hidden = false;
    $('workspace-summary').textContent = '先检查文件，再决定恢复哪些工作台。';
    try {
      const readText = (await read()).replace(/^\uFEFF/, ''); if (request !== epoch) return;
      $('workspace-text').value = readText;
      const text = $('workspace-text').value;
      $('workspace-text-status').textContent = '已保留当前文本，正在检查整套格式和每个工作台。';
      if (new TextEncoder().encode(text).length > limit) throw Error('当前文本超过12 MiB（12,582,912字节），未生成下载或恢复预览；请分别使用工作台备份。');
      const controller = await coordinator(); if (request !== epoch) return;
      const result = controller.preview(text);
      if (!result.ok) throw Error(result.message || '文件不符合当前整套备份格式。');
      fileLink('workspace-download', text, filename('workspaces', result.bundle.createdAt), '当前已检查文本');
      $('workspace-download').textContent = '下载已检查备份';
      if (result.currentBundle) {
        const before = serializeWorkspaceBundle(result.currentBundle, limit);
        fileLink('workspace-before-download', before.text, filename('before-restore', result.currentBundle.createdAt), '恢复前的本机内容');
      }
      blocked = false;
      $('workspace-content-heading').textContent = '文件中的保存内容';
      $('workspace-file-name').textContent = `${name} · 预览尚未写入本机`;
      $('workspace-text-status').textContent = '当前文本已检查；下载内容与此文本相同。需检查的原记录仅保留，不能恢复。';
      $('workspace-restore-panel').hidden = false;
      renderRows(result.entries);
      const previewMessage = result.entries.some(item => item.status === 'saved' && item.changed)
        ? '已勾选可恢复且有差异的记录；可取消不需要的工作台。打开文件本身不会写入存档。'
        : '可恢复的记录与本机一致，无需写入。空项和需要检查的原文保持本机现状。';
      message([result.currentBackupMessage, previewMessage].filter(Boolean).join(' '));
    } catch (error) {
      if (request !== epoch) return;
      blocked = true;
      clearLink('workspace-download'); clearLink('workspace-before-download');
      $('workspace-summary').textContent = '这份文件没有应用';
      $('workspace-file-name').textContent = name;
      $('workspace-text-status').textContent = '文本仍保留；修改后可重新检查，或复制原文另存。';
      message(`${readableError(error, '文件未能读取或备份工具未能加载，请重试。')} 本机存档未修改；可保留当前文本，重新打开文件或检查文本后继续。`); updateApply();
    }
  }
  $('workspace-file').addEventListener('change', event => {
    const file = event.target.files[0]; if (!file) return;
    void openText(() => { if (file.size > limit) throw Error(`文件为 ${sizeLabel(file.size)}，超过12 MiB上限；请分别使用工作台备份。`); return file.text(); }, `文件：${file.name}`);
  });
  $('workspace-preview-text').addEventListener('click', () => {
    const text = $('workspace-text').value;
    void openText(() => text, '粘贴的整套备份');
  });
  $('workspace-text').addEventListener('input', () => {
    epoch++; blocked = true;
    service?.preview('');
    clearLink('workspace-download'); clearLink('workspace-before-download');
    for (const input of $('workspace-rows').querySelectorAll('input')) input.disabled = true;
    $('workspace-file-name').textContent = '当前文本已编辑；请重新检查后下载或恢复。';
    $('workspace-file-name').hidden = false;
    $('workspace-text-status').textContent = '未检查 · 旧下载链接和恢复预览已失效。';
    $('workspace-summary').textContent = '文本已编辑 · 上次检查结果不再用于恢复';
    updateApply(); message('点击“检查粘贴内容”核对当前文本；检查通过后会生成对应下载文件，并可选择恢复。');
  });
  $('workspace-copy').addEventListener('click', async () => {
    const request = epoch, text = $('workspace-text').value;
    if (!text) { message('请先读取本机保存，或粘贴一份备份。'); return; }
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else { $('workspace-text').focus(); $('workspace-text').select(); if (!document.execCommand('copy')) throw Error(); }
      if (request === epoch) message('当前完整文本已复制。请粘贴核对，另存为UTF-8 JSON，再用“打开整套备份文件”检查；复制本身不代表文件已落盘。');
    } catch { if (request === epoch) { $('workspace-text').focus(); $('workspace-text').select(); message('请使用 Ctrl+C / ⌘C 复制已选中的完整备份内容。'); } }
  });
  $('workspace-apply').addEventListener('click', () => {
    if (!service || blocked || !previewMode) return;
    const result = service.apply(selection());
    if (!result.ok) {
      blocked = true; updateApply();
      for (const input of $('workspace-rows').querySelectorAll('input')) input.disabled = true;
      message(result.message || '恢复没有完成，请重新打开文件核对本机记录。');
      onRestored?.(result); return;
    }
    blocked = true; updateApply();
    for (const input of $('workspace-rows').querySelectorAll('input')) input.disabled = true;
    onRestored?.(result);
    $('workspace-file-name').textContent = '恢复已完成；请重新打开恢复后的工作台。';
    $('workspace-before-download').textContent = '下载恢复前的本机备份';
    const beforeMessage = $('workspace-before-download').hidden
      ? '恢复前整套内容超出上限，请保留各工作台的独立备份。'
      : '恢复前文件仍可下载；请在下载列表确认并重新打开检查。';
    message(`已恢复 ${result.writtenIds.length} 个工作台。未选中的本机配置保持；请重新打开所选工作台核对方案与画面。${beforeMessage}`);
  });
  for (const id of ['workspace-download', 'workspace-before-download']) {
    $(id).addEventListener('click', event => {
      const file = urls.get(id);
      if (!file) { event.preventDefault(); message('没有可下载的已检查内容，请重新读取或检查当前文本。'); return; }
      message(`已向浏览器发起下载：${file.name}，${sizeLabel(file.bytes)}。在下载列表确认文件已保存，再用“打开整套备份文件”选择它重新检查；打开不会恢复或覆盖存档。`);
    });
  }
  window.addEventListener('storage', event => {
    if (!dialog.open || event.storageArea !== storage || (event.key !== null && event.key !== 'atelier-collection-trip-v1' && event.key !== 'atelier-underwater-workspace-v1' && !workspaces.some(item => item.key === event.key))) return;
    blocked = true; updateApply();
    if (previewMode) { clearLink('workspace-before-download'); message('本机记录在预览后发生变化。请重新打开这份文件，核对最新差异再恢复。'); }
    else { clearLink('workspace-download'); $('workspace-text-status').textContent = '原文本仍保留，本机已有更新；请重新读取后下载。'; message('本机保存已更新，旧下载链接已失效。原文本可复制保留，请重新读取后生成最新备份。'); }
  });
  dialog.addEventListener('close', () => { epoch++; clearLink('workspace-download'); clearLink('workspace-before-download'); });
}
