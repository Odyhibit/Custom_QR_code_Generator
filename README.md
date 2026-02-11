# Custom QR Code Generator

A browser-based QR code generator with deep customization options including logo embedding, module painting, color palettes, and codeword deletion. No server required -- everything runs client-side.

**[Try it live](https://odyhibit.github.io/Custom_QR_code_Generator/)**

## Features

### 9 Content Types
Text, URL, Contact (vCard), Phone, SMS, Email, WiFi, Calendar Event, and Location.

### Logo Embedding
- Upload and visually position a logo on the QR code
- Adjustable scale (20--150%)
- Automatic color palette extraction from the logo
- Mask pattern optimization to align padding modules with logo dark/light areas

### Padding Painting
- Paint individual padding modules black or white
- Shift+drag to fill rectangular areas
- Grid overlay distinguishes editable (padding) cells from locked (data) cells
- Can automatically match the black/white squares to the Logo

### Styling
- **Module shapes**: Square, circle, rounded, diamond, cushion
- **Finder shapes**: Square, rounded, circle, hybrid, hybrid-inverse with independent outer/middle/center colors
- **Module sizing**: Adjustable from 20--100%
- **Color modes**: Manual colors, palette from logo, or gradient from logo with brightness controls
- **Background fill**: Light or dark from extracted palette

### Codeword Deletion
- Click to delete entire codewords and see which error correction blocks they belong to
- Color-coded block legend with deletion counts
- Paint over deleted regions with black or white
- Toggle deleted module visibility for a clean preview

### Export & Projects
- Export as PNG at 512px, 1024px, or 2048px
- Adjustable quiet zone (0--4 modules)
- Save/load full project state as JSON (content, logo, style, edits, deletions)

## Getting Started

No build step required. Open `index.html` in a browser or serve it with any static file server:

```bash
# Python
python -m http.server

# Node
npx serve
```

## Project Structure

```
index.html              Main 4-step wizard UI
styles.css              All styling
js/
  app.js                Application logic and UI orchestration
  qr-renderer.js        Canvas rendering with styling options
  qr-types.js           Content type definitions and form generation
  color-utils.js         Color extraction, conversion, and matching
core/
  encoder-core.js       QR bitstream encoding with padding tracking
  qr-utils.js           QR utility functions
  qr-block-tables.js    ECC block structure tables
  qr-reed-solomon.js    Reed-Solomon error correction
```

## How It Works

The generator encodes content into a QR bitstream, tracks which modules correspond to padding bytes, and exposes those padding modules for visual editing. This lets you reshape the QR code's appearance without corrupting the encoded data. The codeword deletion step goes further, letting you intentionally remove data codewords and rely on error correction for recovery.

## License

MIT
