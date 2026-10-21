/**
 * Original quiet motion accents; deterministic synthesis, no samples or network. A sound event may instead name a FOUND
 * sound — {time, type: 'found', name, gain?}, a recording kept in the film's sounds/ folder (found/) — which this
 * module only checks by shape: the render mixes it from its file (render.mjs · mixFound), never synthesizes it.
 */
import {peakOfSamples} from './dsp.mjs';
import {FOUND, isFoundName, isTrim, foundFields} from './found/name.mjs';
const TAU=Math.PI*2;
/**
 * Every sound by name: how long it lasts (seconds) and its default gain (0..1, the share of its own full
 * level; an event's `gain` overrides it). Gain is RELATIVE TO ITS SCENE: createMotionSound scales a whole
 * scene by one factor, set by its loudest moment, so a loud door turns down every tap in that scene
 * (limiting each sound on its own is on the later list). The first five keep gain 1, so they sound as before.
 */
const SOUNDS={
 slide:{seconds:.36,gain:1},settle:{seconds:.15,gain:1},tap:{seconds:.095,gain:1},question:{seconds:.3,gain:1},
 // chime = the eureka / answer bell (recipe lessons): three decaying partials, the loudest accent.
 chime:{seconds:1.4,gain:1},
 door:{seconds:.55,gain:.8},step:{seconds:.13,gain:.7},click:{seconds:.05,gain:.8},whoosh:{seconds:.5,gain:.8},crumble:{seconds:.75,gain:.7}};
const LENGTHS=Object.fromEntries(Object.entries(SOUNDS).map(([name,s])=>[name,s.seconds]));
/** The sound names, in the order the README lists them. */
export const SOUND_NAMES=Object.freeze(Object.keys(SOUNDS));
/** The most sounds one scene may carry (checked by compileFilm when the film is built, and again here). */
export const MAX_SOUNDS_PER_SCENE=64;
const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};

/**
 * Each sound's voice at `age` seconds into it (phase = age / its length), from two filtered noises:
 * `low` (below ~350 Hz) and `high` (below ~2.9 kHz; high − low is the band between). Full level, before gain.
 */
const VOICES={
 slide:(age,phase,low,high)=>.033*(high-low)*Math.sin(Math.PI*phase)**2,
 settle:age=>.018*Math.exp(-age*18)*(Math.sin(TAU*190*age)+.2*Math.sin(TAU*380*age)),
 tap:(age,phase,low,high)=>.016*Math.exp(-age*30)*(.8*Math.sin(TAU*330*age)+.2*(high-low)),
 chime:age=>.05*(Math.exp(-age*3.2)*Math.sin(TAU*1318.5*age)+.55*Math.exp(-age*4.5)*Math.sin(TAU*1975.5*age)+.22*Math.exp(-age*7)*Math.sin(TAU*2637*age)),
 question:age=>.018*Math.exp(-age*8)*(Math.sin(TAU*440*age)+.28*Math.sin(TAU*660*age)),
 // A hinge creak (a falling tone that pulses), then the soft thud of the door against its frame.
 door:(age,phase,low)=>{
  const creak=age<.34?.011*Math.sin(Math.PI*age/.34)*(.6+.4*Math.sin(TAU*28*age))*Math.sin(TAU*(250*age-110*age*age)):0;
  const u=age-.32,thud=u>0?.026*Math.exp(-u*24)*(Math.sin(TAU*74*u)+.6*low):0;
  return creak+thud;
 },
 // A soft footfall: a low knock and a muffled scuff.
 step:(age,phase,low)=>.024*Math.exp(-age*36)*(.7*Math.sin(TAU*96*age)+.8*low),
 // A small, bright click: a high tick that dies at once.
 click:(age,phase,low,high)=>.04*Math.exp(-age*95)*(Math.sin(TAU*2150*age)+.4*(high-low)),
 // Air moving past: dull at first, brighter as it goes, swelling and fading.
 whoosh:(age,phase,low,high)=>.05*Math.sin(Math.PI*phase)**3*((1-phase)*low+phase*(high-low)),
 // Something dry breaking up: crackling grains of noise that thin out.
 crumble:(age,phase,low,high)=>.045*Math.exp(-age*3.5)*Math.max(0,Math.sin(TAU*23*age+.7)*Math.sin(TAU*41*age))**3*((high-low)+.5*low),
};

/** A sound gain: a number from 0 to 1. */
const isGain=gain=>typeof gain==='number'&&gain>=0&&gain<=1;
/** Refuse a sound gain that is not a number from 0 to 1. */
function checkGain(gain,who){
 if(gain!==undefined&&!isGain(gain))throw Error(`${who}: a sound's gain must be a number from 0 to 1 (it is ${JSON.stringify(gain)})`);
}
/**
 * Refuse a sound whose name is not a sound, or whose gain is not 0..1 — naming who made it (`who`, e.g.
 * 'the story kit "cartoon"') and the names there are. compileFilm asks it of every kit sound.
 */
export function checkSound(event,who){
 if(!event||typeof event!=='object')throw Error(`${who} makes a sound that is not {time, type}`);
 if(event.type===FOUND){checkFound(event,who);return;}
 if(!Object.hasOwn(SOUNDS,event.type))throw Error(`${who} makes a sound "${event.type}"; the sounds are ${SOUND_NAMES.join(', ')}, or a found sound {type: 'found', name}`);
 checkGain(event.gain,who);
}
/** The type of a sound event that names a found sound (found/name.mjs): {type: 'found', name, gain?}. */
export {FOUND};
/** Refuse a found-sound event whose name is not a found sound's name, whose gain is not 0..1, or whose trim is not one. */
function checkFound(event,who){
 if(!isFoundName(event.name))throw Error(`${who} makes a found sound whose name is not one (a found sound's name is lower case with dashes, e.g. "page-turn", as sounds add --as gave it), not ${JSON.stringify(String(event.name)).slice(0,60)}`);
 checkGain(event.gain,who);
 if(!isTrim(event.from,event.to))throw Error(`${who} trims the found sound "${event.name}" with from ${JSON.stringify(event.from)} and to ${JSON.stringify(event.to)}: give seconds into the recording, from 0 or more, to after from (e.g. {from: 1.35, to: 4.25}), or leave them out to play it whole`);
}
/**
 * A sound chosen by name where a recipe picks one (an entrance's "sound"): a sound's name, or a found sound
 * {"type": "found", "name", "gain"?, "from"?, "to"?} (from/to: the span of its recording to play, in seconds). Returns
 * the name, or {type: 'found', name, gain?, from?, to?}; null when it is neither.
 */
export function readSoundChoice(value){
 if(typeof value==='string')return SOUND_NAMES.includes(value)?value:null;
 if(!value||typeof value!=='object'||Array.isArray(value)||value.type!==FOUND||!isFoundName(value.name))return null;
 if(Object.keys(value).some(k=>!['type','name','gain','from','to'].includes(k)))return null;
 if(value.gain!==undefined&&!isGain(value.gain))return null;
 if(!isTrim(value.from,value.to))return null;
 return Object.freeze({type:FOUND,...foundFields(value),...(value.gain!==undefined?{gain:value.gain}:{})});
}
/**
 * A film's sounds, scene by scene, on each scene's own clock: [[{type, time, gain?}]] — the one rule for
 * which scene a sound falls in (from the scene's start to .02 s before its end; later ones are dropped).
 * renderFilm mixes these, and compileFilm counts them.
 */
export function soundsByScene(sounds,offsets,durations){
 return durations.map((duration,i)=>{
  const t0=offsets[i];
  return sounds.filter(e=>e.time>=t0&&e.time<t0+duration-.02).map(e=>({type:e.type,time:e.time-t0,...(e.gain!==undefined?{gain:e.gain}:{}),...(e.type===FOUND?foundFields(e):{})}));
 });
}

/** Inverse of the renderer's piecewise linear speech-progress mapping. */
export function progressToSpeechTime(cues,progress,duration){
 if(!Number.isFinite(progress)||progress<0||progress>1||!Number.isFinite(duration)||duration<=0)throw Error('Invalid motion sound progress or scene duration.');   // refusal: internal (the renderer's own clock)
 const anchors=cues?.anchors;
 if(!Array.isArray(anchors)||anchors.length<2)throw Error('Motion sound requires the scene speech anchors.');   // refusal: internal (the renderer's own clock)
 for(let i=0;i<anchors.length;i++){
  const a=anchors[i],previous=anchors[i-1];
  if(!Number.isFinite(a.time)||!Number.isFinite(a.progress)||a.time<0||a.time>duration+.000001||a.progress<0||a.progress>1||previous&&(a.time<previous.time||a.progress<previous.progress))throw Error('Invalid motion sound speech anchors.');   // refusal: internal (the renderer's own clock)
 }
 if(anchors[0].progress!==0||anchors.at(-1).progress!==1)throw Error('Motion sound anchors must cover progress zero through one.');
 if(progress<=anchors[0].progress)return anchors[0].time;
 for(let i=1;i<anchors.length;i++){
  const a=anchors[i-1],b=anchors[i];
  if(progress<=b.progress)return a.time+(b.time-a.time)*(progress-a.progress)/(b.progress-a.progress);
 }
 return Math.min(duration,anchors.at(-1).time);
}

/** Where a sound sits on its moment: 'start' (it begins on it, the default) or 'peak' (its loudest transient lands on it). */
export const SOUND_AT=Object.freeze(['start','peak']);
const PEAKS=new Map();
/**
 * A sound's peak: the moment of its loudest transient, in seconds from its start (dsp.mjs · peakOfSamples), measured
 * once on the sound as synthesized alone (a door's thud lands 0.32 s in, a whoosh swells to its middle).
 */
export function soundPeak(type){
 if(!Object.hasOwn(SOUNDS,type))throw Error(`soundPeak: "${type}" is not a sound; the sounds are ${SOUND_NAMES.join(', ')}`);
 if(!PEAKS.has(type)){
  const {wav}=createMotionSound({duration:LENGTHS[type]+.1,events:[{type,time:0}]}),pcm=wav.subarray(44);
  PEAKS.set(type,+peakOfSamples(Float32Array.from({length:pcm.length/2},(_,i)=>pcm.readInt16LE(i*2)/32768),48000).toFixed(4));
 }
 return PEAKS.get(type);
}
/** A sound's start for a moment: the moment itself, or (soundAt 'peak') its peak earlier — never before the scene starts. */
const startFor=(type,time,soundAt)=>soundAt==='peak'?Math.max(0,time-soundPeak(type)):time;

/**
 * Each sound resolved on its scene's clock: {type, time (when it starts), end, gain?, …}. soundAt 'peak' starts each one
 * its peak before its moment, so its hit lands there; the moment is kept as `hit`. Left out, nothing changes.
 */
export function resolveSoundEvents(events,cues,duration,{soundAt='start'}={}){
 if(!Array.isArray(events)||events.length>MAX_SOUNDS_PER_SCENE)throw Error(`Motion sound events must be an array with at most ${MAX_SOUNDS_PER_SCENE} entries.`);
 if(!SOUND_AT.includes(soundAt))throw Error(`soundAt is 'start' (a sound begins on its moment) or 'peak' (its loudest transient lands on it), not ${JSON.stringify(soundAt)}`);
 const hit=time=>soundAt==='peak'?{hit:time}:{};
 return events.map(event=>{
  if(!event||!Object.hasOwn(SOUNDS,event.type))throw Error(`Unsupported motion sound event type "${event?.type}"; the sounds are ${SOUND_NAMES.join(', ')}.`);
  checkGain(event.gain,`Motion sound "${event.type}"`);
  const gain=event.gain!==undefined?{gain:event.gain}:{};
  // Pattern treatments supply action-derived seconds directly; older ones supply speech progress.
  if(event.at===undefined){
   if(!Number.isFinite(event.time)||event.time<0||event.time>duration)throw Error('Motion sound event time must lie within the scene.');
   const time=startFor(event.type,event.time,soundAt);
   return {type:event.type,time,end:Math.min(duration,time+LENGTHS[event.type]),...gain,...(typeof event.source==='string'?{source:event.source.slice(0,80)}:{}),...hit(event.time)};
  }
  const moment=progressToSpeechTime(cues,event.at,duration),time=startFor(event.type,moment,soundAt);
  return {at:event.at,type:event.type,time,end:Math.min(duration,time+LENGTHS[event.type]),...gain,...hit(moment)};
 });
}

/**
 * PCM16 mono, aligned to scene time zero. No narration edits or leading delay. Each event may carry
 * `gain` (0..1, default its sound's own); the scene is then scaled by ONE factor so its loudest moment
 * stays under the ceiling — which is why a gain is relative to its scene.
 */
export function createMotionSound({duration,sampleRate=48000,events=[],cues,peakCeilingDBFS=-28,soundAt='start'}={}){
 if(!Number.isFinite(peakCeilingDBFS)||peakCeilingDBFS>-18||peakCeilingDBFS<-48)throw Error('Motion sound peak ceiling must be between -48 and -18 dBFS.');
 if(!Number.isFinite(duration)||duration<=0||duration>600)throw Error('Motion sound duration must be above zero and at most 600 seconds.');
 if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>96000)throw Error('Motion sound sample rate must be 8000–96000 Hz.');
 const resolved=resolveSoundEvents(events,cues,duration,{soundAt}),sampleCount=Math.round(duration*sampleRate);
 const samples=new Float64Array(sampleCount);
 for(const [eventIndex,event]of resolved.entries()){
  const start=Math.ceil(event.time*sampleRate),length=LENGTHS[event.type],voice=VOICES[event.type],level=event.gain??SOUNDS[event.type].gain;
  let seed=(0x4d4f544e^(eventIndex+1)*0x45d9f3b)>>>0,low=0,high=0;
  const slow=1-Math.exp(-TAU*350/sampleRate),fast=1-Math.exp(-TAU*Math.min(2900,sampleRate*.4)/sampleRate);
  for(let i=start;i<Math.min(sampleCount,Math.ceil(event.end*sampleRate));i++){
   const age=i/sampleRate-event.time,phase=age/length;
   const envelope=smooth(age/.012)*smooth((length-age)/.065)*smooth((duration-i/sampleRate)/.04);
   seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
   const noise=(seed>>>0)/2147483648-1;
   low+=slow*(noise-low);high+=fast*(noise-high);
   samples[i]+=voice(age,phase,low,high)*level*envelope;
  }
 }
 let rawPeak=0;for(const sample of samples)rawPeak=Math.max(rawPeak,Math.abs(sample));
 // Limit the effects bus alone. Never boost sparse or nearly silent sounds.
 const ceiling=10**(peakCeilingDBFS/20)-1/32768,gain=rawPeak>ceiling?ceiling/rawPeak:1;
 const pcm=Buffer.alloc(sampleCount*2);let actualPeak=0,sum=0,sumSquares=0;
 for(let i=0;i<sampleCount;i++){
  const sample=Math.round(samples[i]*gain*32767);pcm.writeInt16LE(sample,i*2);
  actualPeak=Math.max(actualPeak,Math.abs(sample));sum+=sample;sumSquares+=sample*sample;
 }
 const header=Buffer.alloc(44);header.write('RIFF',0,'ascii');header.writeUInt32LE(36+pcm.length,4);header.write('WAVE',8,'ascii');
 header.write('fmt ',12,'ascii');header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);
 header.writeUInt32LE(sampleRate,24);header.writeUInt32LE(sampleRate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);
 header.write('data',36,'ascii');header.writeUInt32LE(pcm.length,40);
 return {wav:Buffer.concat([header,pcm]),metadata:{
  duration:sampleCount/sampleRate,sampleRate,channels:1,format:'PCM16',events:resolved,
  timingMethod:cues?.method??'unspecified-anchor-source',timingBasis:resolved.every(e=>e.at===undefined)&&resolved.length?'action windows compiled from the same measured speech cues as the visuals':'inverse interpolation of the same speech-progress anchors used by the visuals',
  actualPeakDBFS:actualPeak?20*Math.log10(actualPeak/32768):null,rmsDBFS:sumSquares?20*Math.log10(Math.sqrt(sumSquares/sampleCount)/32768):null,
  peakCeilingDBFS,meanPCM:sum/sampleCount,silent:actualPeak===0,gain,
  provenance:'original procedural synthesis',externalMedia:false,
  loudnessMeasurement:'Peak and RMS measured from PCM; integrated LUFS has not been measured.'
 }};
}
