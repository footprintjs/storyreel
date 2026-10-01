/** Original quiet motion accents; deterministic synthesis, no samples or network. */
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

/** Refuse a sound gain that is not a number from 0 to 1. */
function checkGain(gain,who){
 if(gain!==undefined&&!(typeof gain==='number'&&gain>=0&&gain<=1))throw Error(`${who}: a sound's gain must be a number from 0 to 1 (it is ${JSON.stringify(gain)})`);
}
/**
 * Refuse a sound whose name is not a sound, or whose gain is not 0..1 — naming who made it (`who`, e.g.
 * 'the story kit "cartoon"') and the names there are. compileFilm asks it of every kit sound.
 */
export function checkSound(event,who){
 if(!event||typeof event!=='object')throw Error(`${who} makes a sound that is not {time, type}`);
 if(!Object.hasOwn(SOUNDS,event.type))throw Error(`${who} makes a sound "${event.type}"; the sounds are ${SOUND_NAMES.join(', ')}`);
 checkGain(event.gain,who);
}
/**
 * A film's sounds, scene by scene, on each scene's own clock: [[{type, time, gain?}]] — the one rule for
 * which scene a sound falls in (from the scene's start to .02 s before its end; later ones are dropped).
 * renderFilm mixes these, and compileFilm counts them.
 */
export function soundsByScene(sounds,offsets,durations){
 return durations.map((duration,i)=>{
  const t0=offsets[i];
  return sounds.filter(e=>e.time>=t0&&e.time<t0+duration-.02).map(e=>({type:e.type,time:e.time-t0,...(e.gain!==undefined?{gain:e.gain}:{})}));
 });
}

/** Inverse of the renderer's piecewise linear speech-progress mapping. */
export function progressToSpeechTime(cues,progress,duration){
 if(!Number.isFinite(progress)||progress<0||progress>1||!Number.isFinite(duration)||duration<=0)throw Error('Invalid motion sound progress or scene duration.');
 const anchors=cues?.anchors;
 if(!Array.isArray(anchors)||anchors.length<2)throw Error('Motion sound requires the scene speech anchors.');
 for(let i=0;i<anchors.length;i++){
  const a=anchors[i],previous=anchors[i-1];
  if(!Number.isFinite(a.time)||!Number.isFinite(a.progress)||a.time<0||a.time>duration+.000001||a.progress<0||a.progress>1||previous&&(a.time<previous.time||a.progress<previous.progress))throw Error('Invalid motion sound speech anchors.');
 }
 if(anchors[0].progress!==0||anchors.at(-1).progress!==1)throw Error('Motion sound anchors must cover progress zero through one.');
 if(progress<=anchors[0].progress)return anchors[0].time;
 for(let i=1;i<anchors.length;i++){
  const a=anchors[i-1],b=anchors[i];
  if(progress<=b.progress)return a.time+(b.time-a.time)*(progress-a.progress)/(b.progress-a.progress);
 }
 return Math.min(duration,anchors.at(-1).time);
}

export function resolveSoundEvents(events,cues,duration){
 if(!Array.isArray(events)||events.length>MAX_SOUNDS_PER_SCENE)throw Error(`Motion sound events must be an array with at most ${MAX_SOUNDS_PER_SCENE} entries.`);
 return events.map(event=>{
  if(!event||!Object.hasOwn(SOUNDS,event.type))throw Error(`Unsupported motion sound event type "${event?.type}"; the sounds are ${SOUND_NAMES.join(', ')}.`);
  checkGain(event.gain,`Motion sound "${event.type}"`);
  const gain=event.gain!==undefined?{gain:event.gain}:{};
  // Pattern treatments supply action-derived seconds directly; older ones supply speech progress.
  if(event.at===undefined){
   if(!Number.isFinite(event.time)||event.time<0||event.time>duration)throw Error('Motion sound event time must lie within the scene.');
   return {type:event.type,time:event.time,end:Math.min(duration,event.time+LENGTHS[event.type]),...gain,...(typeof event.source==='string'?{source:event.source.slice(0,80)}:{})};
  }
  const time=progressToSpeechTime(cues,event.at,duration);
  return {at:event.at,type:event.type,time,end:Math.min(duration,time+LENGTHS[event.type]),...gain};
 });
}

/**
 * PCM16 mono, aligned to scene time zero. No narration edits or leading delay. Each event may carry
 * `gain` (0..1, default its sound's own); the scene is then scaled by ONE factor so its loudest moment
 * stays under the ceiling — which is why a gain is relative to its scene.
 */
export function createMotionSound({duration,sampleRate=48000,events=[],cues,peakCeilingDBFS=-28}={}){
 if(!Number.isFinite(peakCeilingDBFS)||peakCeilingDBFS>-18||peakCeilingDBFS<-48)throw Error('Motion sound peak ceiling must be between -48 and -18 dBFS.');
 if(!Number.isFinite(duration)||duration<=0||duration>600)throw Error('Motion sound duration must be above zero and at most 600 seconds.');
 if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>96000)throw Error('Motion sound sample rate must be 8000–96000 Hz.');
 const resolved=resolveSoundEvents(events,cues,duration),sampleCount=Math.round(duration*sampleRate);
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
