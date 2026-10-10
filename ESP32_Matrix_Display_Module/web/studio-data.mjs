import { WIDTH, HEIGHT, FRAME_BYTES } from './protocol.mjs';

export function validBytes(values) {
  if (!Array.isArray(values) || values.length !== FRAME_BYTES || values.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new Error('Each frame needs exactly 900 whole RGB values from 0 to 255.');
  }
  return new Uint8Array(values);
}

export function frameToRows(frame) {
  if (!(frame instanceof Uint8Array) || frame.length !== FRAME_BYTES) throw new Error('Invalid frame.');
  return Array.from({ length: HEIGHT }, (_, y) => Array.from({ length: WIDTH }, (_, x) => Array.from(frame.subarray((y * WIDTH + x) * 3, (y * WIDTH + x) * 3 + 3))));
}

export function rowsToFrame(rows) {
  if (!Array.isArray(rows) || rows.length !== HEIGHT || rows.some(row => !Array.isArray(row) || row.length !== WIDTH || row.some(pixel => !Array.isArray(pixel) || pixel.length !== 3))) throw new Error('Use exactly 15 rows × 20 columns, with [red, green, blue] in each cell.');
  return validBytes(rows.flat(2));
}

export function drawingDocument(frame) { return { type: 'matrix-studio-drawing', version: 1, width: WIDTH, height: HEIGHT, rows: frameToRows(frame) }; }
export function parseDrawing(document) {
  if (document?.width !== WIDTH || document?.height !== HEIGHT) throw new Error('This drawing must be 20 columns × 15 rows.');
  if (document.rows) return rowsToFrame(document.rows);
  return validBytes(document.pixels);
}

export function animationDocument(frames, intervalMs, loop) {
  return { type: 'matrix-studio-animation', version: 1, width: WIDTH, height: HEIGHT, intervalMs, loop, frames: frames.map(frameToRows) };
}
export function parseAnimation(document) {
  if (document?.type !== 'matrix-studio-animation' || document?.version !== 1 || document?.width !== WIDTH || document?.height !== HEIGHT) throw new Error('Choose a Matrix Studio 20 × 15 animation JSON file.');
  if (!Array.isArray(document.frames) || document.frames.length < 1 || document.frames.length > 48) throw new Error('Animations need 1–48 frames.');
  if (!Number.isInteger(document.intervalMs) || document.intervalMs < 50 || document.intervalMs > 2000) throw new Error('Frame duration must be 50–2000 ms.');
  if (typeof document.loop !== 'boolean') throw new Error('Animation loop must be true or false.');
  return { frames: document.frames.map(rowsToFrame), intervalMs: document.intervalMs, loop: document.loop };
}

export function imagePlacement(width, height, fit) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Image has invalid dimensions.');
  if (fit === 'stretch') return { x: 0, y: 0, width: WIDTH, height: HEIGHT };
  const scale = (fit === 'crop' ? Math.max : Math.min)(WIDTH / width, HEIGHT / height);
  return { x: (WIDTH - width * scale) / 2, y: (HEIGHT - height * scale) / 2, width: width * scale, height: height * scale };
}
