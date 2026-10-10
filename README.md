# ESP32 Matrix Studio

A mobile-friendly controller and Arduino firmware for a 20×15, 300-pixel WS2812B
matrix. Use Wi-Fi for autonomous ESP32 playback, USB serial for manual commands
and frames, or **Try demo** to explore without hardware.

The studio includes digital/analog clocks, a countdown timer, 60 effects, live
pixel drawing, scrolling ASCII text, local image-to-pixel conversion, and a
48-frame animation editor with 10 built-in examples. Built-in frame animations
have black/off backgrounds; custom and imported colors are preserved.

## Get started

1. Open `ESP32_Matrix_Display_Module/ESP32_Matrix_Display_Module.ino` in Arduino IDE.
2. Install FastLED and select the ESP32 board. The tested setup uses ESP32 Arduino
   core 3.3.11, FastLED 3.10.6, a 4 MB ESP32 Dev Module, and the **No OTA
   (2MB APP/2MB SPIFFS)** partition. GPIO25 is the data pin.
3. Copy `WiFiConfig.local.example.h` to `WiFiConfig.local.h` inside the sketch
   folder. Set your own hotspot password, control passcode, and optional 2.4 GHz
   router credentials. The local file is ignored by Git: never commit it.
4. Upload over USB, then open the ESP32 URL printed at 115200 baud. The panel
   initially shows the last two IP parts. Hotspot-only mode uses the default
   AP address `http://192.168.4.1/`.

See the [complete setup, mapping, protocol, and extension guide](ESP32_Matrix_Display_Module/README.md).
This particular wiring has corrected column-pair swaps; calibrate
`MatrixDisplay.cpp` before reusing it on a differently wired panel. Use a
suitable 5 V LED supply with a common ESP32 ground.

## Browser UI and GitHub Pages

After Pages is enabled and the publish workflow completes, the controller is at
[complex1.github.io/esp32-matrix-studio](https://complex1.github.io/esp32-matrix-studio/).
In the repository's **Settings → Pages**, choose **GitHub Actions** as the source.
A push to `main`, or a manual **Publish Matrix Studio UI** run on `main`, validates
the project and publishes only the sketch's `web/` static assets. Browser test
files, firmware, and private configuration are not in the Pages artifact.

The public website can open anywhere; it does **not** make your ESP32 reachable
from anywhere. A private ESP32 IP needs the same network or a separately secured
gateway/VPN. An HTTPS page making requests to the ESP32's plain HTTP API may be
blocked or require local-network permission depending on the browser. If it
fails, open the ESP32-hosted page directly. Do not publicly forward the ESP32
port; its passcode-over-HTTP API is designed for a trusted DIY local network.
Pages is a static UI, not a proxy or secure remote-access service.

For a local desktop page, run from the sketch folder:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory web
```

Open `http://127.0.0.1:8765/`. USB requires a desktop browser with Web Serial;
close other serial monitors before connecting. Wi-Fi can be controlled from a
phone browser. Drafts autosave in each browser/origin; export/import JSON to
move them between the local, ESP-hosted, and Pages versions.

## Development and checks

From `ESP32_Matrix_Display_Module`, with Node.js 24 and a C++17 compiler:

```sh
node scripts/embed_web.mjs
node scripts/embed_web.mjs --check
node --test web/*.test.mjs
bash scripts/check-native.sh
```

The generated `WebAssets.h` must be refreshed after browser changes so the
ESP-hosted UI matches the source. PR checks have read-only repository access and
run asset verification, all Node tests, and four native C++ sanitizer suites
(mode rendering, router policy, serial rendering revisions, and HTTP parsing).
The Pages deployment runs the same checks first. These checks do not flash a
board and cannot prove physical LED output.

To inspect the exact Pages bundle locally, use a new empty destination:

```sh
node scripts/build-pages.mjs /tmp/matrix-studio-pages-preview
```

The staging script refuses to overwrite a nonempty directory and excludes tests,
hidden files, symbolic links, and non-browser file types.
