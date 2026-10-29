/** Synchronous frame(t), backed by bounded reusable native slots and bounded inflation. */
import {readFileSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {createCanvas} from '@napi-rs/canvas';
import {insideRoot} from '../../files.mjs';
import {FOOTAGE} from './spec.mjs';
import {cacheRead} from './cache-read.mjs';
export const bytesHash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function framePool(){
 const slots=[];let tick=0,allocations=0;
 return {draw(ctx,store,index,rect){
  const key=`${store.folder}:${index}`,width=store.meta.decodeWidth,height=store.meta.decodeHeight,cost=width*height*8;
  let slot=slots.find(s=>s.key===key);
  if(!slot){
   const frame=store.frames[index],file=insideRoot(store.folder,frame.name),info=cacheRead(()=>lstatSync(file));
   if(!info.isFile()||info.isSymbolicLink()||info.size!==frame.bytes||info.size>FOOTAGE.maxFrameBytes)throw new Error('A cached footage frame changed; remove this media cache and prepare the recording again.');
   const block=cacheRead(()=>readFileSync(file));if(bytesHash(block)!==frame.sha256)throw new Error('A cached footage frame failed its checksum; remove this media cache and prepare it again.');
   let rgba;try{rgba=inflateRawSync(block,{maxOutputLength:width*height*4});}catch{throw new Error('A cached footage frame cannot be expanded safely; remove this media cache and prepare it again.');}
   if(rgba.length!==width*height*4)throw new Error('A cached footage frame is incomplete; remove this media cache and prepare it again.');
   slot=(slots.length>=4||slots.reduce((sum,s)=>sum+s.cost,0)+cost>FOOTAGE.memoryBytes)?slots.filter(s=>s.width===width&&s.height===height).sort((a,b)=>a.age-b.age)[0]:null;
   if(!slot){
    while(slots.length>=4||slots.reduce((sum,s)=>sum+s.cost,0)+cost>FOOTAGE.memoryBytes){const old=slots.reduce((a,b)=>a.age<b.age?a:b);slots.splice(slots.indexOf(old),1);old.canvas.width=1;old.canvas.height=1;}
    const canvas=createCanvas(width,height),context=canvas.getContext('2d');allocations++;slot={canvas,context,data:context.createImageData(width,height),width,height,cost,age:0};slots.push(slot);
   }
   slot.context.reset();slot.data.data.set(rgba);slot.context.putImageData(slot.data,0,0);slot.key=key;
  }
  slot.age=++tick;
  const x=width/store.meta.width,y=height/store.meta.height;
  ctx.drawImage(slot.canvas,rect.sx*x,rect.sy*y,rect.sw*x,rect.sh*y,rect.dx,rect.dy,rect.dw,rect.dh);
 },stats:()=>({slots:slots.length,retainedBytes:slots.reduce((sum,s)=>sum+s.cost,0),allocations})};
}
