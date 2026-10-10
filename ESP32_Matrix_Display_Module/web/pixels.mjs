// Logical display pixels, independent of the matrix's physical wiring order.
export const WIDTH = 20;
export const HEIGHT = 15;
export const FRAME_BYTES = WIDTH * HEIGHT * 3;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const byte = (value) => Number.isFinite(value) ? Math.round(clamp(value, 0, 255)) : 0;

function checkFrame(frame) {
  if (!(frame instanceof Uint8Array) || frame.length !== FRAME_BYTES) {
    throw new TypeError(`A frame must be a Uint8Array of ${FRAME_BYTES} RGB bytes.`);
  }
}

export function emptyFrame() {
  return new Uint8Array(FRAME_BYTES);
}

// Fractional coordinates round to the nearest cell; off-screen pixels are ignored.
export function setPixel(frame, x, y, rgb) {
  checkFrame(frame);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return frame;
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return frame;
  const offset = (y * WIDTH + x) * 3;
  frame[offset] = byte(rgb?.[0]);
  frame[offset + 1] = byte(rgb?.[1]);
  frame[offset + 2] = byte(rgb?.[2]);
  return frame;
}

export function line(frame, x0, y0, x1, y1, rgb) {
  checkFrame(frame);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return frame;

  // Clip first, so a line with distant endpoints still needs at most 20 steps.
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return frame;
  let start = 0;
  let end = 1;
  for (const [p, q] of [[-dx, x0], [dx, WIDTH - 1 - x0], [-dy, y0], [dy, HEIGHT - 1 - y0]]) {
    if (p === 0) {
      if (q < 0) return frame;
      continue;
    }
    const ratio = q / p;
    if (p < 0) start = Math.max(start, ratio);
    else end = Math.min(end, ratio);
    if (start > end) return frame;
  }
  const fromX = clamp(Math.round(x0 + start * dx), 0, WIDTH - 1);
  const fromY = clamp(Math.round(y0 + start * dy), 0, HEIGHT - 1);
  const toX = clamp(Math.round(x0 + end * dx), 0, WIDTH - 1);
  const toY = clamp(Math.round(y0 + end * dy), 0, HEIGHT - 1);
  if (![fromX, fromY, toX, toY].every(Number.isFinite)) return frame;
  let x = fromX;
  let y = fromY;
  const stepX = fromX < toX ? 1 : -1;
  const stepY = fromY < toY ? 1 : -1;
  const absX = Math.abs(toX - fromX);
  const absY = -Math.abs(toY - fromY);
  let error = absX + absY;
  for (;;) {
    setPixel(frame, x, y, rgb);
    if (x === toX && y === toY) break;
    const doubled = 2 * error;
    if (doubled >= absY) { error += absY; x += stepX; }
    if (doubled <= absX) { error += absX; y += stepY; }
  }
  return frame;
}

export function hsv(h, s = 1, v = 1) {
  h = Number.isFinite(h) ? ((h % 1) + 1) % 1 : 0;
  s = Number.isFinite(s) ? clamp(s, 0, 1) : 0;
  v = Number.isFinite(v) ? clamp(v, 0, 1) : 0;
  const sector = h * 6;
  const fraction = sector - Math.floor(sector);
  const p = v * (1 - s);
  const q = v * (1 - s * fraction);
  const t = v * (1 - s * (1 - fraction));
  const colors = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]];
  return colors[Math.floor(sector) % 6].map(channel => byte(channel * 255));
}

// Five rows per glyph. Lowercase uses the matching uppercase miniature glyph.
// Fixed three-column glyphs match MatrixFont.cpp on the physical display.
const FONT = {
  ' ': ['000', '000', '000', '000', '000'],
  '!': ['010', '010', '010', '000', '010'],
  '"': ['101', '101', '000', '000', '000'],
  '#': ['101', '111', '101', '111', '101'],
  '$': ['011', '110', '111', '011', '110'],
  '%': ['101', '001', '010', '100', '101'],
  '&': ['010', '101', '010', '101', '111'],
  "'": ['010', '010', '000', '000', '000'],
  '(': ['01', '10', '10', '10', '01'],
  ')': ['10', '01', '01', '01', '10'],
  '*': ['000', '101', '010', '101', '000'],
  '+': ['000', '010', '111', '010', '000'],
  ',': ['000', '000', '000', '010', '100'],
  '-': ['000', '000', '111', '000', '000'],
  '.': ['000', '000', '000', '000', '010'],
  '/': ['001', '001', '010', '100', '100'],
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  ':': ['000', '010', '000', '010', '000'],
  ';': ['0', '1', '0', '1', '1'],
  '<': ['001', '010', '100', '010', '001'],
  '=': ['000', '111', '000', '111', '000'],
  '>': ['100', '010', '001', '010', '100'],
  '?': ['111', '001', '011', '000', '010'],
  '@': ['111', '101', '111', '100', '111'],
  'A': ['010', '101', '111', '101', '101'],
  'B': ['110', '101', '110', '101', '110'],
  'C': ['011', '100', '100', '100', '011'],
  'D': ['110', '101', '101', '101', '110'],
  'E': ['111', '100', '110', '100', '111'],
  'F': ['111', '100', '110', '100', '100'],
  'G': ['011', '100', '101', '101', '011'],
  'H': ['101', '101', '111', '101', '101'],
  'I': ['111', '010', '010', '010', '111'],
  'J': ['001', '001', '001', '101', '010'],
  'K': ['101', '101', '110', '101', '101'],
  'L': ['100', '100', '100', '100', '111'],
  'M': ['101', '111', '111', '101', '101'],
  'N': ['101', '111', '111', '111', '101'],
  'O': ['010', '101', '101', '101', '010'],
  'P': ['110', '101', '110', '100', '100'],
  'Q': ['010', '101', '101', '111', '011'],
  'R': ['110', '101', '110', '101', '101'],
  'S': ['011', '100', '010', '001', '110'],
  'T': ['111', '010', '010', '010', '010'],
  'U': ['101', '101', '101', '101', '111'],
  'V': ['101', '101', '101', '101', '010'],
  'W': ['101', '101', '111', '111', '101'],
  'X': ['101', '101', '010', '101', '101'],
  'Y': ['101', '101', '010', '010', '010'],
  'Z': ['111', '001', '010', '100', '111'],
  '[': ['11', '10', '10', '10', '11'],
  '\\': ['100', '100', '010', '001', '001'],
  ']': ['11', '01', '01', '01', '11'],
  '^': ['010', '101', '000', '000', '000'],
  '_': ['000', '000', '000', '000', '111'],
  '`': ['10', '01', '00', '00', '00'],
  '{': ['011', '010', '110', '010', '011'],
  '|': ['1', '1', '1', '1', '1'],
  '}': ['110', '010', '011', '010', '110'],
  '~': ['000', '010', '101', '000', '000'],
};

const SUPPORTED = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:!?-+/=_'";
const glyphFor = character => SUPPORTED.includes(character.toUpperCase()) ? FONT[character.toUpperCase()] : FONT['?'];
const fontScale = scale => Number.isFinite(scale) ? clamp(Math.round(scale), 1, 8) : 1;

export function textWidth(text, scale = 1) {
  const glyphs = Array.from(String(text));
  if (!glyphs.length) return 0;
  return (glyphs.reduce((sum, character) => sum + glyphFor(character)[0].length + 1, 0) - 1) * fontScale(scale);
}

export function drawText(frame, text, x, y, rgb, scale = 1) {
  checkFrame(frame);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return frame;
  const size = fontScale(scale);
  let cursor = Math.round(x);
  const top = Math.round(y);
  for (const character of String(text)) {
    const glyph = glyphFor(character);
    const width = glyph[0].length;
    // There is deliberately no wrapping: use negative x for scrolling text.
    if (cursor + width * size > 0 && cursor < WIDTH) {
      for (let gy = 0; gy < 5; gy += 1) {
        for (let gx = 0; gx < width; gx += 1) {
          if (glyph[gy][gx] !== '1') continue;
          for (let sy = 0; sy < size; sy += 1) {
            for (let sx = 0; sx < size; sx += 1) {
              setPixel(frame, cursor + gx * size + sx, top + gy * size + sy, rgb);
            }
          }
        }
      }
    }
    cursor += (width + 1) * size;
  }
  return frame;
}

export function renderClock(date, style = 'digital', color = [80, 210, 255], hour12 = false) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new TypeError('Provide a valid Date for the clock.');
  const frame = emptyFrame();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  if (style === 'analog') {
    const cx = 9.5;
    const cy = 7;
    for (let tick = 0; tick < 12; tick += 1) {
      const angle = tick * Math.PI / 6 - Math.PI / 2;
      setPixel(frame, cx + Math.cos(angle) * 6, cy + Math.sin(angle) * 6, color.map(channel => Math.floor(channel * (tick % 3 ? .35 : .7))));
    }
    const hand = (angle, radius, rgb) => line(frame, 10, cy, cx + Math.sin(angle) * radius, cy - Math.cos(angle) * radius, rgb);
    hand(((hours % 12) + minutes / 60) * Math.PI / 6, 3.2, color.map(channel => Math.floor(channel * .65)));
    hand((minutes + seconds / 60) * Math.PI / 30, 5, color);
    hand((seconds + date.getMilliseconds() / 1000) * Math.PI / 30, 5.8, [255, 72, 80]);
    setPixel(frame, cx, cy, [255, 255, 255]);
    return frame;
  }
  const displayHours = hour12 ? (hours % 12 || 12) : hours;
  const stamp = `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  drawText(frame, stamp.replace(':', ' '), 0, 5, color);
  const fraction = date.getMilliseconds() / 1000;
  const breath = .35 + .65 * (.5 + .5 * Math.cos(fraction * Math.PI * 2));
  drawText(frame, ':', 8, 5, color.map(channel => Math.floor(channel * breath)));
  if (hour12) drawText(frame, hours < 12 ? 'AM' : 'PM', 6, 11, color.map(channel => Math.floor(channel * .6)));
  for (let x = 0; x <= Math.floor((seconds + fraction) * WIDTH / 60); x += 1) setPixel(frame, x, HEIGHT - 1, color.map(channel => Math.floor(channel * .25)));
  return frame;
}
