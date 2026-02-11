// Reed-Solomon Error Correction Code
// Shared implementation for QR code encoding and decoding
// Based on ZXing's well-tested implementation

// Galois Field (GF) mathematics for Reed-Solomon
class GenericGF {
    constructor(primitive, size, genBase) {
        this.primitive = primitive;
        this.size = size;
        this.generatorBase = genBase;
        this.expTable = new Array(size);
        this.logTable = new Array(size);

        // Build exponential and logarithm tables
        let x = 1;
        for (let i = 0; i < size; i++) {
            this.expTable[i] = x;
            x <<= 1;
            if (x >= size) {
                x ^= primitive;
                x &= size - 1;
            }
        }

        for (let i = 0; i < size - 1; i++) {
            this.logTable[this.expTable[i]] = i;
        }

        this.zero = new GenericGFPoly(this, [0]);
        this.one = new GenericGFPoly(this, [1]);
    }

    addOrSubtract(a, b) {
        return a ^ b;  // XOR in GF(256)
    }

    multiply(a, b) {
        if (a === 0 || b === 0) return 0;
        return this.expTable[(this.logTable[a] + this.logTable[b]) % (this.size - 1)];
    }

    divide(a, b) {
        if (b === 0) throw new Error('Division by zero');
        if (a === 0) return 0;
        return this.expTable[(this.logTable[a] + (this.size - 1) - this.logTable[b]) % (this.size - 1)];
    }

    inverse(a) {
        if (a === 0) throw new Error('Cannot calculate inverse of 0');
        return this.expTable[(this.size - 1) - this.logTable[a]];
    }

    buildMonomial(degree, coefficient) {
        if (degree < 0) throw new Error('Invalid monomial degree');
        if (coefficient === 0) return this.zero;
        const coefficients = new Array(degree + 1).fill(0);
        coefficients[0] = coefficient;
        return new GenericGFPoly(this, coefficients);
    }

    getZero() {
        return this.zero;
    }

    getOne() {
        return this.one;
    }

    getGeneratorBase() {
        return this.generatorBase;
    }

    getSize() {
        return this.size;
    }
}

// Polynomial over Galois Field
class GenericGFPoly {
    constructor(field, coefficients) {
        if (!coefficients || coefficients.length === 0) {
            throw new Error('No coefficients provided');
        }
        this.field = field;

        // Remove leading zero coefficients
        let firstNonZero = 0;
        while (firstNonZero < coefficients.length && coefficients[firstNonZero] === 0) {
            firstNonZero++;
        }
        this.coefficients = firstNonZero === coefficients.length ? [0] : coefficients.slice(firstNonZero);
    }

    getCoefficient(degree) {
        return this.coefficients[this.coefficients.length - 1 - degree];
    }

    getCoefficients() {
        return this.coefficients.slice();
    }

    getDegree() {
        return this.coefficients.length - 1;
    }

    isZero() {
        return this.coefficients[0] === 0;
    }

    addOrSubtract(other) {
        if (this.field !== other.field) {
            throw new Error('Fields do not match');
        }
        if (this.isZero()) return other;
        if (other.isZero()) return this;

        let smallerCoefficients = this.coefficients;
        let largerCoefficients = other.coefficients;
        if (smallerCoefficients.length > largerCoefficients.length) {
            [smallerCoefficients, largerCoefficients] = [largerCoefficients, smallerCoefficients];
        }

        const lengthDiff = largerCoefficients.length - smallerCoefficients.length;
        const sumDiff = largerCoefficients.slice();
        for (let i = 0; i < smallerCoefficients.length; i++) {
            sumDiff[i + lengthDiff] = this.field.addOrSubtract(smallerCoefficients[i], largerCoefficients[i + lengthDiff]);
        }
        return new GenericGFPoly(this.field, sumDiff);
    }

    multiply(other) {
        if (this.field !== other.field) {
            throw new Error('Fields do not match');
        }
        if (this.isZero() || other.isZero()) return this.field.getZero();

        const aCoefficients = this.coefficients;
        const bCoefficients = other.coefficients;
        const product = new Array(aCoefficients.length + bCoefficients.length - 1).fill(0);
        for (let i = 0; i < aCoefficients.length; i++) {
            const aCoeff = aCoefficients[i];
            for (let j = 0; j < bCoefficients.length; j++) {
                product[i + j] = this.field.addOrSubtract(
                    product[i + j],
                    this.field.multiply(aCoeff, bCoefficients[j])
                );
            }
        }
        return new GenericGFPoly(this.field, product);
    }

    multiplyScalar(scalar) {
        if (scalar === 0) return this.field.getZero();
        if (scalar === 1) return this;
        const product = this.coefficients.map(c => this.field.multiply(c, scalar));
        return new GenericGFPoly(this.field, product);
    }

    multiplyByMonomial(degree, coefficient) {
        if (degree < 0) throw new Error('Invalid monomial degree');
        if (coefficient === 0) return this.field.getZero();

        const product = new Array(this.coefficients.length + degree).fill(0);
        for (let i = 0; i < this.coefficients.length; i++) {
            product[i] = this.field.multiply(this.coefficients[i], coefficient);
        }
        return new GenericGFPoly(this.field, product);
    }

    evaluateAt(x) {
        if (x === 0) {
            return this.getCoefficient(0);
        }
        if (x === 1) {
            return this.coefficients.reduce((acc, c) => this.field.addOrSubtract(acc, c), 0);
        }
        let result = this.coefficients[0];
        for (let i = 1; i < this.coefficients.length; i++) {
            result = this.field.addOrSubtract(this.field.multiply(result, x), this.coefficients[i]);
        }
        return result;
    }
}

// Reed-Solomon Encoder - generates ECC codewords
class ReedSolomonEncoder {
    constructor() {
        this.field = new GenericGF(0x011D, 256, 0);
    }

    // Build Reed-Solomon generator polynomial
    buildGenerator(degree) {
        if (degree < 1 || degree > 255) {
            throw new RangeError("Degree out of range");
        }

        // Polynomial coefficients stored from highest to lowest power
        let result = [];
        for (let i = 0; i < degree - 1; i++) {
            result.push(0);
        }
        result.push(1); // Start with x^0

        // Compute product polynomial (x - r^0) * (x - r^1) * ... * (x - r^{degree-1})
        let root = 1;
        for (let i = 0; i < degree; i++) {
            // Multiply current product by (x - r^i)
            for (let j = 0; j < result.length; j++) {
                result[j] = this.reedSolomonMultiply(result[j], root);
                if (j + 1 < result.length) {
                    result[j] ^= result[j + 1];
                }
            }
            root = this.reedSolomonMultiply(root, 0x02);
        }
        return result;
    }

    // Compute remainder (ECC bytes) using polynomial division
    encode(data, eccCount) {
        const divisor = this.buildGenerator(eccCount);
        let result = divisor.map(_ => 0);

        for (const b of data) {
            const factor = b ^ result.shift();
            result.push(0);
            divisor.forEach((coef, i) => {
                result[i] ^= this.reedSolomonMultiply(coef, factor);
            });
        }

        return result;
    }

    // Reed-Solomon field multiplication
    reedSolomonMultiply(x, y) {
        if (x >>> 8 !== 0 || y >>> 8 !== 0) {
            throw new RangeError("Byte out of range");
        }
        // Russian peasant multiplication
        let z = 0;
        for (let i = 7; i >= 0; i--) {
            z = (z << 1) ^ ((z >>> 7) * 0x11D);
            z ^= ((y >>> i) & 1) * x;
        }
        return z;
    }
}

// Reed-Solomon Decoder - detects and corrects errors
class ReedSolomonDecoder {
    constructor(field = new GenericGF(0x011D, 256, 0)) {
        this.field = field;
        this.expTable = field.expTable;
        this.logTable = field.logTable;
    }

    // Main decode function - returns number of errors corrected
    decode(received, twoS) {
        return this.decodeWithECCount(received, twoS);
    }

    decodeWithECCount(received, twoS) {
        const poly = new GenericGFPoly(this.field, received);
        const syndromeCoefficients = new Array(twoS);
        let noError = true;
        for (let i = 0; i < twoS; i++) {
            const evalResult = poly.evaluateAt(this.expTable[i + this.field.getGeneratorBase()]);
            syndromeCoefficients[syndromeCoefficients.length - 1 - i] = evalResult;
            if (evalResult !== 0) noError = false;
        }

        if (noError) {
            return 0;
        }

        const syndrome = new GenericGFPoly(this.field, syndromeCoefficients);
        const [sigma, omega] = this.runEuclideanAlgorithm(
            this.field.buildMonomial(twoS, 1),
            syndrome,
            twoS
        );
        const errorLocations = this.findErrorLocations(sigma);
        const errorMagnitudes = this.findErrorMagnitudes(omega, errorLocations);

        for (let i = 0; i < errorLocations.length; i++) {
            const position = received.length - 1 - this.field.logTable[errorLocations[i]];
            if (position < 0) {
                throw new Error('Bad error location');
            }
            received[position] = this.field.addOrSubtract(received[position], errorMagnitudes[i]);
        }

        return errorLocations.length;
    }

    gfMul(a, b) {
        return this.field.multiply(a, b);
    }

    gfDiv(a, b) {
        return this.field.divide(a, b);
    }

    polyMul(p1, p2) {
        const result = new Array(p1.length + p2.length - 1).fill(0);
        for (let i = 0; i < p1.length; i++) {
            if (p1[i] === 0) continue;
            for (let j = 0; j < p2.length; j++) {
                if (p2[j] === 0) continue;
                result[i + j] ^= this.gfMul(p1[i], p2[j]);
            }
        }
        return result;
    }

    polyEval(poly, x) {
        let result = 0;
        for (let i = poly.length - 1; i >= 0; i--) {
            result = this.gfMul(result, x) ^ poly[i];
        }
        return result;
    }

    calculateSyndromes(received, twoS) {
        const poly = new GenericGFPoly(this.field, received);
        const syndromes = new Array(twoS);
        for (let i = 0; i < twoS; i++) {
            syndromes[i] = poly.evaluateAt(this.expTable[i + this.field.getGeneratorBase()]);
        }
        return syndromes;
    }

    findErrorLocator(syndromes) {
        const degree = syndromes.length;
        const syndromeCoefficients = new Array(degree);
        for (let i = 0; i < degree; i++) {
            syndromeCoefficients[degree - 1 - i] = syndromes[i];
        }

        const syndrome = new GenericGFPoly(this.field, syndromeCoefficients);
        const [sigma] = this.runEuclideanAlgorithm(
            this.field.buildMonomial(degree, 1),
            syndrome,
            degree
        );
        return sigma.getCoefficients().slice();
    }

    findErrors(locatorCoeffs, codewordLength) {
        if (!locatorCoeffs || locatorCoeffs.length <= 1) return [];
        const trySolve = coeffs => {
            const locatorPoly = new GenericGFPoly(this.field, coeffs);
            const errorLocations = this.findErrorLocations(locatorPoly);
            return errorLocations.map(loc => ({
                position: codewordLength - 1 - this.field.logTable[loc],
                locator: loc
            }));
        };
        try {
            return trySolve(locatorCoeffs.slice());
        } catch (err) {
            try {
                return trySolve(locatorCoeffs.slice().reverse());
            } catch (err2) {
                console.warn('findErrors failed:', err2);
                return [];
            }
        }
    }

    forneyAlgorithm(syndromes, errorLocators, codewordLength, locatorCoeffs) {
        if (!errorLocators || errorLocators.length === 0) return [];
        if (!locatorCoeffs || locatorCoeffs.length === 0) return [];

        const twoS = syndromes.length;
        const syndromeCoefficients = new Array(twoS);
        for (let i = 0; i < twoS; i++) {
            syndromeCoefficients[twoS - 1 - i] = syndromes[i];
        }

        const syndromePoly = new GenericGFPoly(this.field, syndromeCoefficients);
        const locatorPoly = new GenericGFPoly(this.field, (locatorCoeffs || []).slice());
        const errorEvaluator = syndromePoly.multiply(locatorPoly);
        const evaluatorCoeffs = errorEvaluator.getCoefficients();
        const start = Math.max(0, evaluatorCoeffs.length - twoS);
        const omegaCoeffs = evaluatorCoeffs.slice(start);
        const omegaPoly = new GenericGFPoly(this.field, omegaCoeffs);

        return this.findErrorMagnitudes(omegaPoly, errorLocators);
    }

    generateGeneratorPoly(eccLength) {
        let gen = [1];
        for (let i = 0; i < eccLength; i++) {
            gen = this.polyMul(gen, [1, this.expTable[i]]);
        }
        return gen;
    }

    runEuclideanAlgorithm(a, b, R) {
        if (a.getDegree() < b.getDegree()) {
            [a, b] = [b, a];
        }

        let rLast = a;
        let r = b;
        let tLast = this.field.getZero();
        let t = this.field.getOne();

        while (2 * r.getDegree() >= R) {
            const rLastLast = rLast;
            const tLastLast = tLast;
            rLast = r;
            tLast = t;

            if (rLast.isZero()) {
                throw new Error('r_{i-1} was zero');
            }
            r = rLastLast;
            let q = this.field.getZero();
            const denominatorLeadingTerm = rLast.getCoefficient(rLast.getDegree());
            const dltInverse = this.field.inverse(denominatorLeadingTerm);
            while (r.getDegree() >= rLast.getDegree() && !r.isZero()) {
                const degreeDiff = r.getDegree() - rLast.getDegree();
                const scale = this.field.multiply(r.getCoefficient(r.getDegree()), dltInverse);
                q = q.addOrSubtract(this.field.buildMonomial(degreeDiff, scale));
                r = r.addOrSubtract(rLast.multiplyByMonomial(degreeDiff, scale));
            }

            t = q.multiply(tLast).addOrSubtract(tLastLast);

            if (r.getDegree() >= rLast.getDegree()) {
                throw new Error('Division algorithm failed to reduce polynomial');
            }
        }

        const sigmaTildeAtZero = t.getCoefficient(0);
        if (sigmaTildeAtZero === 0) {
            throw new Error('sigmaTilde(0) was zero');
        }

        const inverse = this.field.inverse(sigmaTildeAtZero);
        const sigma = t.multiplyScalar(inverse);
        const omega = r.multiplyScalar(inverse);
        return [sigma, omega];
    }

    findErrorLocations(errorLocator) {
        const numErrors = errorLocator.getDegree();
        if (numErrors === 1) {
            return [errorLocator.getCoefficient(1)];
        }
        const result = [];
        for (let i = 1; i < this.field.getSize() && result.length < numErrors; i++) {
            if (errorLocator.evaluateAt(i) === 0) {
                result.push(this.field.inverse(i));
            }
        }
        if (result.length !== numErrors) {
            throw new Error('Error locator degree does not match number of roots');
        }
        return result;
    }

    findErrorMagnitudes(errorEvaluator, errorLocations) {
        const s = errorLocations.length;
        const result = new Array(s).fill(0);
        for (let i = 0; i < s; i++) {
            const xiInverse = this.field.inverse(errorLocations[i]);
            let denominator = 1;
            for (let j = 0; j < s; j++) {
                if (i === j) continue;
                const term = this.field.multiply(errorLocations[j], xiInverse);
                const termPlus1 = (term & 0x1) === 0 ? term | 1 : term & ~1;
                denominator = this.field.multiply(denominator, termPlus1);
            }
            result[i] = this.field.multiply(
                errorEvaluator.evaluateAt(xiInverse),
                this.field.inverse(denominator)
            );
            if (this.field.getGeneratorBase() !== 0) {
                result[i] = this.field.multiply(result[i], xiInverse);
            }
        }
        return result;
    }
}
