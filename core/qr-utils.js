// Shared QR Code utility functions for encoder and decoder

// Get alignment pattern center positions for a given version
function getAlignmentPatternCenters(version) {
    const alignmentTable = {
        1: [],
        2: [6, 18],
        3: [6, 22],
        4: [6, 26],
        5: [6, 30],
        6: [6, 34],
        7: [6, 22, 38],
        8: [6, 24, 42],
        9: [6, 26, 46],
        10: [6, 28, 50],
        11: [6, 30, 54],
        12: [6, 32, 58],
        13: [6, 34, 62],
        14: [6, 26, 46, 66],
        15: [6, 26, 48, 70],
        16: [6, 26, 50, 74],
        17: [6, 30, 54, 78],
        18: [6, 30, 56, 82],
        19: [6, 30, 58, 86],
        20: [6, 34, 62, 90],
        21: [6, 28, 50, 72, 94],
        22: [6, 26, 50, 74, 98],
        23: [6, 30, 54, 78, 102],
        24: [6, 28, 54, 80, 106],
        25: [6, 32, 58, 84, 110],
        26: [6, 30, 58, 86, 114],
        27: [6, 34, 62, 90, 118],
        28: [6, 26, 50, 74, 98, 122],
        29: [6, 30, 54, 78, 102, 126],
        30: [6, 26, 52, 78, 104, 130],
        31: [6, 30, 56, 82, 108, 134],
        32: [6, 34, 60, 86, 112, 138],
        33: [6, 30, 58, 86, 114, 142],
        34: [6, 34, 62, 90, 118, 146],
        35: [6, 30, 54, 78, 102, 126, 150],
        36: [6, 24, 50, 76, 102, 128, 154],
        37: [6, 28, 54, 80, 106, 132, 158],
        38: [6, 32, 58, 84, 110, 136, 162],
        39: [6, 26, 54, 82, 110, 138, 166],
        40: [6, 30, 58, 86, 114, 142, 170]
    };

    return alignmentTable[version] || [];
}

// Check if a module is part of a finder pattern (including separator)
function isFinderModule(row, col, moduleCount) {
    // Top-left finder (0-7, 0-7) with separator
    if (row <= 7 && col <= 7) return true;

    // Top-right finder (0-7, moduleCount-8 to moduleCount-1) with separator
    if (row <= 7 && col >= moduleCount - 8) return true;

    // Bottom-left finder (moduleCount-8 to moduleCount-1, 0-7) with separator
    if (row >= moduleCount - 8 && col <= 7) return true;

    return false;
}

// Check if a module is part of an alignment pattern
function isAlignmentModule(row, col, moduleCount, version) {
    if (version < 2) return false;

    const alignmentCenters = getAlignmentPatternCenters(version);

    for (let cy of alignmentCenters) {
        for (let cx of alignmentCenters) {
            // Skip if overlaps with finder patterns
            if ((cx < 10 && cy < 10) ||
                (cx < 10 && cy >= moduleCount - 9) ||
                (cx >= moduleCount - 9 && cy < 10)) {
                continue;
            }
            // Check if (col, row) is within 5×5 alignment pattern centered at (cx, cy)
            if (Math.abs(col - cx) <= 2 && Math.abs(row - cy) <= 2) {
                return true;
            }
        }
    }

    return false;
}

// Check if a module is part of format information
function isFormatModule(row, col, moduleCount) {
    // Horizontal strip (row 8, columns 0-8 and moduleCount-8 to moduleCount-1)
    if (row === 8 && (col <= 8 || col >= moduleCount - 8)) return true;

    // Vertical strip (column 8, rows 0-8 and moduleCount-7 to moduleCount-1)
    if (col === 8 && (row <= 8 || row >= moduleCount - 7)) return true;

    return false;
}

// Check if a module is part of timing patterns
function isTimingModule(row, col, moduleCount) {
    // Horizontal timing (row 6, between finders)
    if (row === 6 && col >= 8 && col <= moduleCount - 9) return true;

    // Vertical timing (column 6, between finders)
    if (col === 6 && row >= 8 && row <= moduleCount - 9) return true;

    return false;
}

// Check if a module is the dark module (always black)
function isDarkModule(row, col, version) {
    // Dark module is always at position (4 * version + 9, 8)
    const darkRow = 4 * version + 9;
    const darkCol = 8;

    return row === darkRow && col === darkCol;
}

// Check if a module is part of version information (only version 7+)
function isVersionModule(row, col, moduleCount, version) {
    if (version < 7) return false;

    // Bottom-left version info (3 columns x 6 rows near bottom-left)
    // Rows: moduleCount-11 to moduleCount-9, Columns: 0-5
    if (row >= moduleCount - 11 && row <= moduleCount - 9 && col >= 0 && col <= 5) return true;

    // Top-right version info (6 columns x 3 rows near top-right)
    // Rows: 0-5, Columns: moduleCount-11 to moduleCount-9
    if (row >= 0 && row <= 5 && col >= moduleCount - 11 && col <= moduleCount - 9) return true;

    return false;
}

// Check if a module is a function module (should not be masked)
function isFunctionModule(row, col, moduleCount, version) {
    // Check all function patterns
    if (isFinderModule(row, col, moduleCount)) return true;
    if (isAlignmentModule(row, col, moduleCount, version)) return true;
    if (isFormatModule(row, col, moduleCount)) return true;
    if (isTimingModule(row, col, moduleCount)) return true;
    if (isDarkModule(row, col, version)) return true;
    if (isVersionModule(row, col, moduleCount, version)) return true;

    return false;
}

// Apply mask pattern formula to determine if module should be flipped
function shouldFlipModule(row, col, maskPattern) {
    // x = col, y = row
    const x = col;
    const y = row;

    switch(maskPattern) {
        case 0:
            return (x + y) % 2 === 0;
        case 1:
            return y % 2 === 0;
        case 2:
            return x % 3 === 0;
        case 3:
            return (x + y) % 3 === 0;
        case 4:
            return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
        case 5:
            return ((x * y) % 2) + ((x * y) % 3) === 0;
        case 6:
            return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
        case 7:
            return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        default:
            return false;
    }
}
