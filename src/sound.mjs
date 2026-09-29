/** Original quiet motion accents; deterministic synthesis, no samples or network. */
const TAU=Math.PI*2;
// chime = the eureka / answer bell (recipe lessons): three decaying partials, the loudest accent.
const LENGTHS={slide:.36,settle:.15,tap:.095,question:.3,chime:1.4};
const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};

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
 if(!Array.isArray(events)||events.length>64)throw Error('Motion sound events must be an array with at most 64 entries.');
 return events.map(event=>{
  if(!event||!Object.hasOwn(LENGTHS,event.type))throw Error('Unsupported motion sound event type.');
  // Pattern treatments supply action-derived seconds directly; older ones supply speech progress.
  if(event.at===undefined){
   if(!Number.isFinite(event.time)||event.time<0||event.time>duration)throw Error('Motion sound event time must lie within the scene.');
   return {type:event.type,time:event.time,end:Math.min(duration,event.time+LENGTHS[event.type]),...(typeof event.source==='string'?{source:event.source.slice(0,80)}:{})};
  }
  const time=progressToSpeechTime(cues,event.at,duration);
  return {at:event.at,type:event.type,time,end:Math.min(duration,time+LENGTHS[event.type])};
 });
}

/** PCM16 mono, aligned to scene time zero. No narration edits or leading delay. */
export function createMotionSound({duration,sampleRate=48000,events=[],cues,peakCeilingDBFS=-28}={}){
 if(!Number.isFinite(peakCeilingDBFS)||peakCeilingDBFS>-18||peakCeilingDBFS<-48)throw Error('Motion sound peak ceiling must be between -48 and -18 dBFS.');
 if(!Number.isFinite(duration)||duration<=0||duration>600)throw Error('Motion sound duration must be above zero and at most 600 seconds.');
 if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>96000)throw Error('Motion sound sample rate must be 8000–96000 Hz.');
 const resolved=resolveSoundEvents(events,cues,duration),sampleCount=Math.round(duration*sampleRate);
 const samples=new Float64Array(sampleCount);
 for(const [eventIndex,event]of resolved.entries()){
  const start=Math.ceil(event.time*sampleRate),length=LENGTHS[event.type];
  let seed=(0x4d4f544e^(eventIndex+1)*0x45d9f3b)>>>0,low=0,high=0;
  const slow=1-Math.exp(-TAU*350/sampleRate),fast=1-Math.exp(-TAU*Math.min(2900,sampleRate*.4)/sampleRate);
  for(let i=start;i<Math.min(sampleCount,Math.ceil(event.end*sampleRate));i++){
   const age=i/sampleRate-event.time,phase=age/length;
   const envelope=smooth(age/.012)*smooth((length-age)/.065)*smooth((duration-i/sampleRate)/.04);
   seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
   const noise=(seed>>>0)/2147483648-1;
   low+=slow*(noise-low);high+=fast*(noise-high);
   let value=0;
   if(event.type==='slide')value=.033*(high-low)*Math.sin(Math.PI*phase)**2;
   else if(event.type==='settle')value=.018*Math.exp(-age*18)*(Math.sin(TAU*190*age)+.2*Math.sin(TAU*380*age));
   else if(event.type==='tap')value=.016*Math.exp(-age*30)*(.8*Math.sin(TAU*330*age)+.2*(high-low));
   else if(event.type==='chime')value=.05*(Math.exp(-age*3.2)*Math.sin(TAU*1318.5*age)+.55*Math.exp(-age*4.5)*Math.sin(TAU*1975.5*age)+.22*Math.exp(-age*7)*Math.sin(TAU*2637*age));
   else value=.018*Math.exp(-age*8)*(Math.sin(TAU*440*age)+.28*Math.sin(TAU*660*age));
   samples[i]+=value*envelope;
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
