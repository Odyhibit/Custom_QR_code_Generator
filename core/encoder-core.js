// ========== CORE ENCODING LOGIC ==========

// Mode indicator values
const MODE_INDICATORS = {
    numeric: '0001',
    alphanumeric: '0010',
    byte: '0100',
    eci: '0111'
};

// ECI assignment numbers
const ECI_ASSIGNMENTS = {
    utf8: 26,
    iso8859_1: 3
};

// Alphanumeric character values
const ALPHANUMERIC_TABLE = {
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'A': 10, 'B': 11, 'C': 12, 'D': 13, 'E': 14, 'F': 15, 'G': 16, 'H': 17, 'I': 18,
    'J': 19, 'K': 20, 'L': 21, 'M': 22, 'N': 23, 'O': 24, 'P': 25, 'Q': 26, 'R': 27,
    'S': 28, 'T': 29, 'U': 30, 'V': 31, 'W': 32, 'X': 33, 'Y': 34, 'Z': 35, ' ': 36,
    '$': 37, '%': 38, '*': 39, '+': 40, '-': 41, '.': 42, '/': 43, ':': 44
};

// Get character count indicator size
function getCharCountIndicatorSize(version, mode) {
    if (mode === 'numeric') {
        if (version <= 9) return 10;
        else if (version <= 26) return 12;
        else return 14;
    } else if (mode === 'alphanumeric') {
        if (version <= 9) return 9;
        else if (version <= 26) return 11;
        else return 13;
    } else { // byte
        if (version <= 9) return 8;
        else return 16;
    }
}

// Convert number to binary string with specified length
function toBinary(num, length) {
    return num.toString(2).padStart(length, '0');
}

// Encode numeric message
function encodeNumeric(message) {
    let bits = '';
    // Process 3 digits at a time
    for (let i = 0; i < message.length; i += 3) {
        const chunk = message.substring(i, i + 3);
        const value = parseInt(chunk);
        if (chunk.length === 3) {
            bits += toBinary(value, 10);
        } else if (chunk.length === 2) {
            bits += toBinary(value, 7);
        } else {
            bits += toBinary(value, 4);
        }
    }
    return bits;
}

// Encode alphanumeric message
function encodeAlphanumeric(message) {
    let bits = '';
    // Process 2 characters at a time
    for (let i = 0; i < message.length; i += 2) {
        if (i + 1 < message.length) {
            const val1 = ALPHANUMERIC_TABLE[message[i]];
            const val2 = ALPHANUMERIC_TABLE[message[i + 1]];
            const value = val1 * 45 + val2;
            bits += toBinary(value, 11);
        } else {
            const val1 = ALPHANUMERIC_TABLE[message[i]];
            bits += toBinary(val1, 6);
        }
    }
    return bits;
}

// Encode byte message (ISO-8859-1 / Latin-1)
function encodeByte(message) {
    let bits = '';
    for (let i = 0; i < message.length; i++) {
        const charCode = message.charCodeAt(i);
        bits += toBinary(charCode, 8);
    }
    return bits;
}

// Encode message as UTF-8 bytes
function encodeByteUtf8(message) {
    // Use TextEncoder for proper UTF-8 encoding
    const encoder = new TextEncoder();
    const utf8Bytes = encoder.encode(message);

    let bits = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
        bits += toBinary(utf8Bytes[i], 8);
    }

    return { bits, byteLength: utf8Bytes.length };
}

// Encode ECI assignment number
// Returns bit string for the ECI assignment
function encodeEciAssignment(assignment) {
    if (assignment <= 127) {
        // 8-bit format: 0xxxxxxx
        return '0' + toBinary(assignment, 7);
    } else if (assignment <= 16383) {
        // 16-bit format: 10xxxxxxxxxxxxxx
        return '10' + toBinary(assignment, 14);
    } else {
        // 24-bit format: 110xxxxxxxxxxxxxxxxxxxxx
        return '110' + toBinary(assignment, 21);
    }
}

// Check if message requires UTF-8 encoding (contains non-Latin-1 characters)
function requiresUtf8(message) {
    for (let i = 0; i < message.length; i++) {
        if (message.charCodeAt(i) > 255) {
            return true;
        }
    }
    return false;
}

// Encode message based on mode
function encodeMessage(message, mode) {
    if (mode === 'numeric') {
        return encodeNumeric(message);
    } else if (mode === 'alphanumeric') {
        return encodeAlphanumeric(message);
    } else { // byte
        return encodeByte(message);
    }
}

// Generate complete bitstream
// useUtf8: 'auto' (default) | true | false
function generateBitstream(currentMessage, currentMode, currentVersion, currentEccLevel, capacityTable, useUtf8 = 'auto') {
    const key = `${currentVersion}-${currentEccLevel}`;
    const dataCodewords = capacityTable[key];
    const totalBits = dataCodewords * 8;

    // Determine if we need UTF-8 encoding
    let needsUtf8 = false;
    if (currentMode === 'byte') {
        if (useUtf8 === 'auto') {
            needsUtf8 = requiresUtf8(currentMessage);
        } else {
            needsUtf8 = useUtf8;
        }
    }

    let eciHeader = '';
    let modeIndicator;
    let charCount;
    let messageData;

    if (needsUtf8 && currentMode === 'byte') {
        // UTF-8 mode with ECI header
        // 1. ECI mode indicator
        eciHeader = MODE_INDICATORS.eci;

        // 2. ECI assignment number (26 = UTF-8)
        eciHeader += encodeEciAssignment(ECI_ASSIGNMENTS.utf8);

        // 3. Byte mode indicator
        modeIndicator = MODE_INDICATORS.byte;

        // 4. Encode message as UTF-8 and get byte count
        const utf8Result = encodeByteUtf8(currentMessage);
        messageData = utf8Result.bits;

        // 5. Character count is the UTF-8 byte length, not string length
        const charCountSize = getCharCountIndicatorSize(currentVersion, 'byte');
        charCount = toBinary(utf8Result.byteLength, charCountSize);
    } else {
        // Standard encoding (no ECI)
        // 1. Mode indicator
        modeIndicator = MODE_INDICATORS[currentMode];

        // 2. Character count indicator
        const charCountSize = getCharCountIndicatorSize(currentVersion, currentMode);
        charCount = toBinary(currentMessage.length, charCountSize);

        // 3. Encoded message data
        messageData = encodeMessage(currentMessage, currentMode);
    }

    // 4. Terminator (up to 4 bits of zeros)
    let bitstream = eciHeader + modeIndicator + charCount + messageData;
    const terminatorLength = Math.min(4, totalBits - bitstream.length);
    const terminator = '0'.repeat(terminatorLength);
    bitstream += terminator;

    // 5. Pad to byte boundary
    const padToByte = (8 - (bitstream.length % 8)) % 8;
    const bytePadding = '0'.repeat(padToByte);
    bitstream += bytePadding;

    // 6. Pad bytes (0xEC 0x11 pattern)
    const padBytes = [];
    let padByteIndex = 0;
    const padPattern = [0xEC, 0x11];
    while (bitstream.length < totalBits) {
        const padByte = padPattern[padByteIndex % 2];
        padBytes.push(padByte);
        bitstream += toBinary(padByte, 8);
        padByteIndex++;
    }

    // Convert bitstream to byte array
    const dataBytes = [];
    for (let i = 0; i < bitstream.length; i += 8) {
        const byte = parseInt(bitstream.substring(i, i + 8), 2);
        dataBytes.push(byte);
    }

    return {
        eciHeader,
        modeIndicator,
        charCount,
        messageData,
        terminator,
        bytePadding,
        padBytes,
        dataBytes,
        totalBits: bitstream.length,
        messageBits: eciHeader.length + modeIndicator.length + charCount.length + messageData.length,
        usedUtf8: needsUtf8
    };
}

// Zero out all padding bytes (converts 0xEC and 0x11 to 0x00)
function zeroPaddingBytes(bitstreamData) {
    // Calculate how many bits are actual message (eci + mode + count + data + terminator + byte padding)
    const messageBits = (bitstreamData.eciHeader || '').length +
                       bitstreamData.modeIndicator.length +
                       bitstreamData.charCount.length +
                       bitstreamData.messageData.length +
                       bitstreamData.terminator.length +
                       bitstreamData.bytePadding.length;

    // Calculate how many complete bytes this is
    const messageBytes = Math.ceil(messageBits / 8);

    // Create new dataBytes array with padding zeroed out
    const newDataBytes = [...bitstreamData.dataBytes];
    for (let i = messageBytes; i < newDataBytes.length; i++) {
        newDataBytes[i] = 0x00;
    }

    // Update the padBytes array to reflect the change
    const newPadBytes = new Array(bitstreamData.padBytes.length).fill(0x00);

    return {
        ...bitstreamData,
        dataBytes: newDataBytes,
        padBytes: newPadBytes
    };
}

// Split data bytes into blocks (using block size table directly)
function splitIntoBlocks(dataBytes, currentVersion, currentEccLevel, blockSizeTable) {
    const key = `${currentVersion}-${currentEccLevel}`;
    const blockInfo = blockSizeTable[key];

    const blocks = [];
    let offset = 0;

    // Group 1 blocks (shorter blocks)
    const numBlocksGroup1 = blockInfo.numBlocks;

    for (let i = 0; i < numBlocksGroup1; i++) {
        const blockData = dataBytes.slice(offset, offset + blockInfo.dataCodewordsInGroup1);
        blocks.push({
            data: blockData,
            eccCount: blockInfo.eccCodewordsPerBlock,
            ecc: [],
            isShort: blockInfo.numBlocksInGroup2 > 0 // Only short if there's a group 2
        });
        offset += blockInfo.dataCodewordsInGroup1;
    }

    // Group 2 blocks (one more data codeword)
    if (blockInfo.numBlocksInGroup2 > 0) {
        for (let i = 0; i < blockInfo.numBlocksInGroup2; i++) {
            const blockData = dataBytes.slice(offset, offset + blockInfo.dataCodewordsInGroup2);
            blocks.push({
                data: blockData,
                eccCount: blockInfo.eccCodewordsPerBlock,
                ecc: [],
                isShort: false // Group 2 blocks are "long"
            });
            offset += blockInfo.dataCodewordsInGroup2;
        }
    }

    return blocks;
}

// Calculate ECC for all blocks
function calculateEccForBlocks(blocks) {
    const encoder = new ReedSolomonEncoder();
    blocks.forEach((block, index) => {
        // Compute ECC on the data bytes
        block.ecc = encoder.encode(block.data, block.eccCount);
    });
    return blocks;
}

// Interleave blocks (properly interleave data then ECC)
function interleaveBlocks(blocks) {
    const interleaved = [];

    // Find the maximum data and ECC lengths
    const maxDataLen = Math.max(...blocks.map(b => b.data.length));
    const maxEccLen = Math.max(...blocks.map(b => b.ecc.length));

    // Interleave data bytes
    for (let i = 0; i < maxDataLen; i++) {
        blocks.forEach(block => {
            if (i < block.data.length) {
                interleaved.push(block.data[i]);
            }
        });
    }

    // Interleave ECC bytes
    for (let i = 0; i < maxEccLen; i++) {
        blocks.forEach(block => {
            if (i < block.ecc.length) {
                interleaved.push(block.ecc[i]);
            }
        });
    }

    return interleaved;
}

// ========== QR CODE GENERATION ==========

// Get QR code size for version
function getQrSize(version) {
    return 21 + (version - 1) * 4;
}

// Create empty QR matrix
function createMatrix(size) {
    const matrix = [];
    for (let i = 0; i < size; i++) {
        matrix[i] = new Array(size).fill(null);
    }
    return matrix;
}

// Place finder pattern with separator
function placeFinder(matrix, row, col) {
    for (let i = -1; i <= 7; i++) {
        for (let j = -1; j <= 7; j++) {
            const r = row + i;
            const c = col + j;
            if (r >= 0 && r < matrix.length && c >= 0 && c < matrix.length) {
                // Separator (outer border) - WHITE
                if (i === -1 || i === 7 || j === -1 || j === 7) {
                    matrix[r][c] = false;
                }
                // Finder pattern (7×7 bullseye)
                else if ((i === 0 || i === 6 || j === 0 || j === 6)) {
                    // Outer square - BLACK
                    matrix[r][c] = true;
                } else if (i >= 2 && i <= 4 && j >= 2 && j <= 4) {
                    // Center 3×3 square - BLACK
                    matrix[r][c] = true;
                } else {
                    // Gap between outer and inner - WHITE
                    matrix[r][c] = false;
                }
            }
        }
    }
}

// Place alignment pattern
function placeAlignment(matrix, row, col) {
    for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
            const r = row + i;
            const c = col + j;
            if (r >= 0 && r < matrix.length && c >= 0 && c < matrix.length) {
                if ((i === -2 || i === 2 || j === -2 || j === 2) || (i === 0 && j === 0)) {
                    matrix[r][c] = true;
                } else {
                    matrix[r][c] = false;
                }
            }
        }
    }
}

// Place function patterns (finders, timing, alignment)
function placeFunctionPatterns(matrix, version) {
    const size = matrix.length;

    // Finder patterns (top-left, top-right, bottom-left)
    placeFinder(matrix, 0, 0);
    placeFinder(matrix, 0, size - 7);
    placeFinder(matrix, size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
        matrix[6][i] = (i % 2 === 0);
        matrix[i][6] = (i % 2 === 0);
    }

    // Dark module
    matrix[4 * version + 9][8] = true;

    // Alignment patterns
    const alignments = getAlignmentPatternCenters(version);
    alignments.forEach((row, i) => {
        alignments.forEach((col, j) => {
            // Skip if overlaps with finder
            if ((i === 0 && j === 0) ||
                (i === 0 && j === alignments.length - 1) ||
                (i === alignments.length - 1 && j === 0)) {
                return;
            }
            placeAlignment(matrix, row, col);
        });
    });

    // Reserve format information areas
    for (let i = 0; i < 8; i++) {
        if (matrix[8][i] === null) matrix[8][i] = false;
        if (matrix[i][8] === null) matrix[i][8] = false;
        if (matrix[8][size - 1 - i] === null) matrix[8][size - 1 - i] = false;
        if (matrix[size - 1 - i][8] === null) matrix[size - 1 - i][8] = false;
    }
    // Also reserve the (8,8) position which is part of format info
    if (matrix[8][8] === null) matrix[8][8] = false;

    // Reserve version information areas (for version 7+)
    if (version >= 7) {
        // Top-right version info area (3 cols x 6 rows)
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 3; col++) {
                if (matrix[row][size - 11 + col] === null) {
                    matrix[row][size - 11 + col] = false;
                }
            }
        }
        // Bottom-left version info area (6 cols x 3 rows)
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 6; col++) {
                if (matrix[size - 11 + row][col] === null) {
                    matrix[size - 11 + row][col] = false;
                }
            }
        }
    }
}

// Place data bits on matrix
function placeDataBits(matrix, data) {
    const size = matrix.length;
    let bitIndex = 0;

    // Convert data bytes to bit string
    let bits = '';
    data.forEach(byte => {
        bits += toBinary(byte, 8);
    });

    // Place bits in zigzag pattern (right to left, bottom to top)
    let direction = -1; // -1 = up, 1 = down
    let col = size - 1;

    while (col >= 1) {
        for (let count = 0; count < size; count++) {
            let row = direction === -1 ? size - 1 - count : count;

            for (let c = 0; c < 2; c++) {
                const currentCol = col - c;

                if (matrix[row][currentCol] === null) {
                    if (bitIndex < bits.length) {
                        matrix[row][currentCol] = bits[bitIndex] === '1';
                        bitIndex++;
                    } else {
                        // Ran out of bits - fill with 0
                        matrix[row][currentCol] = false;
                    }
                }
            }
        }

        col -= 2;
        // Skip timing column (check AFTER decrementing)
        if (col === 6) col--;
        direction *= -1;
    }
}

// Apply mask pattern only to data modules (skip function patterns)
function applyMask(matrix, pattern, version) {
    const size = matrix.length;

    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            // Skip function modules - they should never be masked
            if (isFunctionModule(row, col, size, version)) {
                continue;
            }

            // Check if this module should be flipped according to mask pattern
            if (shouldFlipModule(row, col, pattern)) {
                matrix[row][col] = !matrix[row][col];
            }
        }
    }
}

// Calculate format information bits
function calculateFormatBits(eccLevel, maskPattern) {
    // ECC level indicators
    const eccBits = { 'L': 0b01, 'M': 0b00, 'Q': 0b11, 'H': 0b10 };

    const formatInfo = (eccBits[eccLevel] << 3) | maskPattern;

    // BCH error correction for format info
    let bch = formatInfo << 10;
    let g = 0b10100110111;

    for (let i = 0; i < 5; i++) {
        if ((bch >> (14 - i)) & 1) {
            bch ^= g << (4 - i);
        }
    }

    let bits = ((formatInfo << 10) | bch) ^ 0b101010000010010;

    return bits;
}

// Calculate version information bits (for version 7+)
function calculateVersionBits(version) {
    if (version < 7) return 0;

    // BCH error correction for version info
    // Version is 6 bits, BCH adds 12 bits = 18 bits total
    let bch = version << 12;
    let g = 0b1111100100101; // Generator polynomial for version info

    for (let i = 0; i < 6; i++) {
        if ((bch >> (17 - i)) & 1) {
            bch ^= g << (5 - i);
        }
    }

    let bits = (version << 12) | bch;
    return bits;
}

// Place version information (for version 7+)
function placeVersionInfo(matrix, version) {
    if (version < 7) return;

    const size = matrix.length;
    const versionBits = calculateVersionBits(version);

    // Version info is 18 bits total, placed in two locations
    // Bottom-left: 3 columns x 6 rows (rows: size-11 to size-9, cols: 0-5)
    // Top-right: 6 columns x 3 rows (rows: 0-5, cols: size-11 to size-9)

    // Place in bottom-left area (reading column by column, bottom to top)
    for (let col = 0; col < 6; col++) {
        for (let row = 0; row < 3; row++) {
            const bitIndex = col * 3 + row;
            const bit = (versionBits >> bitIndex) & 1;
            matrix[size - 11 + row][col] = bit === 1;
        }
    }

    // Place in top-right area (reading row by row, right to left)
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 3; col++) {
            const bitIndex = row * 3 + col;
            const bit = (versionBits >> bitIndex) & 1;
            matrix[row][size - 11 + col] = bit === 1;
        }
    }
}

// Place format information
function placeFormatInfo(matrix, eccLevel, maskPattern, version) {
    const size = matrix.length;
    const formatBits = calculateFormatBits(eccLevel, maskPattern);

    // Calculate dark module position
    const darkRow = 4 * version + 9;
    const darkCol = 8;

    // The decoder reads format bits in this specific order to build MSB-first
    // So we need to place bit 14 at position 0, bit 13 at position 1, etc.

    // Positions 0-5: row 8, columns 0-5
    for (let i = 0; i < 6; i++) {
        const bit = (formatBits >> (14 - i)) & 1;
        matrix[8][i] = bit === 1;
        // Also place on bottom-left for redundancy
        matrix[size - 1 - i][8] = bit === 1;
    }

    // Position 6: row 8, column 7 (skip column 6 for timing)
    const bit6 = (formatBits >> (14 - 6)) & 1;
    matrix[8][7] = bit6 === 1;
    matrix[size - 7][8] = bit6 === 1;

    // Position 7: row 8, column 8
    const bit7 = (formatBits >> (14 - 7)) & 1;
    matrix[8][8] = bit7 === 1;
    matrix[size - 8][8] = bit7 === 1;

    // Position 8: row 7, column 8
    const bit8 = (formatBits >> (14 - 8)) & 1;
    matrix[7][8] = bit8 === 1;
    matrix[8][size - 8] = bit8 === 1;

    // Positions 9-14: column 8, rows 5,4,3,2,1,0 (skip row 6 for timing)
    const rows = [5, 4, 3, 2, 1, 0];
    for (let i = 0; i < 6; i++) {
        const bit = (formatBits >> (14 - (9 + i))) & 1;
        matrix[rows[i]][8] = bit === 1;
        matrix[8][size - 7 + i] = bit === 1;
    }

    // Ensure dark module is always black (re-assert after format placement)
    matrix[darkRow][darkCol] = true;
}
