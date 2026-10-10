export const WIDTH = 20;
export const HEIGHT = 15;
export const CHANNELS = 3;
export const FRAME_BYTES = WIDTH * HEIGHT * CHANNELS;
export const MAX_COMMAND_BYTES = 95;

const encoder = new TextEncoder();

export function asciiCommand(input) {
  const command = input.trim();
  if (!command) throw new Error("Enter a command first.");
  if (!/^[\x20-\x7e]+$/.test(command)) {
    throw new Error("Commands must use printable ASCII characters only.");
  }
  if (command.length > MAX_COMMAND_BYTES) {
    throw new Error(`Commands are limited to ${MAX_COMMAND_BYTES} characters.`);
  }
  return encoder.encode(`${command}\n`);
}

export function crc16CcittFalse(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

export function framePacket(rgb) {
  if (!(rgb instanceof Uint8Array) || rgb.length !== FRAME_BYTES) {
    throw new Error(`A frame must contain exactly ${FRAME_BYTES} RGB bytes.`);
  }

  // MX + F + uint16 LE length + 900 row-major RGB bytes + CRC16 LE.
  const packet = new Uint8Array(2 + 1 + 2 + FRAME_BYTES + 2);
  packet.set([0x4d, 0x58, 0x46, FRAME_BYTES & 0xff, FRAME_BYTES >> 8]);
  packet.set(rgb, 5);
  const crc = crc16CcittFalse(packet.subarray(2, 5 + FRAME_BYTES));
  packet[5 + FRAME_BYTES] = crc & 0xff;
  packet[6 + FRAME_BYTES] = crc >> 8;
  return packet;
}

export function pixelOffset(x, y) {
  if (!Number.isInteger(x) || x < 0 || x >= WIDTH ||
      !Number.isInteger(y) || y < 0 || y >= HEIGHT) {
    throw new Error("Pixel coordinates must be x=0..19 and y=0..14.");
  }
  return (y * WIDTH + x) * CHANNELS;
}

export function hexToRgb(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error("Select a valid RGB color.");
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
}
