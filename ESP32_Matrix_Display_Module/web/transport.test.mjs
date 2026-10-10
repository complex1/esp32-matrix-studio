import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAddress, isPrivateNetworkHost, deviceHostedAddress, connectionGuidance, networkFailureMessage, MatrixTransport } from './transport.mjs';

test('a public GitHub Pages project origin is never mistaken for the ESP32', () => {
  assert.equal(deviceHostedAddress('https://example.github.io/esp32-matrix-studio/'), null);
  assert.equal(deviceHostedAddress('http://localhost:8765/esp32-matrix-studio/'), null);
  assert.equal(deviceHostedAddress('http://127.0.0.1:8765/'), null);
  assert.equal(deviceHostedAddress('http://192.168.4.1/'), 'http://192.168.4.1');
  assert.equal(deviceHostedAddress('http://matrix.local/'), 'http://matrix.local');
  assert.equal(deviceHostedAddress('http://[fd12::1]/'), 'http://[fd12::1]');
});

test('device host detection recognizes private ranges without treating public IPs as private', () => {
  for (const host of ['10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.1.1', 'esp.local', '[fd12::1]', '[fe80::1234]']) assert.equal(isPrivateNetworkHost(host), true, host);
  for (const host of ['172.15.255.255', '172.32.0.1', '192.169.1.1', '8.8.8.8', 'example.github.io', 'localhost', '127.0.0.1', '[::1]', '[2001:db8::1]']) assert.equal(isPrivateNetworkHost(host), false, host);
});

test('Wi-Fi address input supports local devices and HTTPS gateways, but rejects credentials and unsafe schemes', () => {
  assert.equal(normalizeAddress(' 192.168.4.1 '), 'http://192.168.4.1');
  assert.equal(normalizeAddress('https://gateway.example:8443/'), 'https://gateway.example:8443');
  assert.throws(() => normalizeAddress('ftp://192.168.4.1'), /HTTP address/);
  assert.throws(() => normalizeAddress('http://name:secret@192.168.4.1'), /without a username or password/);
  assert.throws(() => normalizeAddress('http://['), /valid ESP32 address/);
});

test('HTTPS-to-HTTP guidance explains permission-dependent Chrome support and local-page fallback', () => {
  const page = 'https://example.github.io/esp32-matrix-studio/';
  const guidance = connectionGuidance('192.168.4.1', page);
  assert.match(guidance, /same Wi-Fi or a routed VPN/);
  assert.match(guidance, /Chrome can allow private HTTP connections after permission/);
  assert.match(guidance, /other browsers may block/);
  assert.match(guidance, /ESP32’s own local studio/);
  assert.doesNotMatch(connectionGuidance('https://gateway.example', page), /HTTPS-to-HTTP/);
  assert.doesNotMatch(connectionGuidance('192.168.4.1', 'http://192.168.4.1/'), /HTTPS-to-HTTP/);
  assert.match(networkFailureMessage(new TypeError('Failed to fetch'), '192.168.4.1', page), /local-network access/);
  assert.match(networkFailureMessage({ name: 'AbortError' }, '192.168.4.1', page), /Wi-Fi\/VPN/);
});

test('blocked browser requests give actionable guidance while authentication errors remain distinct', async () => {
  const previousFetch = globalThis.fetch;
  const transport = new MatrixTransport(() => {}, () => {}, 'https://example.github.io/esp32-matrix-studio/');
  try {
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(transport.connectWifi('192.168.4.1', 'test-code'), /Chrome can allow private HTTP connections after permission/);
    assert.equal(transport.connected, false);
    globalThis.fetch = async () => new Response('ERR PASSCODE', { status: 401 });
    await assert.rejects(transport.connectWifi('192.168.4.1', 'wrong-code'), /Wrong passcode/);
    await transport.disconnect();
    assert.equal(transport.passcode, '');
  } finally { globalThis.fetch = previousFetch; }
});
