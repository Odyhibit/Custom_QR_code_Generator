// QR Code Scannability Checker
// Downsamples the rendered QR to progressively smaller sizes, applies a
// deterministic tilt + blur to simulate handheld phone camera conditions,
// then attempts to decode each with BarcodeDetector (Chrome/Safari native)
// or jsQR as a fallback.

const QRScannability = {
    SIZES: [1024, 512, 256, 128, 64],

    // Camera simulation parameters (user-controlled)
    angle: 5,    // degrees of rotation
    blurPx: 1,   // gaussian blur radius in pixels

    // Internal state
    _timers: {},
    _lastCanvas: {},
    _lastContent: {},

    schedule(sourceCanvas, expectedContent, barId) {
        this._lastCanvas[barId] = sourceCanvas;
        this._lastContent[barId] = expectedContent;
        clearTimeout(this._timers[barId]);
        this._timers[barId] = setTimeout(
            () => this._run(sourceCanvas, expectedContent, barId),
            250
        );
    },

    // Re-run with stored canvas/content (used when controls change)
    _reschedule(barId) {
        const canvas = this._lastCanvas[barId];
        const content = this._lastContent[barId];
        if (canvas && content) this._run(canvas, content, barId);
    },

    async _run(sourceCanvas, expectedContent, barId) {
        if (!expectedContent) return;
        this._setPending(barId);

        let detector = null;
        if ('BarcodeDetector' in window) {
            try {
                detector = new BarcodeDetector({ formats: ['qr_code'] });
            } catch (e) { /* qr_code format not supported */ }
        }

        const results = await Promise.all(this.SIZES.map(async (size, i) => {
            // Step 1: draw at test size
            const raw = document.createElement('canvas');
            raw.width = size;
            raw.height = size;
            const rawCtx = raw.getContext('2d');
            rawCtx.drawImage(sourceCanvas, 0, 0, size, size);

            // Step 2: grayscale + global midpoint binarization.
            // Two problems solved here:
            //   a) Color: blurring colored modules smears hues into mixed
            //      colors that reduce effective luminance contrast. Converting
            //      to grayscale first normalises this.
            //   b) Padding-modified QR codes can have large uniform dark/light
            //      areas (intentionally filled via ECC padding manipulation).
            //      BarcodeDetector's adaptive local binarizer samples
            //      neighborhoods to set thresholds — a large uniform area
            //      provides no local contrast, so the threshold lands wrong for
            //      adjacent modules. A global midpoint threshold uses the full image
            //      histogram and correctly classifies these regions regardless of
            //      local context. After this step BarcodeDetector receives a
            //      nearly-binary image and its binarizer has a trivial job.
            const imgData = rawCtx.getImageData(0, 0, size, size);
            const px = imgData.data;
            // Grayscale pass
            for (let i = 0; i < px.length; i += 4) {
                const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
                px[i] = px[i + 1] = px[i + 2] = lum;
            }
            // Midpoint binarization pass
            const thresh = this._midpointThreshold(px);
            for (let i = 0; i < px.length; i += 4) {
                const v = px[i] < thresh ? 0 : 255;
                px[i] = px[i + 1] = px[i + 2] = v;
                px[i + 3] = 255;
            }
            rawCtx.putImageData(imgData, 0, 0);

            // Step 3: apply tilt + blur to simulate handheld camera conditions.
            // Fill white first so corners exposed by rotation are white rather
            // than transparent/black, which would otherwise look like dark
            // artifacts and confuse the decoder.
            const sim = document.createElement('canvas');
            sim.width = size;
            sim.height = size;
            const sCtx = sim.getContext('2d');
            sCtx.fillStyle = '#ffffff';
            sCtx.fillRect(0, 0, size, size);
            sCtx.translate(size / 2, size / 2);
            sCtx.rotate(this.angle * Math.PI / 180);
            if (this.blurPx > 0) sCtx.filter = `blur(${this.blurPx}px)`;
            sCtx.drawImage(raw, -size / 2, -size / 2, size, size);
            sCtx.filter = 'none';
            sCtx.setTransform(1, 0, 0, 1, 0, 0);

            // Debug: show the simulated image (what the decoder actually sees)
            const dbg = document.getElementById(`scan-debug-${barId}-${i}`);
            if (dbg) dbg.getContext('2d').drawImage(sim, 0, 0, 80, 80);

            if (detector) {
                try {
                    const barcodes = await detector.detect(sim);
                    return barcodes.some(b => b.rawValue === expectedContent);
                } catch (e) {
                    return false;
                }
            }

            if (window.jsQR) {
                return this._decodeWithJsQR(sim, size, expectedContent);
            }

            return false;
        }));

        this._updateUI(results, barId);
    },

    // Find the dominant dark peak and dominant light peak in the grayscale
    // histogram and return their midpoint as the binarization threshold.
    // More robust than Otsu for QR codes because:
    //   - Otsu maximises at t=0 for bimodal distributions with a dark peak at 0
    //     or near-0, then binarizes everything as white.
    //   - The midpoint between modes gives generous margin on both sides,
    //     capturing anti-aliased module edges rather than trimming them.
    _midpointThreshold(grayRGBA) {
        const hist = new Int32Array(256);
        for (let i = 0; i < grayRGBA.length; i += 4) hist[grayRGBA[i]]++;

        // Dominant dark peak: highest count in lower half [0, 127]
        let darkPeak = 0, darkCount = 0;
        for (let i = 0; i <= 127; i++) {
            if (hist[i] > darkCount) { darkCount = hist[i]; darkPeak = i; }
        }

        // Dominant light peak: highest count in upper half [128, 255]
        let lightPeak = 255, lightCount = 0;
        for (let i = 128; i <= 255; i++) {
            if (hist[i] > lightCount) { lightCount = hist[i]; lightPeak = i; }
        }

        return Math.round((darkPeak + lightPeak) / 2);
    },

    // jsQR fallback with binarize+dilate preprocessing
    _decodeWithJsQR(canvas, size, expectedContent) {
        const ctx = canvas.getContext('2d');
        const img = ctx.getImageData(0, 0, size, size);
        const px = img.data;
        for (let i = 0; i < px.length; i += 4) {
            const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            const v = lum < 128 ? 0 : 255;
            px[i] = px[i + 1] = px[i + 2] = v;
            px[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);

        const blurPx = Math.max(1, Math.round(size / 100));
        const dil = document.createElement('canvas');
        dil.width = size;
        dil.height = size;
        const dCtx = dil.getContext('2d');
        dCtx.filter = `blur(${blurPx}px)`;
        dCtx.drawImage(canvas, 0, 0);
        dCtx.filter = 'none';

        const dilImg = dCtx.getImageData(0, 0, size, size);
        const dp = dilImg.data;
        for (let i = 0; i < dp.length; i += 4) {
            const v = dp[i] < 180 ? 0 : 255;
            dp[i] = dp[i + 1] = dp[i + 2] = v;
            dp[i + 3] = 255;
        }

        const result = jsQR(dp, size, size);
        return result !== null && result.data === expectedContent;
    },

    // Wire up the tilt/blur controls in both bars, keeping them in sync
    initControls() {
        const barIds = ['main', 'delete'];

        const syncAndRun = () => {
            barIds.forEach(id => {
                const angleEl = document.getElementById(`scan-angle-${id}`);
                const blurEl  = document.getElementById(`scan-blur-${id}`);
                const angleVal = document.getElementById(`scan-angle-val-${id}`);
                const blurVal  = document.getElementById(`scan-blur-val-${id}`);
                if (angleEl)  angleEl.value = this.angle;
                if (blurEl)   blurEl.value  = this.blurPx;
                if (angleVal) angleVal.textContent = `${this.angle}°`;
                if (blurVal)  blurVal.textContent  = `${this.blurPx}px`;
            });
            barIds.forEach(id => this._reschedule(id));
        };

        barIds.forEach(barId => {
            const angleInput = document.getElementById(`scan-angle-${barId}`);
            const blurInput  = document.getElementById(`scan-blur-${barId}`);

            if (angleInput) {
                angleInput.addEventListener('input', () => {
                    this.angle = parseFloat(angleInput.value);
                    syncAndRun();
                });
            }
            if (blurInput) {
                blurInput.addEventListener('input', () => {
                    this.blurPx = parseFloat(blurInput.value);
                    syncAndRun();
                });
            }
        });
    },

    _setPending(barId) {
        this.SIZES.forEach((_, i) => {
            const dot = document.getElementById(`scan-dot-${barId}-${i}`);
            if (dot) dot.className = 'scan-dot pending';
        });
    },

    _updateUI(results, barId) {
        this.SIZES.forEach((size, i) => {
            const dot = document.getElementById(`scan-dot-${barId}-${i}`);
            if (dot) {
                dot.className = `scan-dot ${results[i] ? 'pass' : 'fail'}`;
                dot.title = `${size}px: ${results[i] ? 'pass' : 'fail'}`;
            }
        });
    }
};
