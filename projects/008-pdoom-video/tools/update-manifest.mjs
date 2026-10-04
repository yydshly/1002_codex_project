import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=JSON.parse(await readFile(path.join(root,'upstream/source.json'),'utf8'));
const files=[];
async function walk(folder){for(const entry of await readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())await walk(file);else if(entry.name.endsWith('.js')){const content=await readFile(file);files.push({path:path.relative(path.join(root,'web'),file).split(path.sep).join('/'),bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')});}}}
await walk(path.join(root,'web/vendor/pdoom'));
for(const name of ['p5.min.js','p5.brush.js']){const file=path.join(root,'web/vendor',name),content=await readFile(file);files.push({path:'vendor/'+name,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')});}
const manifest={repository:source.repository,commit:source.commit,researchDate:'2026-10-04',sourceDate:source.sourceDate,upstreamChanges:'绘画、角色、时间轴与九章代码原样保存；source-studio.html 是本地加载包装页，字体采用系统回退。',license:{upstream:'package.json 声明 ISC；固定版本没有独立 LICENSE 文件。',dependencies:[{name:'p5',version:'2.3.3',license:'LGPL-2.1',notice:'vendor/p5-LICENSE.txt',source:'https://github.com/processing/p5.js'},{name:'p5.brush',version:'2.2.3',license:'MIT',notice:'vendor/p5.brush-LICENSE.md',source:'https://github.com/acamposuribe/p5.brush'}]},excluded:source.excluded,media:'本机原画静帧与三秒无声短片；新增点亮一盏灯场景有三种风格的六秒无声成片，复用上游角色与绘画代码；原作音乐与完整成片通过作者外部入口访问。',localDemo:'lab.js 使用原生 Canvas 另行编写，用于原理示意；example-scene.js 新写分镜、动作与道具，复用 core.js 和 clawd.js，独立包装绘画和合成以展示三种风格及上色过程；elements-scene.js 另写目录与驱动包装，调用原始共享组件和章节 CAST 接口，提供 14 张预览及角色参数控制台。',files};
await writeFile(path.join(root,'web/vendor/pdoom/source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Recorded ${files.length} pinned browser files and dependency notices.`);
