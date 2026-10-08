const input = document.getElementById('web-search');
const status = document.getElementById('web-search-status');
const groups = [...document.querySelectorAll('.web-group')];
const initialOpen = new Map(groups.map(group => [group, group.open]));
input.addEventListener('input', () => {
  const query = input.value.trim().toLowerCase();
  let count = 0;
  for (const entry of document.querySelectorAll('.web-entry')) {
    entry.hidden = query !== '' && !entry.dataset.search.includes(query);
    if (!entry.hidden) count++;
  }
  for (const group of groups) {
    group.hidden = ![...group.querySelectorAll('.web-entry')].some(entry => !entry.hidden);
    group.open = query ? !group.hidden : initialOpen.get(group);
  }
  for (const project of document.querySelectorAll('.web-project')) {
    project.hidden = Boolean(query) && ![...project.querySelectorAll('.web-entry')].some(entry => !entry.hidden);
  }
  status.textContent = query ? `找到 ${count} 个入口${count ? '' : '，可尝试其他关键词'}。` : '全部入口已显示；辅助与历史页面可展开查看。';
});
document.querySelector('.project-shortcuts').addEventListener('click', event => {
  if (!event.target.closest('a')) return;
  input.value = '';
  input.dispatchEvent(new Event('input'));
});
