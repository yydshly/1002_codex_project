import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const upstream=path.join(root,'upstream','TripoSR-main');
const changes=[];
async function modify(filename,from,to,note){
  const target=path.join(upstream,filename);const original=await fs.readFile(target,'utf8');
  if(!original.includes(from))throw Error(`Expected upstream content not found: ${filename}`);
  const modified=original.replace(from,to);await fs.writeFile(target,modified);
  changes.push({filename,originalSha256:createHash('sha256').update(original).digest('hex'),modifiedSha256:createHash('sha256').update(modified).digest('hex'),note});
}
await modify('tsr/models/isosurface.py','from torchmcubes import marching_cubes',`from skimage.measure import marching_cubes as skimage_marching_cubes

# Windows adapter: the pretrained neural density field is unchanged.
# skimage returns tensor-axis coordinates; the upstream helper reverses XYZ.
def marching_cubes(level, threshold):
    vertices, faces, _, _ = skimage_marching_cubes(level.cpu().numpy(), level=threshold)
    return torch.from_numpy(vertices[:, [2, 1, 0]].copy()), torch.from_numpy(faces.copy().astype(np.int64))`,
  'Replace only the isosurface extraction backend with standard CPU scikit-image marching cubes; keep neural weights and density queries unchanged.');
await modify('tsr/utils.py','import rembg',`try:
    import rembg
except ImportError:
    rembg = None`, 'Transparent input is required by the local adapter; no background-removal model or global installation is needed.');
await modify('tsr/bake_texture.py','positions = torch.tensor(positions_texture.reshape(-1, 4)[:, :-1])','positions = torch.tensor(positions_texture.reshape(-1, 4)[:, :-1], device=scene_code.device)', 'Place texture density-query positions on the same device as the real neural scene code.');
await modify('tsr/bake_texture.py','rgb_f = queried_grid["color"].numpy().reshape(-1, 3)','rgb_f = queried_grid["color"].detach().cpu().numpy().reshape(-1, 3)', 'Read neural texture colors back from CUDA for texture encoding.');
await fs.copyFile(path.join(upstream,'LICENSE'),path.join(root,'TRIPOSR-LICENSE.txt'));
await fs.writeFile(path.join(root,'upstream-adaptations.json'),JSON.stringify({source:'https://github.com/VAST-AI-Research/TripoSR',preparedAt:new Date().toISOString(),changes},null,2));
console.log(JSON.stringify({adaptations:changes.length,neuralArchitectureChanged:false}));
