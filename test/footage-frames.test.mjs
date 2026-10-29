import test from 'node:test';
import assert from 'node:assert/strict';
import {RgbaFrames} from '../src/kits/footage/frame-stream.mjs';
test('raw frame framing preserves bytes across every pipe boundary',()=>{const input=Buffer.from(Array.from({length:48},(_,i)=>i));for(const size of [1,3,7,48]){const frames=[],reader=new RgbaFrames({frameBytes:16,maxFrames:3,onFrame:b=>frames.push(b)});for(let n=0;n<input.length;n+=size)reader.push(input.subarray(n,n+size));assert.equal(reader.end(),3);assert.deepEqual(frames,[input.subarray(0,16),input.subarray(16,32),input.subarray(32,48)]);}});
test('an incomplete last frame cannot become evidence of completion',()=>{const reader=new RgbaFrames({frameBytes:16,maxFrames:3,onFrame(){}});reader.push(Buffer.alloc(17));assert.throws(()=>reader.end(),/complete.*recording|recording.*complete/);});
test('a refused frame is never delivered to the cache writer',()=>{let delivered=0;const reader=new RgbaFrames({frameBytes:16,maxFrames:1,onFrame(){delivered++;}});assert.throws(()=>reader.push(Buffer.alloc(32)),/reduce|trim/);assert.equal(delivered,1);});
