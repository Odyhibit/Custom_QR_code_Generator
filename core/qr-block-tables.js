// QR Code Block Structure Tables
// Contains error correction block information for all versions (1-40) and ECC levels (L,M,Q,H)

// Block structure table format (CSV):
// version-ecc, totalDataCodewords, eccCodewordsPerBlock, numBlocksGroup1, dataCodewordsInGroup1, numBlocksGroup2, dataCodewordsInGroup2, totalDataCodewords

const blockSizeTableCsv = `
1-L,19,7,1,19,,,19
1-M,16,10,1,16,,,16
1-Q,13,13,1,13,,,13
1-H,9,17,1,9,,,9
2-L,34,10,1,34,,,34
2-M,28,16,1,28,,,28
2-Q,22,22,1,22,,,22
2-H,16,28,1,16,,,16
3-L,55,15,1,55,,,55
3-M,44,26,1,44,,,44
3-Q,34,18,2,17,,,34
3-H,26,22,2,13,,,26
4-L,80,20,1,80,,,80
4-M,64,18,2,32,,,64
4-Q,48,26,2,24,,,48
4-H,36,16,4,9,,,36
5-L,108,26,1,108,,,108
5-M,86,24,2,43,,,86
5-Q,62,18,2,15,2,16,62
5-H,46,22,2,11,2,12,46
6-L,136,18,2,68,,,136
6-M,108,16,4,27,,,108
6-Q,76,24,4,19,,,76
6-H,60,28,4,15,,,60
7-L,156,20,2,78,,,156
7-M,124,18,4,31,,,124
7-Q,88,18,2,14,4,15,88
7-H,66,26,4,13,1,14,66
8-L,194,24,2,97,,,194
8-M,154,22,2,38,2,39,154
8-Q,110,22,4,18,2,19,110
8-H,86,26,4,14,2,15,86
9-L,232,30,2,116,,,232
9-M,182,22,3,36,2,37,182
9-Q,132,20,4,16,4,17,132
9-H,100,24,4,12,4,13,100
10-L,274,18,2,68,2,69,274
10-M,216,26,4,43,1,44,216
10-Q,154,24,6,19,2,20,154
10-H,122,28,6,15,2,16,122
11-L,324,20,4,81,,,324
11-M,254,30,1,50,4,51,254
11-Q,180,28,4,22,4,23,180
11-H,140,24,3,12,8,13,140
12-L,370,24,2,92,2,93,370
12-M,290,22,6,36,2,37,290
12-Q,206,26,4,20,6,21,206
12-H,158,28,7,14,4,15,158
13-L,428,26,4,107,,,428
13-M,334,22,8,37,1,38,334
13-Q,244,24,8,20,4,21,244
13-H,180,22,12,11,4,12,180
14-L,461,30,3,115,1,116,461
14-M,365,24,4,40,5,41,365
14-Q,261,20,11,16,5,17,261
14-H,197,24,11,12,5,13,197
15-L,523,22,5,87,1,88,523
15-M,415,24,5,41,5,42,415
15-Q,295,30,5,24,7,25,295
15-H,223,24,11,12,7,13,223
16-L,589,24,5,98,1,99,589
16-M,453,28,7,45,3,46,453
16-Q,325,24,15,19,2,20,325
16-H,253,30,3,15,13,16,253
17-L,647,28,1,107,5,108,647
17-M,507,28,10,46,1,47,507
17-Q,367,28,1,22,15,23,367
17-H,283,28,2,14,17,15,283
18-L,721,30,5,120,1,121,721
18-M,563,26,9,43,4,44,563
18-Q,397,28,17,22,1,23,397
18-H,313,28,2,14,19,15,313
19-L,795,28,3,113,4,114,795
19-M,627,26,3,44,11,45,627
19-Q,445,26,17,21,4,22,445
19-H,341,26,9,13,16,14,341
20-L,861,28,3,107,5,108,861
20-M,669,26,3,41,13,42,669
20-Q,485,30,15,24,5,25,485
20-H,385,28,15,15,10,16,385
21-L,932,28,4,116,4,117,932
21-M,714,26,17,42,,,714
21-Q,512,28,17,22,6,23,512
21-H,406,30,19,16,6,17,406
22-L,1006,28,2,111,7,112,1006
22-M,782,28,17,46,,,782
22-Q,568,30,7,24,16,25,568
22-H,442,24,34,13,,,442
23-L,1094,30,4,121,5,122,1094
23-M,860,28,4,47,14,48,860
23-Q,614,30,11,24,14,25,614
23-H,464,30,16,15,14,16,464
24-L,1174,30,6,117,4,118,1174
24-M,914,28,6,45,14,46,914
24-Q,664,30,11,24,16,25,664
24-H,514,30,30,16,2,17,514
25-L,1276,26,8,106,4,107,1276
25-M,1000,28,8,47,13,48,1000
25-Q,718,30,7,24,22,25,718
25-H,538,30,22,15,13,16,538
26-L,1370,28,10,114,2,115,1370
26-M,1062,28,19,46,4,47,1062
26-Q,754,28,28,22,6,23,754
26-H,596,30,33,16,4,17,596
27-L,1468,30,8,122,4,123,1468
27-M,1128,28,22,45,3,46,1128
27-Q,808,30,8,23,26,24,808
27-H,628,30,12,15,28,16,628
28-L,1531,30,3,117,10,118,1531
28-M,1193,28,3,45,23,46,1193
28-Q,871,30,4,24,31,25,871
28-H,661,30,11,15,31,16,661
29-L,1631,30,7,116,7,117,1631
29-M,1267,28,21,45,7,46,1267
29-Q,911,30,1,23,37,24,911
29-H,701,30,19,15,26,16,701
30-L,1735,30,5,115,10,116,1735
30-M,1373,28,19,47,10,48,1373
30-Q,985,30,15,24,25,25,985
30-H,745,30,23,15,25,16,745
31-L,1843,30,13,115,3,116,1843
31-M,1455,28,2,46,29,47,1455
31-Q,1033,30,42,24,1,25,1033
31-H,793,30,23,15,28,16,793
32-L,1955,30,17,115,,,1955
32-M,1541,28,10,46,23,47,1541
32-Q,1115,30,10,24,35,25,1115
32-H,845,30,19,15,35,16,845
33-L,2071,30,17,115,1,116,2071
33-M,1631,28,14,46,21,47,1631
33-Q,1171,30,29,24,19,25,1171
33-H,901,30,11,15,46,16,901
34-L,2191,30,13,115,6,116,2191
34-M,1725,28,14,46,23,47,1725
34-Q,1231,30,44,24,7,25,1231
34-H,961,30,59,16,1,17,961
35-L,2306,30,12,121,7,122,2306
35-M,1812,28,12,47,26,48,1812
35-Q,1286,30,39,24,14,25,1286
35-H,986,30,22,15,41,16,986
36-L,2434,30,6,121,14,122,2434
36-M,1914,28,6,47,34,48,1914
36-Q,1354,30,46,24,10,25,1354
36-H,1054,30,2,15,64,16,1054
37-L,2566,30,17,122,4,123,2566
37-M,1992,28,29,46,14,47,1992
37-Q,1426,30,49,24,10,25,1426
37-H,1096,30,24,15,46,16,1096
38-L,2702,30,4,122,18,123,2702
38-M,2102,28,13,46,32,47,2102
38-Q,1502,30,48,24,14,25,1502
38-H,1142,30,42,15,32,16,1142
39-L,2812,30,20,117,4,118,2812
39-M,2216,28,40,47,7,48,2216
39-Q,1582,30,43,24,22,25,1582
39-H,1222,30,10,15,67,16,1222
40-L,2956,30,19,118,6,119,2956
40-M,2334,28,18,47,31,48,2334
40-Q,1666,30,34,24,34,25,1666
40-H,1276,30,20,15,61,16,1276`;

// Parse block size table for detailed block information (used by encoder)
function parseBlockSizeTableEncoder(csv) {
    const table = {};
    csv.trim().split('\n').forEach(line => {
        const parts = line.trim().split(',');
        const key = parts[0]; // e.g., "1-L"
        table[key] = {
            dataCodewords: parseInt(parts[1]),
            eccCodewordsPerBlock: parseInt(parts[2]),
            numBlocks: parseInt(parts[3]),
            dataCodewordsInGroup1: parseInt(parts[4]),
            numBlocksInGroup2: parts[5] ? parseInt(parts[5]) : 0,
            dataCodewordsInGroup2: parts[6] ? parseInt(parts[6]) : 0,
            totalDataCodewords: parseInt(parts[7])
        };
    });
    return table;
}

// Parse capacity table (simpler version for capacity lookups)
function parseCapacityTable(csv) {
    const table = {};
    csv.trim().split('\n').forEach(line => {
        const parts = line.trim().split(',');
        const key = parts[0]; // e.g., "1-L"
        table[key] = parseInt(parts[1]); // Just the data codewords count
    });
    return table;
}

// Parse block size table for decoder (different format)
function parseBlockSizeTableDecoder(csv) {
    const map = {};
    const lines = csv.trim().split(/\r?\n/);
    for (const line of lines) {
        const parts = line.split(',');
        if (!parts.length || parts[0].includes('Version and EC Level')) continue;
        const key = parts[0].trim();
        if (!key) continue;

        const [versionStr, eccLevel] = key.split('-');
        const version = parseInt(versionStr, 10);
        if (!version || !eccLevel) continue;

        const ecPerBlock = parseInt(parts[2], 10) || 0;
        const g1Blocks = parseInt(parts[3], 10) || 0;
        const g1Data = parseInt(parts[4], 10) || 0;
        const g2Blocks = parseInt(parts[5], 10) || 0;
        const g2Data = parseInt(parts[6], 10) || 0;

        if (!map[version]) map[version] = {};
        map[version][eccLevel] = { ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data };
    }
    return map;
}

function getBlockConfig(version, eccLevel) {
    if (!blockSizeTableForDecoder[version]) return null;
    return blockSizeTableForDecoder[version][eccLevel] || null;
}

function hasMultipleBlocks(version, eccLevel) {
    const config = getBlockConfig(version, eccLevel);
    if (!config) return false;
    return (config.g1Blocks || 0) + (config.g2Blocks || 0) > 1;
}

// Initialize tables
const blockSizeTable = parseBlockSizeTableEncoder(blockSizeTableCsv);
const capacityTable = parseCapacityTable(blockSizeTableCsv);
const blockSizeTableForDecoder = parseBlockSizeTableDecoder(blockSizeTableCsv);
