/** Private, corruption-checked compressed RGBA cache. A completion manifest is the last write. */
import {existsSync,lstatSync,readFileSync,readdirSync} from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import path from 'node:path';
import {outputFolder,insideRoot,writeOutput} from '../../files.mjs';
import {RgbaFrames} from './frame-stream.mjs';
import {mediaTool,descriptorInput} from './process.mjs';
import {FOOTAGE} from './spec.mjs';
import {bytesHash} from './pool.mjs';
import {cacheRead} from './cache-read.mjs';
const NAME=/^[0-9]{6}\.frame$/;
export function cacheFolder(root,key){return outputFolder(root,['.storyreel-footage',key]);}
export function cachePresent(folder){return existsSync(path.join(folder,'manifest.json'));}
export function readCache(folder,expected,meta){
 const file=path.join(folder,'manifest.json'),info=cacheRead(()=>lstatSync(file));
 if(!info.isFile()||info.isSymbolicLink()||info.size>8*1024*1024)throw new Error('The media cache manifest is invalid or too large; remove this cache and prepare the recording again.');
 let value;try{value=JSON.parse(readFileSync(file,'utf8'));}catch{throw new Error('The media cache manifest is unreadable; remove this cache and prepare the recording again.');}
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('The media cache manifest is invalid; remove this cache and prepare the recording again.');
 if(value.schemaVersion!==1||value.sourceSha256!==expected.sourceSha256||value.key!==expected.key||value.codec!=='rgba-deflate-v1'||value.width!==meta.decodeWidth||value.height!==meta.decodeHeight||value.fps!==expected.fps||!Array.isArray(value.frames)||value.frameCount!==value.frames.length||value.frames.length<Math.max(1,Math.floor(meta.seconds*expected.fps))||value.frames.length>FOOTAGE.maxFrames)throw new Error('The media cache does not describe this complete recording; remove this cache and prepare it again.');
 let bytes=0;
 for(let i=0;i<value.frames.length;i++){
  const frame=value.frames[i];
  if(!frame||typeof frame!=='object'||Array.isArray(frame)||frame.name!==`${String(i).padStart(6,'0')}.frame`||!NAME.test(frame.name)||!Number.isSafeInteger(frame.bytes)||frame.bytes<1||frame.bytes>FOOTAGE.maxFrameBytes||typeof frame.sha256!=='string'||!/^[a-f0-9]{64}$/.test(frame.sha256))throw new Error('A media cache frame entry is invalid; remove this cache and prepare the recording again.');
  const target=insideRoot(folder,frame.name),stat=cacheRead(()=>lstatSync(target));
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==frame.bytes)throw new Error('A media cache frame is missing or changed; remove this cache and prepare the recording again.');
  bytes+=frame.bytes;if(bytes>FOOTAGE.maxCacheBytes)throw new Error('The media cache exceeds its byte limit; remove it and reduce footage fps or width.');
 }
 const allowed=new Set(['manifest.json',...value.frames.map(frame=>frame.name)]);
 if(cacheRead(()=>readdirSync(folder)).some(name=>!allowed.has(name)))throw new Error('The media cache contains unexpected files; choose a clean private cache folder by removing this incomplete media cache.');
 return {...value,folder,meta};
}
export async function decodeCache(fd,container,folder,expected,meta,tools,deadline){
 if(cacheRead(()=>readdirSync(folder)).length)throw new Error('An incomplete media cache already exists; remove that cache folder before preparing the recording again.');
 const frames=[];let total=0;
 const reader=new RgbaFrames({frameBytes:meta.decodeWidth*meta.decodeHeight*4,maxFrames:Math.min(FOOTAGE.maxFrames,Math.ceil(meta.seconds*expected.fps)+1),onFrame:rgba=>{
  const block=deflateRawSync(rgba,{level:1});total+=block.length;
  if(block.length>FOOTAGE.maxFrameBytes||total>FOOTAGE.maxCacheBytes)throw new Error('The decoded media cache is too large; remove the incomplete cache and reduce footage fps or width.');
  const name=`${String(frames.length).padStart(6,'0')}.frame`;writeOutput(path.join(folder,name),block);frames.push({name,bytes:block.length,sha256:bytesHash(block)});
 }});
 await mediaTool(tools.ffmpeg,['-v','error','-threads','1',...descriptorInput(container),'-map','0:v:0','-an','-vf',`fps=${expected.fps},scale=${meta.decodeWidth}:${meta.decodeHeight}:flags=area`,'-threads','1','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{fd,deadline,maxBytes:FOOTAGE.maxFrames*meta.decodeWidth*meta.decodeHeight*4,onChunk:bytes=>reader.push(bytes)});
 reader.end();if(frames.length<Math.max(1,Math.floor(meta.seconds*expected.fps)))throw new Error('The video ended before its advertised duration; remove the incomplete cache and use a complete recording.');
 return {schemaVersion:1,key:expected.key,sourceSha256:expected.sourceSha256,codec:'rgba-deflate-v1',width:meta.decodeWidth,height:meta.decodeHeight,fps:expected.fps,frameCount:frames.length,frames};
}
export function completeCache(folder,value,record){writeOutput(path.join(folder,'manifest.json'),JSON.stringify({...value,record},null,2)+'\n');}
