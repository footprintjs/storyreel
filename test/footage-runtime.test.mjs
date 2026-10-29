import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,readdirSync,symlinkSync,chmodSync,existsSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {deflateRawSync} from 'node:zlib';
import path from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {tempDir} from './tmp.mjs';
import {framePool,bytesHash} from '../src/kits/footage/pool.mjs';
import {mediaTool,descriptorInput} from '../src/kits/footage/process.mjs';
import {createFootageKit} from '../src/kits/footage/index.mjs';
import {measureFile} from '../src/input-file.mjs';
import {makePainter} from '../src/paint.mjs';
import {FOOTAGE} from '../src/kits/footage/spec.mjs';
import {readCache} from '../src/kits/footage/cache.mjs';
import {makeFilm,wholeVideo} from '../src/index.mjs';

const rect={sx:0,sy:0,sw:1600,sh:900,dx:0,dy:0,dw:1600,dh:900};
const pixel=ctx=>[...ctx.getImageData(10,10,1,1).data];
function stored(t,width,height,count=8){
 const folder=tempDir('footage-pool',t),frames=[];
 for(let i=0;i<count;i++){const rgba=Buffer.alloc(width*height*4);for(let p=0;p<rgba.length;p+=4){rgba[p]=i*29;rgba[p+1]=99;rgba[p+2]=17;rgba[p+3]=255;}const block=deflateRawSync(rgba,{level:1}),name=`${String(i).padStart(6,'0')}.frame`;writeFileSync(path.join(folder,name),block);frames.push({name,bytes:block.length,sha256:bytesHash(block)});}
 return {folder,frames,meta:{width:1600,height:900,decodeWidth:width,decodeHeight:height}};
}
test('frame pool reuses byte-limited square slots and seeks deterministically after eviction',t=>{
 const store=stored(t,1920,1920),pool=framePool(),ctx=createCanvas(1600,900).getContext('2d');
 const results=[];for(const i of [0,1,2,3,4,5,6,7,0]){ctx.reset();pool.draw(ctx,store,i,rect);results.push(pixel(ctx));}
 assert.deepEqual(results[0],results.at(-1));assert.notDeepEqual(results[0],results[1]);
 assert.equal(pool.stats().allocations,2,'native slots are reused when bytes, rather than count, set capacity');
 assert.equal(pool.stats().slots,2);assert(pool.stats().retainedBytes<=FOOTAGE.memoryBytes);
});
test('mixed-dimension recordings stay within the retained budget; corrupt blocks are refused before drawing',t=>{
 const a=stored(t,320,180,5),b=stored(t,640,360,5),pool=framePool(),ctx=createCanvas(1600,900).getContext('2d');
 for(let i=0;i<5;i++){ctx.reset();pool.draw(ctx,i%2?a:b,i,rect);assert(pool.stats().slots<=4);assert(pool.stats().retainedBytes<=FOOTAGE.memoryBytes);}
 const bad=Buffer.alloc(a.frames[0].bytes,42);writeFileSync(path.join(a.folder,a.frames[0].name),bad);
 assert.throws(()=>pool.draw(ctx,a,0,rect),/checksum.*remove/i);
});
test('each complete painter frame releases old context state and matches an isolated seek',()=>{
 const film={total:3,frame(ctx,t){ctx.fillStyle=t<1?'#e34a28':'#2469cf';ctx.fillRect(0,0,1600,900);ctx.globalAlpha=.2;ctx.translate(500,500);ctx.beginPath();ctx.rect(0,0,3,3);ctx.clip();}};
 const canvas=createCanvas(160,90),ctx=canvas.getContext('2d'),paint=makePainter({film,width:160,height:90,fps:12,ctx});
 paint(0);const first=Buffer.from(ctx.getImageData(0,0,160,90).data);paint(2);paint(0);
 assert.deepEqual(Buffer.from(ctx.getImageData(0,0,160,90).data),first);
 const other=createCanvas(160,90).getContext('2d');makePainter({film,width:160,height:90,fps:12,ctx:other})(2);
 paint(2);assert.deepEqual(Buffer.from(ctx.getImageData(0,0,160,90).data),Buffer.from(other.getImageData(0,0,160,90).data));
 assert.equal(ctx.globalAlpha,.2,'a film may leave state internally; the next complete frame starts fresh');
});
test('media tools are bounded, killed and awaited on timeout or excessive output',async t=>{
 const folder=tempDir('footage-child',t),marker=path.join(folder,'late');
 await assert.rejects(mediaTool(process.execPath,['-e',`setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'ran'),2000)`],{deadline:Date.now()+50}),/timed out.*trim/i);
 await assert.rejects(mediaTool(process.execPath,['-e','process.stdout.write(Buffer.alloc(20000))'],{deadline:Date.now()+2000,maxBytes:10}),/output limit.*trim/i);
 assert.equal(existsSync(marker),false);
 await assert.rejects(mediaTool(path.join(folder,'absent'),[],{deadline:Date.now()+2000}),/missing.*set/i);
 await assert.rejects(mediaTool(process.execPath,['-e','process.exit(1)'],{deadline:Date.now()+2000}),/decoded.*choose/i);
});
test('decoder inputs disable URLs, playlists and external MOV data references',()=>{
 for(const container of ['mov','matroska'])assert.deepEqual(descriptorInput(container).slice(0,4),['-protocol_whitelist','fd,pipe','-f',container]);
 const mov=descriptorInput('mov');assert.equal(mov[mov.indexOf('-enable_drefs')+1],'0');assert.equal(mov[mov.indexOf('-use_absolute_path')+1],'0');
});
test('malformed cache manifests refuse with an actionable fix rather than a runtime type error',t=>{
 const folder=tempDir('footage-manifest',t),expected={key:'fixed',sourceSha256:'a'.repeat(64),fps:1},meta={decodeWidth:2,decodeHeight:2,seconds:1};
 const valid={schemaVersion:1,key:expected.key,sourceSha256:expected.sourceSha256,codec:'rgba-deflate-v1',width:2,height:2,fps:1,frameCount:1,frames:[{name:'000000.frame',bytes:1,sha256:'a'.repeat(64)}]};
 for(const value of [null,3,'text',[],{}, {...valid,frames:[null]},{...valid,frames:[{...valid.frames[0],sha256:{toString:'bad'}}]}]){
  writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(value));assert.throws(()=>readCache(folder,expected,meta),/cache.*(invalid|describe|entry).*remove|cache.*remove.*prepare/i);
 }
 writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(valid));assert.throws(()=>readCache(folder,expected,meta),/cache.*missing.*remove|cache.*changed.*remove/i);
 const store=stored(t,2,2,1);unlinkSync(path.join(store.folder,store.frames[0].name));assert.throws(()=>framePool().draw(createCanvas(10,10).getContext('2d'),store,0,rect),/cache.*missing.*remove|cache.*changed.*remove/i);
});
test('admission reserves concurrency before starting file hashing',async()=>{
 const kit=createFootageKit({ffmpeg:'/not-used',ffprobe:'/not-used'});let starts=0,release;
 const pending=new Promise(resolve=>release=resolve),clock={start:()=>0,end:()=>1,at:x=>x};
 const context={root:process.cwd(),clock,fileInput(){starts++;return pending;}};
 const worlds=Array.from({length:32},()=>kit.story.compile({kit:'footage',scene:'take',file:'not-used.webm'},context));
 const extra=kit.story.compile({kit:'footage',scene:'take',file:'not-used.webm'},context);await assert.rejects(extra.ready,/Too many.*use fewer/i);assert.equal(starts,2,'only active preparations may hash; the remaining thirty requests are queued');
 release({sha256:'0'.repeat(64),size:0});await Promise.all(worlds.map(world=>assert.rejects(world.ready)));
});
test('preparation slots are shared across kit factories and released when admission fails',async()=>{
 let starts=0,release;const block=new Promise(resolve=>release=resolve),clock={start:()=>0,end:()=>1,at:x=>x};
 const context={root:process.cwd(),clock,fileInput(){starts++;return starts<=2?block:Promise.reject(Error('Expected failed admission'));}};
 const worlds=Array.from({length:3},()=>createFootageKit({ffmpeg:'/not-used',ffprobe:'/not-used'}).story.compile({kit:'footage',scene:'take',file:'not-used.webm'},context));
 const caught=worlds.map(world=>world.ready.then(()=>false,()=>true));await new Promise(resolve=>setImmediate(resolve));assert.equal(starts,2);
 release({sha256:'0'.repeat(64),size:0});assert.deepEqual(await Promise.all(caught),[true,true,true]);assert.equal(starts,3,'the queued request gets its slot after a failure');
});

const ffmpeg=process.env.FFMPEG_BIN||'ffmpeg',ffprobe=process.env.FFPROBE_BIN||'ffprobe';
const fdTools=[ffmpeg,ffprobe].every(cmd=>{const r=spawnSync(cmd,['-protocols'],{encoding:'utf8',timeout:10000});return r.status===0&&/^\s+fd\s*$/m.test(r.stdout);});
const skip=fdTools?false:'installed FFmpeg and ffprobe need the fd protocol for actual local-media checks';
function source(t,ext){
 const root=tempDir('footage-real',t),file=`input.${ext}`;
 const args=['-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=4:duration=1','-f','lavfi','-i','sine=frequency=440:duration=1','-shortest','-c:v',ext==='mp4'?'libx264':'libvpx-vp9','-threads','1','-c:a',ext==='mp4'?'aac':'libopus',path.join(root,file)];
 const r=spawnSync(ffmpeg,args,{encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stderr);return {root,file};
}
function worldAt(kit,root,file,extra={}){const clock={start:()=>0,end:()=>1,at:x=>x};return kit.story.compile({kit:'footage',scene:'take',file,width:320,fps:4,...extra},{root,clock,fileInput:(f,limits)=>measureFile(root,f,limits,()=>{})});}
for(const ext of ['mp4','webm'])test(`real ${ext}: source audio is omitted, complete frames cache and random seeks agree`,{skip},async t=>{
 const {root,file}=source(t,ext),kit=createFootageKit({ffmpeg,ffprobe}),world=worldAt(kit,root,file);await world.ready;
 assert.deepEqual(world.sounds,[]);const ctx=createCanvas(1600,900).getContext('2d'),snap=[];
 for(const at of [0,.25,.5,.75,0]){ctx.reset();world.draw(ctx,at);snap.push(bytesHash(ctx.getImageData(0,0,1600,900).data));}assert.equal(snap[0],snap[4]);assert.notEqual(snap[0],snap[3]);
 const caches=readdirSync(path.join(root,'.storyreel-footage'));assert.equal(caches.length,1);const folder=path.join(root,'.storyreel-footage',caches[0]);const before=readFileSync(path.join(folder,'manifest.json'));
 const manifest=JSON.parse(before);assert.equal(manifest.codec,'rgba-deflate-v1');assert.equal(manifest.frameCount,4);assert(manifest.record.length);
 const reused=worldAt(createFootageKit({ffmpeg,ffprobe}),root,file);await reused.ready;assert.deepEqual(readFileSync(path.join(folder,'manifest.json')),before,'reuse does not republish the completed cache');
 const changed=Buffer.from(readFileSync(path.join(folder,manifest.frames[0].name)));changed[0]^=1;writeFileSync(path.join(folder,manifest.frames[0].name),changed);assert.throws(()=>reused.draw(ctx,0),/checksum.*remove/i);
});
test('every world validates its own regions even when preparation is shared',{skip},async t=>{
 const {root,file}=source(t,'webm'),kit=createFootageKit({ffmpeg,ffprobe}),a=worldAt(kit,root,file),b=worldAt(kit,root,file,{regions:[{name:'outside',box:[0,0,1000,1000]}]});
 await a.ready;await assert.rejects(b.ready,/region.*outside.*move/i);
});
test('actual final render never copies the recording tone into its audio track',{skip},async t=>{
 const {root,file}=source(t,'webm'),storyboard={scenes:[{id:'take',narration:'Recorded.'}]},timings={scenes:[{id:'take',duration:1,alignment:{status:'available',method:'manual'},words:[{text:'Recorded.',start:0,end:.5}]}]};
 const result=await makeFilm({storyboard,timings,recipe:{story:{kit:'footage',scene:'take',file,width:320,fps:4}},kits:[createFootageKit({ffmpeg,ffprobe})],root,release:false,out:path.join(root,'out','silent.mp4'),render:{width:320,height:180,fps:4,ffmpeg,poster:false,video:wholeVideo()}});
 const audio=spawnSync(ffmpeg,['-v','error','-i',result.out,'-vn','-ac','1','-ar','8000','-f','f32le','pipe:1'],{timeout:10000,maxBuffer:1024*1024});assert.equal(audio.status,0,String(audio.stderr));
 assert(audio.stdout.length>=8000*4,'a measurable final audio track is present');let peak=0;for(let i=0;i<audio.stdout.length;i+=4)peak=Math.max(peak,Math.abs(audio.stdout.readFloatLE(i)));assert.equal(peak,0,'the 440Hz recording tone is absent, not merely turned down');
 const made=JSON.parse(readFileSync(result.makingOf,'utf8'));assert.deepEqual(made.preparation.map(row=>row.path),['story']);assert(made.preparation[0].record.source.length);assert(made.preparation[0].record.remap.length);
});
test('a failed tool-info check does not poison a later explicit compile',{skip},async t=>{
 const {root,file}=source(t,'webm'),tool=path.join(root,'ffmpeg-wrapper.cjs'),marker=path.join(root,'failed-once');
 writeFileSync(tool,`#!${process.execPath}\nconst fs=require('node:fs'),cp=require('node:child_process');const args=process.argv.slice(2);if(args[0]==='-version'&&!fs.existsSync(${JSON.stringify(marker)})){fs.writeFileSync(${JSON.stringify(marker)},'yes');process.exit(1);}const r=cp.spawnSync(${JSON.stringify(ffmpeg)},args,{stdio:args.includes('-fd')?['ignore','inherit','inherit',3]:['ignore','inherit','inherit']});process.exit(r.status??1);\n`,{mode:0o755});
 const kit=createFootageKit({ffmpeg:tool,ffprobe});await assert.rejects(worldAt(kit,root,file).ready,/decoded.*choose/i);
 const second=worldAt(kit,root,file);await second.ready;assert.deepEqual(second.sounds,[]);
});
