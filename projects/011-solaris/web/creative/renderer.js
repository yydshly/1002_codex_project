import { CANVAS, TARGETS, resampleStroke, strokeSpacing } from './core.js';

export const SOURCES = Object.freeze({
  cat: { file:'cat-fur.jpg', name:'猫的毛纹', author:'OboeBlanket', year:'2013', kind:'CC0真实实拍', source:'https://commons.wikimedia.org/wiki/File:Cat_in_towel.jpg', rect:[.53,.23,.13,.15] },
  wheat: { file:'wheat-cypresses.jpg', name:'麦田与柏树', author:'Vincent van Gogh', year:'1889', kind:'Met开放图像 · 公版', source:'https://www.metmuseum.org/art/collection/search/436535', rect:[0,0,1,1] },
  river: { file:'river-bridge.jpg', name:'维勒讷夫拉加伦桥', author:'Alfred Sisley', year:'1872', kind:'Met开放图像 · 公版', source:'https://www.metmuseum.org/art/collection/search/437680', rect:[0,0,1,1] },
});
const canvas = (width = CANVAS.width, height = CANVAS.height) => Object.assign(document.createElement('canvas'), { width, height });
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const hex = rgb => '#' + rgb.map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
const luminance = (r,g,b) => .2126*r + .7152*g + .0722*b;

export async function loadAssets() {
  const entries = [...Object.entries(SOURCES).map(([id, source]) => [id, source.file]), ['stilllife','still-life.jpg']];
  const results = await Promise.all(entries.map(async ([id, file]) => {
    const image = new Image(); image.src = new URL(`../assets/creative/${file}`, import.meta.url).href;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw Error('参考图片无法读取');
    return [id,image];
  }));
  return Object.fromEntries(results);
}

function paletteFromPixels(pixels) {
  const samples = [];
  for (let i=0; i<pixels.length; i+=16) samples.push([pixels[i],pixels[i+1],pixels[i+2]]);
  const sorted = [...samples].sort((a,b) => luminance(...a)-luminance(...b));
  let centers = [0,.22,.45,.68,.92].map(t => [...sorted[Math.floor((sorted.length-1)*t)]]);
  for (let iteration=0; iteration<7; iteration++) {
    const accumulators = centers.map(() => [0,0,0,0]);
    for (const pixel of samples) {
      let best=0, distance=Infinity;
      centers.forEach((center,index) => { const d=pixel.reduce((sum,value,axis) => sum+(value-center[axis])**2,0); if(d<distance){distance=d;best=index;} });
      const bucket=accumulators[best]; for(let axis=0;axis<3;axis++)bucket[axis]+=pixel[axis];bucket[3]++;
    }
    centers=centers.map((old,index)=>accumulators[index][3] ? accumulators[index].slice(0,3).map(x=>x/accumulators[index][3]) : old);
  }
  return centers.map(center => center.map(Math.round));
}

/** Read only the declared crop; the library image is never changed. */
export function sampleSource(image, rect) {
  const crop = canvas(128,128), ctx = crop.getContext('2d',{willReadFrequently:true});
  const [x,y,w,h]=rect;
  ctx.drawImage(image,x*image.naturalWidth,y*image.naturalHeight,w*image.naturalWidth,h*image.naturalHeight,0,0,128,128);
  const pixels=ctx.getImageData(0,0,128,128).data;
  let xx=0,yy=0,xy=0,energy=0;
  const lum=at=>luminance(pixels[at],pixels[at+1],pixels[at+2])/255;
  for(let row=1;row<127;row+=2)for(let col=1;col<127;col+=2){
    const at=(row*128+col)*4, gx=lum(at+4)-lum(at-4), gy=lum(at+512)-lum(at-512);
    xx+=gx*gx;yy+=gy*gy;xy+=gx*gy;energy+=Math.hypot(gx,gy);
  }
  const direction=(.5*Math.atan2(2*xy,xx-yy)+Math.PI/2+Math.PI)%Math.PI;
  const contrast=clamp(energy/(63*63),0,1);
  const palette=paletteFromPixels(pixels), stamp=canvas(128,128), sc=stamp.getContext('2d');
  sc.drawImage(crop,0,0);sc.globalCompositeOperation='destination-in';
  const fade=sc.createRadialGradient(64,64,46,64,64,64);fade.addColorStop(0,'#fff');fade.addColorStop(1,'#fff0');
  sc.fillStyle=fade;sc.fillRect(0,0,128,128);
  // Filaments take color and brightness from the crop, with a fixed arrangement.
  const paint=canvas(192,128), pc=paint.getContext('2d');
  const center=96;
  for(let lane=0;lane<44;lane++){
    const t=lane/43, y0=12+t*104, edge=Math.sqrt(Math.max(0,1-((t-.5)*2)**2));
    const color=palette[Math.floor(t*palette.length)%palette.length], start=center-82*edge+((lane*17)%9),end=center+82*edge-((lane*31)%12);
    pc.strokeStyle=hex(color);pc.globalAlpha=.45+.45*((lane*19)%23)/22;pc.lineWidth=1.1+(lane%4)*.5;
    pc.beginPath();pc.moveTo(start,y0);pc.bezierCurveTo(center-30,y0-3,center+35,y0+2,end,y0);pc.stroke();
  }
  pc.globalAlpha=.24;pc.globalCompositeOperation='soft-light';pc.drawImage(crop,0,0,192,128);
  pc.globalAlpha=1;pc.globalCompositeOperation='destination-in';
  const mask=pc.createRadialGradient(96,64,20,96,64,90);mask.addColorStop(0,'#fff');mask.addColorStop(.7,'#ffff');mask.addColorStop(1,'#fff0');pc.fillStyle=mask;pc.fillRect(0,0,192,128);
  return {crop,stamp,paint,palette,paletteHex:palette.map(hex),direction,contrast};
}

export class CreativeRenderer {
  constructor(target,images){
    this.canvas=target;this.ctx=target.getContext('2d');this.images=images;
    this.samples=new Map();this.layerCache=new Map();this.baseCache=new Map();
  }
  sample(source){
    const key=JSON.stringify(source);
    if(!this.samples.has(key)){
      if(this.samples.size>=48)this.samples.delete(this.samples.keys().next().value);
      this.samples.set(key,sampleSource(this.images[source.id],source.rect));
    }
    return this.samples.get(key);
  }
  base(id){
    if(this.baseCache.has(id))return this.baseCache.get(id);
    const layer=canvas(),ctx=layer.getContext('2d');ctx.fillStyle='#f4f0e5';ctx.fillRect(0,0,CANVAS.width,CANVAS.height);
    if(id==='stilllife'){
      const image=this.images.stilllife,scale=Math.min((CANVAS.width-32)/image.naturalWidth,(CANVAS.height-32)/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;
      ctx.drawImage(image,(CANVAS.width-w)/2,(CANVAS.height-h)/2,w,h);
    }else{
      // A fixed paper grain supports repeatable exports; it is authored, not a reference image.
      ctx.fillStyle='#5f624414';for(let i=0;i<11000;i++){const x=(i*373+47)%1200,y=(i*541+19)%900;ctx.fillRect(x,y,1,1);}
    }
    this.baseCache.set(id,layer);return layer;
  }
  drawStroke(ctx,stroke){
    const sample=this.sample(stroke.source),points=resampleStroke(stroke.points,strokeSpacing(stroke));
    ctx.save();ctx.beginPath();ctx.rect(...TARGETS[stroke.target]);ctx.clip();ctx.globalAlpha=stroke.opacity;
    for(let i=0;i<points.length;i++){
      const [x,y,pressure]=points[i],before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)];
      const angle=Math.atan2(after[1]-before[1],after[0]-before[0]);
      const size=stroke.size*(.55+.45*pressure);
      ctx.save();ctx.translate(x,y);
      if(stroke.mode==='texture'){
        ctx.rotate(angle*.18);ctx.drawImage(sample.stamp,-size/2,-size/2,size,size);
      }else{
        ctx.rotate(angle+sample.direction*.25);const spread=1.05+sample.contrast*1.8;
        ctx.drawImage(sample.paint,-size*spread/2,-size*.35,size*spread,size*.7);
      }
      ctx.restore();
    }
    ctx.restore();
  }
  render(state,preview=null){
    const ctx=this.ctx;ctx.clearRect(0,0,CANVAS.width,CANVAS.height);ctx.drawImage(this.base(state.base),0,0);
    for(const id of ['texture','paint']){
      const layer=state.layers.find(item=>item.id===id);if(!layer.visible)continue;
      const key=JSON.stringify(layer.strokes);let cache=this.layerCache.get(id);
      if(!cache||cache.key!==key){
        const image=canvas(),lc=image.getContext('2d');for(const stroke of layer.strokes)this.drawStroke(lc,stroke);
        cache={key,image};this.layerCache.set(id,cache);
      }
      ctx.drawImage(cache.image,0,0);if(preview?.mode===id)this.drawStroke(ctx,preview);
    }
  }
  preview(target,source,mode){
    const ctx=target.getContext('2d'),sample=this.sample(source);ctx.clearRect(0,0,target.width,target.height);
    ctx.fillStyle='#ebece0';ctx.fillRect(0,0,target.width,target.height);
    if(mode==='texture')ctx.drawImage(sample.crop,0,0,100,100);
    else{ctx.save();ctx.translate(88,50);ctx.rotate(sample.direction*.25);ctx.drawImage(sample.paint,-75,-40,150,80);ctx.restore();}
    if(mode==='texture')ctx.drawImage(sample.stamp,104,19,64,64);
  }
  png(){return this.canvas.toDataURL('image/png');}
}
