import { asciiCommand, framePacket } from './protocol.mjs';

export function normalizeAddress(input) {
  const value = input.trim();
  if (!value) throw new Error('Enter your ESP32 address.');
  let url;
  try { url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`); }
  catch { throw new Error('Enter a valid ESP32 address, such as 192.168.4.1, or your HTTPS gateway URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Enter an HTTP address or HTTPS gateway URL without a username or password in the URL.');
  }
  return url.origin;
}

export function isPrivateNetworkHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host.endsWith('.local')) return true;
  if (/^(?:fc|fd)[\da-f]{2}:/.test(host) || /^fe[89ab][\da-f]:/.test(host)) return true;
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 169 && parts[1] === 254);
}

export function deviceHostedAddress(pageAddress) {
  try {
    const url = new URL(pageAddress);
    return ['http:', 'https:'].includes(url.protocol) && isPrivateNetworkHost(url.hostname) ? url.origin : null;
  } catch { return null; }
}

export function connectionGuidance(address, pageAddress = '') {
  const base = 'A private ESP32 needs the same Wi-Fi or a routed VPN. Remote access needs an existing HTTPS gateway; this public page does not provide a connection service.';
  try {
    const target = new URL(normalizeAddress(address));
    const page = new URL(pageAddress);
    if (page.protocol === 'https:' && target.protocol === 'http:' && page.origin !== target.origin) {
      return `${base} Your browser may ask for local-network access. Chrome can allow private HTTP connections after permission; other browsers may block HTTPS-to-HTTP requests. The reliable option is opening the ESP32’s own local studio.`;
    }
  } catch { /* Show general guidance while the address is being edited. */ }
  return `${base} You can always open the ESP32’s own local studio while its address is reachable.`;
}

export function networkFailureMessage(error, address, pageAddress = '') {
  if (error.name === 'AbortError') return 'Matrix timed out. Check its power, address and Wi-Fi/VPN connection, then retry. You can also open the ESP32’s own local studio.';
  if (error instanceof TypeError) return `Cannot reach the matrix. Check the address and the endpoint’s browser access settings. ${connectionGuidance(address, pageAddress)}`;
  return error.message;
}

export class MatrixTransport {
  constructor(onMessage = () => {}, onState = () => {}, pageAddress = globalThis.location?.href || '') {
    this.onMessage = onMessage;
    this.onState = onState;
    this.type = 'offline';
    this.tail = Promise.resolve();
    this.generation = 0;
    this.port = null;
    this.reader = null;
    this.pending = null;
    this.controllers = new Set();
    this.pageAddress = pageAddress;
  }

  get connected() { return this.type === 'wifi' || this.type === 'usb'; }
  enqueue(action) {
    const generation = this.generation;
    const next = this.tail.then(() => {
      if (generation !== this.generation) throw new Error('Connection changed. Please try again.');
      return action();
    });
    this.tail = next.catch(() => {});
    return next;
  }

  async request(path, { method = 'GET', body, headers = {}, json = false, timeoutMs = 6500 } = {}) {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.base}${path}`, {
        method, body, signal: controller.signal, cache: 'no-store',
        headers: { 'X-Matrix-Passcode': this.passcode, ...headers },
      });
      if (response.status === 401) throw new Error('Wrong passcode. Check your ESP32 passcode and reconnect.');
      if (!response.ok) throw new Error(`ESP32 returned ${response.status}: ${(await response.text()).slice(0, 160)}`);
      if (json) return await response.json();
      const reply = (await response.text()).trim();
      if (!/^OK(?:\s|$)/.test(reply)) throw new Error(reply || 'The ESP32 did not acknowledge this request.');
      this.onMessage(reply);
      return reply;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw new Error(networkFailureMessage(error, this.base, this.pageAddress));
      throw error;
    } finally {
      clearTimeout(timer);
      this.controllers.delete(controller);
    }
  }

  async connectWifi(address, passcode) {
    await this.disconnect();
    this.base = normalizeAddress(address);
    if (!/^[\x20-\x7e]{1,64}$/.test(passcode)) throw new Error('Enter a passcode using 1–64 printable characters.');
    this.passcode = passcode;
    // Initial connection can include a browser local-network permission prompt.
    const status = await this.request('/api/status', { json: true, timeoutMs: 30000 });
    if (status.name !== 'Matrix-ESP32' || status.width !== 20 || status.height !== 15) throw new Error('This address is not a compatible 20 × 15 Matrix-ESP32.');
    this.type = 'wifi';
    this.onState(this.type, status);
    return status;
  }

  async connectUsb() {
    if (!navigator.serial) throw new Error('USB needs a desktop browser with Web Serial support. Use Wi-Fi on your phone.');
    // Keep the port picker in the click activation; disconnect is done by the UI first.
    const selectedPort = await navigator.serial.requestPort();
    await selectedPort.open({ baudRate: 115200, bufferSize: 4096 });
    this.port = selectedPort;
    this.readTask = this.readSerial(selectedPort);
    await new Promise(resolve => setTimeout(resolve, 1800));
    if (this.port !== selectedPort || !selectedPort.writable || !selectedPort.readable) throw new Error('USB disconnected while starting.');
    this.type = 'usb';
    this.onState(this.type);
  }

  async readSerial(port) {
    const reader = port.readable.getReader();
    this.reader = reader;
    let buffer = '';
    const decoder = new TextDecoder();
    try {
      while (this.port === port) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/[\r\n]+/);
        buffer = lines.pop();
        if (buffer.length > 8192) buffer = '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;
          this.onMessage(line);
          if (/^(?:OK|ERR)(?:\s|$)/.test(line) && this.pending) {
            const pending = this.pending;
            this.pending = null;
            clearTimeout(pending.timer);
            if (line.startsWith('ERR')) pending.reject(new Error(line));
            else pending.resolve(line);
          }
        }
      }
    } catch (error) {
      if (this.port === port) this.onMessage(`USB read: ${error.message}`);
    } finally {
      reader.releaseLock();
      if (this.reader === reader) this.reader = null;
      if (this.port === port) {
        this.port = null;
        this.failPending('USB disconnected.');
        this.type = 'offline';
        this.onState(this.type);
        try { await port.close(); } catch { /* Removed device. */ }
      }
    }
  }

  failPending(message) {
    if (!this.pending) return;
    const pending = this.pending;
    this.pending = null;
    clearTimeout(pending.timer);
    pending.reject(new Error(message));
  }

  async writeSerial(bytes) {
    if (!this.port?.writable) throw new Error('Connect your ESP32 first.');
    const writer = this.port.writable.getWriter();
    this.writer = writer;
    const reply = new Promise((resolve, reject) => {
      this.pending = { resolve, reject, timer: setTimeout(() => this.failPending('ESP32 reply timed out. Reconnect before trying again.'), 5000) };
    });
    // Attach an immediate handler because a write failure can reject the reply first.
    reply.catch(() => {});
    try { await writer.write(bytes); }
    catch (error) { this.failPending(error.message); throw error; }
    finally { writer.releaseLock(); if (this.writer === writer) this.writer = null; }
    return reply;
  }

  send(bytes) {
    return this.enqueue(() => {
      if (this.type === 'wifi') return this.request('/api/send', { method: 'POST', body: bytes, headers: { 'Content-Type': 'application/octet-stream' } });
      if (this.type === 'usb') return this.writeSerial(bytes);
      throw new Error('Connect a matrix first, or choose Try demo.');
    });
  }
  command(command) { return this.send(asciiCommand(command)); }
  frame(frame) { return this.send(framePacket(frame)); }
  form(path, fields) {
    return this.enqueue(() => {
      if (this.type !== 'wifi') throw new Error('Connect over Wi-Fi to start playback on the ESP32.');
      return this.request(path, { method: 'POST', body: new URLSearchParams(fields), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    });
  }
  uploadFrame(index, frame) {
    return this.enqueue(() => this.request('/api/frames/frame', {
      method: 'POST', body: framePacket(frame), headers: { 'Content-Type': 'application/octet-stream', 'X-Frame-Index': String(index) },
    }));
  }
  async disconnect() {
    this.generation += 1;
    for (const controller of this.controllers) controller.abort();
    this.failPending('Disconnected.');
    const port = this.port;
    this.port = null;
    this.type = 'offline';
    if (this.writer) { try { await this.writer.abort('Disconnected'); } catch { /* Device removed. */ } }
    if (this.reader) { try { await this.reader.cancel(); } catch { /* Device removed. */ } }
    if (this.readTask) { try { await this.readTask; } catch { /* Device removed. */ } this.readTask = null; }
    if (port) { try { await port.close(); } catch { /* A pending writer or removed device. */ } }
    this.passcode = '';
    this.onState(this.type);
  }
}
