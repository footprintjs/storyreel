/** Fixed-size normalized RGBA frames: one frame plus the pipe chunk, with no growing concatenation. */
export class RgbaFrames {
 constructor({frameBytes,maxFrames,onFrame}){this.frameBytes=frameBytes;this.maxFrames=maxFrames;this.onFrame=onFrame;this.frame=Buffer.alloc(frameBytes);this.filled=0;this.count=0;}
 push(chunk){for(let at=0;at<chunk.length;){const take=Math.min(this.frameBytes-this.filled,chunk.length-at);chunk.copy(this.frame,this.filled,at,at+take);this.filled+=take;at+=take;if(this.filled===this.frameBytes){if(this.count>=this.maxFrames)throw new Error('The recording decoded too many frames; trim it or choose lower footage fps.');this.onFrame(this.frame,this.count++);this.frame=Buffer.alloc(this.frameBytes);this.filled=0;}}}
 end(){if(this.filled)throw new Error('The decoded recording has an incomplete frame; choose a complete local recording.');return this.count;}
}
