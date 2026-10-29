/** One owner for the recorded-shot limits and plain-data settings. */
import {isProxy} from 'node:util/types';
export const FOOTAGE = Object.freeze({fps:12,width:1600,maxSeconds:600,maxBytes:512*1024*1024,maxFrames:18000,maxSourcePixels:33177600,maxFrameBytes:16*1024*1024,maxCacheBytes:2*1024*1024*1024,memoryBytes:64*1024*1024,maxKeys:256,maxRegions:128,minRate:1/8,maxRate:8,timeoutMs:120000,maxPreparing:2,maxRequests:32});
const allowed=['kit','scene','file','fit','background','fps','width','keys','regions'];
export function dataObject(value,keys,where){
  if(!value||typeof value!=='object'||isProxy(value)||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error(`${where} must be plain data; give a JSON object.`);
  const descriptors=Object.getOwnPropertyDescriptors(value);
  for(const name of Reflect.ownKeys(descriptors)){const d=descriptors[name];if(typeof name!=='string'||!Object.hasOwn(d,'value')||!keys.includes(name))throw new Error(`${where} has an unread or executable field; give only ${keys.join(', ')} as plain values.`);}
  return value;
}
/** Validate array descriptors before iteration, including holes and inherited/accessor indices. */
export function dataArray(value,where,max=256){
 if(isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw new Error(`${where} must be plain array data; give a JSON list.`);
 const descriptors=Object.getOwnPropertyDescriptors(value),length=descriptors.length?.value;
 if(!Number.isSafeInteger(length)||length>max)throw new Error(`${where} is too long; give at most ${max} entries.`);
 for(const key of Reflect.ownKeys(descriptors)){const d=descriptors[key];if(typeof key!=='string'||(key!=='length'&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=length||!Object.hasOwn(d,'value'))))throw new Error(`${where} has an executable or extra field; give plain JSON array values.`);}
 for(let i=0;i<length;i++)if(!Object.hasOwn(descriptors,String(i)))throw new Error(`${where} has missing entries; give a complete JSON list.`);
 return value;
}
export function readAnchor(value){
 if(finite(value))return value;
 if(Array.isArray(value)){dataArray(value,'footage anchor',3);if(value.length<2||typeof value[0]!=='string'||typeof value[1]!=='string'||(value.length===3&&!finite(value[2])))throw new Error('A footage anchor is [scene, phrase, optional seconds]; give an existing phrase or finite film time.');return [...value];}
 dataObject(value,['scene','phrase','plus','nth','edge'],'footage anchor');
 if(typeof value.scene!=='string'||!value.scene.trim()||typeof value.phrase!=='string'||!value.phrase.trim()||
   (value.plus!==undefined&&!finite(value.plus))||(value.nth!==undefined&&(!Number.isSafeInteger(value.nth)||value.nth<0))||
   (value.edge!==undefined&&!['start','end'].includes(value.edge)))throw new Error('A footage anchor needs string scene and phrase, finite plus, nonnegative whole nth and start/end edge; give plain primitive anchor fields.');
 return {...value};
}
export const finite = value => typeof value==='number'&&Number.isFinite(value);
export function readSpec(spec){
  dataObject(spec,allowed,'footage');
  if(typeof spec.scene!=='string'||!spec.scene)throw new Error('footage.scene names its storyboard scene; give the scene id.');
  if(typeof spec.file!=='string'||!spec.file||spec.file.includes('\0')||/^[a-z][a-z0-9+.-]*:/i.test(spec.file))throw new Error('footage.file is a local recording inside the film root; move a MP4 or WebM inside it and give its relative path.');
  const fit=spec.fit??'contain',background=spec.background??'#15151b',fps=spec.fps??FOOTAGE.fps,width=spec.width??FOOTAGE.width;
  if(!['contain','cover'].includes(fit))throw new Error('footage.fit is contain or cover; choose contain to preserve the whole recording or cover to crop it.');
  if(typeof background!=='string'||!/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(background))throw new Error('footage.background must be a hex colour; give #15151b or another plain colour.');
  if(!Number.isInteger(fps)||fps<1||fps>30)throw new Error('footage.fps is a whole number from 1 to 30; reduce it to 12 for a smaller cache.');
  if(!Number.isInteger(width)||width<160||width>1920)throw new Error('footage.width is a whole number from 160 to 1920; choose a smaller decode width.');
  const regions=spec.regions??[];
  dataArray(regions,'footage regions',FOOTAGE.maxRegions);
  if(regions.length>FOOTAGE.maxRegions)throw new Error('footage.regions is a list of at most 128 named boxes; give fewer regions.');
  const names=new Set();
  for(const region of regions){dataObject(region,['name','box'],'footage region');if(typeof region.name!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(region.name)||names.has(region.name))throw new Error('Each footage region needs a unique plain name; name it with letters, digits, underscores or hyphens.');names.add(region.name);dataArray(region.box,'footage region box',4);if(region.box.length!==4||!region.box.every(finite)||region.box[0]<0||region.box[1]<0||region.box[2]<=region.box[0]||region.box[3]<=region.box[1])throw new Error('A footage region box is [left, top, right, bottom] in recording pixels; give a positive box inside the recording.');}
  const keys=spec.keys===undefined?undefined:dataArray(spec.keys,'footage keys',FOOTAGE.maxKeys).map(key=>{dataObject(key,['at','video'],'footage time key');return {at:readAnchor(key.at),video:key.video};});
  return {file:spec.file,scene:spec.scene,fit,background,fps,width,keys,regions:regions.map(region=>({name:region.name,box:[...region.box]}))};
}
