import assert from "node:assert/strict";
import test from "node:test";
import {
  FRAME_BYTES, HEIGHT, WIDTH, asciiCommand, crc16CcittFalse,
  framePacket, hexToRgb, pixelOffset,
} from "./protocol.mjs";

test("ASCII commands are newline terminated and bounded", () => {
  assert.deepEqual([...asciiCommand(" PIXEL 19 14 ")], [...new TextEncoder().encode("PIXEL 19 14\n")]);
  assert.throws(() => asciiCommand(""), /Enter a command/);
  assert.throws(() => asciiCommand("TEXT नमस्ते"), /ASCII/);
  assert.throws(() => asciiCommand("X".repeat(96)), /95/);
  assert.throws(() => asciiCommand("TEXT HI\nCLEAR"), /ASCII/);
});

test("RGB frame matches the firmware packet format", () => {
  const rgb = new Uint8Array(FRAME_BYTES);
  rgb.set([255, 0, 0], pixelOffset(0, 0));
  rgb.set([0, 0, 255], pixelOffset(WIDTH - 1, HEIGHT - 1));
  const packet = framePacket(rgb);
  assert.equal(packet.length, 907);
  assert.deepEqual([...packet.subarray(0, 5)], [0x4d, 0x58, 0x46, 0x84, 0x03]);
  assert.deepEqual([...packet.subarray(5, 8)], [255, 0, 0]);
  assert.deepEqual([...packet.subarray(902, 905)], [0, 0, 255]);
  assert.equal(packet[905] | (packet[906] << 8), crc16CcittFalse(packet.subarray(2, 905)));
  assert.throws(() => framePacket(new Uint8Array(899)), /900/);
});

test("CRC matches the existing Python sender", () => {
  const empty = framePacket(new Uint8Array(FRAME_BYTES));
  assert.equal(empty[905] | (empty[906] << 8), 0xc92a);

  const solid = new Uint8Array(FRAME_BYTES);
  for (let offset = 0; offset < FRAME_BYTES; offset += 3) solid.set([1, 2, 3], offset);
  const packet = framePacket(solid);
  assert.equal(packet[905] | (packet[906] << 8), 0xe314);
});

test("visual coordinates and colors are validated", () => {
  assert.equal(pixelOffset(19, 14), 897);
  assert.deepEqual(hexToRgb("#10a0FF"), [16, 160, 255]);
  assert.throws(() => pixelOffset(20, 0), /coordinates/);
  assert.throws(() => hexToRgb("red"), /valid RGB/);
});
