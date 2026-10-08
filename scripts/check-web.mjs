import { checkPageLinks } from './lib/web-index.mjs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../_site/', import.meta.url));
const checked = await checkPageLinks(root);
console.log(`网页内部链接检查通过（${checked} 处）`);
