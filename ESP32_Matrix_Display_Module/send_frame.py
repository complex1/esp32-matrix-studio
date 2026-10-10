#!/usr/bin/env python3
"""Send an RGB frame or text command to the ESP32 matrix display.

Pixels are in visual row-major order: frame[y][x] is [red, green, blue].
The ESP32 maps visual coordinates to the actual LED wiring.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path


WIDTH = 20
HEIGHT = 15
CHANNELS = 3
PAYLOAD_SIZE = WIDTH * HEIGHT * CHANNELS
BAUD_RATE = 115200
MAX_COMMAND_CHARS = 95


def crc16_ccitt_false(data: bytes) -> int:
    """CRC-16/CCITT-FALSE: polynomial 0x1021, initial value 0xFFFF."""
    crc = 0xFFFF
    for value in data:
        crc ^= value << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def frame_to_payload(frame: object) -> bytes:
    """Validate a 15x20x3 nested array and serialize it in RGB row order."""
    if not isinstance(frame, list) or len(frame) != HEIGHT:
        raise ValueError(f"Frame must contain exactly {HEIGHT} rows")

    payload = bytearray()
    for y, row in enumerate(frame):
        if not isinstance(row, list) or len(row) != WIDTH:
            raise ValueError(f"Row {y} must contain exactly {WIDTH} pixels")
        for x, pixel in enumerate(row):
            if not isinstance(pixel, list) or len(pixel) != CHANNELS:
                raise ValueError(f"Pixel ({x}, {y}) must be an [R, G, B] array")
            for channel, value in zip("RGB", pixel):
                if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 255:
                    raise ValueError(f"Pixel ({x}, {y}) {channel} must be an integer from 0 to 255")
                payload.append(value)

    return bytes(payload)


def make_packet(frame: object) -> bytes:
    """Build MX + F + uint16 length + 900 RGB bytes + uint16 CRC."""
    payload = frame_to_payload(frame)
    if len(payload) != PAYLOAD_SIZE:
        raise ValueError(f"Frame payload must be {PAYLOAD_SIZE} bytes")

    body = b"F" + len(payload).to_bytes(2, "little") + payload
    crc = crc16_ccitt_false(body)
    return b"MX" + body + crc.to_bytes(2, "little")


def send_packet(port_name: str, packet: bytes) -> None:
    try:
        import serial
    except ImportError as exc:
        raise RuntimeError("pyserial is required: python3 -m pip install pyserial") from exc

    with serial.Serial(port_name, BAUD_RATE, timeout=0.25, write_timeout=5) as port:
        # Many ESP32 boards restart when the serial port opens.
        time.sleep(2)
        port.reset_input_buffer()
        port.write(packet)
        port.flush()

        deadline = time.monotonic() + 5
        last_line = ""
        while time.monotonic() < deadline:
            line = port.readline().decode("utf-8", errors="replace").strip()
            if not line:
                continue
            last_line = line
            if line == "OK FRAME":
                print("OK FRAME")
                return
            if line.startswith("ERR"):
                raise RuntimeError(f"ESP32 replied: {line}")

    detail = f" Last line: {last_line}" if last_line else ""
    raise RuntimeError(f"No OK FRAME response from ESP32 within 5 seconds.{detail}")


def make_ascii_line(line: str) -> bytes:
    """Validate one complete line and append the firmware's newline delimiter."""
    if not line.strip():
        raise ValueError("Provide a command, such as TEXT HELLO")
    if "\r" in line or "\n" in line:
        raise ValueError("A serial command cannot contain a line break")
    try:
        encoded = line.encode("ascii")
    except UnicodeEncodeError as exc:
        raise ValueError("Serial commands must contain ASCII characters only") from exc
    if any(value < 32 or value > 126 for value in encoded):
        raise ValueError("Serial commands must contain printable ASCII characters only")
    if len(encoded) > MAX_COMMAND_CHARS:
        raise ValueError(f"Serial command exceeds {MAX_COMMAND_CHARS} characters")
    return encoded + b"\n"


def make_ascii_command(words: list[str]) -> bytes:
    """Build a command from shell words, normalizing the command name."""
    if not words:
        raise ValueError("Provide a command, such as TEXT HELLO")
    return make_ascii_line(" ".join([words[0].upper(), *words[1:]]))


def send_ascii_commands(port_name: str, command_lines: list[bytes]) -> None:
    """Send commands in one serial session, retaining settings between them."""
    try:
        import serial
    except ImportError as exc:
        raise RuntimeError("pyserial is required: python3 -m pip install pyserial") from exc

    with serial.Serial(port_name, BAUD_RATE, timeout=0.25, write_timeout=5) as port:
        # Many ESP32 boards restart when the serial port opens.
        time.sleep(2)
        port.reset_input_buffer()
        for command_line in command_lines:
            port.write(command_line)
            port.flush()

            deadline = time.monotonic() + 5
            last_line = ""
            while time.monotonic() < deadline:
                line = port.readline().decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                last_line = line
                if line == "OK" or line.startswith("OK "):
                    print(line)
                    break
                if line.startswith("ERR"):
                    raise RuntimeError(f"ESP32 replied: {line}")
            else:
                detail = f" Last line: {last_line}" if last_line else ""
                raise RuntimeError(f"No OK response from ESP32 within 5 seconds.{detail}")


def send_ascii_command(port_name: str, command_line: bytes) -> None:
    send_ascii_commands(port_name, [command_line])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", help="Serial port, for example /dev/cu.usbserial-0001")
    parser.add_argument("--dry-run", action="store_true", help="Build and validate packet without opening a serial port")
    commands = parser.add_subparsers(dest="command", required=True)

    solid = commands.add_parser("solid", help="Fill the matrix with one RGB color")
    solid.add_argument("red", type=int)
    solid.add_argument("green", type=int)
    solid.add_argument("blue", type=int)

    json_command = commands.add_parser("json", help="Send a JSON 15x20x3 RGB array")
    json_command.add_argument("path", type=Path)

    serial_command = commands.add_parser("command", help="Send a newline-terminated ASCII display command")
    serial_command.add_argument("words", nargs="+", help="Command and arguments, for example TEXT HELLO")

    batch_command = commands.add_parser("batch", help="Send quoted complete commands in one serial session")
    batch_command.add_argument("lines", nargs="+", help="For example 'COLOR 255 0 0' 'TEXT HELLO'")

    args = parser.parse_args()
    if not args.dry_run and not args.port:
        parser.error("--port is required unless --dry-run is used")

    try:
        if args.command == "solid":
            frame = [[[args.red, args.green, args.blue] for _ in range(WIDTH)] for _ in range(HEIGHT)]
        elif args.command == "json":
            frame = json.loads(args.path.read_text(encoding="utf-8"))
        elif args.command == "command":
            command_line = make_ascii_command(args.words)
            if args.dry_run:
                print(f"Valid command: {command_line[:-1].decode('ascii')} ({len(command_line) - 1} ASCII bytes + newline)")
            else:
                send_ascii_command(args.port, command_line)
            return 0
        elif args.command == "batch":
            command_lines = [make_ascii_line(line) for line in args.lines]
            if args.dry_run:
                for number, command_line in enumerate(command_lines, start=1):
                    print(f"Valid command {number}/{len(command_lines)}: {command_line[:-1].decode('ascii')} ({len(command_line) - 1} ASCII bytes + newline)")
            else:
                send_ascii_commands(args.port, command_lines)
            return 0

        packet = make_packet(frame)
        if args.dry_run:
            print(f"Valid frame: {PAYLOAD_SIZE} RGB bytes, {len(packet)} packet bytes, CRC 0x{int.from_bytes(packet[-2:], 'little'):04X}")
        else:
            send_packet(args.port, packet)
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
