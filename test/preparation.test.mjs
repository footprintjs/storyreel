import test from 'node:test';
import assert from 'node:assert/strict';
import {compileFilm,evenTimings} from '../src/index.mjs';
const storyboard={scenes:[{id:'demo',narration:'Ready now.'}]};
async function filmFor(report,options={}){let ready=false;const kit={name:'prepared',story:{compile(){const world={draw(){},ready:Promise.resolve().then(()=>ready=true)};if(options.present!==false)Object.defineProperty(world,'preparation',{get(){assert(ready,'read only after ready');return report;}});return world;}}};return compileFilm({storyboard,timings:evenTimings(storyboard,{wpm:120}),recipe:{story:{kit:'prepared',scene:'demo'}},kits:[kit]});}
test('optional world preparation is read after ready and detached from the kit',async()=>{
 const report={decode:[{stage:'bounded source',seconds:2}],remap:[{kind:'hold',at:1}]},film=await filmFor(report);
 assert.deepEqual(film.preparation,[{path:'story',record:report}]);report.decode[0].seconds=99;assert.equal(film.preparation[0].record.decode[0].seconds,2);assert(Object.isFrozen(film.preparation[0].record.decode));
});
test('old kits add no preparation property to the compiled film',async()=>{const film=await filmFor(null,{present:false});assert.equal(Object.hasOwn(film,'preparation'),false);});
test('unsupported, cyclic, oversized or executable nested preparation data is refused with a fix',async()=>{
 let getters=0;const getter={};Object.defineProperty(getter,'value',{enumerable:true,get(){getters++;return 'secret';}});const cycle={};cycle.self=cycle;
 for(const report of [getter,cycle,{value:NaN},{value:()=>{}},{value:'x'.repeat(2*1024*1024)},new Date(),{[Symbol('value')]:3},[,,3]])await assert.rejects(filmFor(report),/preparation.*(plain|limit|cycle|finite|data|large).*give|preparation.*use/i);
 assert.equal(getters,0);
});
test('nested preparation proxies are refused without invoking traps',async()=>{let calls=0;const value=new Proxy({value:1},{getPrototypeOf(){calls++;return Object.prototype;},ownKeys(){calls++;return ['value'];},getOwnPropertyDescriptor(){calls++;return {value:1,enumerable:true,configurable:true};}});await assert.rejects(filmFor({nested:value}),/preparation.*plain.*give/i);assert.equal(calls,0);});
test('discarded director probes never have their preparation getter read',async()=>{
 let compiles=0,probeReads=0;const kit={name:'directed',story:{direction:{camera:'camera'},compile(){const probe=++compiles===1;let ready=false;return {hang:1,draw(){},regionsAt:()=>[],ready:probe?new Promise(()=>{}):Promise.resolve().then(()=>ready=true),get preparation(){if(probe){probeReads++;throw Error('Unready probe');}assert(ready);return {prepared:true};}};}}};
 const film=await compileFilm({storyboard,timings:evenTimings(storyboard),recipe:{story:{kit:'directed',scene:'demo'},director:'on'},kits:[kit]});
 assert.equal(compiles,2);assert.equal(probeReads,0);assert.deepEqual(film.preparation,[{path:'story',record:{prepared:true}}]);
});
