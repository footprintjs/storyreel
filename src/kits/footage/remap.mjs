/** The one recorded decision table for holds, source direction, bounds and speed. */
import {flowChart,narrative} from 'footprintjs';
import {addDecider,decideAll,decideMount} from '../../decisions.mjs';
import {QUIET,plainNarrative} from '../../record.mjs';
import {FOOTAGE,dataObject,dataArray,readAnchor,finite} from './spec.mjs';
const TABLE={key:'kind',noun:'recording span',rules:[
 {when:{filmStep:{lte:0}},then:'film-order',label:'Film keys must move forward; give each key a later phrase or time'},
 {when:{outside:{eq:true}},then:'outside',label:'A key is outside the scene or recording; move it inside their durations'},
 {when:{sourceStep:{lt:0}},then:'backward',label:'A recording key moves backward; put source times in forward order'},
 {when:{rate:{eq:0}},then:'hold',label:'The same recording frame is held while the film clock advances'},
 {when:{rate:{gt:FOOTAGE.maxRate}},then:'too-fast',label:'The recording runs too fast; increase the film time or shorten the source span'},
 {when:{rate:{lt:FOOTAGE.minRate}},then:'too-slow',label:'The recording runs too slowly; shorten the film span or increase the source span'}],
 fallback:{branch:'linear',label:'Recording time advances linearly within the speed limits'}};
export async function planRemap(spec,clock,sourceSeconds){
 const start=clock.start(spec.scene),end=clock.end(spec.scene);let keys,plan;
 let chart=flowChart('read time map',s=>{
  if(!finite(sourceSeconds)||sourceSeconds<=0)throw new Error('The recording has no finite positive duration; choose a readable recording.');
  if(!finite(start)||!finite(end)||end<=start)throw new Error('The footage scene has no duration; give its storyboard scene valid timings.');
  s.explicit=spec.keys!==undefined;s.shortSource=sourceSeconds<end-start;
  if(s.explicit){dataArray(spec.keys,'footage keys',FOOTAGE.maxKeys);if(spec.keys.length<2||spec.keys.length>FOOTAGE.maxKeys)throw new Error('footage.keys needs two to 256 time keys; give [{at: [scene, phrase], video: seconds}, …].');keys=spec.keys.map(key=>{dataObject(key,['at','video'],'footage time key');let at;try{const anchor=readAnchor(key.at);at=typeof anchor==='number'?anchor:clock.at(anchor);}catch{throw new Error('A footage key has no valid anchor; give an existing scene phrase or finite film time.');}if(!finite(at)||!finite(key.video))throw new Error('A footage time key needs finite film and recording seconds; give an existing phrase and a number.');return {at,video:key.video};});}
 },'read-time-map','Read explicit anchors or the normal-speed default');
 chart=addDecider(chart,{name:'map default',id:'map-default',key:'defaultKind',description:'Explicit map, normal playback or a normal-speed tail hold',table:{rules:[{when:{explicit:{eq:true}},then:'explicit',label:'The recipe supplies the recording times'},{when:{shortSource:{eq:true}},then:'tail-hold',label:'The recording ends before the scene; hold its last frame'}],fallback:{branch:'identity',label:'Play the recording at normal speed'}}});
 chart=chart.addFunction('form spans',s=>{
  if(s.defaultKind==='tail-hold')keys=[{at:start,video:0},{at:start+sourceSeconds,video:sourceSeconds},{at:end,video:sourceSeconds}];
  if(s.defaultKind==='identity')keys=[{at:start,video:0},{at:end,video:end-start}];
  s.measures=keys.slice(1).map((key,i)=>{const before=keys[i],filmStep=key.at-before.at,sourceStep=key.video-before.video;return {at:before.at,measures:{filmStep,sourceStep,rate:filmStep>0?sourceStep/filmStep:0,outside:[before,key].some(k=>k.at<start||k.at>end||k.video<0||k.video>sourceSeconds)}};});
 },'form-spans','The exact spans and rates each rule decides')
 .addSubFlowChartNext('decide-spans',decideAll(TABLE,'spans'),'decide recording spans',decideMount('measures','spanKinds'))
 .addFunction('make time map',s=>{const verdicts=s.$getValue('spanKinds');for(const result of verdicts){if(!['hold','linear'].includes(result.kind))throw new Error(`The footage time map is ${result.kind}: ${result.kindWhy.because}.`);}plan={keys:keys.map(k=>Object.freeze({...k})),videoAt:t=>{if(t<=keys[0].at)return keys[0].video;for(let i=1;i<keys.length;i++)if(t<=keys[i].at){const a=keys[i-1],b=keys[i];return a.video+(b.video-a.video)*(t-a.at)/(b.at-a.at);}return keys.at(-1).video;}};},'make-time-map','Keep only a fully admitted map; no guessed source motion');
 const trace=narrative();try{await chart.setLogger(QUIET).build().recorder(trace).run();}catch(error){error.record=plainNarrative(trace);throw error;}
 return {...plan,record:plainNarrative(trace)};
}
