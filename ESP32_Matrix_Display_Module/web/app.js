import { WIDTH, HEIGHT, FRAME_BYTES, hexToRgb } from './protocol.mjs';
import { emptyFrame, setPixel, line, drawText, textWidth, renderClock } from './pixels.mjs';
import { EFFECTS, renderEffect } from './effects.mjs';
import { PRESETS } from './presets.mjs';
import { MatrixTransport, normalizeAddress, deviceHostedAddress, connectionGuidance } from './transport.mjs';
import { validBytes, drawingDocument, parseDrawing, animationDocument, parseAnimation, imagePlacement } from './studio-data.mjs';

const $ = id => document.getElementById(id);
// Add one registry entry plus a view to introduce another mode.
export const MODES = [
  { id: 'home', title: 'Home', icon: '⌂', description: '' },
  { id: 'clock', title: 'Clock & timer', icon: '◷', description: 'Digital, analog and countdown. Time with a little personality.' },
  { id: 'effects', title: 'Effects', icon: '✦', description: '60 patterns. Rain, color waves, snakes, stars and more.' },
  { id: 'draw', title: 'Live drawing', icon: '✎', description: 'Paint a pixel and watch your real display respond.' },
  { id: 'text', title: 'Scrolling text', icon: 'Aa', description: 'Messages and numbers, moving in your favorite colors.' },
  { id: 'image', title: 'Image studio', icon: '▧', description: 'Turn a photo or tiny artwork into 300 colorful pixels.' },
  { id: 'animation', title: 'Frame animations', icon: '▷', description: 'Draw a story or try walking, flying birds and moving forests.' },
];

const DRAFT_KEY = 'matrix-studio-draft-v1';
const ANIMATION_KEY = 'matrix-studio-animation-v1';
const SETTINGS_KEY = 'matrix-studio-settings-v1';
const LIBRARY_KEY = 'matrix-studio-library-v1';
let library = [];
let framesArePreset = false;
let currentMode = 'home';
let demo = false;
let busy = false;
let connecting = false;
let clockStyle = 'digital';
let selectedEffect = 0;
let draft = emptyFrame();
let imageFrame = null;
let imageSource = null;
let frames = [emptyFrame()];
let selectedFrame = 0;
let drawTool = 'paint';
let frameTool = 'paint';
let playback = null;
let shownFrame = emptyFrame();
let painting = false;
let previousPixel = null;
let cursor = { x: 0, y: 0 };
let latestFrame = null;
let sendingLatest = false;
let frameDebounce = null;
let saveTimer = null;
let toastTimer = null;
let uploadToken = 0;
let lastPreview = 0;
let previousDisplayFrame = null;
let playbackGeneration = 0;
let imageLoadGeneration = 0;

function log(message, error = false) {
  const row = document.createElement('p');
  row.textContent = `${new Date().toLocaleTimeString()} · ${message}`;
  if (error) row.className = 'error';
  $('eventLog').append(row);
  while ($('eventLog').children.length > 80) $('eventLog').firstElementChild.remove();
  $('eventLog').scrollTop = $('eventLog').scrollHeight;
}
function notify(message, error = false) {
  log(message, error);
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 6000 : 3500);
}
const transport = new MatrixTransport(reply => log(reply), () => updateConnection());

function updateConnection() {
  const type = demo ? 'demo' : transport.type;
  $('connectionStatus').textContent = connecting ? 'Connecting…' : ({ wifi: 'Wi-Fi connected', usb: 'USB connected', demo: 'Demo mode', offline: 'Offline' })[type];
  $('connectionStatus').classList.toggle('online', type !== 'offline');
  $('pairToggle').textContent = transport.connected ? 'Connection' : 'Connect';
  $('disconnectButton').hidden = !transport.connected && !demo;
  $('connectButton').disabled = connecting || transport.connected || busy;
  $('connectionType').disabled = connecting || transport.connected || busy;
  $('wifiAddress').disabled = connecting || transport.connected || busy;
  $('passcode').disabled = connecting || transport.connected || busy;
  $('demoButton').disabled = connecting || transport.connected || busy;
  $('disconnectButton').disabled = connecting || busy;
  $('deviceNote').textContent = demo ? 'Demo mode: every action stays in this preview.' : type === 'wifi' ? 'Native modes keep playing when you close this page.' : type === 'usb' ? 'USB sends drawings, images and commands. Use Wi-Fi for clocks, effects and animations.' : 'Connect to send to your matrix, or try the demo.';
  for (const id of ['startClock', 'startEffect', 'startText', 'startAnimation']) $(id).disabled = busy || (!demo && type !== 'wifi');
  for (const id of ['applyBrightness', 'sendDrawing', 'sendImage']) $(id).disabled = busy || (!demo && !transport.connected) || (id === 'sendImage' && !imageFrame);
  $('imageToDrawing').disabled = !imageFrame;
  $('imageToFrame').disabled = !imageFrame || frames.length >= 48;
  $('stopDisplay').disabled = !demo && !transport.connected;
  $('previewBadge').textContent = playback ? (playback.onDevice ? 'PLAYING' : 'PREVIEW') : 'PREVIEW';
}

function connectionFields() {
  const wifi = $('connectionType').value === 'wifi';
  $('addressField').hidden = !wifi;
  $('passcodeField').hidden = !wifi;
  $('connectionTip').textContent = wifi ? 'Join your ESP32’s Wi-Fi using your configured Wi-Fi password, or use its router IP. Enter your configured ESP32 control passcode above.' : 'Close Arduino Serial Monitor first. USB works in desktop Chrome or Edge on HTTPS or localhost; phones can connect over Wi-Fi.';
  $('networkHelp').hidden = !wifi;
  updateNetworkGuidance();
}

function updateNetworkGuidance() {
  $('networkGuidance').textContent = connectionGuidance($('wifiAddress').value, location.href);
  try { $('localStudioLink').href = `${normalizeAddress($('wifiAddress').value)}/`; $('localStudioLink').hidden = false; }
  catch { $('localStudioLink').hidden = true; }
}

async function perform(action, message) {
  if (busy) return;
  busy = true;
  updateConnection();
  try { const result = await action(); if (message && result !== false) notify(message); }
  catch (error) { notify(error.message, true); }
  finally { busy = false; updateConnection(); }
}

function color(id) { return hexToRgb($(id).value); }
function colorHex(id) { return $(id).value.slice(1); }
function number(id, min, max) {
  const value = Number($(id).value);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Choose a value between ${min} and ${max}.`);
  return value;
}
function filled(rgb) {
  const frame = emptyFrame();
  for (let offset = 0; offset < FRAME_BYTES; offset += 3) frame.set(rgb, offset);
  return frame;
}
function background(frame, rgb) {
  for (let offset = 0; offset < FRAME_BYTES; offset += 3) if (!(frame[offset] || frame[offset + 1] || frame[offset + 2])) frame.set(rgb, offset);
  return frame;
}
function drawCanvas(canvas, frame, small = false) {
  const context = canvas.getContext('2d');
  const sx = canvas.width / WIDTH, sy = canvas.height / HEIGHT;
  context.fillStyle = '#070c14';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < HEIGHT; y += 1) for (let x = 0; x < WIDTH; x += 1) {
    const offset = (y * WIDTH + x) * 3;
    const rgb = frame.subarray(offset, offset + 3);
    context.fillStyle = rgb.some(Boolean) ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : '#131d2d';
    const gap = small ? 0.4 : 2.8;
    context.fillRect(x * sx + gap, y * sy + gap, sx - gap * 2, sy - gap * 2);
  }
}
function showFrame(frame) {
  shownFrame = frame;
  if (previousDisplayFrame && frame.every((byte, i) => byte === previousDisplayFrame[i])) return;
  drawCanvas($('matrixCanvas'), frame);
  previousDisplayFrame = frame.slice();
}
function setPlayback(mode, options = {}, onDevice = false) {
  playback = { mode, options, onDevice, started: performance.now() };
  updateConnection();
}
function stopPreview() { playback = null; updateConnection(); }
function clockOptions() {
  const startedAt = Date.now();
  return { style: clockStyle, color: color('clockColor'), bg: color('clockBg'), hour12: $('hourFormat').value === '1', startedAt, deadline: startedAt + number('timerMinutes', 1, 1440) * 60000 };
}
function textOptions() {
  const text = $('textMessage').value;
  if (!text.trim() || !/^[\x20-\x7e]{1,240}$/.test(text)) throw new Error('Use 1–240 printable English letters, numbers or symbols.');
  return { text, speed: number('textSpeed', 1, 100), color: color('textColor'), bg: color('textBg'), scale: number('textScale', 1, 2) };
}
function animationOptions() {
  return { frames: frames.map(frame => frame.slice()), interval: number('frameDuration', 50, 2000), loop: $('frameLoop').checked };
}
function previewLoop(now) {
  if (now - lastPreview >= 75) {
    lastPreview = now;
    if (playback) {
      const elapsed = (now - playback.started) / 1000;
      const o = playback.options;
      let frame;
      if (playback.mode === 'effect') frame = renderEffect(o.id, elapsed, o.speed, o.color);
      if (playback.mode === 'clock') frame = background(renderClock(new Date(), o.style, o.color, o.hour12), o.bg);
      if (playback.mode === 'timer') {
        const seconds = Math.max(0, Math.ceil((o.deadline - Date.now()) / 1000));
        const left = seconds >= 3600 ? Math.floor(seconds / 3600) : Math.floor(seconds / 60);
        const right = seconds >= 3600 ? Math.floor(seconds / 60) % 60 : seconds % 60;
        const text = `${String(left).padStart(2, '0')}:${String(right).padStart(2, '0')}`;
        frame = filled(o.bg);
        const pulse = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin((elapsed * 1000 % 2000) * Math.PI / 1000));
        const foreground = seconds ? o.color : o.color.map(channel => Math.round(channel * pulse));
        drawText(frame, text, 0, 5, foreground);
        if (!seconds) drawText(frame, 'DONE', 2, 11, foreground);
        else for (let x = 0; x < Math.floor(seconds * WIDTH / Math.round((o.deadline - o.startedAt) / 1000)); x += 1) setPixel(frame, x, 13, o.color.map(channel => Math.round(channel * 0.3)));
      }
      if (playback.mode === 'text') {
        frame = filled(o.bg);
        const width = o.text.length * 4 * o.scale;
        const x = WIDTH - Math.floor(elapsed * (2 + o.speed * 0.24)) % (WIDTH + width);
        drawText(frame, o.text, x, Math.floor((HEIGHT - 5 * o.scale) / 2), o.color, o.scale);
      }
      if (playback.mode === 'animation') {
        const rawIndex = Math.floor(elapsed * 1000 / o.interval);
        const index = o.loop ? rawIndex % o.frames.length : Math.min(rawIndex, o.frames.length - 1);
        frame = o.frames[index];
      }
      if (frame) showFrame(frame);
    }
  }
  requestAnimationFrame(previewLoop);
}

function route() {
  playbackGeneration += 1;
  const id = location.hash.slice(1) || 'home';
  currentMode = MODES.some(mode => mode.id === id) ? id : 'home';
  // Changing views never lets a delayed drawing overwrite a newly started mode.
  clearTimeout(frameDebounce); latestFrame = null;
  for (const mode of MODES) $('view-' + mode.id).hidden = mode.id !== currentMode;
  document.querySelectorAll('#modeNav button').forEach(button => button.classList.toggle('active', button.dataset.mode === currentMode));
  $('previewTitle').textContent = MODES.find(mode => mode.id === currentMode).title;
  $('previewHelp').textContent = currentMode === 'draw' || currentMode === 'animation' ? 'Touch or drag to paint. Arrow keys move; space paints a pixel.' : 'Preview shows the selected content. Start or Apply sends it to the matrix.';
  $('matrixCanvas').style.cursor = ['draw', 'animation'].includes(currentMode) ? 'crosshair' : 'default';
  stopPreview();
  if (currentMode === 'draw') showFrame(draft);
  else if (currentMode === 'animation') { showFrame(frames[selectedFrame]); renderFrames(); }
  else if (currentMode === 'image') showFrame(imageFrame || emptyFrame());
  else if (currentMode === 'clock') { try { setPlayback(clockStyle === 'timer' ? 'timer' : 'clock', clockOptions()); } catch { showFrame(emptyFrame()); } }
  else if (currentMode === 'effects') previewEffect();
  else if (currentMode === 'text') { try { setPlayback('text', textOptions()); } catch { showFrame(emptyFrame()); } }
  else showFrame(draft.some(Boolean) ? draft : PRESETS[0].frames[0]);
  updateConnection();
}
function navigate(id) { if (location.hash === `#${id}`) route(); else location.hash = id; }
for (const mode of MODES) {
  const nav = document.createElement('button');
  nav.type = 'button'; nav.textContent = mode.title; nav.dataset.mode = mode.id;
  nav.addEventListener('click', () => navigate(mode.id)); $('modeNav').append(nav);
  if (mode.id === 'home') continue;
  const card = document.createElement('button');
  card.className = 'mode-card'; card.type = 'button';
  const icon = document.createElement('span'); icon.className = 'mode-icon'; icon.textContent = mode.icon;
  const title = document.createElement('strong'); title.textContent = mode.title;
  const description = document.createElement('span'); description.textContent = mode.description;
  card.append(icon, title, description); card.addEventListener('click', () => navigate(mode.id)); $('modeCards').append(card);
}

$('pairToggle').addEventListener('click', () => { $('pairing').hidden = !$('pairing').hidden; if (!$('pairing').hidden) $('pairing').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('connectionType').addEventListener('change', connectionFields);
$('wifiAddress').addEventListener('input', updateNetworkGuidance);
$('connectionForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (connecting || busy || transport.connected) return;
  connecting = true; demo = false; $('connectionError').hidden = true; updateConnection();
  try {
    if ($('connectionType').value === 'usb') await transport.connectUsb();
    else {
      const status = await transport.connectWifi($('wifiAddress').value, $('passcode').value);
      $('wifiAddress').value = transport.base;
      if (Number.isInteger(status.brightness) && status.brightness >= 1 && status.brightness <= 64) { $('brightness').value = status.brightness; $('brightnessValue').textContent = status.brightness; }
    }
    $('pairing').hidden = true;
    saveSettings();
    notify('Matrix connected. Pick a mode and press Start.');
  } catch (error) {
    await transport.disconnect();
    if (error.name !== 'NotFoundError') { $('connectionError').textContent = error.message; $('connectionError').hidden = false; log(error.message, true); }
  } finally { connecting = false; updateConnection(); }
});
$('disconnectButton').addEventListener('click', async () => { uploadToken += 1; latestFrame = null; clearTimeout(frameDebounce); demo = false; await transport.disconnect(); $('passcode').value = ''; updateConnection(); notify('Disconnected. Your drafts are kept.'); });
$('demoButton').addEventListener('click', () => { demo = true; $('pairing').hidden = true; $('connectionError').hidden = true; updateConnection(); navigate('home'); notify('Demo mode. Nothing is sent to a device.'); });
$('brightness').addEventListener('input', () => { $('brightnessValue').textContent = $('brightness').value; });
$('applyBrightness').addEventListener('click', () => perform(async () => { const value = number('brightness', 1, 64); if (!demo) await transport.command(`BRIGHTNESS ${value}`); }, demo ? 'Preview brightness setting saved.' : 'Brightness applied.'));
$('stopDisplay').addEventListener('click', async () => {
  playbackGeneration += 1;
  uploadToken += 1; latestFrame = null; clearTimeout(frameDebounce); stopPreview(); showFrame(emptyFrame());
  try { if (!demo) { if (transport.type === 'wifi') await transport.form('/api/mode', { mode: 'manual' }); await transport.command('CLEAR'); } notify('Display stopped.'); }
  catch (error) { notify(error.message, true); }
});

document.querySelectorAll('[data-clock-style]').forEach(button => button.addEventListener('click', () => {
  clockStyle = button.dataset.clockStyle;
  document.querySelectorAll('[data-clock-style]').forEach(item => item.classList.toggle('selected', item === button));
  $('timerField').hidden = clockStyle !== 'timer'; $('hourField').hidden = clockStyle === 'timer';
  $('startClock').textContent = clockStyle === 'timer' ? 'Start countdown' : 'Start clock';
  try { setPlayback(clockStyle === 'timer' ? 'timer' : 'clock', clockOptions()); } catch (error) { notify(error.message, true); }
}));
$('previewClock').addEventListener('click', () => { try { setPlayback(clockStyle === 'timer' ? 'timer' : 'clock', clockOptions()); } catch (error) { notify(error.message, true); } });
$('startClock').addEventListener('click', () => perform(async () => {
  const generation = playbackGeneration;
  const style = clockStyle;
  const options = clockOptions();
  if (!demo) await transport.form('/api/mode', style === 'timer' ? { mode: 'timer', seconds: number('timerMinutes', 1, 1440) * 60, color: colorHex('clockColor'), bg: colorHex('clockBg') } : { mode: 'clock', style, epoch: Math.floor(Date.now() / 1000), offset: -new Date().getTimezoneOffset(), hour12: $('hourFormat').value, color: colorHex('clockColor'), bg: colorHex('clockBg') });
  if (generation !== playbackGeneration) return false;
  setPlayback(style === 'timer' ? 'timer' : 'clock', options, !demo);
}, demo ? 'Clock preview started.' : 'Clock started on your ESP32.'));

for (const category of [...new Set(EFFECTS.map(effect => effect.category))]) { const option = document.createElement('option'); option.value = category; option.textContent = category; $('effectCategory').append(option); }
function previewEffect() { const effect = EFFECTS.find(item => item.id === selectedEffect); $('selectedEffectName').textContent = effect.name; setPlayback('effect', { id: selectedEffect, speed: Number($('effectSpeed').value), color: color('effectColor') }); }
function renderEffects() {
  const query = $('effectSearch').value.trim().toLowerCase();
  const category = $('effectCategory').value;
  const visible = EFFECTS.filter(effect => (category === 'all' || effect.category === category) && `${effect.name} ${effect.description}`.toLowerCase().includes(query));
  $('effectCards').replaceChildren();
  for (const effect of visible) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `effect-card${effect.id === selectedEffect ? ' selected' : ''}`; button.setAttribute('aria-pressed', effect.id === selectedEffect ? 'true' : 'false');
    const name = document.createElement('strong'); name.textContent = effect.name;
    const description = document.createElement('small'); description.textContent = effect.description;
    button.append(name, description); button.addEventListener('click', () => { selectedEffect = effect.id; renderEffects(); previewEffect(); }); $('effectCards').append(button);
  }
  $('effectEmpty').hidden = visible.length > 0;
}
$('effectSearch').addEventListener('input', renderEffects); $('effectCategory').addEventListener('change', renderEffects);
$('effectSpeed').addEventListener('input', () => { $('effectSpeedValue').textContent = $('effectSpeed').value; previewEffect(); }); $('effectColor').addEventListener('input', previewEffect);
$('startEffect').addEventListener('click', () => perform(async () => { const generation = playbackGeneration; const options = { id: selectedEffect, speed: number('effectSpeed', 1, 100), color: color('effectColor') }; if (!demo) await transport.form('/api/mode', { mode: 'effect', id: selectedEffect, speed: options.speed, color: colorHex('effectColor') }); if (generation !== playbackGeneration) return false; setPlayback('effect', options, !demo); }, demo ? 'Effect preview started.' : 'Effect started on your ESP32.'));

$('textSpeed').addEventListener('input', () => { $('textSpeedValue').textContent = $('textSpeed').value; });
$('previewText').addEventListener('click', () => { try { setPlayback('text', textOptions()); } catch (error) { notify(error.message, true); } });
$('startText').addEventListener('click', () => perform(async () => { const generation = playbackGeneration; const options = textOptions(); if (!demo) await transport.form('/api/mode', { mode: 'text', text: options.text, speed: options.speed, scale: options.scale, color: colorHex('textColor'), bg: colorHex('textBg') }); if (generation !== playbackGeneration) return false; setPlayback('text', options, !demo); }, demo ? 'Text preview started.' : 'Text started on your ESP32.'));

async function sendLatest() {
  if (sendingLatest || !latestFrame || demo || !transport.connected) return;
  sendingLatest = true;
  try {
    while (latestFrame && transport.connected && !demo) {
      const frame = latestFrame; latestFrame = null;
      await transport.frame(frame);
      $('drawStatus').textContent = 'Drawing received by the matrix · Autosaved.';
    }
  } catch (error) { latestFrame = null; $('drawStatus').textContent = `Drawing kept locally. ${error.message}`; notify(error.message, true); }
  finally { sendingLatest = false; }
}
function queueDrawing() {
  if (!$('liveDraw').checked || demo || busy || !transport.connected || currentMode !== 'draw') return;
  clearTimeout(frameDebounce);
  frameDebounce = setTimeout(() => { latestFrame = draft.slice(); sendLatest(); }, 120);
}
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveArt, 180); }
function saveArt() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ pixels: Array.from(draft), paintColor: $('drawColor').value }));
    localStorage.setItem(ANIMATION_KEY, JSON.stringify({ ...animationDocument(frames, number('frameDuration', 50, 2000), $('frameLoop').checked), sourcePreset: framesArePreset }));
  } catch { $('drawStatus').textContent = 'Browser storage is unavailable. Export your drawing and animation to keep them.'; }
}
function restoreArt() {
  try { const saved = JSON.parse(localStorage.getItem(DRAFT_KEY)); if (saved) { draft = validBytes(saved.pixels); if (/^#[0-9a-f]{6}$/i.test(saved.paintColor)) $('drawColor').value = saved.paintColor; } } catch { /* Keep new blank draft. */ }
  try { const saved = JSON.parse(localStorage.getItem(ANIMATION_KEY)); if (saved) { const animation = parseAnimation(saved); frames = animation.frames; framesArePreset = saved.sourcePreset === true; $('frameDuration').value = animation.intervalMs; $('frameLoop').checked = animation.loop; } } catch { /* Keep new blank animation. */ }
}
function selectTool(prefix, next) {
  if (prefix === 'draw') drawTool = next; else frameTool = next;
  $(prefix + 'Paint').classList.toggle('selected', next === 'paint'); $(prefix + 'Erase').classList.toggle('selected', next === 'erase');
  $(prefix + 'Paint').setAttribute('aria-pressed', String(next === 'paint')); $(prefix + 'Erase').setAttribute('aria-pressed', String(next === 'erase'));
}
for (const prefix of ['draw', 'frame']) { $(prefix + 'Paint').addEventListener('click', () => selectTool(prefix, 'paint')); $(prefix + 'Erase').addEventListener('click', () => selectTool(prefix, 'erase')); }
function paintPixel(x, y) {
  if (!['draw', 'animation'].includes(currentMode)) return;
  stopPreview();
  const frame = currentMode === 'draw' ? draft : frames[selectedFrame];
  const rgb = (currentMode === 'draw' ? drawTool : frameTool) === 'erase' ? [0, 0, 0] : color(currentMode === 'draw' ? 'drawColor' : 'frameColor');
  if (previousPixel) line(frame, previousPixel.x, previousPixel.y, x, y, rgb); else setPixel(frame, x, y, rgb);
  previousPixel = { x, y }; cursor = { x, y }; showFrame(frame);
  $('matrixCanvas').setAttribute('aria-label', `20 by 15 drawing canvas, pixel x ${x}, y ${y}`);
  scheduleSave();
  if (currentMode === 'draw') queueDrawing(); else {
    framesArePreset = false;
    const thumbnail = $('frameStrip').children[selectedFrame]?.querySelector('canvas');
    if (thumbnail) drawCanvas(thumbnail, frame, true);
  }
}
function canvasPoint(event) { const rect = $('matrixCanvas').getBoundingClientRect(); return { x: Math.max(0, Math.min(WIDTH - 1, Math.floor((event.clientX - rect.left) / rect.width * WIDTH))), y: Math.max(0, Math.min(HEIGHT - 1, Math.floor((event.clientY - rect.top) / rect.height * HEIGHT))) }; }
$('matrixCanvas').tabIndex = 0;
$('matrixCanvas').addEventListener('pointerdown', event => { if (!['draw', 'animation'].includes(currentMode)) return; painting = true; previousPixel = null; $('matrixCanvas').setPointerCapture(event.pointerId); const point = canvasPoint(event); paintPixel(point.x, point.y); });
$('matrixCanvas').addEventListener('pointermove', event => { if (!painting) return; const point = canvasPoint(event); paintPixel(point.x, point.y); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('matrixCanvas').addEventListener(type, () => { painting = false; previousPixel = null; });
$('matrixCanvas').addEventListener('keydown', event => { if (!['draw', 'animation'].includes(currentMode)) return; const movement = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]; if (movement) { event.preventDefault(); cursor.x = Math.max(0, Math.min(19, cursor.x + movement[0])); cursor.y = Math.max(0, Math.min(14, cursor.y + movement[1])); $('matrixCanvas').setAttribute('aria-label', `Drawing canvas, pixel x ${cursor.x}, y ${cursor.y}`); } else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); previousPixel = null; paintPixel(cursor.x, cursor.y); previousPixel = null; } });
$('drawFill').addEventListener('click', () => { draft = filled(color('drawColor')); showFrame(draft); scheduleSave(); queueDrawing(); });
$('drawClear').addEventListener('click', () => { draft = emptyFrame(); showFrame(draft); scheduleSave(); queueDrawing(); });
$('sendDrawing').addEventListener('click', () => perform(async () => { if (!demo) await transport.frame(draft.slice()); }, demo ? 'Drawing shown in preview.' : 'Drawing sent.'));
$('liveDraw').addEventListener('change', () => { if (!$('liveDraw').checked) { clearTimeout(frameDebounce); latestFrame = null; } else queueDrawing(); });

function download(document, name) { const url = URL.createObjectURL(new Blob([JSON.stringify(document)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function readJson(input, limit = 2 * 1024 * 1024) { const file = input.files[0]; if (!file) return null; if (file.size > limit) throw new Error('JSON file is too large. Maximum 2 MB.'); try { return JSON.parse(await file.text()); } catch { throw new Error('Choose a valid JSON file.'); } finally { input.value = ''; } }
$('exportDraft').addEventListener('click', () => download(drawingDocument(draft), 'matrix-drawing.json'));
$('importDraft').addEventListener('click', () => $('draftFile').click());
$('draftFile').addEventListener('change', async () => { try { const document = await readJson($('draftFile')); if (!document) return; const next = parseDrawing(document); draft = next; stopPreview(); showFrame(draft); saveArt(); notify('Drawing imported. Press Send when ready.'); } catch (error) { notify(error.message, true); } });

function renderFrames() {
  $('frameStrip').replaceChildren();
  frames.forEach((frame, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = `frame-item${index === selectedFrame ? ' selected' : ''}`; button.setAttribute('aria-pressed', String(index === selectedFrame)); button.setAttribute('aria-label', `Edit animation frame ${index + 1}`);
    const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 75; drawCanvas(canvas, frame, true);
    const label = document.createElement('span'); label.textContent = `Frame ${index + 1}`; button.append(canvas, label);
    button.addEventListener('click', () => { selectedFrame = index; stopPreview(); renderFrames(); showFrame(frames[selectedFrame]); }); $('frameStrip').append(button);
  });
  $('animationStatus').textContent = `${frames.length} / 48 frames · ${number('frameDuration', 50, 2000)} ms each · Saved automatically.`;
  $('addFrame').disabled = frames.length >= 48; $('duplicateFrame').disabled = frames.length >= 48; $('deleteFrame').disabled = frames.length <= 1; $('frameLeft').disabled = selectedFrame === 0; $('frameRight').disabled = selectedFrame === frames.length - 1;
}
function changedFrames() { framesArePreset = false; stopPreview(); renderFrames(); showFrame(frames[selectedFrame]); scheduleSave(); updateConnection(); }
$('addFrame').addEventListener('click', () => { if (frames.length >= 48) return; frames.splice(selectedFrame + 1, 0, emptyFrame()); selectedFrame += 1; changedFrames(); });
$('duplicateFrame').addEventListener('click', () => { if (frames.length >= 48) return; frames.splice(selectedFrame + 1, 0, frames[selectedFrame].slice()); selectedFrame += 1; changedFrames(); });
$('deleteFrame').addEventListener('click', () => { if (frames.length <= 1) return; frames.splice(selectedFrame, 1); selectedFrame = Math.min(selectedFrame, frames.length - 1); changedFrames(); });
function reorderFrame(delta) { const next = selectedFrame + delta; if (next < 0 || next >= frames.length) return; [frames[selectedFrame], frames[next]] = [frames[next], frames[selectedFrame]]; selectedFrame = next; changedFrames(); }
$('frameLeft').addEventListener('click', () => reorderFrame(-1)); $('frameRight').addEventListener('click', () => reorderFrame(1));
$('frameClear').addEventListener('click', () => { frames[selectedFrame] = emptyFrame(); changedFrames(); });
$('frameDuration').addEventListener('change', () => { try { number('frameDuration', 50, 2000); renderFrames(); scheduleSave(); } catch (error) { $('frameDuration').value = 160; notify(error.message, true); } }); $('frameLoop').addEventListener('change', scheduleSave);
for (const preset of PRESETS) { const option = document.createElement('option'); option.value = preset.id; option.textContent = `${preset.name} · ${preset.frames.length} frames`; $('presetSelect').append(option); }
$('presetSelect').addEventListener('change', () => { const preset = PRESETS.find(item => item.id === $('presetSelect').value); if (!preset) return; backupAnimation(); frames = preset.frames.map(frame => frame.slice()); selectedFrame = 0; $('frameDuration').value = preset.intervalMs; $('frameLoop').checked = true; changedFrames(); framesArePreset = true; setPlayback('animation', animationOptions()); notify(`${preset.name} loaded. ${preset.description}`); $('presetSelect').value = ''; });
$('previewAnimation').addEventListener('click', () => { try { setPlayback('animation', animationOptions()); } catch (error) { notify(error.message, true); } });
$('editFrame').addEventListener('click', () => { stopPreview(); showFrame(frames[selectedFrame]); });
$('startAnimation').addEventListener('click', () => perform(async () => {
  const generation = playbackGeneration;
  const options = animationOptions();
  const token = ++uploadToken;
  if (!demo) {
    await transport.form('/api/frames/reset', { count: options.frames.length });
    for (let index = 0; index < options.frames.length; index += 1) { if (token !== uploadToken || generation !== playbackGeneration) return false; $('animationStatus').textContent = `Uploading frame ${index + 1} of ${options.frames.length}…`; await transport.uploadFrame(index, options.frames[index]); }
    if (token !== uploadToken || generation !== playbackGeneration) return false;
    await transport.form('/api/frames/start', { interval: options.interval, loop: options.loop ? 1 : 0 });
  }
  if (generation !== playbackGeneration) return false;
  setPlayback('animation', options, !demo); renderFrames();
}, demo ? 'Animation preview started.' : 'Animation is playing on your ESP32.'));
$('exportAnimation').addEventListener('click', () => { try { download(animationDocument(frames, number('frameDuration', 50, 2000), $('frameLoop').checked), 'matrix-animation.json'); } catch (error) { notify(error.message, true); } });
$('importAnimation').addEventListener('click', () => $('animationFile').click());
$('animationFile').addEventListener('change', async () => { try { const document = await readJson($('animationFile')); if (!document) return; const animation = parseAnimation(document); backupAnimation(); frames = animation.frames; selectedFrame = 0; $('frameDuration').value = animation.intervalMs; $('frameLoop').checked = animation.loop; changedFrames(); notify('Animation imported. Preview or upload when ready.'); } catch (error) { notify(error.message, true); } });
function renderLibrary() {
  $('savedAnimations').replaceChildren();
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose a saved animation…'; $('savedAnimations').append(placeholder);
  for (const saved of library) { const option = document.createElement('option'); option.value = saved.id; option.textContent = `${saved.name} · ${saved.document.frames.length} frames`; $('savedAnimations').append(option); }
}
function storeAnimation(name, id) {
  const document = animationDocument(frames, number('frameDuration', 50, 2000), $('frameLoop').checked);
  const item = { id, name, document };
  const next = [item, ...library.filter(saved => saved.id !== id)];
  if (next.filter(saved => saved.id !== 'previous-draft').length > 8) throw new Error('Your library has eight saved animations. Export this story, or reuse an existing animation name.');
  try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(next)); } catch { throw new Error('Library storage is full. Export your animation to keep it.'); }
  library = next;
  renderLibrary();
}
function backupAnimation() {
  if (!framesArePreset && frames.some(frame => frame.some(Boolean))) {
    try { storeAnimation('Previous editor draft', 'previous-draft'); } catch (error) { notify(error.message, true); }
  }
}
$('saveAnimation').addEventListener('click', () => {
  try { const name = $('animationName').value.trim(); if (!name) throw new Error('Give your animation a name.'); const existing = library.find(saved => saved.name === name && saved.id !== 'previous-draft'); storeAnimation(name, existing?.id || `custom-${Date.now()}`); notify('Animation saved in your browser library.'); }
  catch (error) { notify(error.message, true); }
});
$('loadSavedAnimation').addEventListener('click', () => {
  try { const saved = library.find(item => item.id === $('savedAnimations').value); if (!saved) throw new Error('Choose a saved animation first.'); const animation = parseAnimation(saved.document); backupAnimation(); frames = animation.frames; selectedFrame = 0; $('frameDuration').value = animation.intervalMs; $('frameLoop').checked = animation.loop; $('animationName').value = saved.name; changedFrames(); notify('Saved animation loaded.'); }
  catch (error) { notify(error.message, true); }
});

function convertImage() {
  if (!imageSource) return;
  const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = $('imageBg').value; context.fillRect(0, 0, WIDTH, HEIGHT);
  context.imageSmoothingEnabled = $('imageSampling').value === 'smooth'; context.imageSmoothingQuality = 'high';
  const placement = imagePlacement(imageSource.width, imageSource.height, $('imageFit').value);
  context.drawImage(imageSource, placement.x, placement.y, placement.width, placement.height);
  const rgba = context.getImageData(0, 0, WIDTH, HEIGHT).data; imageFrame = emptyFrame();
  for (let i = 0; i < WIDTH * HEIGHT; i += 1) imageFrame.set(rgba.subarray(i * 4, i * 4 + 3), i * 3);
  stopPreview(); showFrame(imageFrame); updateConnection();
}
$('imageFile').addEventListener('change', async () => {
  const generation = ++imageLoadGeneration;
  const file = $('imageFile').files[0]; if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10 MB.');
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Choose a PNG, JPG, WebP or GIF image.');
    const bitmap = await createImageBitmap(file);
    if (generation !== imageLoadGeneration) { bitmap.close(); return; }
    if (bitmap.width > 8192 || bitmap.height > 8192 || bitmap.width * bitmap.height > 24000000) { bitmap.close(); throw new Error('Image is too large. Use up to 8192 pixels per side and 24 megapixels total.'); }
    imageSource?.close(); imageSource = bitmap;
    $('imageInfo').textContent = `${file.name} · ${bitmap.width} × ${bitmap.height} → 20 × 15 pixels. Images stay in your browser.`;
    convertImage();
  } catch (error) { if (generation === imageLoadGeneration) notify(error.message, true); }
});
for (const id of ['imageFit', 'imageSampling', 'imageBg']) $(id).addEventListener('change', convertImage);
$('sendImage').addEventListener('click', () => perform(async () => { if (!imageFrame) throw new Error('Choose an image first.'); if (!demo) await transport.frame(imageFrame.slice()); }, demo ? 'Image shown in preview.' : 'Image sent to your matrix.'));
$('imageToDrawing').addEventListener('click', () => { if (!imageFrame) return; draft = imageFrame.slice(); saveArt(); navigate('draw'); notify('Image copied to your drawing.'); });
$('imageToFrame').addEventListener('click', () => { if (!imageFrame || frames.length >= 48) return; frames.push(imageFrame.slice()); framesArePreset = false; selectedFrame = frames.length - 1; saveArt(); navigate('animation'); notify('Image added as an animation frame.'); });

$('commandForm').addEventListener('submit', event => { event.preventDefault(); perform(async () => { if (demo) { notify('Demo: command preview only. No device was contacted.'); return; } if (!transport.connected) throw new Error('Connect your matrix first.'); await transport.command($('commandInput').value); }); });
const settingIds = ['wifiAddress', 'clockColor', 'clockBg', 'hourFormat', 'timerMinutes', 'effectSpeed', 'effectColor', 'textMessage', 'textColor', 'textBg', 'textScale', 'textSpeed', 'drawColor', 'frameColor'];
function saveSettings() {
  try {
    const settings = {};
    for (const id of settingIds) {
      if (id === 'wifiAddress') {
        try { settings[id] = normalizeAddress($(id).value); } catch { /* Never store credentials in an invalid address. */ }
      } else settings[id] = $(id).value;
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* Settings are optional. */ }
}
function restoreSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (!saved || typeof saved !== 'object') return;
    for (const id of settingIds) {
      const input = $(id), value = saved[id];
      if (typeof value !== 'string' || value.length > 500) continue;
      if (id === 'wifiAddress') { try { input.value = normalizeAddress(value); } catch { /* Keep default address. */ } continue; }
      if (input.type === 'color' && !/^#[0-9a-f]{6}$/i.test(value)) continue;
      if (['number', 'range'].includes(input.type) && (!Number.isInteger(Number(value)) || Number(value) < Number(input.min) || Number(value) > Number(input.max))) continue;
      if (input.tagName === 'SELECT' && !Array.from(input.options).some(option => option.value === value)) continue;
      if (input.maxLength > 0 && value.length > input.maxLength) continue;
      input.value = value;
    }
  } catch { /* Default values remain. */ }
}
for (const id of settingIds) $(id).addEventListener('change', saveSettings);
window.addEventListener('pagehide', () => { saveArt(); saveSettings(); });
window.addEventListener('hashchange', route);
restoreSettings(); restoreArt();
try { const saved = JSON.parse(localStorage.getItem(LIBRARY_KEY)); if (Array.isArray(saved)) library = saved.slice(0, 9).filter(item => { try { parseAnimation(item.document); return typeof item.id === 'string' && typeof item.name === 'string' && item.name.length <= 40; } catch { return false; } }); } catch { /* Start an empty library. */ }
renderLibrary();
// Only a private device host can prefill itself; a public Pages host is the UI.
const hostedDevice = deviceHostedAddress(location.href);
if (hostedDevice) $('wifiAddress').value = hostedDevice;
$('effectSpeedValue').textContent = $('effectSpeed').value; $('textSpeedValue').textContent = $('textSpeed').value;
connectionFields(); renderEffects(); renderFrames(); route(); updateConnection();
requestAnimationFrame(previewLoop);
