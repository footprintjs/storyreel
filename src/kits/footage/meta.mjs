/** Container and decoded-source admission, before any frame allocation. */
import {readSync} from 'node:fs';
import {flowChart,narrative} from 'footprintjs';
import {addDecider} from '../../decisions.mjs';
import {QUIET,plainNarrative} from '../../record.mjs';
import {mediaTool,descriptorInput} from './process.mjs';
import {FOOTAGE,finite} from './spec.mjs';
export function containerOf(fd){const bytes=Buffer.alloc(16),n=readSync(fd,bytes,0,16,0);if(n>=8&&bytes.toString('ascii',4,8)==='ftyp')return 'mov';if(n>=4&&bytes.readUInt32BE(0)===0x1a45dfa3)return 'matroska';throw new Error('Footage accepts local MP4 or WebM recordings; convert this file to one of those formats first.');}
export async function metadata(fd,container,spec,tools,deadline){
 let result;
 let chart=flowChart('probe recording',async s=>{
  let raw;try{raw=JSON.parse(await mediaTool(tools.ffprobe,['-v','error',...descriptorInput(container),'-select_streams','v:0','-show_entries','stream=width,height,duration:stream_side_data=rotation:format=duration','-of','json'],{fd,deadline}));}catch(error){throw new Error('The recording metadata could not be read; choose a complete MP4 or WebM and tools with the fd input protocol.');}
  const data=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},video=Array.isArray(data.streams)&&data.streams[0]&&typeof data.streams[0]==='object'?data.streams[0]:{};
  const number=value=>typeof value==='number'||typeof value==='string'?Number(value):NaN,duration=number(video.duration??data.format?.duration);
  result={width:number(video.width),height:number(video.height),seconds:duration};
  s.invalid=!Number.isInteger(result.width)||!Number.isInteger(result.height)||result.width<2||result.height<2||!finite(duration)||duration<=0;
  s.rotated=Array.isArray(video.side_data_list)&&video.side_data_list.some(item=>item?.rotation!==undefined&&number(item.rotation)!==0);
  s.seconds=duration;s.pixels=result.width*result.height;s.frames=Math.ceil(duration*spec.fps);
 },'probe-recording','Only the admitted descriptor is probed; audio and external data refs are not followed');
 chart=addDecider(chart,{name:'recording bounds',id:'recording-bounds',key:'admission',description:'The source must fit the recorded-shot limits',table:{rules:[
  {when:{invalid:{eq:true}},then:'refuse',label:'The video has invalid dimensions or duration; choose a readable recording'},
  {when:{rotated:{eq:true}},then:'refuse',label:'The recording carries a rotation transform; re-encode it upright first'},
  {when:{seconds:{gt:FOOTAGE.maxSeconds}},then:'refuse',label:'The recording is too long; trim it to ten minutes or less'},
  {when:{pixels:{gt:FOOTAGE.maxSourcePixels}},then:'refuse',label:'The source pixel count is too large; reduce its dimensions'},
  {when:{frames:{gt:FOOTAGE.maxFrames}},then:'refuse',label:'The recording would decode too many frames; trim it or reduce footage fps'}],fallback:{branch:'prepare',label:'The recording fits the source duration, pixel and frame limits'}}});
 chart=chart.addFunction('admit source',s=>{if(s.admission!=='prepare')throw new Error(s.admissionWhy.because);const z=Math.min(1,spec.width/result.width,1920/result.height);result.decodeWidth=Math.max(2,Math.floor(result.width*z/2)*2);result.decodeHeight=Math.max(2,Math.floor(result.height*z/2)*2);},'admit-source','Bound dimensions before allocating decoded storage');
 const trace=narrative();try{await chart.setLogger(QUIET).build().recorder(trace).run();}catch(error){error.record=plainNarrative(trace);throw error;}return {...result,record:plainNarrative(trace)};
}
