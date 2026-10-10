import { WIDTH, HEIGHT, emptyFrame, setPixel, line, hsv } from './pixels.mjs';

const C = {
  ink: [0, 0, 0], white: [205, 236, 255], skin: [255, 160, 90],
  blue: [25, 100, 245], purple: [145, 45, 230], yellow: [255, 200, 30], red: [255, 40, 70],
  leaf: [25, 145, 70], trunk: [90, 52, 30], orange: [255, 105, 10], cyan: [15, 210, 225],
};
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;

function sprite(frame, rows, x, y, palette) {
  rows.forEach((row, sy) => Array.from(row).forEach((cell, sx) => {
    if (palette[cell]) setPixel(frame, x + sx, y + sy, palette[cell]);
  }));
}

function frames(count, renderer) {
  return Array.from({ length: count }, (_, index) => {
    // Unpainted cells are actual LEDs off, not a dim colored sky or water fill.
    const frame = emptyFrame();
    renderer(frame, index, count);
    return frame;
  });
}

function bird(frame, x, y, wing) {
  const palette = { b: C.blue, w: C.white, y: C.yellow, k: C.ink };
  const poses = [
    ['..w.w..', '...w...', '.bbbyy.', 'bb.bkyy', '....y..'],
    ['.......', '.......', '.bbbyy.', 'bwwwkyy', '....y..'],
    ['.......', '.......', '.bbbyy.', 'bb.bkyy', '..w.y..', '...w...'],
    ['.......', '.......', '.bbbyy.', 'bwwwkyy', '....y..'],
  ];
  sprite(frame, poses[mod(wing, poses.length)], x, y, palette);
}

function tree(frame, x, base, height, leaf, trunk = C.trunk) {
  line(frame, x, base - height + 2, x, base, trunk);
  for (let tier = 0; tier < 3; tier += 1) {
    const top = base - height + tier * 2;
    for (let row = 0; row < 3; row += 1) line(frame, x - row, top + row, x + row, top + row, leaf);
  }
}

const walking = frames(24, (frame, i) => {
  line(frame, 0, 13, 19, 13, [35, 55, 75]);
  for (let x = 0; x < WIDTH; x += 1) if (mod(x + i, 5) < 2) setPixel(frame, x, 14, [15, 25, 42]);
  const gait = [
    ['...hhh..', '..hhss..', '...sks..', '...ss...', '..bbbs..', '.sbbb...', '..bbb...', '...pp...', '..p..p..', '.ww..ww.'],
    ['...hhh..', '..hhss..', '...sks..', '...ss...', '..bbb...', '..bbbs..', '..bbb...', '...pp...', '...pp...', '..wwww..'],
    ['...hhh..', '..hhss..', '...sks..', '...ss...', '.sbbb...', '..bbbs..', '..bbb...', '...pp...', '..p..p..', '.ww..ww.'],
    ['...hhh..', '..hhss..', '...sks..', '...ss...', '..bbb...', '.sbbb...', '..bbb...', '...pp...', '...pp...', '..wwww..'],
  ];
  sprite(frame, gait[Math.floor(i / 2) % 4], 6, 3 - (i % 4 === 1 ? 1 : 0), { h: C.purple, s: C.skin, k: C.ink, b: C.blue, p: [70, 55, 130], w: C.white });
});

const flying = frames(32, (frame, i) => {
  for (const [x, y] of [[2, 2], [13, 1], [8, 12], [17, 10]]) setPixel(frame, x, y, [20, 55, 75]);
  bird(frame, -6 + i, 4 + Math.round(Math.sin(i * Math.PI / 8)), Math.floor(i / 2));
});

const landscape = frames(36, (frame, i) => {
  setPixel(frame, 17, 1, C.yellow);
  setPixel(frame, 18, 1, [180, 115, 15]);
  // Distant trunks travel slowly; the foreground moves one cell each frame.
  for (let n = 0; n < 3; n += 1) tree(frame, mod(n * 12 - Math.floor(i / 3), 36) - 5, 12, 6, [15, 65, 65], [12, 40, 42]);
  line(frame, 0, 13, 19, 13, [12, 80, 50]);
  line(frame, 0, 14, 19, 14, [10, 45, 35]);
  for (let n = 0; n < 3; n += 1) tree(frame, mod(n * 12 - i, 36) - 5, 14, 8, C.leaf);
  bird(frame, 7, 3 + Math.round(Math.sin(i * Math.PI / 9)), Math.floor(i / 2));
});

const heartMask = ['.11.11.', '1111111', '1111111', '.11111.', '..111..', '...1...'];
const heart = frames(24, (frame, i, count) => {
  const pulse = Math.pow((Math.sin(i * 2 * Math.PI / count) + 1) / 2, 3);
  const width = 9 + Math.round(pulse * 5);
  const height = 8 + Math.round(pulse * 4);
  const left = Math.floor((WIDTH - width) / 2);
  const top = Math.floor((HEIGHT - height) / 2);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (heartMask[Math.floor(y * 6 / height)][Math.floor(x * 7 / width)] === '1') {
      setPixel(frame, left + x, top + y, [170 + pulse * 85, 12 + pulse * 25, 45 + pulse * 55]);
    }
  }
  setPixel(frame, left + Math.floor(width * .23), top + 2, [255, 115, 145]);
});

const ball = frames(36, (frame, i, count) => {
  line(frame, 0, 14, 19, 14, [35, 30, 65]);
  for (let trail = 3; trail >= 0; trail -= 1) {
    const phase = (i - trail) * Math.PI * 2 / count;
    const x = 9.5 + Math.sin(phase) * 8;
    const y = 12 - Math.abs(Math.cos(phase * 2)) * 10;
    const color = hsv(i / count, .7, 1 - trail * .22);
    setPixel(frame, x, y, color);
    if (!trail) {
      setPixel(frame, x + 1, y, color);
      setPixel(frame, x, y + 1, color);
      setPixel(frame, x + 1, y + 1, [210, 240, 255]);
    }
  }
});

const rocket = frames(24, (frame, i) => {
  for (let star = 0; star < 10; star += 1) setPixel(frame, mod(star * 7, 20), mod(star * 5 + i, 15), [45, 55, 90]);
  const x = 7 + Math.round(Math.sin(i * Math.PI / 6));
  sprite(frame, ['..r..', '.rrr.', '.www.', '.wbw.', '.www.', 'rwwwr', 'rrwrr', '..y..'], x, 2, { r: C.red, w: C.white, b: C.blue, y: C.yellow });
  line(frame, x + 2, 10, x + 2, 11 + i % 3, C.orange);
  if (i % 2) setPixel(frame, x + 1, 10, C.yellow);
  else setPixel(frame, x + 3, 10, C.red);
});

const aquarium = frames(36, (frame, i) => {
  for (let x = 0; x < WIDTH; x += 1) setPixel(frame, x, 14, x % 3 ? [90, 62, 33] : [135, 100, 45]);
  for (const x of [1, 3, 17, 19]) {
    line(frame, x, 13, x + Math.round(Math.sin(i * Math.PI / 9)), 9 - x % 3, C.leaf);
    setPixel(frame, x - 1, 11, [20, 90, 40]);
  }
  const fishX = mod(i, 27) - 6;
  const fishY = 4 + Math.round(Math.sin(i * Math.PI / 9));
  sprite(frame, ['o..yyy', 'ooyyky', 'o..yyy'], fishX, fishY, { o: C.orange, y: C.yellow, k: C.ink });
  sprite(frame, ['cc..c', 'ckccc', 'cc..c'], 23 - mod(i * 2, 31), 9, { c: C.cyan, k: C.ink });
  for (let b = 0; b < 3; b += 1) setPixel(frame, 5 + b * 6, mod(12 - i - b * 4, 15), [85, 185, 220]);
});

const sunrise = frames(36, (frame, i, count) => {
  const daylight = (1 - Math.cos(i * Math.PI * 2 / count)) / 2;
  const sunY = 15 - daylight * 12;
  for (let y = -2; y <= 2; y += 1) for (let x = -2; x <= 2; x += 1) if (x * x + y * y <= 5) setPixel(frame, 13 + x, sunY + y, C.yellow);
  for (let x = 0; x < WIDTH; x += 1) {
    const ridge = 11 - Math.round(Math.abs(Math.sin(x * .36)) * 3);
    line(frame, x, ridge, x, 14, [9 + daylight * 10, 24 + daylight * 15, 35 + daylight * 10]);
  }
  const cloud = mod(Math.floor(i / 3), 27) - 5;
  line(frame, cloud, 2, cloud + 3, 2, [65 + daylight * 105, 60 + daylight * 105, 95 + daylight * 80]);
  line(frame, cloud - 1, 3, cloud + 4, 3, [65 + daylight * 105, 60 + daylight * 105, 95 + daylight * 80]);
});

const fireworks = frames(32, (frame, i, count) => {
  const cycle = i % 16;
  const cx = i < 16 ? 6 : 13;
  if (cycle < 5) {
    line(frame, cx, 14 - cycle * 2, cx, 13 - cycle * 2, C.yellow);
  } else {
    const radius = (cycle - 4) * .55;
    for (let ray = 0; ray < 10; ray += 1) {
      const angle = ray * Math.PI / 5;
      setPixel(frame, cx + Math.cos(angle) * radius, 5 + Math.sin(angle) * radius + (cycle - 8) * .13, hsv(ray / 10 + i / count, .8, Math.max(.2, 1 - (cycle - 5) / 13)));
    }
  }
});

const rain = frames(30, (frame, i) => {
  for (let drop = 0; drop < 15; drop += 1) {
    const x = mod(drop * 7, 20);
    const y = mod(i + drop * 11, 20) - 3;
    setPixel(frame, x, y, [100, 195, 255]);
    setPixel(frame, x, y - 1, [22, 70, 125]);
  }
  line(frame, 0, 14, 19, 14, [12, 40, 75]);
  const ripple = i % 5;
  const x = mod(Math.floor(i / 5) * 7, 16) + 2;
  if (ripple) {
    setPixel(frame, x - ripple, 13, [45, 100, 155]);
    setPixel(frame, x + ripple, 13, [45, 100, 155]);
  }
});

export const PRESETS = [
  { id: 'walking-friend', name: 'Walking friend', description: 'A tiny character walks with alternating arms, feet, and a scrolling path.', intervalMs: 115, frames: walking },
  { id: 'bird-flight', name: 'Bird flight', description: 'A blue and gold bird crosses the night sky with four wing poses.', intervalMs: 100, frames: flying },
  { id: 'bird-forest', name: 'Bird over forest', description: 'Flapping wings above trees that move at two speeds for depth.', intervalMs: 110, frames: landscape },
  { id: 'heartbeat', name: 'Heartbeat', description: 'A soft pink heart expands, brightens, and relaxes.', intervalMs: 75, frames: heart },
  { id: 'bouncing-ball', name: 'Bouncing ball', description: 'A colorful ball arcs across the grid with a fading trail.', intervalMs: 65, frames: ball },
  { id: 'rocket-launch', name: 'Rocket launch', description: 'A little red rocket travels through streaming stars.', intervalMs: 90, frames: rocket },
  { id: 'aquarium', name: 'Aquarium', description: 'Two fish, rising bubbles, and swaying water plants.', intervalMs: 110, frames: aquarium },
  { id: 'sunrise', name: 'Mountain sunrise', description: 'Day and night cycle over a layered mountain ridge.', intervalMs: 150, frames: sunrise },
  { id: 'fireworks', name: 'Fireworks', description: 'Two launches bloom into rings of rainbow sparks.', intervalMs: 95, frames: fireworks },
  { id: 'rain-window', name: 'Rain and ripples', description: 'Blue drops fall into a puddle with small spreading ripples.', intervalMs: 90, frames: rain },
];
