import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync,readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const puppeteer=require(process.env.SHADCN_AUTOMATION_MODULE||'puppeteer-core');
const chrome=process.env.SHADCN_CHROME_PATH||[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).map(base=>resolve(base,'Google/Chrome/Application/chrome.exe')).find(existsSync);
assert.ok(chrome,'Chrome required; set SHADCN_CHROME_PATH for another installation.');
const url=process.env.SHADCN_PREVIEW_URL||'http://127.0.0.1:4193/projects/009-shadcn-admin/';
const renderOnly=process.argv.includes('--render-only');
const hash=data=>createHash('sha256').update(data).digest('hex');
const report={status:'running',startedAt:new Date().toISOString(),previewUrl:url,method:'Native SVG rendered by Chromium; local research page browser verification',checks:[],errors:[]};
const record=()=>writeFileSync(resolve(project,'notes/web-verification.json'),JSON.stringify(report,null,2)+'\n');
mkdirSync(resolve(project,'web/assets'),{recursive:true});
mkdirSync(resolve(project,'assets/verification'),{recursive:true});
const check=async(name,run)=>{const data=await run();report.checks.push({name,status:'passed',...data});console.log('PASS '+name);};
let browser;
try{
  browser=await puppeteer.launch({executablePath:chrome,headless:true,userDataDir:resolve(project,'tools/.browser-profile'),args:['--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check']});
  const graph=await browser.newPage();
  await graph.setViewport({width:1600,height:2180,deviceScaleFactor:2});
  await graph.goto(pathToFileURL(resolve(project,'assets/shadcn-admin-understanding.svg')).href,{waitUntil:'load'});
  await graph.evaluate(async()=>{await document.fonts.ready;});
  await check('Diagram text fits the canvas and covers all eight modules',async()=>{
    const data=await graph.evaluate(()=>{
      const svg=document.querySelector('svg'),bounds=svg.viewBox.baseVal;
      const texts=[...svg.querySelectorAll('text')].map(node=>{const b=node.getBBox();return{text:node.textContent,box:{x:b.x,y:b.y,width:b.width,height:b.height}};});
      return{width:bounds.width,height:bounds.height,texts,overflow:texts.filter(({box:b})=>b.x<0||b.y<0||b.x+b.width>bounds.width||b.y+b.height>bounds.height)};
    });
    assert.deepEqual(data.overflow,[]);
    for(const token of ['仪表盘','任务','用户','聊天','应用 Apps','设置','认证','错误页面'])assert.ok(data.texts.some(({text})=>text.includes(token)),token);
    return{width:data.width,height:data.height,textNodes:data.texts.length,overflow:0};
  });
  const png=Buffer.from(await(await graph.$('svg')).screenshot({path:resolve(project,'assets/shadcn-admin-understanding.png'),type:'png'}));
  for(const ext of ['svg','png'])copyFileSync(resolve(project,`assets/shadcn-admin-understanding.${ext}`),resolve(project,`web/assets/shadcn-admin-understanding.${ext}`));
  report.image={width:png.readUInt32BE(16),height:png.readUInt32BE(20),bytes:png.length,sha256:hash(png),svgSha256:hash(readFileSync(resolve(project,'assets/shadcn-admin-understanding.svg')))};
  await graph.close();
  if(!renderOnly){
    const page=await browser.newPage();
    page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});
    await page.setViewport({width:1440,height:1000});await page.goto(url,{waitUntil:'networkidle0'});
    await check('Page includes modules, reuse, value and source evidence',async()=>{
      assert.equal(await page.$$eval('.module',n=>n.length),8);
      for(const id of ['map','principles','adapt','value','boundaries','sources'])assert.ok(await page.$('#'+id),id);
      assert.equal(await page.$eval('#png-download',n=>n.hasAttribute('download')),true);
      return{modules:8,adaptationSteps:await page.$$eval('.adapt-steps li',n=>n.length),valueDirections:await page.$$eval('.value-grid article',n=>n.length)};
    });
    await check('Local resources, downloads, anchors and research index resolve',async()=>{
      const links=await page.evaluate(async()=>Promise.all([...new Set([...document.querySelectorAll('a[href],img[src],link[href]')].map(n=>n.getAttribute('href')||n.getAttribute('src')).filter(h=>h&&!h.startsWith('https:')&&!h.startsWith('#')))].map(async href=>({href,status:(await fetch(href)).status}))));
      assert.ok(links.every(l=>l.status===200),JSON.stringify(links));
      assert.deepEqual(await page.$$eval('a[href^="#"]',links=>links.map(l=>l.getAttribute('href').slice(1)).filter(id=>!document.getElementById(id))),[]);
      assert.ok((await(await fetch(new URL('../../',url))).text()).includes('009-shadcn-admin'));
      return{localLinks:links.length,missingAnchors:0,projectInIndex:true};
    });
    await check('Diagram loads and native FAQ disclosure operates',async()=>{
      await page.$eval('#understanding-map',n=>n.scrollIntoView());await page.waitForFunction(()=>{const n=document.getElementById('understanding-map');return n.complete&&n.naturalWidth>0;});
      const detail=await page.$('.faq details:not([open])');assert.ok(detail);await(await detail.$('summary')).click();assert.equal(await detail.evaluate(n=>n.open),true);
      return{loadedImage:true,disclosureOpened:true};
    });
    await check('Desktop and mobile layouts have no page overflow',async()=>{
      for(const width of [1440,768,390,320]){
        await page.setViewport({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'overflow at '+width);
        if([1440,390].includes(width)){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:resolve(project,`assets/verification/page-${width}.png`),fullPage:true});await page.screenshot({path:resolve(project,`assets/verification/first-screen-${width}.png`)});}
      }
      return{viewports:[1440,768,390,320],pageOverflow:0};
    });
    await check('Browser and local resources have no errors',async()=>{assert.deepEqual(report.errors,[]);return{errors:0};});
  }
  report.status=renderOnly?'rendered':'passed';report.completedAt=new Date().toISOString();
  console.log(`Diagram exported ${report.image.width} x ${report.image.height}, ${(report.image.bytes/1024/1024).toFixed(2)} MiB`);
}catch(error){report.status='failed';report.error=error.message;throw error;}finally{record();await browser?.close();}
