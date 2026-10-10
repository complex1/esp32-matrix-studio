import test from 'node:test';
import assert from 'node:assert/strict';
import {EFFECTS,renderEffect} from './effects.mjs';

test('60 named effects have contiguous shared IDs and real animated output',()=>{
  assert.equal(EFFECTS.length,60);
  assert.equal(new Set(EFFECTS.map(e=>e.name)).size,60);
  const times=[0,.17,.71,1.33,2.79,5.1];
  EFFECTS.forEach((effect,index)=>{
    assert.equal(effect.id,index);
    assert.ok(effect.category&&effect.description);
    const frames=times.map(time=>renderEffect(effect.id,time,50,[25,185,255]));
    frames.forEach(frame=>assert.equal(frame.length,900));
    assert.ok(frames.some(frame=>frame.some(v=>v>0)),`${effect.name} must be visible`);
    assert.ok(frames.some(frame=>!frame.every((v,i)=>v===frames[0][i])),`${effect.name} must animate`);
    assert.deepEqual(frames[2],renderEffect(effect.id,times[2],50,[25,185,255]));
  });
});

test('effect preview rejects malformed IDs, times and RGB input',()=>{
  for(const id of [-1,60,1.5,NaN])assert.throws(()=>renderEffect(id,0));
  for(const time of [-1,NaN,Infinity])assert.throws(()=>renderEffect(0,time));
  assert.throws(()=>renderEffect(0,0,50,[1,2]));
  assert.throws(()=>renderEffect(0,0,50,[1,2,NaN]));
});
