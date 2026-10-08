import {createRealisticScene} from './realistic/scene.js';
export async function openCampScene({canvas,proposal,variantId,onSelect,onProgress,viewState}){
 const variant=proposal.variants.find(v=>v.id===variantId)||proposal.variants[0],candidate=variant.candidate;
 const scene=await createRealisticScene({canvas,plan:proposal.sourcePlan,completionRecipe:candidate?.recipe??null,mode:candidate?'realistic':'coarse',onSelect,onProgress});
 if(candidate){scene.setWorldQuality(true);scene.applyFineGeometry(candidate.geometry);scene.setLighting(candidate.recipe.environment.lighting);}
 scene.setView('overview');if(viewState)scene.setViewState(viewState);return scene;
}
export function applyCampView(scene,view){if(view.state)scene.setViewState(view.state);else if(view.entityId)scene.focusEntity(view.entityId);else scene.setView(view.preset);}
export function campLayoutImage(plan,objects){
 const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=Math.round(1000*plan.world.depth/plan.world.width);const ctx=canvas.getContext('2d'),colors={land:'#b7bea0',water:'#72a7b7',road:'#dbc6a0',cabin:'#986947',palm:'#548158',boat:'#e3cda8',lighthouse:'#eeeeee'};
 ctx.fillStyle='#c5dfe4';ctx.fillRect(0,0,canvas.width,canvas.height);
 for(const e of plan.entities){ctx.beginPath();e.points.forEach((p,i)=>i?ctx.lineTo(p.x*canvas.width,p.y*canvas.height):ctx.moveTo(p.x*canvas.width,p.y*canvas.height));ctx.fillStyle=colors[e.kind];ctx.strokeStyle=colors[e.kind];ctx.lineWidth=e.kind==='road'?12:2;if(['land','water'].includes(e.kind)){ctx.closePath();ctx.fill();}else if(e.kind==='road')ctx.stroke();else{const p=e.points[0];ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,9,0,Math.PI*2);ctx.fill();ctx.fillStyle='#183d36';ctx.font='16px system-ui';ctx.fillText(objects.find(o=>o.id===e.id)?.name??e.id,p.x*canvas.width+12,p.y*canvas.height-9);}}
 ctx.fillStyle='#183d36';ctx.font='18px system-ui';ctx.fillText(`${plan.world.width}×${plan.world.depth}米 · 语义布局，位置/高度以plan为准`,20,30);return canvas.toDataURL('image/png');
}
