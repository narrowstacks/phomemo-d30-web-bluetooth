# Phomemo D30 Web Bluetooth

A browser-based label designer and printer for the [Phomemo D30](https://www.amazon.com/dp/B08HV3MPFD) Bluetooth label maker. It runs entirely client-side and talks to the printer over [Web Bluetooth](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API), so there's no app to install and nothing leaves your machine.

This is an expanded fork of [odensc/phomemo-d30-web-bluetooth](https://github.com/odensc/phomemo-d30-web-bluetooth), which figured out the D30 protocol and built the original proof of concept. See [Credits](#credits).

## Demo

[Try it here.](https://narrowstacks.github.io/phomemo-d30-web-bluetooth/) Use a Web Bluetooth–compatible browser (see [Requirements](#requirements)).

## Features

- **Text** — pick a font family, size, weight, and alignment, with multi-line support.
- **Images** — upload an image and position it above, below, beside, or behind the text, and control its size on the label.
- **Image processing** — brightness, contrast, gamma, pre-blur, and edge enhancement, with a range of dithering algorithms:
  - Error diffusion: Floyd–Steinberg, Atkinson, Stucki, Jarvis-Judice-Ninke, Sierra, Burkes, Two-Phase Diffusion
  - Ordered: Bayer 2x2 / 4x4 / 8x8, Blue Noise
  - Plain threshold
- **QR codes & barcodes** — generate a QR code (with selectable error correction) or a barcode (CODE128, CODE39, EAN13, EAN8, UPC) and place it anywhere on the label.
- **Layout** — rotate the design (0/90/180/270°) and nudge elements into place with a live canvas preview.

## Requirements

You need a Web Bluetooth–compatible browser. That means a Chromium-based browser (Chrome, Edge, Brave, etc.) on desktop or Android. Safari and Firefox do not support Web Bluetooth.

## Usage

1. Open the app in a supported browser.
2. Design your label using the text, image, and code controls.
3. Click connect and select your Phomemo D30 from the Bluetooth pairing dialog.
4. Print.

To run it locally, serve the directory over HTTP. Web Bluetooth requires a secure context, so `localhost` or HTTPS works:

```sh
npx serve .
```

## Credits

This project builds directly on [odensc/phomemo-d30-web-bluetooth](https://github.com/odensc/phomemo-d30-web-bluetooth) by [odensc](https://github.com/odensc), who reverse-engineered the D30 print protocol and wrote the original Web Bluetooth demo. The label-designer features in this fork are built on top of that foundation.

The original protocol and image-conversion work in turn drew on these projects:

- https://github.com/WebBluetoothCG/demos
- https://github.com/Knightro63/phomemo

## License

[Apache License 2.0](LICENSE)
