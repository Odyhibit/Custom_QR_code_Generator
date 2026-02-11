// Color Utilities for QR Code Generator
// Handles color extraction, conversion, and matching

const ColorUtils = {
    /**
     * RGB to HSL conversion (r, g, b in 0-255 range)
     * Returns { h: 0-360, s: 0-100, l: 0-100 }
     */
    rgbToHsl(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }

        return {
            h: h * 360,
            s: s * 100,
            l: l * 100
        };
    },

    /**
     * HSL to RGB conversion (h in 0-360, s and l in 0-100)
     * Returns { r: 0-255, g: 0-255, b: 0-255 }
     */
    hslToRgb(h, s, l) {
        h /= 360;
        s /= 100;
        l /= 100;

        let r, g, b;

        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;

            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    },

    /**
     * Calculate Euclidean distance between two RGB colors
     */
    colorDistance(c1, c2) {
        const dr = c1[0] - c2[0];
        const dg = c1[1] - c2[1];
        const db = c1[2] - c2[2];
        return Math.sqrt(dr * dr + dg * dg + db * db);
    },

    /**
     * Calculate hue distance (circular, 0-180)
     */
    hueDistance(h1, h2) {
        const diff = Math.abs(h1 - h2);
        return Math.min(diff, 360 - diff);
    },

    /**
     * Convert RGB to hex string
     */
    rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = Math.round(x).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    },

    /**
     * Convert hex to RGB array [r, g, b]
     */
    hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b];
    },

    /**
     * Get luminance from hex color (0-1 range)
     */
    getLuminance(hex) {
        const [r, g, b] = this.hexToRgb(hex);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    },

    /**
     * Find best matching color from a palette based on a sampled RGB color
     */
    findBestMatch(sampledRgb, palette) {
        const sampledHsl = this.rgbToHsl(sampledRgb[0], sampledRgb[1], sampledRgb[2]);
        const sampledH = sampledHsl.h;
        const sampledS = sampledHsl.s / 100;
        const sampledL = sampledHsl.l / 100;

        const paletteData = palette.map(hex => {
            const [r, g, b] = this.hexToRgb(hex);
            const hsl = this.rgbToHsl(r, g, b);
            return { hex, rgb: [r, g, b], hsl: [hsl.h, hsl.s / 100, hsl.l / 100] };
        });

        let minDist = Infinity;
        let bestIndex = 0;

        for (let i = 0; i < paletteData.length; i++) {
            const [h, s, l] = paletteData[i].hsl;
            const isGrayscale = sampledS < 0.15 || s < 0.15;

            if (!isGrayscale) {
                const hueDist = this.hueDistance(sampledH, h) / 180;
                const satDist = Math.abs(sampledS - s);
                const lightDist = Math.abs(sampledL - l);
                const dist = hueDist * 5 + satDist * 1 + lightDist * 1;

                if (dist < minDist) {
                    minDist = dist;
                    bestIndex = i;
                }
            } else {
                const rgbDist = this.colorDistance(sampledRgb, paletteData[i].rgb);
                if (rgbDist < minDist) {
                    minDist = rgbDist;
                    bestIndex = i;
                }
            }
        }

        return palette[bestIndex];
    },

    /**
     * Extract dominant dark and light colors from an image
     */
    extractDominantColors(img) {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        tempCtx.drawImage(img, 0, 0);

        const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
        const data = imageData.data;

        const quantize = (val) => Math.min(255, Math.round(val / 4) * 4);

        const darkColors = {};
        const lightColors = {};

        for (let i = 0; i < data.length; i += 16) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a < 128) continue;

            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            const qR = quantize(r);
            const qG = quantize(g);
            const qB = quantize(b);
            const colorKey = `${qR},${qG},${qB}`;

            if (luminance < 128) {
                darkColors[colorKey] = (darkColors[colorKey] || 0) + 1;
            } else {
                lightColors[colorKey] = (lightColors[colorKey] || 0) + 1;
            }
        }

        const getTopColors = (colorFreqMap, count = 4) => {
            const totalPixels = Object.values(colorFreqMap).reduce((a, b) => a + b, 0);
            const minFrequency = Math.max(10, totalPixels * 0.001);

            const sorted = Object.entries(colorFreqMap)
                .filter(([colorKey, freq]) => freq >= minFrequency)
                .sort((a, b) => b[1] - a[1]);

            const topColors = sorted.slice(0, count);

            return topColors.map(([colorKey]) => {
                const [r, g, b] = colorKey.split(',').map(Number);
                return this.rgbToHex(r, g, b);
            });
        };

        const validateDarkPalette = (palette) => {
            const validColors = palette.filter(color => this.getLuminance(color) < 0.5);
            if (validColors.length > 0) {
                while (validColors.length < 4) {
                    validColors.push(validColors[validColors.length - 1]);
                }
                return validColors;
            }
            return ['#000000', '#333333', '#1a1a1a', '#0d0d0d'];
        };

        const validateLightPalette = (palette) => {
            const validColors = palette.filter(color => this.getLuminance(color) > 0.5);
            if (validColors.length > 0) {
                while (validColors.length < 4) {
                    validColors.push(validColors[validColors.length - 1]);
                }
                return validColors;
            }
            return ['#ffffff', '#f0f0f0', '#e0e0e0', '#d0d0d0'];
        };

        const darkPalette = validateDarkPalette(getTopColors(darkColors, 4));
        const lightPalette = validateLightPalette(getTopColors(lightColors, 4));

        // Sort palettes
        darkPalette.sort((a, b) => this.getLuminance(a) - this.getLuminance(b));
        lightPalette.sort((a, b) => this.getLuminance(b) - this.getLuminance(a));

        return { darkPalette, lightPalette };
    }
};
