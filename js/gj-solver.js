// Gauss-Jordan elimination solver for QR data bits.
//
// Allows setting individual module (pixel) values in a QR code while
// maintaining valid Reed-Solomon error correction.  Implements the same
// algorithm used by Russ Cox's QArt Coder (rsc.io/qr/qart).
//
// Ported from qr_core/lib/src/gj_solver.dart.
//
// Algorithm overview:
//   For each RS block, build a constraint matrix M where row i represents
//   the effect of flipping data bit i on the full codeword (data + ECC).
//   Each row is initialised as: data part = bit i set, ECC part = RS(data).
//   canSet(bi, bval) performs GJ elimination to set bit bi to bval, reducing
//   the active rows by one and ensuring ECC remains valid.

// ---------------------------------------------------------------------------
// Per-block solver
// ---------------------------------------------------------------------------

class GJBitBlock {
    constructor(nd, nc, b, active) {
        this.nd = nd;        // data byte count
        this.nc = nc;        // ECC byte count
        this.b = b;          // codeword: nd data bytes + nc ECC bytes
        this._active = active; // unsolved constraint rows
        this._used = [];       // solved rows (kept for back-substitution)
    }

    static fromData(data, eccCount) {
        const rs = new ReedSolomonEncoder();
        const nd = data.length;
        const nc = eccCount;
        const b = [...data, ...rs.encode(data, nc)];

        // Build constraint matrix: one row per data bit.
        // Row i has data part = bit i set to 1, ECC part = RS(that data vector).
        const active = [];
        for (let i = 0; i < nd * 8; i++) {
            const row = new Array(nd + nc).fill(0);
            row[i >>> 3] = 1 << (7 - (i & 7)); // MSB-first
            const eccPart = rs.encode(row.slice(0, nd), nc);
            for (let j = 0; j < nc; j++) {
                row[nd + j] = eccPart[j];
            }
            active.push(row);
        }

        return new GJBitBlock(nd, nc, b, active);
    }

    // Try to set data bit bi (0 = MSB of first data byte) to bval (0 or 1).
    // Returns true if the bit was independently controllable and has been set.
    canSet(bi, bval) {
        // Find a pivot row with bit bi set.
        let pivotIdx = -1;
        for (let j = 0; j < this._active.length; j++) {
            if ((this._active[j][bi >>> 3] >> (7 - (bi & 7))) & 1) {
                pivotIdx = j;
                break;
            }
        }
        if (pivotIdx === -1) return false;

        // Swap pivot to front.
        if (pivotIdx !== 0) {
            [this._active[0], this._active[pivotIdx]] = [this._active[pivotIdx], this._active[0]];
        }
        const targ = this._active[0];

        // Forward elimination: remove bit bi from all other active rows.
        for (let j = 1; j < this._active.length; j++) {
            if ((this._active[j][bi >>> 3] >> (7 - (bi & 7))) & 1) {
                for (let k = 0; k < targ.length; k++) {
                    this._active[j][k] ^= targ[k];
                }
            }
        }

        // Back-substitution: remove bit bi from previously solved rows.
        for (const row of this._used) {
            if ((row[bi >>> 3] >> (7 - (bi & 7))) & 1) {
                for (let k = 0; k < targ.length; k++) {
                    row[k] ^= targ[k];
                }
            }
        }

        // Apply pivot to codeword if the current bit value differs from target.
        if (((this.b[bi >>> 3] >> (7 - (bi & 7))) & 1) !== bval) {
            for (let j = 0; j < this.b.length; j++) {
                this.b[j] ^= targ[j];
            }
        }

        // Mark this pivot as solved.
        this._used.push(targ);
        this._active.shift();
        return true;
    }

    // Try to set an ECC bit to bval (0 or 1) by finding a free data-bit row
    // whose RS contribution touches this ECC bit and using it as a pivot.
    canSetEccBit(eccByteInBlock, bitInByte, bval) {
        const cwByteIdx = this.nd + eccByteInBlock;
        const bitMask = 1 << (7 - bitInByte);

        // Find a pivot row that has this ECC bit set.
        let pivotIdx = -1;
        for (let j = 0; j < this._active.length; j++) {
            if (this._active[j][cwByteIdx] & bitMask) {
                pivotIdx = j;
                break;
            }
        }
        if (pivotIdx === -1) return false;

        if (pivotIdx !== 0) {
            [this._active[0], this._active[pivotIdx]] = [this._active[pivotIdx], this._active[0]];
        }
        const targ = this._active[0];

        // Forward elimination: clear this ECC bit from all other active rows.
        for (let j = 1; j < this._active.length; j++) {
            if (this._active[j][cwByteIdx] & bitMask) {
                for (let k = 0; k < targ.length; k++) {
                    this._active[j][k] ^= targ[k];
                }
            }
        }

        // Back-substitution into already-solved rows.
        for (const row of this._used) {
            if (row[cwByteIdx] & bitMask) {
                for (let k = 0; k < targ.length; k++) {
                    row[k] ^= targ[k];
                }
            }
        }

        // Apply pivot to codeword if the current ECC bit differs from target.
        const currentEccBit = (this.b[cwByteIdx] & bitMask) ? 1 : 0;
        if (currentEccBit !== bval) {
            for (let j = 0; j < this.b.length; j++) {
                this.b[j] ^= targ[j];
            }
        }

        this._used.push(targ);
        this._active.shift();
        return true;
    }

    get dataBytes() {
        return this.b.slice(0, this.nd);
    }
}

// ---------------------------------------------------------------------------
// Internal helper: replay zigzag walk once for all interleaved bytes
// ---------------------------------------------------------------------------

// Returns Map<byteIndex, [{row, col, bitOffset}]> covering totalBytes.
// Uses isFunctionModule() from qr-utils.js (loaded before this file).
function _gjMapAllInterleavedToModules(version, totalBytes) {
    const size = 21 + (version - 1) * 4;
    const result = new Map();
    let bitIndex = 0;
    const totalBits = totalBytes * 8;
    let direction = -1; // -1 = up, 1 = down
    let col = size - 1;

    while (col >= 1) {
        for (let count = 0; count < size; count++) {
            const row = direction === -1 ? size - 1 - count : count;
            for (let c = 0; c < 2; c++) {
                const currentCol = col - c;
                if (!isFunctionModule(row, currentCol, size, version)) {
                    if (bitIndex < totalBits) {
                        const byteIndex = bitIndex >>> 3;
                        const bitOffset = bitIndex & 7;
                        if (!result.has(byteIndex)) result.set(byteIndex, []);
                        result.get(byteIndex).push({ row, col: currentCol, bitOffset });
                        bitIndex++;
                    }
                }
            }
        }
        col -= 2;
        if (col === 6) col--;
        direction *= -1;
    }

    return result;
}

// ---------------------------------------------------------------------------
// Public: buildGJMaps
// Builds all maps needed for gjSolveModuleBits in a single zigzag pass.
// ---------------------------------------------------------------------------

// Returns { moduleToInterleavedBit, eccModuleMap, interleavedBitToBlock }
function buildGJMaps(version, eccLevel, numDataBytes) {
    const key = `${version}-${eccLevel}`;
    const info = blockSizeTable[key];
    const totalBlocks = info.numBlocks + info.numBlocksInGroup2;
    const totalInterleaved = info.totalDataCodewords + totalBlocks * info.eccCodewordsPerBlock;

    // Single zigzag walk for everything.
    const fullMap = _gjMapAllInterleavedToModules(version, totalInterleaved);

    // moduleToInterleavedBit: "row,col" → interleaved DATA bit index (data bytes only)
    const moduleToInterleavedBit = new Map();
    for (let ii = 0; ii < numDataBytes; ii++) {
        const positions = fullMap.get(ii);
        if (!positions) continue;
        for (const pos of positions) {
            moduleToInterleavedBit.set(`${pos.row},${pos.col}`, ii * 8 + pos.bitOffset);
        }
    }

    // eccModuleMap: "row,col" → { blockIdx, eccByteInBlock, bitInByte }
    const eccModuleMap = new Map();
    for (let cwIdx = info.totalDataCodewords; cwIdx < totalInterleaved; cwIdx++) {
        const positions = fullMap.get(cwIdx);
        if (!positions) continue;
        const eccSectionIdx = cwIdx - info.totalDataCodewords;
        const blockIdx = eccSectionIdx % totalBlocks;
        const eccByteInBlock = Math.floor(eccSectionIdx / totalBlocks);
        for (const pos of positions) {
            eccModuleMap.set(`${pos.row},${pos.col}`, {
                blockIdx,
                eccByteInBlock,
                bitInByte: pos.bitOffset
            });
        }
    }

    // interleavedBitToBlock: Array index = interleaved DATA bit index,
    // value = { blockIdx, bitInBlock }
    const blockSizes = [];
    for (let i = 0; i < info.numBlocks; i++) {
        blockSizes.push(info.dataCodewordsInGroup1);
    }
    for (let i = 0; i < info.numBlocksInGroup2; i++) {
        blockSizes.push(info.dataCodewordsInGroup2);
    }
    const maxLen = Math.max(...blockSizes);
    const interleavedBitToBlock = [];
    for (let i = 0; i < maxLen; i++) {
        for (let b = 0; b < blockSizes.length; b++) {
            if (i < blockSizes[b]) {
                for (let bit = 0; bit < 8; bit++) {
                    interleavedBitToBlock.push({ blockIdx: b, bitInBlock: i * 8 + bit });
                }
            }
        }
    }

    return { moduleToInterleavedBit, eccModuleMap, interleavedBitToBlock };
}

// ---------------------------------------------------------------------------
// Public: gjSolveModuleBits
// ---------------------------------------------------------------------------

// Solve for data bytes that produce targets module display values, and
// optionally also eccTargets ECC module display values.
//
// Parameters:
//   dataBytes             — original sequential data codewords (array of ints)
//   version, eccLevel     — QR parameters
//   maskPattern           — the mask applied during rendering; targets are
//                           the desired POST-mask display values
//   messageByteCount      — number of leading sequential data bytes that must
//                           not be modified (0 = no locking)
//   targets               — Map<"row,col", bool> for DATA module positions
//   moduleToInterleavedBit— Map<"row,col", interleavedBitIndex> (data only)
//   interleavedBitToBlock — Array of { blockIdx, bitInBlock }
//   eccTargets            — optional Map<"row,col", bool> for ECC modules
//   eccModuleMap          — optional Map<"row,col", {blockIdx,eccByteInBlock,bitInByte}>
//
// Returns modified sequential data bytes (ECC must be recalculated by caller).
function gjSolveModuleBits({
    dataBytes,
    version,
    eccLevel,
    maskPattern,
    messageByteCount,
    targets,
    moduleToInterleavedBit,
    interleavedBitToBlock,
    eccTargets = null,
    eccModuleMap = null
}) {
    const key = `${version}-${eccLevel}`;
    const info = blockSizeTable[key];

    // Build per-block solvers from sequential data bytes.
    const solvers = [];
    const blockOffsets = [];
    let offset = 0;
    for (let i = 0; i < info.numBlocks; i++) {
        blockOffsets.push(offset);
        const slice = dataBytes.slice(offset, offset + info.dataCodewordsInGroup1);
        solvers.push(GJBitBlock.fromData(slice, info.eccCodewordsPerBlock));
        offset += info.dataCodewordsInGroup1;
    }
    for (let i = 0; i < info.numBlocksInGroup2; i++) {
        blockOffsets.push(offset);
        const slice = dataBytes.slice(offset, offset + info.dataCodewordsInGroup2);
        solvers.push(GJBitBlock.fromData(slice, info.eccCodewordsPerBlock));
        offset += info.dataCodewordsInGroup2;
    }

    // 1. Lock message bytes so GJ cannot use their rows as pivots for ECC
    //    targets.  We set each bit to its current value — this consumes one
    //    degree of freedom per bit but keeps the message intact.
    if (messageByteCount > 0) {
        for (let ib = 0; ib < interleavedBitToBlock.length; ib++) {
            const bInfo = interleavedBitToBlock[ib];
            if (bInfo.blockIdx >= solvers.length) continue;
            const seqByteIdx = blockOffsets[bInfo.blockIdx] + (bInfo.bitInBlock >>> 3);
            if (seqByteIdx >= messageByteCount) continue;
            const bitInByte = bInfo.bitInBlock & 7;
            const currentBit = (dataBytes[seqByteIdx] >> (7 - bitInByte)) & 1;
            solvers[bInfo.blockIdx].canSet(bInfo.bitInBlock, currentBit);
        }
    }

    // 2. ECC targets — processed before padding targets to give them priority.
    if (eccTargets && eccModuleMap) {
        for (const [cellKey, isDark] of eccTargets) {
            const eccInfo = eccModuleMap.get(cellKey);
            if (!eccInfo || eccInfo.blockIdx >= solvers.length) continue;

            const [row, col] = cellKey.split(',').map(Number);
            const flipped = shouldFlipModule(row, col, maskPattern);
            const rawBit = (isDark ^ flipped) ? 1 : 0;

            solvers[eccInfo.blockIdx].canSetEccBit(
                eccInfo.eccByteInBlock, eccInfo.bitInByte, rawBit
            );
        }
    }

    // 3. Data / padding targets.
    for (const [cellKey, isDark] of targets) {
        const ib = moduleToInterleavedBit.get(cellKey);
        if (ib === undefined || ib >= interleavedBitToBlock.length) continue;

        const blockInfo = interleavedBitToBlock[ib];
        if (blockInfo.blockIdx >= solvers.length) continue;

        const [row, col] = cellKey.split(',').map(Number);
        const flipped = shouldFlipModule(row, col, maskPattern);
        const rawBit = (isDark ^ flipped) ? 1 : 0;

        solvers[blockInfo.blockIdx].canSet(blockInfo.bitInBlock, rawBit);
    }

    // Reassemble sequential data bytes from all blocks.
    const result = [...dataBytes];
    let writeOffset = 0;
    for (const solver of solvers) {
        const solved = solver.dataBytes;
        for (let j = 0; j < solved.length; j++) {
            result[writeOffset + j] = solved[j];
        }
        writeOffset += solved.length;
    }
    return result;
}
