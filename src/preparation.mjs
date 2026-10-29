/** Optional kit decisions, detached after ready. No executable nested data or unbounded record enters making-of. */
import {isProxy} from 'node:util/types';
const LIMIT=2*1024*1024,MAX_NODES=20000,MAX_REPORTS=256;
const refuse=why=>{throw new Error(`The world preparation report ${why}; give a smaller, finite plain-data report without accessors or cycles.`);};
export function worldPreparation(worlds){
 let nodes=0,bytes=0;const active=new Set(),reports=[];
 function copy(value,depth=0){
  if(++nodes>MAX_NODES||depth>32)refuse('exceeds its node or nesting limit');
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='number'){if(!Number.isFinite(value))refuse('contains a nonfinite number');return value;}
  if(typeof value==='string'){bytes+=Buffer.byteLength(value);if(value.length>65536||bytes>LIMIT)refuse('is too large');return value;}
  if(typeof value!=='object'||isProxy(value))refuse('is not plain stored data');
  if(active.has(value))refuse('contains a cycle');
  const array=Array.isArray(value),proto=Object.getPrototypeOf(value);if(array?proto!==Array.prototype:proto!==Object.prototype&&proto!==null)refuse('is not plain stored data');
  active.add(value);const descriptors=Object.getOwnPropertyDescriptors(value),out=array?[]:{};
  for(const key of Reflect.ownKeys(descriptors)){
   const descriptor=descriptors[key];if(typeof key!=='string'||!('value'in descriptor))refuse('contains executable or symbol data');
   if(array&&key==='length')continue;
   if(!descriptor.enumerable)refuse('contains unsupported hidden data');
   if(array&&!/^(0|[1-9][0-9]*)$/.test(key))refuse('is not a plain data array');
   bytes+=Buffer.byteLength(key)+4;if(bytes>LIMIT)refuse('is too large');
   if(descriptor.value===undefined&&!array)continue;
   Object.defineProperty(out,key,{value:copy(descriptor.value,depth+1),enumerable:true,writable:false,configurable:false});
  }
  if(array&&(out.length!==value.length||Object.keys(out).length!==value.length))refuse('contains missing array data');
  active.delete(value);return Object.freeze(out);
 }
 for(const {path,instance} of worlds){
  // A kit is executable code; this optional boundary getter is trusted, its returned nested data is not.
  const value=instance.preparation;if(value===undefined)continue;
  if(reports.length>=MAX_REPORTS)refuse('exceeds its world count limit');
  reports.push(Object.freeze({path,record:copy(value)}));
 }
 if(Buffer.byteLength(JSON.stringify(reports))>LIMIT)refuse('is too large');
 return reports.length?Object.freeze(reports):null;
}
