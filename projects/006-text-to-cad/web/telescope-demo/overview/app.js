const local = ['127.0.0.1','localhost','[::1]'].includes(location.hostname)
  && /\/overview(?:\/|\/index\.html)$/.test(location.pathname);
for (const link of document.querySelectorAll('.demo-entry')) {
  if (local) link.href = '../#demo';
  else link.textContent = '本地启动完整 CAD 演示 ↓';
}
document.getElementById('copy-brief').addEventListener('click', async () => {
  const status = document.getElementById('copy-status');
  try {
    await navigator.clipboard.writeText(document.getElementById('brief-template').textContent);
    status.textContent = '目标模板已复制。';
  } catch {
    status.textContent = '浏览器未允许复制，可直接选择右侧模板文本。';
  }
});
