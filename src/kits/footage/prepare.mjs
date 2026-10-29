/** Open-descriptor admission and preparation choices, recorded once per footage input. */
import {closeSync,fstatSync} from 'node:fs';
import {flowChart,narrative} from 'footprintjs';
import {addDecider} from '../../decisions.mjs';
import {QUIET,plainNarrative} from '../../record.mjs';
import {openInput,hashDescriptor,sameFile} from '../../input-file.mjs';
import {mediaTool} from './process.mjs';
import {containerOf,metadata} from './meta.mjs';
import {cacheFolder,cachePresent,readCache,decodeCache,completeCache} from './cache.mjs';
import {bytesHash} from './pool.mjs';
import {FOOTAGE} from './spec.mjs';
import {preparationSlot} from './slots.mjs';
export function preparation(tools){
 const inFlight=new Map();let toolInfo=null;
 const info=deadline=>{
  if(!toolInfo){
   const pending=Promise.allSettled([mediaTool(tools.ffmpeg,['-version'],{deadline}),mediaTool(tools.ffmpeg,['-protocols'],{deadline}),mediaTool(tools.ffprobe,['-protocols'],{deadline})]).then(results=>{
    const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
    const [version,ffmpeg,ffprobe]=results.map(result=>result.value);
    if(!/^\s+fd\s*$/m.test(String(ffmpeg))||!/^\s+fd\s*$/m.test(String(ffprobe)))throw new Error('The media tools lack local descriptor input; choose installed FFmpeg and ffprobe builds with the fd protocol.');return bytesHash(version);
   });
   toolInfo=pending;pending.catch(()=>{if(toolInfo===pending)toolInfo=null;});
  }
  return toolInfo;
 };
 return async(context,spec)=>{
  const release=await preparationSlot();let opened,decodeOpened;
  try{
  const deadline=Date.now()+FOOTAGE.timeoutMs;
  if(typeof context.fileInput!=='function')throw new Error('The footage kit needs the current file-input context; use it through the current compileFilm API.');
  const input=await context.fileInput(spec.file,{maxBytes:FOOTAGE.maxBytes});opened=openInput(context.root,spec.file,FOOTAGE.maxBytes);decodeOpened=openInput(context.root,spec.file,FOOTAGE.maxBytes);
  if(!sameFile(opened.stat,decodeOpened.stat))throw new Error('The recording changed while descriptors were admitted; make a stable local copy and compile again.');
  let store,meta,expected,folder;const trace=narrative();
  const run=async()=>{
   let chart=flowChart('admit recording',async s=>{
    const measured=await hashDescriptor(opened.fd,FOOTAGE.maxBytes),decodeMeasured=await hashDescriptor(decodeOpened.fd,FOOTAGE.maxBytes);
    if(measured.sha256!==input.sha256||measured.size!==input.size||decodeMeasured.sha256!==input.sha256||decodeMeasured.size!==input.size)throw new Error('The recording changed after its input hash was measured; make a stable local copy and compile again.');
    const decoder=await info(deadline),container=containerOf(opened.fd);meta=await metadata(opened.fd,container,spec,tools,deadline);
    expected={key:bytesHash(JSON.stringify({v:1,codec:'rgba-deflate-v1',source:input.sha256,fps:spec.fps,width:meta.decodeWidth,height:meta.decodeHeight,decoder})),sourceSha256:input.sha256,fps:spec.fps};
    folder=cacheFolder(context.root,expected.key);s.cached=cachePresent(folder);s.container=container;s.sourceSha256=input.sha256;s.width=meta.decodeWidth;s.height=meta.decodeHeight;s.fps=spec.fps;
   },'admit-recording','Paired admitted descriptors, their measured bytes, source bounds and decoder identity');
   chart=addDecider(chart,{name:'reuse frames',id:'reuse-frames',key:'cacheChoice',description:'Reuse only a complete matching private cache',table:{rules:[{when:{cached:{eq:true}},then:'reuse',label:'A completion manifest exists; validate this recording cache'}],fallback:{branch:'decode',label:'Prepare the admitted recording before drawing'}}});
   chart=chart.addFunction('prepare cache',async s=>{
    if(s.cacheChoice==='reuse')store=readCache(folder,expected,meta);
    else{const value=await decodeCache(decodeOpened.fd,s.container,folder,expected,meta,tools,deadline);const after=await hashDescriptor(opened.fd,FOOTAGE.maxBytes);if(after.sha256!==input.sha256||!sameFile(opened.stat,fstatSync(opened.fd))||!sameFile(decodeOpened.stat,fstatSync(decodeOpened.fd)))throw new Error('The recording changed during decode; remove the incomplete cache and compile a stable copy.');store={...value,folder,meta};}
    s.decodedFrames=store.frameCount;s.cacheBytes=store.frames.reduce((sum,f)=>sum+f.bytes,0);
   },'prepare-cache','Check cache entries or decode bounded compressed frames; no source audio')
   .addFunction('complete cache',s=>{if(s.cacheChoice==='decode')completeCache(folder,store,plainNarrative(trace));},'complete-cache','Publish the completion manifest only after source identity was rechecked');
   try{await chart.setLogger(QUIET).build().recorder(trace).run();}catch(error){error.record=plainNarrative(trace);throw error;}
   return {...store,record:plainNarrative(trace)};
  };
  // Concurrent worlds using exactly the same input and decode settings share only this in-flight preparation.
  const identity=JSON.stringify([context.root,input.sha256,spec.fps,spec.width]);
  if(!inFlight.has(identity))inFlight.set(identity,run().finally(()=>inFlight.delete(identity)));return await inFlight.get(identity);
  }finally{try{if(opened)closeSync(opened.fd);}finally{try{if(decodeOpened)closeSync(decodeOpened.fd);}finally{release();}}}
 };
}
