const $ = id => document.getElementById(id);

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
    if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
    urls.delete(id); link.removeAttribute('href'); link.hidden = true;
  }
  function fileLink(id, bundle) {
    clearLink(id);
    if (!bundle) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    urls.set(id, url); $(id).href = url; $(id).hidden = false;
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
      const size = item.bytes >= 1024 * 1024 ? `${(item.bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(item.bytes / 1024))} KB`;
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
    $('workspace-text').value = '';
    $('workspace-text-panel').open = false;
    $('workspace-before-download').textContent = '下载预览时的本机备份';
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
      renderRows(result.entries); fileLink('workspace-download', result.bundle);
      $('workspace-text').value = JSON.stringify(result.bundle, null, 2);
      message('下载保留当前已保存记录，空项不生成默认方案。返回检查点、试衣和真人参考不包含在这份文件中。');
    } catch { if (request !== epoch) return; $('workspace-summary').textContent = '备份工具未能加载'; message('请重新读取或刷新页面；本机存档没有被修改。'); }
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
      const text = (await read()).replace(/^\uFEFF/, ''); if (request !== epoch) return;
      $('workspace-text').value = text;
      const controller = await coordinator(); if (request !== epoch) return;
      if (new TextEncoder().encode(text).length > limit) throw Error('整套备份不能超过12 MB，请分别使用工作台备份。');
      const result = controller.preview(text);
      if (!result.ok) throw Error(result.message || '文件不符合当前整套备份格式。');
      blocked = false;
      $('workspace-content-heading').textContent = '文件中的保存内容';
      $('workspace-file-name').textContent = `${name} · 预览尚未写入本机`;
      $('workspace-text').value = text;
      $('workspace-restore-panel').hidden = false;
      renderRows(result.entries); fileLink('workspace-before-download', result.currentBundle);
      const previewMessage = result.entries.some(item => item.status === 'saved' && item.changed)
        ? '已勾选可恢复且有差异的记录；可取消不需要的工作台。打开文件本身不会写入存档。'
        : '可恢复的记录与本机一致，无需写入。空项和需要检查的原文保持本机现状。';
      message([result.currentBackupMessage, previewMessage].filter(Boolean).join(' '));
    } catch (error) {
      if (request !== epoch) return;
      $('workspace-summary').textContent = '这份文件没有应用';
      $('workspace-file-name').textContent = name;
      message(error.message); updateApply();
    }
  }
  $('workspace-file').addEventListener('change', event => {
    const file = event.target.files[0]; if (!file) return;
    void openText(() => { if (file.size > limit) throw Error('整套备份不能超过12 MB，请分别使用工作台备份。'); return file.text(); }, `文件：${file.name}`);
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
    $('workspace-file-name').textContent = '内容已编辑；请重新检查后恢复。';
    $('workspace-file-name').hidden = false;
    updateApply(); message('备份文本已修改，原预览已失效。点击“检查粘贴内容”后再选择恢复。');
  });
  $('workspace-copy').addEventListener('click', async () => {
    const request = epoch, text = $('workspace-text').value;
    if (!text) { message('请先读取本机保存，或粘贴一份备份。'); return; }
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else { $('workspace-text').focus(); $('workspace-text').select(); if (!document.execCommand('copy')) throw Error(); }
      if (request === epoch) message('完整备份内容已复制，可另存为 JSON 文件。');
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
      ? '恢复前整套备份超出大小限制，本轮未提供下载。'
      : '恢复前备份仍可下载。';
    message(`已恢复 ${result.writtenIds.length} 个工作台。未选中的本机配置保持。${beforeMessage}`);
  });
  window.addEventListener('storage', event => {
    if (!dialog.open || event.storageArea !== storage || (event.key !== null && event.key !== 'atelier-collection-trip-v1' && event.key !== 'atelier-underwater-workspace-v1' && !workspaces.some(item => item.key === event.key))) return;
    blocked = true; updateApply();
    if (previewMode) { clearLink('workspace-before-download'); message('本机记录在预览后发生变化。请重新打开这份文件，核对最新差异再恢复。'); }
    else { clearLink('workspace-download'); message('本机保存已更新，请重新读取后下载。'); }
  });
  dialog.addEventListener('close', () => { epoch++; clearLink('workspace-download'); clearLink('workspace-before-download'); });
}
