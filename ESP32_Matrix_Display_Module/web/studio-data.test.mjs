import test from 'node:test';
import assert from 'node:assert/strict';
import { drawingDocument, parseDrawing, animationDocument, parseAnimation, imagePlacement } from './studio-data.mjs';
import { framePacket } from './protocol.mjs';
import { MatrixTransport, normalizeAddress } from './transport.mjs';

test('15 by 20 JSON round-trip retains RGB orientation used by frame packet', () => {
  const frame = new Uint8Array(900);
  frame.set([11, 22, 33], (14 * 20 + 19) * 3);
  const document = drawingDocument(frame);
  assert.deepEqual(document.rows[14][19], [11, 22, 33]);
  assert.deepEqual(parseDrawing(JSON.parse(JSON.stringify(document))), frame);
  assert.throws(() => parseDrawing({ ...document, rows: document.rows.slice(1) }), /15 rows/);
  const bad = JSON.parse(JSON.stringify(document)); bad.rows[0][0][0] = -1;
  assert.throws(() => parseDrawing(bad), /RGB/);
});
test('animation import rejects malformed counts, durations and RGB values before replacing draft', () => {
  const frames = [new Uint8Array(900), new Uint8Array(900).fill(12)];
  const document = animationDocument(frames, 100, false);
  const parsed = parseAnimation(document);
  assert.deepEqual(parsed.frames, frames);
  assert.equal(parsed.loop, false);
  assert.throws(() => parseAnimation({ ...document, intervalMs: 49 }), /duration/);
  assert.throws(() => parseAnimation({ ...document, frames: Array(49).fill(document.frames[0]) }), /1–48/);
  assert.throws(() => parseAnimation({ ...document, loop: 'true' }), /true or false/);
});
test('image fit contains or crops with centered bounds and stretch fills every cell', () => {
  assert.deepEqual(imagePlacement(100, 50, 'contain'), { x: 0, y: 2.5, width: 20, height: 10 });
  assert.deepEqual(imagePlacement(100, 50, 'crop'), { x: -5, y: 0, width: 30, height: 15 });
  assert.deepEqual(imagePlacement(100, 50, 'stretch'), { x: 0, y: 0, width: 20, height: 15 });
});
test('Wi-Fi pairs with passcode and serializes native mode and exact binary frame uploads', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  let active = 0, peak = 0;
  globalThis.fetch = async (url, options) => {
    active += 1; peak = Math.max(peak, active);
    calls.push({ url, options });
    await new Promise(resolve => setTimeout(resolve, 2));
    active -= 1;
    if (url.endsWith('/api/status')) return new Response(JSON.stringify({ name: 'Matrix-ESP32', width: 20, height: 15 }), { status: 200 });
    return new Response('OK TEST', { status: 200 });
  };
  try {
    const transport = new MatrixTransport();
    await transport.connectWifi('192.168.4.1', 'secret');
    const frame = new Uint8Array(900).fill(7);
    await Promise.all([transport.form('/api/mode', { mode: 'effect', id: 59 }), transport.uploadFrame(2, frame), transport.command('CLEAR')]);
    assert.equal(peak, 1);
    assert.ok(calls.every(call => call.options.headers['X-Matrix-Passcode'] === 'secret'));
    assert.equal(calls[2].options.headers['X-Frame-Index'], '2');
    assert.deepEqual(calls[2].options.body, framePacket(frame));
    assert.equal(String(calls[1].options.body), 'mode=effect&id=59');
    await transport.disconnect();
    assert.equal(transport.passcode, '');
  } finally { globalThis.fetch = previousFetch; }
});
test('invalid pairing and wrong passcode do not establish a connection', async () => {
  assert.equal(normalizeAddress('192.168.4.1/path'), 'http://192.168.4.1');
  assert.throws(() => normalizeAddress('http://user:password@192.168.4.1'), /HTTP address/);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('ERR PASSCODE', { status: 401 });
  try {
    const transport = new MatrixTransport();
    await assert.rejects(transport.connectWifi('192.168.4.1', 'bad'), /Wrong passcode/);
    assert.equal(transport.connected, false);
  } finally { globalThis.fetch = previousFetch; }
});
