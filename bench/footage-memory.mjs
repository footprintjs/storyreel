#!/usr/bin/env node
/** Reproducible local-only experiment: two minutes of 1080p at 12 decoded fps, bounded images in both strategies. */
import {readFileSync,existsSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {spawned} from '../src/spawned.mjs';
import {outputFolder,writeOutput} from '../src/files.mjs';
import {RgbaFrames} from '../src/kits/footage/frame-stream.mjs';
import {createFootageKit} from '../src/kits/footage/index.mjs';
import {measureFile} from '../src/input-file.mjs';
import {makePainter} from '../src/paint.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function collected(command,args){const {child,finished}=spawned(command,args,{stdio:['ignore','pipe','pipe']});const chunks=[];let error='';child.stderr.on('data',b=>error=(error+b).slice(-800));for await(const b of child.stdout)chunks.push(b);if(await finished!==0)throw new Error(`Benchmark subprocess failed; check the local recording and tools: ${error}`);return Buffer.concat(chunks);}
if(process.argv[2]==='--production'){
  const [file,output]=process.argv.slice(3);if(!file||!output||existsSync(output))throw new Error('Give an existing recording and a new report path to preserve prior production measurements.');
  const root=path.dirname(path.resolve(file)),name=path.basename(file),source=await measureFile(root,name,{maxBytes:512*1024*1024},()=>{}),clock={start:()=>0,end:()=>120,at:x=>x};
  let peak=process.memoryUsage().rss;const sample=setInterval(()=>peak=Math.max(peak,process.memoryUsage().rss),20),start=performance.now();
  try{
    const world=createFootageKit().story.compile({kit:'footage',scene:'take',file:name,width:1920,fps:12},{root,clock,fileInput:(file,options)=>measureFile(root,file,options,()=>{})});await world.ready;
    const readySeconds=(performance.now()-start)/1000,canvas=createCanvas(960,540),ctx=canvas.getContext('2d'),paint=makePainter({film:{total:120,frame:(ctx,t)=>world.draw(ctx,t)},ctx,width:960,height:540,fps:12});
    const sequence=Array.from({length:180},(_,i)=>(i*173)%1440);let checksum='';const drawStart=performance.now();
    for(const index of sequence){paint(index/12);checksum+=ctx.getImageData(400,200,1,1).data.join(',');peak=Math.max(peak,process.memoryUsage().rss);}
    const report={kind:'actual-production-kit-and-painter',sourceSha256:source.sha256,sourceBytes:source.size,sequenceSeconds:120,width:1920,height:1080,fps:12,draws:sequence.length,readySeconds,drawSeconds:(performance.now()-drawStart)/1000,sampledPeakRssBytes:peak,maxRssKiB:process.resourceUsage().maxRSS,sequencePixelDigest:sha(checksum),preparation:world.preparation,scope:'Actual production kit, private cache and complete-frame painter; measured local mostly-static recording. RSS includes parent preparation/drawing, excludes subprocess RSS. Retained decoded budget is separate from process RSS; no general performance or savings claim.'};
    writeOutput(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,preparation:'saved in report'},null,2));
  }finally{clearInterval(sample);}
}else if(process.argv[2]==='--worker'){
  const [mode,folder]=process.argv.slice(3),manifest=JSON.parse(readFileSync(path.join(folder,'manifest.json'),'utf8'));
  const bytes=manifest.frames.reduce((sum,f)=>sum+f.bytes,0),cap=256*1024*1024;
  if(mode==='compressed-memory'&&bytes>cap){console.log(JSON.stringify({mode,status:'not-run',reason:'The complete compressed RGBA sequence exceeds the explicit 256 MiB compressed-memory cap.',compressedFrameBytes:bytes,capBytes:cap}));process.exit(0);}
  let peak=process.memoryUsage().rss;const start=performance.now(),buffers=mode==='compressed-memory'?manifest.frames.map(f=>readFileSync(path.join(folder,f.name))):null,images=new Map(),slots=Array.from({length:4},()=>{const canvas=createCanvas(1920,1080),ctx=canvas.getContext('2d');return {canvas,ctx,data:ctx.createImageData(1920,1080)};}),target=createCanvas(960,540),ctx=target.getContext('2d');
  const sequence=Array.from({length:180},(_,i)=>(i*173)%manifest.frames.length);let checksum='';
  for(const index of sequence){
    let image=images.get(index);
    if(!image){let slot;if(images.size===4){const first=images.keys().next().value;slot=images.get(first);images.delete(first);}else slot=slots[images.size];const block=buffers?.[index]??readFileSync(path.join(folder,manifest.frames[index].name));const rgba=inflateRawSync(block,{maxOutputLength:1920*1080*4});if(rgba.length!==1920*1080*4)throw new Error('The benchmark requires complete normalized RGBA frames; prepare them again.');slot.ctx.reset();slot.data.data.set(rgba);slot.ctx.putImageData(slot.data,0,0);image=slot;images.set(index,image);}
    ctx.reset();ctx.drawImage(image.canvas,0,0,960,540);checksum+=ctx.getImageData(400,200,1,1).data.join(',');
    peak=Math.max(peak,process.memoryUsage().rss);
  }
  console.log(JSON.stringify({mode,status:'measured',seconds:(performance.now()-start)/1000,peakRssBytes:peak,maxRssKiB:process.resourceUsage().maxRSS,draws:sequence.length,compressedBytesHeld:buffers?bytes:0,decodedImagesRetained:4,sequencePixelDigest:sha(checksum),compressedFrameBytes:bytes}));
}else{
  const [file,output]=process.argv.slice(2);if(!file||!output)throw new Error('Give an existing local two-minute 1080p recording and a new output folder.');
  if(existsSync(output))throw new Error('The benchmark output already exists; use a new folder to preserve earlier measurements.');
  const out=outputFolder(output,[]),frames=outputFolder(out,['frames']),source=readFileSync(file),start=performance.now();
  const meta=JSON.parse(await collected('/opt/homebrew/bin/ffprobe',['-v','error','-show_entries','format=duration:stream=width,height,codec_type','-of','json',file]));
  const video=meta.streams.find(s=>s.codec_type==='video');if(!video||video.width!==1920||video.height!==1080||Number(meta.format.duration)<120)throw new Error('Use an actual recording at least two minutes long and exactly 1920 by 1080.');
  const list=[],parser=new RgbaFrames({frameBytes:1920*1080*4,maxFrames:1440,onFrame:rgba=>{const block=deflateRawSync(rgba,{level:1}),name=`${String(list.length).padStart(6,'0')}.frame`;writeOutput(path.join(frames,name),block);list.push({name,bytes:block.length,sha256:sha(block)});}});
  const {child,finished}=spawned('/opt/homebrew/bin/ffmpeg',['-v','error','-threads','1','-i',file,'-t','120','-vf','fps=12','-an','-threads','1','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{stdio:['ignore','pipe','pipe']});let error='';child.stderr.on('data',b=>error=(error+b).slice(-800));for await(const b of child.stdout)parser.push(b);if(await finished!==0)throw new Error(`The benchmark decode failed; choose a readable recording: ${error}`);parser.end();
  if(list.length!==1440)throw new Error('The benchmark did not receive two minutes of frames; check the recording duration.');
  writeOutput(path.join(frames,'manifest.json'),JSON.stringify({frames:list}));const preparedSeconds=(performance.now()-start)/1000,results=[];
  for(const mode of ['disk','compressed-memory'])results.push(JSON.parse(await collected(process.execPath,['--expose-gc',fileURLToPath(import.meta.url),'--worker',mode,frames])));
  const report={sourceSha256:sha(source),sourceBytes:source.length,sourceSeconds:Number(meta.format.duration),measuredSeconds:120,width:1920,height:1080,fps:12,frames:list.length,preparedSeconds,compressedFrameBytes:list.reduce((sum,f)=>sum+f.bytes,0),results,scope:'Local mostly-static interface recording; separate worker process RSS excludes FFmpeg. File-system cache is warm after preparation. No general performance or savings claim.',unsafeDecodedArray:'Not allocated. Its plane size is calculated from measured dimensions/count, not presented as measured RSS.',decodedPlaneBytes:1920*1080*4*list.length};
  writeOutput(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
