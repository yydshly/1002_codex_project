import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const folder=path.join(root,'versions/2026-10-07-capability-baseline-v5');
const replay=path.join(root,'web/versions/2026-10-07-fine-components-v5');
const digest=b=>createHash('sha256').update(b).digest('hex');
const archiveBytes=await fs.readFile(path.join(folder,'capabilities.json'));
const archive=JSON.parse(archiveBytes),manifest=JSON.parse(await fs.readFile(path.join(replay,'delivery-manifest.json')));
async function checkFiles(base,files){return Promise.all(files.map(async f=>{const absolute=path.resolve(base,f.path);if(!absolute.startsWith(base+path.sep))throw Error('Invalid archive path');const bytes=await fs.readFile(absolute);return {path:f.path,bytes:bytes.length,sha256:digest(bytes),passed:bytes.length===f.bytes&&digest(bytes)===f.sha256};}));}
const source=await checkFiles(path.join(folder,'source'),archive.sourceSnapshot),runtime=await checkFiles(replay,manifest.files);
const publicManifestMatches=archiveBytes.equals(await fs.readFile(path.join(root,'web/assets/capabilities/baseline-v5.json')));
const report={format:'tidewater-capability-archive-check.v1',checkedAt:new Date().toISOString(),passed:publicManifestMatches&&source.every(f=>f.passed)&&runtime.every(f=>f.passed),publicManifestMatches,capabilityGroups:archive.capabilities.length,sourceFiles:source.length,runtimeFiles:runtime.length,source,runtime};
await fs.writeFile(path.join(root,'checks/capability-archive-results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,capabilityGroups:report.capabilityGroups,sourceFiles:source.length,runtimeFiles:runtime.length}));if(!report.passed)process.exitCode=1;
