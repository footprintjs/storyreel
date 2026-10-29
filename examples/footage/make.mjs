#!/usr/bin/env node
/** A free local recorded-shot film, a one-line recipe edit, and the actual piece-reuse receipts. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {makeFilm,segmentedVideo,folderStore} from 'footprint-storyreel';
import {footageKit} from 'footprint-storyreel/kits/footage';
import {kineticKit} from '../../src/kits/kinetic/index.mjs';
import {outputFolder,writeOutput} from '../../src/files.mjs';
import {ffmpegProbe} from '../../src/finished.mjs';
const root=fileURLToPath(new URL('.',import.meta.url)),out=outputFolder(root,'out');
const capture=JSON.parse(readFileSync(path.join(root,'capture.json'),'utf8'));
const actual=createHash('sha256').update(readFileSync(path.join(root,capture.video))).digest('hex');
assert.equal(actual,capture.sha256,'recording bytes must match the explicit capture receipt');
const sourceMeta=await ffmpegProbe().probe(path.join(root,capture.video));
assert(sourceMeta.video.seconds>=119,'capture at least 119 seconds for the complete example time map');
const storyboard={title:'A recorded interaction',scenes:[
 {id:'intro',narration:'A recorded interaction.'},
 {id:'take',narration:'A real click shows the error. We hold on this message. Then the long wait plays faster. Named regions keep the whole error readable. The camera and circle use the same timeline. This is a local prototype, not a live service test.'},
 {id:'outro',narration:'Edit the recipe. Reuse the rest.'}
]};
const duration=[4,80,4];
const timings={provider:'manual-silent-example',scenes:storyboard.scenes.map((scene,i)=>({id:scene.id,duration:duration[i],alignment:{status:'available',method:'manual'},words:scene.narration.split(' ').map((text,n)=>({text,start:i===1?(n<6?n*.4:n<11?7.4+(n-6)*.4:18+(n-11)*1.5):n*duration[i]/scene.narration.split(' ').length,end:i===1?(n<6?n*.4+.3:n<11?7.4+(n-6)*.4+.3:18+(n-11)*1.5+1.2):(n+1)*duration[i]/scene.narration.split(' ').length-.05}))}))};
const recipe={story:{kit:'kinetic',scene:'intro',words:['A','recorded','interaction.'],style:'stack',size:180},stages:[
 {type:'world',scene:'take',enter:{type:'fade',seconds:.6},world:{kit:'footage',scene:'take',file:capture.video,width:960,fps:12,fit:'contain',regions:[{name:'validation',box:[600,460,1320,580]}],keys:[
  {at:4,video:0},{at:8,video:4},{at:['take','Then the long wait plays faster'],video:4},
  {at:70,video:100},{at:80,video:119},{at:84,video:119}
 ]}},
 {type:'world',scene:'outro',enter:{type:'fade',seconds:.6},world:{kit:'kinetic',scene:'outro',words:['Edit','the','recipe.','Reuse','the','rest.'],style:'stack',size:130,colors:['#e9efe9','#182c24']}}
],camera:[{move:'dolly-in',at:['take','message',1],until:['take','message',2.4],on:'validation',amount:1.4}],focus:{strategy:'circle',keys:[{at:['take','We'],on:'validation'},{at:['take','Then'],on:'wide'}]}};
const edited=structuredClone(recipe);edited.stages[1].world.colors[0]='#dbe9f4';
for(const [name,data] of [['storyboard',storyboard],['timings',timings],['recipe',recipe],['recipe-edited',edited]])writeOutput(path.join(root,`${name}.json`),JSON.stringify(data,null,2)+'\n');
const store=folderStore(path.join(out,'pieces'),{cap:256*1024*1024});
const run=async(name,selected)=>makeFilm({storyboard,timings,recipe:selected,kits:[kineticKit,footageKit],root,release:false,claims:'report',out:path.join(outputFolder(out,name),'recorded-shot.mp4'),render:{fps:12,layout:{format:'landscape',scale:.5,captions:{maxWords:9,size:38,box:[100,960,1720,100]}},captionFiles:true,stamp:'LOCAL RECORDING EXAMPLE',video:segmentedVideo({store,parallel:1,chunkSeconds:6}),ffmpeg:process.env.FFMPEG_BIN||'ffmpeg'}});
const started=performance.now(),first=await run('first',recipe),firstSeconds=(performance.now()-started)/1000;
const editStart=performance.now(),second=await run('edited',edited),editSeconds=(performance.now()-editStart)/1000;
const made=JSON.parse(readFileSync(second.makingOf,'utf8'));
const proof={kind:'local-recorded-shot-example',source:{sha256:actual,seconds:sourceMeta.video.seconds,viewport:capture.viewport},filmSeconds:second.seconds,firstSeconds,editSeconds,first:first.video??null,edited:second.video??null,preparation:made.preparation,paths:{first:first.out,edited:second.out,makingOf:second.makingOf},edit:'Only outro world ground color changed; no recording or timing changed.',providerCalls:0};
assert(made.preparation?.length,'actual making-of must expose the preparation and remap decisions');
assert(second.video.reused>0,'edit must reuse actual checked picture pieces');assert.equal(second.video.rendered,1,'only the edited end-card piece is redrawn');
assert(second.video.segments.filter(piece=>piece.status==='rendered').every(piece=>piece.scenes.includes('outro')),'only a piece drawing the edited outro may redraw');
writeOutput(path.join(out,'proof.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({first:first.out,edited:second.out,firstSeconds,editSeconds,proof:path.join(out,'proof.json')}));
