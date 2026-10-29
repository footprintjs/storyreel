/** Engine-owned, bounded file measurement. A recipe never supplies an input hash or its owning entry. */
import {openSync,closeSync,fstatSync,lstatSync,constants,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {insideRoot} from './files.mjs';
export const sameFile = (a,b) => ['dev','ino','size','mtimeMs','ctimeMs'].every(key=>a[key]===b[key]);
export async function hashDescriptor(fd,maxBytes){
 const before=fstatSync(fd);
 if(!before.isFile())throw new Error('The input is not a regular file; choose a local recording file.');
 if(before.size>maxBytes)throw new Error('The input file is too large; choose a smaller file within the footage byte limit.');
 const hash=createHash('sha256');let size=0;
 const input=createReadStream(null,{fd,autoClose:false,start:0,highWaterMark:64*1024});
 for await(const bytes of input){size+=bytes.length;if(size>maxBytes)throw new Error('The input grew beyond its byte limit; choose a smaller stable file.');hash.update(bytes);}
 if(size!==before.size||!sameFile(before,fstatSync(fd)))throw new Error('The input changed while it was read; make a stable copy inside the film root and try again.');
 return {size,sha256:hash.digest('hex'),stat:before};
}
export function openInput(root,file,maxBytes){
 const real=insideRoot(root,file);let before;
 try{before=lstatSync(real);}catch{throw new Error('The input is missing; choose an existing local file inside the film root.');}
 if(!before.isFile()||before.isSymbolicLink())throw new Error('The input is not a regular file; choose a local recording file.');
 if(before.size>maxBytes)throw new Error('The input file is too large; choose a smaller file within the footage byte limit.');
 let fd;
 try{fd=openSync(real,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));}catch{throw new Error('The input cannot be opened without following a changed path; choose a stable local file inside the film root.');}
 try{const opened=fstatSync(fd),after=lstatSync(real);if(!opened.isFile()||after.isSymbolicLink()||!sameFile(before,opened)||!sameFile(opened,after)||insideRoot(root,file)!==real)throw new Error('The input path changed during admission; make a stable copy inside the film root and try again.');return {file:real,fd,stat:opened};}catch(error){closeSync(fd);throw error;}
}
export async function measureFile(root,file,{maxBytes},note){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error('fileInput.maxBytes must be a positive whole number; give a bounded byte ceiling.');
 const {file:real,fd}=openInput(root,file,maxBytes);
 try{const measured=await hashDescriptor(fd,maxBytes);note(real,measured.sha256,measured.size);return Object.freeze({file:real,size:measured.size,sha256:measured.sha256});}finally{closeSync(fd);}
}
