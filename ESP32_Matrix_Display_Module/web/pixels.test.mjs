import test from 'node:test';
import assert from 'node:assert/strict';
import { WIDTH, HEIGHT, emptyFrame, setPixel, line, hsv, drawText, textWidth, renderClock } from './pixels.mjs';
import { PRESETS } from './presets.mjs';

const pixel = (frame, x, y) => Array.from(frame.slice((y * WIDTH + x) * 3, (y * WIDTH + x) * 3 + 3));

test('pixels clamp channels and clip invalid coordinates without corrupting neighboring cells', () => {
  const frame = emptyFrame();
  setPixel(frame, 19, 14, [300, -20, 12.6]);
  assert.deepEqual(pixel(frame, 19, 14), [255, 0, 13]);
  const saved = frame.slice();
  for (const [x, y] of [[-1, 0], [20, 1], [0, 15], [NaN, 2], [Infinity, 3]]) setPixel(frame, x, y, [255, 255, 255]);
  assert.deepEqual(frame, saved);
  assert.throws(() => setPixel(new Uint8Array(3), 0, 0, [1, 2, 3]), TypeError);
});

test('line clipping handles huge endpoints, diagonal edges, and rejected lines', () => {
  const frame = emptyFrame();
  line(frame, -1e9, 7, 1e9, 7, [1, 2, 3]);
  for (let x = 0; x < WIDTH; x += 1) assert.deepEqual(pixel(frame, x, 7), [1, 2, 3]);
  line(frame, 0, 0, 19, 14, [4, 5, 6]);
  assert.deepEqual(pixel(frame, 0, 0), [4, 5, 6]);
  assert.deepEqual(pixel(frame, 19, 14), [4, 5, 6]);
  const saved = frame.slice();
  line(frame, -10, -10, -3, -3, [255, 255, 255]);
  assert.deepEqual(frame, saved);
  line(frame, -Number.MAX_VALUE, 7, Number.MAX_VALUE, 7, [255, 255, 255]);
  assert.deepEqual(frame, saved, 'overflowing coordinate differences are ignored');
});

test('HSV wraps hue and covers primary colors with bounded RGB values', () => {
  assert.deepEqual(hsv(0), [255, 0, 0]);
  assert.deepEqual(hsv(1 / 3), [0, 255, 0]);
  assert.deepEqual(hsv(2 / 3), [0, 0, 255]);
  assert.deepEqual(hsv(1), hsv(0));
  assert.deepEqual(hsv(-1 / 3), hsv(2 / 3));
  assert.deepEqual(hsv(.5, 0, .5), [128, 128, 128]);
});

test('font renders a known glyph, measures punctuation, and clips scrolling text without wrapping', () => {
  const frame = emptyFrame();
  drawText(frame, 'A', 0, 0, [10, 20, 30]);
  assert.deepEqual(pixel(frame, 1, 0), [10, 20, 30]);
  assert.deepEqual(pixel(frame, 0, 0), [0, 0, 0]);
  assert.deepEqual(pixel(frame, 1, 2), [10, 20, 30]);
  assert.equal(textWidth('12:34'), 19);
  assert.equal(textWidth(''), 0);
  assert.equal(textWidth('A', 2), 6);
  const lower = emptyFrame();
  drawText(lower, 'a', 0, 0, [10, 20, 30]);
  assert.deepEqual(lower, frame);
  const scrolling = emptyFrame();
  drawText(scrolling, 'AB', -4, 10, [1, 2, 3]);
  const onlyB = emptyFrame();
  drawText(onlyB, 'B', 0, 10, [1, 2, 3]);
  assert.deepEqual(scrolling, onlyB);
  for (let code = 32; code <= 126; code += 1) assert.equal(drawText(emptyFrame(), String.fromCharCode(code), 0, 0, [1, 2, 3]).length, 900);
});

test('both clock styles render changing time into valid independent RGB frames', () => {
  const date = new Date(2026, 9, 10, 10, 25, 0);
  const later = new Date(2026, 9, 10, 10, 25, 15);
  for (const style of ['digital', 'analog']) {
    const frame = renderClock(date, style, [100, 200, 250], false);
    assert.equal(frame.length, WIDTH * HEIGHT * 3);
    assert.ok(frame.some(channel => channel));
    assert.notDeepEqual(frame, renderClock(later, style, [100, 200, 250], false));
  }
  assert.notDeepEqual(renderClock(new Date(2026, 9, 10, 13, 0, 0), 'digital', [10, 20, 30], true), renderClock(new Date(2026, 9, 10, 13, 0, 0), 'digital', [10, 20, 30], false));
  assert.throws(() => renderClock(new Date('invalid')), TypeError);
});

test('animation presets have unique IDs, valid pixels, independent frames, and visible motion', () => {
  assert.deepEqual(PRESETS.map(preset => [preset.id, preset.frames.length, preset.intervalMs]), [
    ['walking-friend', 24, 115], ['bird-flight', 32, 100], ['bird-forest', 36, 110],
    ['heartbeat', 24, 75], ['bouncing-ball', 36, 65], ['rocket-launch', 24, 90],
    ['aquarium', 36, 110], ['sunrise', 36, 150], ['fireworks', 32, 95], ['rain-window', 30, 90],
  ]);
  assert.equal(new Set(PRESETS.map(preset => preset.id)).size, PRESETS.length);
  for (const preset of PRESETS) {
    assert.ok(preset.frames.length >= 8 && preset.frames.length <= 48, preset.id);
    assert.ok(preset.intervalMs >= 50, preset.id);
    assert.equal(new Set(preset.frames.map(frame => frame.buffer)).size, preset.frames.length, preset.id);
    assert.ok(new Set(preset.frames.map(frame => Buffer.from(frame).toString('base64'))).size >= 4, preset.id);
    for (const frame of preset.frames) {
      assert.ok(frame instanceof Uint8Array, preset.id);
      assert.equal(frame.length, 900, preset.id);
      assert.ok(frame.some(channel => channel > 0), preset.id);
    }
  }
});

test('all built-in animations retain true-black backgrounds in every frame', () => {
  // These cells lie outside the foreground geometry for their whole sequence.
  const backgroundCell = {
    'walking-friend': [0, 0],
    'bird-flight': [0, 0],
    'bird-forest': [0, 0],
    'heartbeat': [0, 0],
    'bouncing-ball': [0, 0],
    'rocket-launch': [19, 0],
    'aquarium': [0, 0],
    'sunrise': [0, 0],
    'fireworks': [0, 0],
    'rain-window': [19, 0],
  };
  assert.deepEqual(PRESETS.map(preset => preset.id).sort(), Object.keys(backgroundCell).sort());
  for (const preset of PRESETS) {
    preset.frames.forEach((frame, index) => {
      const label = `${preset.id} frame ${index}`;
      assert.deepEqual(pixel(frame, ...backgroundCell[preset.id]), [0, 0, 0], label);
      let off = 0;
      for (let offset = 0; offset < frame.length; offset += 3) {
        if (frame[offset] === 0 && frame[offset + 1] === 0 && frame[offset + 2] === 0) off += 1;
      }
      assert.ok(off >= 100, `${label}: at least one third of cells should be LEDs off, got ${off}`);
      assert.ok(off < WIDTH * HEIGHT, `${label}: foreground should remain visible`);
    });
  }
});

test('black sprite eyes stay off while paths, drops and scenery retain foreground colors', () => {
  const preset = id => PRESETS.find(item => item.id === id);
  assert.deepEqual(pixel(preset('walking-friend').frames[0], 10, 5), [0, 0, 0]);
  assert.deepEqual(pixel(preset('walking-friend').frames[0], 0, 13), [35, 55, 75]);
  assert.deepEqual(pixel(preset('rain-window').frames[0], 7, 8), [100, 195, 255]);
  assert.deepEqual(pixel(preset('rain-window').frames[0], 0, 14), [12, 40, 75]);
  assert.deepEqual(pixel(preset('aquarium').frames[0], 0, 14), [135, 100, 45]);
  assert.deepEqual(pixel(preset('sunrise').frames[0], 0, 14), [9, 24, 35]);
});
