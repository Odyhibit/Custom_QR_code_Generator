// QR Code Renderer
// Handles rendering QR codes with custom styling options

const QRRenderer = {
    // Styling state
    state: {
        logoImage: null,
        logoImg: null,
        logoImageData: null,
        originalLogoImg: null,
        originalLogoImageData: null,
        logoPrep: {
            backgroundMode: 'none', // 'none', 'white', 'black'
            tolerance: 32,
            fillHoles: true,
            outlineEnabled: true,
            outlineColor: '#ffffff',
            outlineWidth: 3
        },
        logoX: 50, // percentage position
        logoY: 50,
        logoScale: 100,
        moduleShape: 'cushion', // 'square', 'circle', 'rounded', 'diamond', 'cushion'
        moduleSize: 80, // percentage (20-100)
        colorMode: 'simple', // 'simple', 'default', 'palette', 'gradient'
        darkPalette: ['#000000', '#333333', '#1a1a1a', '#0d0d0d'],
        lightPalette: ['#ffffff', '#f0f0f0', '#e0e0e0', '#d0d0d0'],
        darkMaxLuminosity: 33,
        lightMinLuminosity: 66,
        quietZone: 2,
        finderShape: 'rounded', // 'square', 'circle', 'hybrid', 'hybrid-inverse', 'rounded'
        finderOuterColor: '#000000',
        finderMiddleColor: '#ffffff',
        finderCenterColor: '#000000',
        backgroundFill: 'light', // 'light', 'dark'
        finderFullSeparator: false,
        // Simple 2-color mode (no logo)
        simpleDarkColor: '#000000',
        simpleLightColor: '#ffffff',
        // Layer blending (logo only)
        layers: {
            enabled: false,
            bottomShape: 'square',
            bottomSize: 100,
            bottomColor: '#000000'
        }
    },

    /**
     * Load logo image
     */
    loadLogo(file, callback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Store original image for re-processing on prep changes
                this.state.originalLogoImg = img;
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                tempCtx.drawImage(img, 0, 0);
                this.state.originalLogoImageData = tempCtx.getImageData(0, 0, img.width, img.height);

                // Reset prep to defaults, using size-aware outline width
                this.state.logoPrep = {
                    backgroundMode: 'none',
                    tolerance: 32,
                    fillHoles: true,
                    outlineEnabled: true,
                    outlineColor: '#ffffff',
                    outlineWidth: this.getDefaultOutlineWidth()
                };

                // Reset position to center
                this.state.logoX = 50;
                this.state.logoY = 50;

                // Apply prep pipeline (initially passes through unchanged)
                this.applyLogoPrep(callback);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    /**
     * Clear logo
     */
    clearLogo() {
        this.state.logoImage = null;
        this.state.logoImg = null;
        this.state.logoImageData = null;
        this.state.originalLogoImg = null;
        this.state.originalLogoImageData = null;
        this.state.logoPrep = {
            backgroundMode: 'none',
            tolerance: 32,
            fillHoles: true,
            outlineEnabled: true,
            outlineColor: '#ffffff',
            outlineWidth: 3
        };
        this.state.logoX = 50;
        this.state.logoY = 50;
        this.state.darkPalette = ['#000000', '#333333', '#1a1a1a', '#0d0d0d'];
        this.state.lightPalette = ['#ffffff', '#f0f0f0', '#e0e0e0', '#d0d0d0'];
        this.state.backgroundFill = 'light';
    },

    // ========== LOGO PREP ==========

    hexToRgb(hex) {
        const clean = hex.replace('#', '');
        return {
            r: parseInt(clean.slice(0, 2), 16),
            g: parseInt(clean.slice(2, 4), 16),
            b: parseInt(clean.slice(4, 6), 16)
        };
    },

    getDefaultOutlineWidth() {
        const source = this.state.originalLogoImageData;
        if (!source) return 3;
        const sourceLongSide = Math.max(source.width, source.height);
        const scale = Math.max(0.01, this.state.logoScale / 100);

        // Scale to ~1 module worth of coverage so the outline reliably shows through
        const matrixSize = (typeof App !== 'undefined' && App.state && App.state.matrix)
            ? App.state.matrix.length : 0;

        if (matrixSize > 0) {
            return Math.max(1, Math.round(sourceLongSide / (matrixSize * scale)));
        }
        // Fallback: assume typical 25-module QR
        return Math.max(1, Math.round(sourceLongSide / 25));
    },

    buildOutsideTransparentMask(opaque, width, height) {
        const outside = new Uint8Array(width * height);
        const queue = [];

        const enqueue = (x, y) => {
            if (x < 0 || y < 0 || x >= width || y >= height) return;
            const index = y * width + x;
            if (opaque[index] || outside[index]) return;
            outside[index] = 1;
            queue.push(index);
        };

        for (let x = 0; x < width; x++) {
            enqueue(x, 0);
            enqueue(x, height - 1);
        }
        for (let y = 1; y < height - 1; y++) {
            enqueue(0, y);
            enqueue(width - 1, y);
        }

        for (let i = 0; i < queue.length; i++) {
            const index = queue[i];
            const x = index % width;
            const y = Math.floor(index / width);
            enqueue(x + 1, y);
            enqueue(x - 1, y);
            enqueue(x, y + 1);
            enqueue(x, y - 1);
        }

        return outside;
    },

    // Squared Euclidean distance from each pixel to the nearest opaque pixel
    // (Felzenszwalb & Huttenlocher exact distance transform, O(width*height))
    buildDistanceSqToOpaque(opaque, width, height) {
        const INF = 1e20;
        const size = Math.max(width, height);
        const f = new Float64Array(size);
        const d = new Float64Array(size);
        const v = new Int32Array(size);
        const z = new Float64Array(size + 1);
        const distSq = new Float64Array(width * height);

        const transform1d = (n) => {
            let k = 0;
            v[0] = 0;
            z[0] = -INF;
            z[1] = INF;
            for (let q = 1; q < n; q++) {
                let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
                while (s <= z[k]) {
                    k--;
                    s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
                }
                k++;
                v[k] = q;
                z[k] = s;
                z[k + 1] = INF;
            }
            k = 0;
            for (let q = 0; q < n; q++) {
                while (z[k + 1] < q) k++;
                d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
            }
        };

        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) f[y] = opaque[y * width + x] ? 0 : INF;
            transform1d(height);
            for (let y = 0; y < height; y++) distSq[y * width + x] = d[y];
        }
        for (let y = 0; y < height; y++) {
            const row = y * width;
            for (let x = 0; x < width; x++) f[x] = distSq[row + x];
            transform1d(width);
            for (let x = 0; x < width; x++) distSq[row + x] = d[x];
        }

        return distSq;
    },

    prepareLogoImageData(sourceImageData) {
        const prep = this.state.logoPrep;
        const sourceWidth = sourceImageData.width;
        const sourceHeight = sourceImageData.height;
        const outlineWidth = prep.outlineEnabled ? Math.max(0, parseInt(prep.outlineWidth) || 0) : 0;
        const border = outlineWidth;
        const width = sourceWidth + border * 2;
        const height = sourceHeight + border * 2;
        const data = new Uint8ClampedArray(width * height * 4);

        // Copy source into bordered region
        for (let y = 0; y < sourceHeight; y++) {
            for (let x = 0; x < sourceWidth; x++) {
                const si = (y * sourceWidth + x) * 4;
                const ti = ((y + border) * width + (x + border)) * 4;
                data[ti] = sourceImageData.data[si];
                data[ti + 1] = sourceImageData.data[si + 1];
                data[ti + 2] = sourceImageData.data[si + 2];
                data[ti + 3] = sourceImageData.data[si + 3];
            }
        }

        // Background removal
        if (prep.backgroundMode !== 'none') {
            const bg = prep.backgroundMode === 'white' ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
            const tol = Math.max(0, parseInt(prep.tolerance) || 0);
            const feather = 32;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] === 0) continue;
                const dr = data[i] - bg.r;
                const dg = data[i + 1] - bg.g;
                const db = data[i + 2] - bg.b;
                const dist = Math.sqrt(dr * dr + dg * dg + db * db);
                if (dist <= tol) {
                    data[i + 3] = 0;
                } else if (dist <= tol + feather) {
                    data[i + 3] = Math.round(data[i + 3] * (dist - tol) / feather);
                }
            }
        }

        // Build opaque mask
        const outlineRgb = this.hexToRgb(prep.outlineColor || '#ffffff');
        const opaque = new Uint8Array(width * height);
        for (let index = 0; index < width * height; index++) {
            opaque[index] = data[index * 4 + 3] >= 128 ? 1 : 0;
        }

        // Fill holes (transparent pixels enclosed by opaque ones)
        if (prep.fillHoles) {
            const outside = this.buildOutsideTransparentMask(opaque, width, height);
            for (let index = 0; index < width * height; index++) {
                if (!opaque[index] && !outside[index]) {
                    const di = index * 4;
                    data[di] = outlineRgb.r;
                    data[di + 1] = outlineRgb.g;
                    data[di + 2] = outlineRgb.b;
                    data[di + 3] = 255;
                    opaque[index] = 1;
                }
            }
        }

        // Draw outline around opaque pixels
        const output = new Uint8ClampedArray(data);
        if (outlineWidth > 0) {
            const radiusSq = outlineWidth * outlineWidth;
            const distSq = this.buildDistanceSqToOpaque(opaque, width, height);
            for (let index = 0; index < width * height; index++) {
                if (opaque[index] || distSq[index] > radiusSq) continue;
                const di = index * 4;
                output[di] = outlineRgb.r;
                output[di + 1] = outlineRgb.g;
                output[di + 2] = outlineRgb.b;
                output[di + 3] = 255;
            }
        }

        return new ImageData(output, width, height);
    },

    applyLogoPrep(callback) {
        if (!this.state.originalLogoImageData) {
            if (callback) callback();
            return;
        }

        const src = this.state.originalLogoImageData;
        const cloned = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
        const preparedImageData = this.prepareLogoImageData(cloned);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = preparedImageData.width;
        canvas.height = preparedImageData.height;
        ctx.putImageData(preparedImageData, 0, 0);

        const img = new Image();
        img.onload = () => {
            this.state.logoImage = canvas.toDataURL('image/png');
            this.state.logoImg = img;
            this.state.logoImageData = preparedImageData;

            const colors = ColorUtils.extractDominantColors(img);
            this.state.darkPalette = colors.darkPalette;
            this.state.lightPalette = colors.lightPalette;

            if (callback) callback();
        };
        img.src = canvas.toDataURL('image/png');
    },

    /**
     * Check if a module is part of a finder pattern (7x7 core only)
     */
    isFinderPattern(row, col, moduleCount) {
        if (row <= 6 && col <= 6) return true;
        if (row <= 6 && col >= moduleCount - 7) return true;
        if (row >= moduleCount - 7 && col <= 6) return true;
        return false;
    },

    /**
     * Check if a module is a separator (1-module border around finders)
     */
    isSeparator(row, col, moduleCount) {
        if (row <= 7 && col <= 7) {
            if (row === 7 || col === 7) return true;
        }
        if (row <= 7 && col >= moduleCount - 8) {
            if (row === 7 || col === moduleCount - 8) return true;
        }
        if (row >= moduleCount - 8 && col <= 7) {
            if (row === moduleCount - 8 || col === 7) return true;
        }
        return false;
    },

    /**
     * Calculate logo dimensions and position
     */
    getLogoBounds(qrAreaSize) {
        if (!this.state.logoImg) return null;

        const img = this.state.logoImg;
        const scale = this.state.logoScale / 100;
        const maxSize = qrAreaSize * scale;
        const aspectRatio = img.width / img.height;

        let logoWidth, logoHeight;
        if (aspectRatio > 1) {
            logoWidth = maxSize;
            logoHeight = maxSize / aspectRatio;
        } else {
            logoHeight = maxSize;
            logoWidth = maxSize * aspectRatio;
        }

        const logoX = (qrAreaSize * this.state.logoX / 100) - (logoWidth / 2);
        const logoY = (qrAreaSize * this.state.logoY / 100) - (logoHeight / 2);

        return { x: logoX, y: logoY, width: logoWidth, height: logoHeight };
    },

    /**
     * Draw logo as background
     */
    drawLogoBackground(ctx, offsetX, offsetY, qrAreaSize) {
        if (!this.state.logoImg) return;

        const bounds = this.getLogoBounds(qrAreaSize);
        if (!bounds) return;

        ctx.drawImage(
            this.state.logoImg,
            offsetX + bounds.x,
            offsetY + bounds.y,
            bounds.width,
            bounds.height
        );
    },

    /**
     * Sample logo color at specific position
     */
    sampleLogo(canvasX, canvasY, qrAreaSize) {
        if (!this.state.logoImg || !this.state.logoImageData) {
            return null;
        }

        const bounds = this.getLogoBounds(qrAreaSize);
        if (!bounds) return null;

        const logoLocalX = canvasX - bounds.x;
        const logoLocalY = canvasY - bounds.y;

        if (logoLocalX < 0 || logoLocalX >= bounds.width || logoLocalY < 0 || logoLocalY >= bounds.height) {
            return null;
        }

        const logoOriginalX = Math.floor((logoLocalX / bounds.width) * this.state.logoImg.width);
        const logoOriginalY = Math.floor((logoLocalY / bounds.height) * this.state.logoImg.height);

        const clampedX = Math.max(0, Math.min(this.state.logoImg.width - 1, logoOriginalX));
        const clampedY = Math.max(0, Math.min(this.state.logoImg.height - 1, logoOriginalY));

        const idx = (clampedY * this.state.logoImg.width + clampedX) * 4;

        return [
            this.state.logoImageData.data[idx],
            this.state.logoImageData.data[idx + 1],
            this.state.logoImageData.data[idx + 2],
            this.state.logoImageData.data[idx + 3]
        ];
    },

    /**
     * Sample the dominant logo color around a position
     */
    sampleLogoDominant(canvasX, canvasY, qrAreaSize, sampleSize) {
        if (!this.state.logoImg || !this.state.logoImageData) {
            return null;
        }

        const bounds = this.getLogoBounds(qrAreaSize);
        if (!bounds) return null;

        const logoLocalX = canvasX - bounds.x;
        const logoLocalY = canvasY - bounds.y;

        if (logoLocalX < 0 || logoLocalX >= bounds.width || logoLocalY < 0 || logoLocalY >= bounds.height) {
            return null;
        }

        const centerX = (logoLocalX / bounds.width) * this.state.logoImg.width;
        const centerY = (logoLocalY / bounds.height) * this.state.logoImg.height;

        const sampleWidth = Math.max(1, Math.round((sampleSize / bounds.width) * this.state.logoImg.width));
        const sampleHeight = Math.max(1, Math.round((sampleSize / bounds.height) * this.state.logoImg.height));
        const halfW = sampleWidth / 2;
        const halfH = sampleHeight / 2;

        const minX = Math.max(0, Math.floor(centerX - halfW));
        const maxX = Math.min(this.state.logoImg.width - 1, Math.floor(centerX + halfW));
        const minY = Math.max(0, Math.floor(centerY - halfH));
        const maxY = Math.min(this.state.logoImg.height - 1, Math.floor(centerY + halfH));

        const regionWidth = maxX - minX + 1;
        const regionHeight = maxY - minY + 1;
        const targetSamples = 36;
        const stepX = Math.max(1, Math.floor(regionWidth / Math.sqrt(targetSamples)));
        const stepY = Math.max(1, Math.floor(regionHeight / Math.sqrt(targetSamples)));

        const buckets = new Map();
        const quantize = (val) => Math.min(255, Math.round(val / 4) * 4);

        for (let y = minY; y <= maxY; y += stepY) {
            for (let x = minX; x <= maxX; x += stepX) {
                const idx = (y * this.state.logoImg.width + x) * 4;
                const a = this.state.logoImageData.data[idx + 3];
                if (a < 128) continue;

                const r = this.state.logoImageData.data[idx];
                const g = this.state.logoImageData.data[idx + 1];
                const b = this.state.logoImageData.data[idx + 2];
                const qR = quantize(r);
                const qG = quantize(g);
                const qB = quantize(b);
                const key = `${qR},${qG},${qB}`;

                if (!buckets.has(key)) {
                    buckets.set(key, { count: 1, r: r, g: g, b: b });
                } else {
                    const entry = buckets.get(key);
                    entry.count += 1;
                    entry.r += r;
                    entry.g += g;
                    entry.b += b;
                }
            }
        }

        if (buckets.size === 0) return null;

        let best = null;
        for (const entry of buckets.values()) {
            if (!best || entry.count > best.count) {
                best = entry;
            }
        }

        return [
            Math.round(best.r / best.count),
            Math.round(best.g / best.count),
            Math.round(best.b / best.count),
            255
        ];
    },

    /**
     * Sample the logo's alpha at a QR-area pixel coordinate (no offset).
     * Returns 0–255; 0 if outside the logo bounds entirely.
     */
    sampleLogoAlpha(canvasX, canvasY, qrAreaSize) {
        if (!this.state.logoImg || !this.state.logoImageData) return 0;
        const bounds = this.getLogoBounds(qrAreaSize);
        if (!bounds) return 0;

        const lx = canvasX - bounds.x;
        const ly = canvasY - bounds.y;
        if (lx < 0 || lx >= bounds.width || ly < 0 || ly >= bounds.height) return 0;

        const imgX = Math.min(this.state.logoImageData.width - 1, Math.floor((lx / bounds.width) * this.state.logoImageData.width));
        const imgY = Math.min(this.state.logoImageData.height - 1, Math.floor((ly / bounds.height) * this.state.logoImageData.height));
        return this.state.logoImageData.data[(imgY * this.state.logoImageData.width + imgX) * 4 + 3];
    },

    /**
     * Get color for a module based on color mode
     */
    getModuleColor(canvasX, canvasY, isDark, qrAreaSize, moduleSize) {
        if (this.state.colorMode === 'default') {
            return isDark ? '#000000' : '#ffffff';
        }

        // Simple 2-color mode when no logo is loaded
        if (this.state.colorMode === 'simple') {
            return isDark ? this.state.simpleDarkColor : this.state.simpleLightColor;
        }

        const sampleSize = moduleSize * 0.5;
        let sampledRgba = this.sampleLogoDominant(canvasX, canvasY, qrAreaSize, sampleSize);

        if (!sampledRgba || sampledRgba[3] < 128) {
            // Outside logo or transparent - use defaults based on color mode
            if (this.state.colorMode === 'palette') {
                const palette = isDark ? this.state.darkPalette : this.state.lightPalette;
                return palette[0];
            }
            // Gradient mode: use background fill color so sliders control the result
            const bgPalette = this.state.backgroundFill === 'dark' ? this.state.darkPalette : this.state.lightPalette;
            const hex = bgPalette[0] || (this.state.backgroundFill === 'dark' ? '#000000' : '#ffffff');
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            sampledRgba = [r, g, b, 255];
        }

        const sampledRgb = [sampledRgba[0], sampledRgba[1], sampledRgba[2]];

        if (this.state.colorMode === 'gradient') {
            const hsl = ColorUtils.rgbToHsl(sampledRgb[0], sampledRgb[1], sampledRgb[2]);
            const sampledLuminosity = hsl.l;

            if (isDark) {
                if (sampledLuminosity > this.state.darkMaxLuminosity && hsl.l > this.state.darkMaxLuminosity) {
                    hsl.l = this.state.darkMaxLuminosity;
                }
            } else {
                if (sampledLuminosity < this.state.lightMinLuminosity && hsl.l < this.state.lightMinLuminosity) {
                    hsl.l = this.state.lightMinLuminosity;
                }
            }

            const rgb = ColorUtils.hslToRgb(hsl.h, hsl.s, hsl.l);
            return ColorUtils.rgbToHex(rgb.r, rgb.g, rgb.b);
        } else if (this.state.colorMode === 'palette') {
            const palette = isDark ? this.state.darkPalette : this.state.lightPalette;
            return ColorUtils.findBestMatch(sampledRgb, palette);
        }

        return isDark ? '#000000' : '#ffffff';
    },

    /**
     * Draw white quiet zone overlay to prevent logo bleed
     */
    drawQuietZoneOverlay(ctx, canvasSize, moduleSize, quietZone) {
        if (!quietZone || quietZone <= 0) return;

        const quietZonePixels = quietZone * moduleSize;
        ctx.fillStyle = this.state.finderMiddleColor;
        ctx.fillRect(0, 0, canvasSize, quietZonePixels);
        ctx.fillRect(0, canvasSize - quietZonePixels, canvasSize, quietZonePixels);
        ctx.fillRect(0, 0, quietZonePixels, canvasSize);
        ctx.fillRect(canvasSize - quietZonePixels, 0, quietZonePixels, canvasSize);
    },

    /**
     * Draw a single module with shape
     */
    drawModule(ctx, x, y, width, height, color, shape, sizeFraction) {
        ctx.fillStyle = color;

        const shrunkWidth = width * sizeFraction;
        const shrunkHeight = height * sizeFraction;
        const offsetX = (width - shrunkWidth) / 2;
        const offsetY = (height - shrunkHeight) / 2;
        const centerX = x + offsetX + shrunkWidth / 2;
        const centerY = y + offsetY + shrunkHeight / 2;

        if (shape === 'circle') {
            const radius = Math.min(shrunkWidth, shrunkHeight) / 2;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fill();
        } else if (shape === 'rounded') {
            const rx = x + offsetX;
            const ry = y + offsetY;
            const radius = Math.min(shrunkWidth, shrunkHeight) * 0.10;
            ctx.beginPath();
            ctx.roundRect(rx, ry, shrunkWidth, shrunkHeight, radius);
            ctx.fill();
        } else if (shape === 'cushion') {
            const halfWidth = shrunkWidth / 2;
            const halfHeight = shrunkHeight / 2;
            const top = { x: centerX, y: y + offsetY };
            const right = { x: x + offsetX + shrunkWidth, y: centerY };
            const bottom = { x: centerX, y: y + offsetY + shrunkHeight };
            const left = { x: x + offsetX, y: centerY };
            const concaveFactor = 0.35;

            ctx.beginPath();
            ctx.moveTo(top.x, top.y);
            ctx.quadraticCurveTo(centerX + halfWidth * concaveFactor, centerY - halfHeight * concaveFactor, right.x, right.y);
            ctx.quadraticCurveTo(centerX + halfWidth * concaveFactor, centerY + halfHeight * concaveFactor, bottom.x, bottom.y);
            ctx.quadraticCurveTo(centerX - halfWidth * concaveFactor, centerY + halfHeight * concaveFactor, left.x, left.y);
            ctx.quadraticCurveTo(centerX - halfWidth * concaveFactor, centerY - halfHeight * concaveFactor, top.x, top.y);
            ctx.fill();
        } else if (shape === 'diamond') {
            const halfW = shrunkWidth / 2;
            const halfH = shrunkHeight / 2;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY - halfH);
            ctx.lineTo(centerX + halfW, centerY);
            ctx.lineTo(centerX, centerY + halfH);
            ctx.lineTo(centerX - halfW, centerY);
            ctx.closePath();
            ctx.fill();
        } else {
            // Square: use integer coords at 100% to avoid sub-pixel anti-aliasing
            if (sizeFraction >= 1.0) {
                const ix = Math.round(x);
                const iy = Math.round(y);
                const iw = Math.round(x + width) - ix;
                const ih = Math.round(y + height) - iy;
                ctx.fillRect(ix, iy, iw, ih);
            } else {
                ctx.fillRect(x + offsetX, y + offsetY, shrunkWidth, shrunkHeight);
            }
        }
    },

    /**
     * Draw finder pattern
     */
    drawFinder(ctx, startRow, startCol, moduleSize, offset, outerColor, middleColor, centerColor, sizeFraction, matrixSize) {
        const centerModuleX = startCol + 3.5;
        const centerModuleY = startRow + 3.5;
        const centerX = offset + (centerModuleX * moduleSize);
        const centerY = offset + (centerModuleY * moduleSize);

        // For non-square finders, draw background modules first
        if (this.state.finderShape !== 'square' && this.state.finderShape !== 'rounded') {
            const qrAreaSize = matrixSize * moduleSize;
            for (let row = 0; row < 7; row++) {
                for (let col = 0; col < 7; col++) {
                    const moduleX = offset + ((startCol + col) * moduleSize);
                    const moduleY = offset + ((startRow + row) * moduleSize);
                    const moduleCenterX = ((startCol + col) * moduleSize) + moduleSize / 2;
                    const moduleCenterY = ((startRow + row) * moduleSize) + moduleSize / 2;
                    const color = this.getModuleColor(moduleCenterX, moduleCenterY, false, qrAreaSize, moduleSize);
                    this.drawModule(ctx, moduleX, moduleY, moduleSize, moduleSize, color, this.state.moduleShape, sizeFraction);
                }
            }
        }

        const thicknessBoost = 0.08;

        if (this.state.finderShape === 'circle') {
            ctx.fillStyle = outerColor;
            ctx.beginPath();
            ctx.arc(centerX, centerY, (3.5 + thicknessBoost) * moduleSize, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = middleColor;
            ctx.beginPath();
            ctx.arc(centerX, centerY, (2.5 - thicknessBoost * 0.5) * moduleSize, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = centerColor;
            ctx.beginPath();
            ctx.arc(centerX, centerY, 1.5 * moduleSize, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.state.finderShape === 'rounded') {
            const roundingPercent = 0.10;

            ctx.fillStyle = outerColor;
            const outerX = offset + (startCol * moduleSize);
            const outerY = offset + (startRow * moduleSize);
            const outerSize = 7 * moduleSize;
            ctx.beginPath();
            ctx.roundRect(outerX, outerY, outerSize, outerSize, outerSize * roundingPercent);
            ctx.fill();

            ctx.fillStyle = middleColor;
            const middleX = offset + ((startCol + 1) * moduleSize);
            const middleY = offset + ((startRow + 1) * moduleSize);
            const middleSize = 5 * moduleSize;
            ctx.beginPath();
            ctx.roundRect(middleX, middleY, middleSize, middleSize, middleSize * roundingPercent);
            ctx.fill();

            ctx.fillStyle = centerColor;
            const innerX = offset + ((startCol + 2) * moduleSize);
            const innerY = offset + ((startRow + 2) * moduleSize);
            const innerSize = 3 * moduleSize;
            ctx.beginPath();
            ctx.roundRect(innerX, innerY, innerSize, innerSize, innerSize * roundingPercent);
            ctx.fill();
        } else if (this.state.finderShape === 'hybrid') {
            ctx.fillStyle = outerColor;
            ctx.beginPath();
            ctx.arc(centerX, centerY, (3.5 + thicknessBoost) * moduleSize, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = middleColor;
            ctx.beginPath();
            ctx.arc(centerX, centerY, (2.5 - thicknessBoost * 0.5) * moduleSize, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = centerColor;
            const innerSize = 3 * moduleSize;
            const innerX = offset + ((startCol + 2) * moduleSize);
            const innerY = offset + ((startRow + 2) * moduleSize);
            ctx.fillRect(innerX, innerY, innerSize, innerSize);
        } else if (this.state.finderShape === 'hybrid-inverse') {
            ctx.fillStyle = outerColor;
            const outerX = offset + (startCol * moduleSize) - (thicknessBoost * moduleSize);
            const outerY = offset + (startRow * moduleSize) - (thicknessBoost * moduleSize);
            const outerSize = (7 + thicknessBoost * 2) * moduleSize;
            ctx.fillRect(outerX, outerY, outerSize, outerSize);

            ctx.fillStyle = middleColor;
            const middleX = offset + ((startCol + 1) * moduleSize) + (thicknessBoost * 0.5 * moduleSize);
            const middleY = offset + ((startRow + 1) * moduleSize) + (thicknessBoost * 0.5 * moduleSize);
            const middleSize = (5 - thicknessBoost) * moduleSize;
            ctx.fillRect(middleX, middleY, middleSize, middleSize);

            ctx.fillStyle = centerColor;
            ctx.beginPath();
            ctx.arc(centerX, centerY, 1.5 * moduleSize, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Square
            ctx.fillStyle = outerColor;
            const outerX = offset + (startCol * moduleSize);
            const outerY = offset + (startRow * moduleSize);
            ctx.fillRect(outerX, outerY, 7 * moduleSize, 7 * moduleSize);

            ctx.fillStyle = middleColor;
            const middleX = offset + ((startCol + 1) * moduleSize);
            const middleY = offset + ((startRow + 1) * moduleSize);
            ctx.fillRect(middleX, middleY, 5 * moduleSize, 5 * moduleSize);

            ctx.fillStyle = centerColor;
            const innerX = offset + ((startCol + 2) * moduleSize);
            const innerY = offset + ((startRow + 2) * moduleSize);
            ctx.fillRect(innerX, innerY, 3 * moduleSize, 3 * moduleSize);
        }
    },

    /**
     * Draw full-sized background rectangles behind each finder pattern,
     * covering the 8x8 region (7x7 finder + 1-module separator).
     * The corner facing the QR center is rounded to match the finder shape.
     */
    drawFinderBackgrounds(ctx, moduleSize, offset, size) {
        const color = this.state.finderMiddleColor;
        const shape = this.state.finderShape;
        const bgSize = 8 * moduleSize;
        // Extend outer edges by 1px to prevent sub-pixel anti-aliasing artifacts
        const pad = 1;

        let r = 0;
        if (shape === 'rounded') {
            r = moduleSize * 1.2;
        } else if (shape === 'circle' || shape === 'hybrid') {
            r = moduleSize * 3;
        }

        ctx.fillStyle = color;

        // Top-left finder: extend left and top edges outward
        ctx.beginPath();
        ctx.roundRect(offset - pad, offset - pad, bgSize + pad, bgSize + pad, [0, 0, r, 0]);
        ctx.fill();

        // Top-right finder: extend right and top edges outward
        ctx.beginPath();
        ctx.roundRect(offset + (size - 8) * moduleSize, offset - pad, bgSize + pad, bgSize + pad, [0, 0, 0, r]);
        ctx.fill();

        // Bottom-left finder: extend left and bottom edges outward
        ctx.beginPath();
        ctx.roundRect(offset - pad, offset + (size - 8) * moduleSize, bgSize + pad, bgSize + pad, [0, r, 0, 0]);
        ctx.fill();
    },

    /**
     * Draw the bottom QR layer (dark modules only, under the logo)
     * Plain version — no deletion state awareness, used in render().
     * Skips any module whose center is inside the logo (alpha ≥ 128) — those
     * belong exclusively to the top layer.
     */
    renderBottomLayer(ctx, matrix, offset, moduleSize, size) {
        const layers = this.state.layers;
        const sizeFraction = layers.bottomSize / 100;
        const shape = layers.bottomShape;
        const darkColor = layers.bottomColor || '#000000';
        const lightColor = this.state.colorMode === 'simple'
            ? this.state.simpleLightColor
            : (this.state.lightPalette[0] || '#ffffff');
        const qrAreaSize = size * moduleSize;

        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                if (this.isFinderPattern(row, col, size)) continue;
                if (this.isSeparator(row, col, size)) continue;

                const cx = (col + 0.5) * moduleSize;
                const cy = (row + 0.5) * moduleSize;
                if (this.sampleLogoAlpha(cx, cy, qrAreaSize) >= 128) continue;

                const color = matrix[row][col] ? darkColor : lightColor;
                this.drawModule(ctx, offset + col * moduleSize, offset + row * moduleSize, moduleSize, moduleSize, color, shape, sizeFraction);
            }
        }
    },

    /**
     * Draw the bottom QR layer respecting the delete step's deletion/hide/paint state.
     * Used in renderWithDeletion() so the export tab shows all three layers consistently.
     */
    renderBottomLayerWithDeletion(ctx, matrix, offset, moduleSize, size, deleteState) {
        const layers = this.state.layers;
        const sizeFraction = layers.bottomSize / 100;
        const shape = layers.bottomShape;
        const darkColor = layers.bottomColor || '#000000';
        const lightColor = this.state.colorMode === 'simple'
            ? this.state.simpleLightColor
            : (this.state.lightPalette[0] || '#ffffff');
        const qrAreaSize = size * moduleSize;

        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                if (this.isFinderPattern(row, col, size)) continue;
                if (this.isSeparator(row, col, size)) continue;

                const cx = (col + 0.5) * moduleSize;
                const cy = (row + 0.5) * moduleSize;
                if (this.sampleLogoAlpha(cx, cy, qrAreaSize) >= 128) continue;

                const cellKey = `${row},${col}`;
                if (deleteState.hiddenModules && deleteState.hiddenModules.has(cellKey)) continue;

                if (deleteState.reverseMap) {
                    const cwIdx = deleteState.reverseMap.get(cellKey);
                    if (cwIdx !== undefined && deleteState.deletedCodewords.has(cwIdx)) {
                        if (deleteState.deletedModuleEdits && deleteState.deletedModuleEdits.has(cellKey)) {
                            const paintedDark = deleteState.deletedModuleEdits.get(cellKey);
                            this.drawModule(ctx, offset + col * moduleSize, offset + row * moduleSize, moduleSize, moduleSize, paintedDark ? darkColor : lightColor, shape, sizeFraction);
                        }
                        continue;
                    }
                }

                const color = matrix[row][col] ? darkColor : lightColor;
                this.drawModule(ctx, offset + col * moduleSize, offset + row * moduleSize, moduleSize, moduleSize, color, shape, sizeFraction);
            }
        }
    },

    /**
     * Main render function
     */
    render(canvas, matrix, version) {
        if (!matrix) return;

        const ctx = canvas.getContext('2d');
        const canvasSize = canvas.width;
        const size = matrix.length;
        const quietZone = this.state.quietZone;
        const totalSize = size + (quietZone * 2);
        const moduleSize = canvasSize / totalSize;
        const offset = quietZone * moduleSize;
        const qrAreaSize = size * moduleSize;

        // Clear canvas
        ctx.clearRect(0, 0, canvasSize, canvasSize);

        // Fill background based on backgroundFill setting
        if (this.state.backgroundFill === 'dark') {
            ctx.fillStyle = this.state.darkPalette[0] || '#000000';
        } else {
            ctx.fillStyle = this.state.lightPalette[0] || '#ffffff';
        }
        ctx.fillRect(0, 0, canvasSize, canvasSize);

        // Bottom QR layer (when layer blending is enabled and logo is loaded)
        if (this.state.logoImg && this.state.layers.enabled) {
            this.renderBottomLayer(ctx, matrix, offset, moduleSize, size);
        }

        // Draw logo background
        if (this.state.logoImg) {
            this.drawLogoBackground(ctx, offset, offset, qrAreaSize);
        }

        // Ensure quiet zone stays white even if logo scales beyond content
        this.drawQuietZoneOverlay(ctx, canvasSize, moduleSize, quietZone);

        const sizeFraction = this.state.moduleSize / 100;

        // Get finder colors (always from dedicated finder color pickers)
        const finderOuter = this.state.finderOuterColor;
        const finderMiddle = this.state.finderMiddleColor;
        const finderCenter = this.state.finderCenterColor;

        // Draw data modules (skip finder patterns)
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                if (this.isFinderPattern(row, col, size)) continue;
                if (this.isSeparator(row, col, size)) {
                    if (!this.state.finderFullSeparator) {
                        const moduleX = offset + (col * moduleSize);
                        const moduleY = offset + (row * moduleSize);
                        this.drawModule(ctx, moduleX, moduleY, moduleSize, moduleSize, finderMiddle, this.state.moduleShape, sizeFraction);
                    }
                    continue;
                }

                const moduleX = offset + (col * moduleSize);
                const moduleY = offset + (row * moduleSize);
                const isDark = matrix[row][col];

                const moduleCenterX = (col * moduleSize) + moduleSize / 2;
                const moduleCenterY = (row * moduleSize) + moduleSize / 2;

                // With layer blending: top layer only draws modules inside the logo area
                if (this.state.layers.enabled && this.state.logoImg) {
                    if (this.sampleLogoAlpha(moduleCenterX, moduleCenterY, qrAreaSize) < 128) continue;
                }

                const color = this.getModuleColor(moduleCenterX, moduleCenterY, isDark, qrAreaSize, moduleSize);
                this.drawModule(ctx, moduleX, moduleY, moduleSize, moduleSize, color, this.state.moduleShape, sizeFraction);
            }
        }

        // Draw finder backgrounds (full-sized separators) before finders
        if (this.state.finderFullSeparator) {
            this.drawFinderBackgrounds(ctx, moduleSize, offset, size);
        }

        // Draw finder patterns
        this.drawFinder(ctx, 0, 0, moduleSize, offset, finderOuter, finderMiddle, finderCenter, sizeFraction, size);
        this.drawFinder(ctx, 0, size - 7, moduleSize, offset, finderOuter, finderMiddle, finderCenter, sizeFraction, size);
        this.drawFinder(ctx, size - 7, 0, moduleSize, offset, finderOuter, finderMiddle, finderCenter, sizeFraction, size);
    },

    /**
     * Render with logo as background layer (for logo positioning step)
     * Logo is drawn at partial opacity underneath, QR modules are fully opaque on top
     */
    renderWithTransparency(canvas, matrix, version, logoOpacity = 0.4) {
        if (!matrix) return;

        const ctx = canvas.getContext('2d');
        const canvasSize = canvas.width;
        const size = matrix.length;
        const quietZone = this.state.quietZone;
        const totalSize = size + (quietZone * 2);
        const moduleSize = canvasSize / totalSize;
        const offset = quietZone * moduleSize;
        const qrAreaSize = size * moduleSize;

        // Clear canvas with white or background fill color
        ctx.clearRect(0, 0, canvasSize, canvasSize);

        if (this.state.backgroundFill === 'dark') {
            ctx.fillStyle = this.state.darkPalette[0] || '#000000';
        } else {
            ctx.fillStyle = this.state.lightPalette[0] || '#ffffff';
        }
        ctx.fillRect(0, 0, canvasSize, canvasSize);

        // Draw logo as background layer (partial opacity)
        if (this.state.logoImg) {
            ctx.globalAlpha = logoOpacity;
            this.drawLogoBackground(ctx, offset, offset, qrAreaSize);
            ctx.globalAlpha = 1.0;
        }

        // Ensure quiet zone stays white even if logo scales beyond content
        this.drawQuietZoneOverlay(ctx, canvasSize, moduleSize, quietZone);

        // Draw modules on top with transparency so logo shows through
        ctx.globalAlpha = 0.35;
        const sizeFraction = 0.85; // Use larger modules for visibility

        // Draw all modules as simple black/white
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const moduleX = offset + (col * moduleSize);
                const moduleY = offset + (row * moduleSize);
                const isDark = matrix[row][col];

                const color = isDark ? '#000000' : '#ffffff';
                this.drawModule(ctx, moduleX, moduleY, moduleSize, moduleSize, color, 'square', sizeFraction);
            }
        }

        ctx.globalAlpha = 1.0;
    },

    /**
     * Render for painting mode - shows editable vs locked cells with grid
     */
    renderForPainting(canvas, matrix, version, editableCells, paddingEdits, logoOpacity = 0.4) {
        if (!matrix) return;

        const ctx = canvas.getContext('2d');
        const canvasSize = canvas.width;
        const size = matrix.length;
        const quietZone = this.state.quietZone;
        const totalSize = size + (quietZone * 2);
        const moduleSize = canvasSize / totalSize;
        const offset = quietZone * moduleSize;
        const qrAreaSize = size * moduleSize;

        // Clear canvas with background
        ctx.clearRect(0, 0, canvasSize, canvasSize);

        if (this.state.backgroundFill === 'dark') {
            ctx.fillStyle = this.state.darkPalette[0] || '#000000';
        } else {
            ctx.fillStyle = this.state.lightPalette[0] || '#ffffff';
        }
        ctx.fillRect(0, 0, canvasSize, canvasSize);

        // Draw logo at partial opacity
        if (this.state.logoImg) {
            ctx.globalAlpha = logoOpacity;
            this.drawLogoBackground(ctx, offset, offset, qrAreaSize);
            ctx.globalAlpha = 1.0;
        }

        // Quiet zone overlay
        this.drawQuietZoneOverlay(ctx, canvasSize, moduleSize, quietZone);

        const sizeFraction = 0.85;

        // Draw modules with editable/locked distinction
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const moduleX = offset + (col * moduleSize);
                const moduleY = offset + (row * moduleSize);
                const cellKey = `${row},${col}`;
                const isEditable = editableCells.has(cellKey);

                // Determine module value (check paddingEdits override)
                let isDark;
                if (paddingEdits.has(cellKey)) {
                    isDark = paddingEdits.get(cellKey);
                } else {
                    isDark = matrix[row][col];
                }

                if (isEditable) {
                    // Editable cells: full opacity
                    ctx.globalAlpha = 0.85;
                    const color = isDark ? '#000000' : '#ffffff';
                    this.drawModule(ctx, moduleX, moduleY, moduleSize, moduleSize, color, 'square', sizeFraction);
                    ctx.globalAlpha = 1.0;
                } else {
                    // Locked cells: reduced opacity + gray tint
                    ctx.globalAlpha = 0.55;
                    const color = isDark ? '#000000' : '#ffffff';
                    this.drawModule(ctx, moduleX, moduleY, moduleSize, moduleSize, color, 'square', sizeFraction);
                    ctx.globalAlpha = 1.0;

                    // Gray overlay tint
                    ctx.fillStyle = 'rgba(180, 180, 180, 0.35)';
                    const shrunk = moduleSize * sizeFraction;
                    const off = (moduleSize - shrunk) / 2;
                    ctx.fillRect(moduleX + off, moduleY + off, shrunk, shrunk);
                }
            }
        }

        // Draw subtle grid lines between modules
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.4)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= size; i++) {
            const x = offset + i * moduleSize;
            ctx.beginPath();
            ctx.moveTo(x, offset);
            ctx.lineTo(x, offset + size * moduleSize);
            ctx.stroke();

            const y = offset + i * moduleSize;
            ctx.beginPath();
            ctx.moveTo(offset, y);
            ctx.lineTo(offset + size * moduleSize, y);
            ctx.stroke();
        }
    },

    /**
     * Render the unified control workflow with region, target, and lock overlays.
     */
    renderForControl(canvas, matrix, version, controlState, analysis, logoOpacity = 0.4) {
        if (!matrix) return;

        const ctx = canvas.getContext('2d');
        const canvasSize = canvas.width;
        const size = matrix.length;
        const quietZone = this.state.quietZone;
        const totalSize = size + (quietZone * 2);
        const moduleSize = canvasSize / totalSize;
        const offset = quietZone * moduleSize;
        const qrAreaSize = size * moduleSize;

        ctx.clearRect(0, 0, canvasSize, canvasSize);
        ctx.fillStyle = this.state.backgroundFill === 'dark'
            ? (this.state.darkPalette[0] || '#000000')
            : (this.state.lightPalette[0] || '#ffffff');
        ctx.fillRect(0, 0, canvasSize, canvasSize);

        if (this.state.logoImg) {
            ctx.globalAlpha = logoOpacity;
            this.drawLogoBackground(ctx, offset, offset, qrAreaSize);
            ctx.globalAlpha = 1.0;
        }
        this.drawQuietZoneOverlay(ctx, canvasSize, moduleSize, quietZone);

        const targets = analysis?.targets || new Map();
        const classifications = analysis?.classifications || new Map();
        const regionCells = analysis?.regionCells || new Set();
        const sizeFraction = 0.85;
        const classColors = {
            function: 'rgba(107, 114, 128, 0.45)',
            locked: 'rgba(239, 68, 68, 0.42)',
            padding: 'rgba(16, 185, 129, 0.22)',
            'ecc-solvable': 'rgba(59, 130, 246, 0.24)',
            'ecc-locked': 'rgba(245, 158, 11, 0.42)',
            'data-damageable': 'rgba(168, 85, 247, 0.24)',
            'data-locked': 'rgba(107, 114, 128, 0.30)'
        };

        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const cellKey = `${row},${col}`;
                const moduleX = offset + col * moduleSize;
                const moduleY = offset + row * moduleSize;
                const target = targets.get(cellKey);
                const isDark = target !== undefined ? target : matrix[row][col];
                const color = isDark ? '#000000' : '#ffffff';

                ctx.globalAlpha = regionCells.has(cellKey) ? 0.9 : 0.5;
                this.drawModule(ctx, moduleX, moduleY, moduleSize, moduleSize, color, 'square', sizeFraction);
                ctx.globalAlpha = 1.0;

                const cls = classifications.get(cellKey);
                if (cls && regionCells.has(cellKey)) {
                    const shrunk = moduleSize * sizeFraction;
                    const off = (moduleSize - shrunk) / 2;
                    ctx.fillStyle = classColors[cls] || 'rgba(107, 114, 128, 0.25)';
                    ctx.fillRect(moduleX + off, moduleY + off, shrunk, shrunk);
                }

                if (target !== undefined) {
                    ctx.strokeStyle = target ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.95)';
                    ctx.lineWidth = Math.max(1, moduleSize * 0.08);
                    ctx.strokeRect(moduleX + 2, moduleY + 2, moduleSize - 4, moduleSize - 4);
                }
            }
        }

        ctx.strokeStyle = 'rgba(200, 200, 200, 0.4)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= size; i++) {
            const x = offset + i * moduleSize;
            ctx.beginPath();
            ctx.moveTo(x, offset);
            ctx.lineTo(x, offset + size * moduleSize);
            ctx.stroke();

            const y = offset + i * moduleSize;
            ctx.beginPath();
            ctx.moveTo(offset, y);
            ctx.lineTo(offset + size * moduleSize, y);
            ctx.stroke();
        }

        if (controlState?.regions) {
            ctx.strokeStyle = 'rgba(79, 70, 229, 0.9)';
            ctx.lineWidth = 2;
            controlState.regions.forEach(region => {
                ctx.strokeRect(
                    offset + region.x * moduleSize,
                    offset + region.y * moduleSize,
                    region.width * moduleSize,
                    region.height * moduleSize
                );
            });
        }
    },

    /**
     * Draw a highlight border around a cell (for hover effect)
     */
    drawCellHighlight(canvas, row, col, size, quietZone) {
        const ctx = canvas.getContext('2d');
        const canvasSize = canvas.width;
        const totalSize = size + (quietZone * 2);
        const moduleSize = canvasSize / totalSize;
        const offset = quietZone * moduleSize;

        const x = offset + col * moduleSize;
        const y = offset + row * moduleSize;

        ctx.strokeStyle = 'rgba(79, 70, 229, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, moduleSize - 2, moduleSize - 2);
    },

    /**
     * Render with codeword deletion support
     * deleteState: { deletedCodewords, hoveredCodewordIndex, codewordMap, blockInfo, blockColors, reverseMap }
     * options: { showOverlays: true }
     */
    renderWithDeletion(canvas, matrix, version, deleteState, options = {}) {
        if (!matrix) return;

        const showOverlays = options.showOverlays !== false;
        const ctx = canvas.getContext('2d');
        const canvasSize = canvas.width;
        const size = matrix.length;
        const quietZone = this.state.quietZone;
        const totalSize = size + (quietZone * 2);
        const moduleSize = canvasSize / totalSize;
        const offset = quietZone * moduleSize;
        const qrAreaSize = size * moduleSize;

        // Clear canvas
        ctx.clearRect(0, 0, canvasSize, canvasSize);

        // Fill background
        if (this.state.backgroundFill === 'dark') {
            ctx.fillStyle = this.state.darkPalette[0] || '#000000';
        } else {
            ctx.fillStyle = this.state.lightPalette[0] || '#ffffff';
        }
        ctx.fillRect(0, 0, canvasSize, canvasSize);

        // Bottom QR layer (when layer blending is enabled)
        if (this.state.logoImg && this.state.layers.enabled) {
            this.renderBottomLayerWithDeletion(ctx, matrix, offset, moduleSize, size, deleteState);
        }

        // Draw logo background
        if (this.state.logoImg) {
            this.drawLogoBackground(ctx, offset, offset, qrAreaSize);
        }

        // Quiet zone overlay
        this.drawQuietZoneOverlay(ctx, canvasSize, moduleSize, quietZone);

        const sizeFraction = this.state.moduleSize / 100;

        // Get finder colors (always from dedicated finder color pickers)
        const finderOuter = this.state.finderOuterColor;
        const finderMiddle = this.state.finderMiddleColor;
        const finderCenter = this.state.finderCenterColor;

        // Draw data modules (skip finder, separator, and deleted)
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                if (this.isFinderPattern(row, col, size)) continue;
                if (this.isSeparator(row, col, size)) {
                    if (!this.state.finderFullSeparator) {
                        const moduleX = offset + (col * moduleSize);
                        const moduleY = offset + (row * moduleSize);
                        this.drawModule(ctx, moduleX, moduleY, moduleSize, moduleSize, finderMiddle, this.state.moduleShape, sizeFraction);
                    }
                    continue;
                }

                // Check if module belongs to a deleted codeword or is individually hidden
                const cellKey = `${row},${col}`;

                // Individually hidden modules — always skip rendering
                if (deleteState.hiddenModules && deleteState.hiddenModules.has(cellKey)) {
                    continue;
                }

                if (deleteState.reverseMap) {
                    const cwIdx = deleteState.reverseMap.get(cellKey);
                    if (cwIdx !== undefined && deleteState.deletedCodewords.has(cwIdx)) {
                        // Check if this deleted module has been painted
                        if (deleteState.deletedModuleEdits && deleteState.deletedModuleEdits.has(cellKey)) {
                            const paintedDark = deleteState.deletedModuleEdits.get(cellKey);
                            const moduleX = offset + (col * moduleSize);
                            const moduleY = offset + (row * moduleSize);
                            // Use palette dark/light colors for painted deleted modules
                            const color = paintedDark ?
                                (this.state.darkPalette[0] || '#000000') :
                                (this.state.lightPalette[0] || '#ffffff');
                            this.drawModule(ctx, moduleX, moduleY, moduleSize, moduleSize, color, this.state.moduleShape, sizeFraction);
                        }
                        // If not painted, skip (leave transparent/background)
                        continue;
                    }
                }

                const moduleX = offset + (col * moduleSize);
                const moduleY = offset + (row * moduleSize);
                const isDark = matrix[row][col];

                const moduleCenterX = (col * moduleSize) + moduleSize / 2;
                const moduleCenterY = (row * moduleSize) + moduleSize / 2;

                // With layer blending: top layer only draws modules inside the logo area
                if (this.state.layers.enabled && this.state.logoImg) {
                    if (this.sampleLogoAlpha(moduleCenterX, moduleCenterY, qrAreaSize) < 128) continue;
                }

                const color = this.getModuleColor(moduleCenterX, moduleCenterY, isDark, qrAreaSize, moduleSize);
                this.drawModule(ctx, moduleX, moduleY, moduleSize, moduleSize, color, this.state.moduleShape, sizeFraction);
            }
        }

        // Draw finder backgrounds (full-sized separators) before finders
        if (this.state.finderFullSeparator) {
            this.drawFinderBackgrounds(ctx, moduleSize, offset, size);
        }

        // Draw finder patterns
        this.drawFinder(ctx, 0, 0, moduleSize, offset, finderOuter, finderMiddle, finderCenter, sizeFraction, size);
        this.drawFinder(ctx, 0, size - 7, moduleSize, offset, finderOuter, finderMiddle, finderCenter, sizeFraction, size);
        this.drawFinder(ctx, size - 7, 0, moduleSize, offset, finderOuter, finderMiddle, finderCenter, sizeFraction, size);

        // Draw overlays if requested
        if (showOverlays) {
            for (let row = 0; row < size; row++) {
                for (let col = 0; col < size; col++) {
                    const cellKey = `${row},${col}`;
                    const moduleX = offset + (col * moduleSize);
                    const moduleY = offset + (row * moduleSize);

                    // Orange dashed outline for hidden modules
                    const isHidden = deleteState.hiddenModules && deleteState.hiddenModules.has(cellKey);
                    if (isHidden) {
                        ctx.strokeStyle = '#f59e0b';
                        ctx.lineWidth = 1.5;
                        ctx.setLineDash([3, 3]);
                        ctx.strokeRect(moduleX + 1, moduleY + 1, moduleSize - 2, moduleSize - 2);
                        ctx.setLineDash([]);
                    }

                    // Orange solid outline for hovered cell in hide mode
                    const hc = deleteState.hoveredHideCell;
                    if (hc && hc.row === row && hc.col === col && !isHidden) {
                        ctx.strokeStyle = '#f59e0b';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(moduleX + 1, moduleY + 1, moduleSize - 2, moduleSize - 2);
                    }

                    // Deleted/hovered codeword outlines
                    if (!deleteState.reverseMap) continue;
                    const cwIdx = deleteState.reverseMap.get(cellKey);
                    if (cwIdx === undefined) continue;

                    const isDeleted = deleteState.deletedCodewords.has(cwIdx);
                    const isHovered = cwIdx === deleteState.hoveredCodewordIndex;

                    if (!isDeleted && !isHovered) continue;

                    // Red outline for deleted (non-hovered)
                    if (isDeleted && !isHovered) {
                        ctx.strokeStyle = '#ff0000';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(moduleX + 1, moduleY + 1, moduleSize - 2, moduleSize - 2);
                    }

                    // Block-color outline for hovered
                    if (isHovered) {
                        let strokeColor = '#ffff00';
                        const blockIndex = deleteState.codewordMap.get(cwIdx)?.blockIndex;
                        if (blockIndex !== undefined && deleteState.blockInfo[blockIndex]) {
                            strokeColor = deleteState.blockInfo[blockIndex].color;
                        }

                        ctx.strokeStyle = strokeColor;
                        ctx.lineWidth = 2;
                        ctx.strokeRect(moduleX + 1, moduleY + 1, moduleSize - 2, moduleSize - 2);

                        // Inner red outline if also deleted
                        if (isDeleted) {
                            ctx.strokeStyle = '#ff0000';
                            ctx.lineWidth = 1;
                            ctx.strokeRect(moduleX + 3, moduleY + 3, moduleSize - 6, moduleSize - 6);
                        }
                    }
                }
            }
        }
    },

    /**
     * Export as PNG
     */
    exportPNG(canvas, matrix, version, exportSize = 1024) {
        // Create a temporary canvas at the export size
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = exportSize;
        exportCanvas.height = exportSize;

        // Store original canvas size
        const originalWidth = canvas.width;
        const originalHeight = canvas.height;

        // Temporarily resize main canvas for rendering
        canvas.width = exportSize;
        canvas.height = exportSize;

        // Render at export size
        this.render(canvas, matrix, version);

        // Get data URL
        const dataURL = canvas.toDataURL('image/png');

        // Restore original size and re-render
        canvas.width = originalWidth;
        canvas.height = originalHeight;
        this.render(canvas, matrix, version);

        // Trigger download
        const link = document.createElement('a');
        link.download = `qrcode-${exportSize}px.png`;
        link.href = dataURL;
        link.click();
    }
};
