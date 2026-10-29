/** A local recorded video as a world: pure time, the existing camera/focus, and no source audio. */
import {fileURLToPath} from 'node:url';
import {ffprobeBeside} from '../../spawned.mjs';
import {readSpec,FOOTAGE} from './spec.mjs';
import {preparation} from './prepare.mjs';
import {framePool} from './pool.mjs';
import {fitRect,fittedBox} from './fit.mjs';
import {planRemap} from './remap.mjs';
export {FOOTAGE};
export function createFootageKit({ffmpeg=process.env.FFMPEG_BIN||'ffmpeg',ffprobe=ffprobeBeside(ffmpeg)}={}){
 if(typeof ffmpeg!=='string'||!ffmpeg||ffmpeg.includes('\0')||typeof ffprobe!=='string'||!ffprobe||ffprobe.includes('\0'))throw new Error('The footage media tools need executable paths; give installed ffmpeg and ffprobe paths.');
 const prepare=preparation({ffmpeg,ffprobe}),pool=framePool();
 return {name:'footage',sources:{entry:()=>[fileURLToPath(import.meta.url)]},story:{context:true,compile(given,context){
  const spec=readSpec(given);let store,map,rect,regions=[];
  const ensureReady=()=>{if(!store||!map)throw new Error('The recorded shot is not ready; use compileFilm and await it before drawing.');};
  const ready=prepare(context,spec).then(async value=>{
   store=value;for(const region of spec.regions)if(region.box[2]>store.meta.width||region.box[3]>store.meta.height)throw new Error('A named footage region is outside the recording pixels; move its box inside the actual video dimensions.');map=await planRemap(spec,context.clock,store.meta.seconds);rect=fitRect(store.meta.width,store.meta.height,spec.fit);
   regions=spec.regions.map(region=>{const box=fittedBox(region.box,rect);return {name:region.name,path:`regions.${region.name}`,label:region.name,box:[Math.max(0,box[0]),Math.max(0,box[1]),Math.min(1600,box[2]),Math.min(900,box[3])]};}).filter(region=>region.box[2]>region.box[0]&&region.box[3]>region.box[1]);
  });
  return {hang:1,ready,sounds:[],get preparation(){ensureReady();return {source:store.record,bounds:store.meta.record,remap:map.record};},regionsAt:()=>regions,draw(ctx,t){
   ensureReady();
   ctx.save();ctx.fillStyle=spec.background;ctx.fillRect(0,0,1600,900);
   const index=Math.max(0,Math.min(store.frameCount-1,Math.floor(map.videoAt(t)*spec.fps)));pool.draw(ctx,store,index,rect);ctx.restore();
  }};
 }}};
}
export const footageKit=createFootageKit();
