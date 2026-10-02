import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { synchronize, buildSite } from './lib/hub.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2];
try {
  if (!['sync', 'check', 'build'].includes(command)) throw new Error('用法：node scripts/catalog.mjs <sync|check|build>');
  const catalog = command === 'build' ? await buildSite(root) : await synchronize(root, command === 'check');
  const messages = { sync: 'README 索引已同步', check: '清单与 README 检查通过', build: '展示站点已生成到 _site/' };
  console.log(`${messages[command]}（${catalog.projects.length} 个项目）`);
} catch (error) {
  console.error(`失败：${error.message}`);
  process.exitCode = 1;
}
