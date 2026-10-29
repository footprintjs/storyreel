/** Process-wide admission: even separate kit factories share the decode/hash budget. */
import {FOOTAGE} from './spec.mjs';
let active=0;const waiting=[];
function release(){const next=waiting.shift();if(next)next(release);else active--;}
export function preparationSlot(){
 if(active+waiting.length>=FOOTAGE.maxRequests)return Promise.reject(new Error('Too many footage inputs are preparing together; use fewer simultaneous recorded shots.'));
 if(active<FOOTAGE.maxPreparing){active++;return Promise.resolve(release);}
 return new Promise(resolve=>waiting.push(resolve));
}
