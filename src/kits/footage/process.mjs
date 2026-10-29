/** Bounded local media tools: argument arrays, a fixed deadline, no shell, no retries, no decoder error echo. */
import {spawned} from '../../spawned.mjs';
export async function mediaTool(command,args,{fd=null,deadline,maxBytes=1024*1024,onChunk=null}={}){
 const remaining=deadline-Date.now();
 if(remaining<=0)throw new Error('Footage preparation reached its time limit; trim the recording or reduce its fps and width.');
 const {child,finished}=spawned(command,args,{stdio:fd===null?['ignore','pipe','pipe']:['ignore','pipe','pipe',fd]});
 let failure=null,total=0;const chunks=[];
 const timer=setTimeout(()=>{failure=new Error('The local media tool timed out; trim the recording or reduce footage fps and width.');child.kill('SIGKILL');},remaining);
 child.stderr.on('data',()=>{});
 try{
  for await(const bytes of child.stdout){total+=bytes.length;if(total>maxBytes)throw new Error('The decoded recording exceeds its output limit; trim it or choose lower footage fps and width.');if(onChunk)onChunk(bytes);else chunks.push(bytes);}
  const code=await finished;if(failure)throw failure;if(code!==0)throw new Error('The local recording could not be decoded; choose a complete readable MP4 or WebM.');
  return onChunk?total:Buffer.concat(chunks,total);
 }catch(error){child.kill('SIGKILL');await finished.catch(()=>{});if(failure)throw failure;if(error?.code==='ENOENT')throw new Error('A local media tool is missing; set the installed ffmpeg and ffprobe paths.');throw error;}
 finally{clearTimeout(timer);}
}
export function descriptorInput(container){return ['-protocol_whitelist','fd,pipe','-f',container,...(container==='mov'?['-enable_drefs','0','-use_absolute_path','0']:[]),'-fd','3','-i','fd:'];}
