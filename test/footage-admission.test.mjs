import test from 'node:test';
import assert from 'node:assert/strict';
import fs,{writeFileSync,renameSync,symlinkSync,mkdirSync,realpathSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {tempDir} from './tmp.mjs';
import {metadata} from '../src/kits/footage/meta.mjs';
import {readSpec,FOOTAGE} from '../src/kits/footage/spec.mjs';
import {measureFile} from '../src/input-file.mjs';
const spec=readSpec({scene:'take',file:'input.webm'});
function probe(t,data){const folder=tempDir('footage-probe',t),file=path.join(folder,'probe.cjs');writeFileSync(file,`#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(JSON.stringify(data))});\n`,{mode:0o755});return {ffprobe:file};}
for(const [name,data,why] of [
 ['null metadata',null,/invalid.*choose/i],
 ['non-scalar dimensions',{streams:[{width:{toString:'bad'},height:1080,duration:'1'}]},/invalid.*choose/i],
 ['unknown dimensions',{streams:[{width:0,height:1080,duration:'1'}]},/invalid.*choose/i],
 ['unbounded duration',{streams:[{width:1920,height:1080,duration:'Infinity'}]},/invalid.*choose/i],
 ['long recording',{streams:[{width:1920,height:1080,duration:600.1}]},/too long.*trim/i],
 ['large source plane',{streams:[{width:8192,height:4320,duration:1}]},/pixel.*large.*reduce/i],
 ['rotation metadata',{streams:[{width:1920,height:1080,duration:1,side_data_list:[{rotation:90}]}]},/rotation.*re-encode/i],
])test(`metadata refuses ${name} with its recorded rule and repair`,async t=>{await assert.rejects(metadata(null,'matroska',spec,probe(t,data),Date.now()+5000),error=>{assert.match(error.message,why);assert(error.record.length);return true;});});
test('source bounds are admitted before reducing a full 8K input to the decode ceiling',async t=>{
 const meta=await metadata(null,'matroska',{...spec,fps:30,width:1920},probe(t,{streams:[{width:7680,height:4320,duration:600}]}),Date.now()+5000);
 assert.equal(meta.width*meta.height,FOOTAGE.maxSourcePixels);assert.equal(meta.decodeWidth,1920);assert.equal(meta.decodeHeight,1080);assert(meta.record.length);
});
test('a FIFO is refused before any potentially blocking open',{skip:process.platform==='win32'},async t=>{
 const folder=tempDir('footage-fifo',t),file=path.join(folder,'recording.webm'),made=spawnSync('mkfifo',[file],{timeout:2000});assert.equal(made.status,0);
 await assert.rejects(measureFile(folder,'recording.webm',{maxBytes:100},()=>assert.fail('not admitted')),/regular file.*choose/i);
});
for(const kind of ['final symlink','parent directory'])test(`a pathname replacement at open cannot admit an outside file (${kind})`,async t=>{
 const base=realpathSync(tempDir('footage-race',t)),root=path.join(base,'film'),outside=path.join(base,'outside');mkdirSync(root);mkdirSync(outside);mkdirSync(path.join(root,'clips'));
 const target=path.join(root,'clips','recording.webm');writeFileSync(target,'inside');writeFileSync(path.join(outside,'recording.webm'),'outside');
 const originalOpen=fs.openSync,originalStream=fs.createReadStream;let swapped=false,streams=0,notes=0;
 fs.openSync=function(file,...args){if(file===target&&!swapped){swapped=true;if(kind==='final symlink'){renameSync(target,target+'.old');symlinkSync(path.join(outside,'recording.webm'),target);}else{renameSync(path.join(root,'clips'),path.join(root,'clips-old'));symlinkSync(outside,path.join(root,'clips'),'dir');}}return Reflect.apply(originalOpen,this,[file,...args]);};
 fs.createReadStream=function(...args){streams++;return Reflect.apply(originalStream,this,args);};syncBuiltinESMExports();
 try{await assert.rejects(measureFile(root,'clips/recording.webm',{maxBytes:100},()=>notes++),/changed|outside|stable|root/);assert(swapped);assert.equal(streams,0,'no content is read before descriptor/path admission succeeds');assert.equal(notes,0);}
 finally{fs.openSync=originalOpen;fs.createReadStream=originalStream;syncBuiltinESMExports();}
});
