import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createProject, directoryOf } from './lib/hub.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const { values } = parseArgs({ options: {
    slug: { type: 'string' }, name: { type: 'string' }, repo: { type: 'string' },
    summary: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log('用法：npm run new -- --slug <英文短名> --name "<项目名称>" --repo "https://github.com/owner/repo" [--summary "<摘要>"]');
  } else {
    const project = await createProject(root, values);
    console.log(`已创建 projects/${directoryOf(project)}/，总 README 索引已同步。`);
    console.log('下一步：填写研究文档，并按需在 projects/catalog.json 中添加封面与演示。');
  }
} catch (error) {
  console.error(`创建失败：${error.message}`);
  process.exitCode = 1;
}
