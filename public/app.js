(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var BigInteger = require("../lib/BigInteger");
var Base58 = (function () {
    function Base58() {
    }
    Base58.encode = function (input) {
        var bi = BigInteger.fromByteArrayUnsigned(input);
        var chars = [];
        while (bi.compareTo(Base58.base) >= 0) {
            var mod = bi.mod(Base58.base);
            chars.unshift(Base58.alphabet[mod.intValue()]);
            bi = bi.subtract(mod).divide(Base58.base);
        }
        chars.unshift(Base58.alphabet[bi.intValue()]);
        // Convert leading zeros too.
        for (var i = 0; i < input.length; i++) {
            if (input[i] == 0x00) {
                chars.unshift(Base58.alphabet[0]);
            }
            else
                break;
        }
        return chars.join('');
    };
    /**
     * Convert a base58-encoded string to a byte array.
     *
     * Written by Mike Hearn for BitcoinJ.
     *   Copyright (c) 2011 Google Inc.
     *
     * Ported to JavaScript by Stefan Thomas.
     */
    Base58.decode = function (input) {
        var bi = BigInteger.valueOf(0);
        var leadingZerosNum = 0;
        for (var i = input.length - 1; i >= 0; i--) {
            var alphaIndex = Base58.alphabet.indexOf(input[i]);
            if (alphaIndex < 0) {
                throw "Invalid character";
            }
            bi = bi.add(BigInteger.valueOf(alphaIndex)
                .multiply(Base58.base.pow(input.length - 1 - i)));
            // This counts leading zero bytes
            if (input[i] == "1")
                leadingZerosNum++;
            else
                leadingZerosNum = 0;
        }
        var bytes = bi.toByteArrayUnsigned();
        // Add leading zeros
        while (leadingZerosNum-- > 0)
            bytes.unshift(0);
        return bytes;
    };
    Base58.alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    Base58.validRegex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    Base58.base = BigInteger.valueOf(58);
    return Base58;
})();
module.exports = Base58;

},{"../lib/BigInteger":2}],2:[function(require,module,exports){
var Classic = (function () {
    function Classic(m) {
        this.m = m;
    }
    Classic.prototype.convert = function (x) {
        if (x.s < 0 || x.compareTo(this.m) >= 0)
            return x.mod(this.m);
        else
            return x;
    };
    Classic.prototype.revert = function (x) {
        return x;
    };
    Classic.prototype.reduce = function (x) {
        x.divRemTo(this.m, null, x);
    };
    Classic.prototype.mulTo = function (x, y, r) {
        x.multiplyTo(y, r);
        this.reduce(r);
    };
    Classic.prototype.sqrTo = function (x, r) {
        x.squareTo(r);
        this.reduce(r);
    };
    return Classic;
})();
var Barrett = (function () {
    function Barrett(m) {
        // setup Barrett
        this.r2 = BigInteger.nbi();
        this.q3 = BigInteger.nbi();
        BigInteger.ONE.dlShiftTo(2 * m.t, this.r2);
        this.mu = this.r2.divide(m);
        this.m = m;
    }
    Barrett.prototype.convert = function (x) {
        if (x.s < 0 || x.t > 2 * this.m.t)
            return x.mod(this.m);
        else if (x.compareTo(this.m) < 0)
            return x;
        else {
            var r = BigInteger.nbi();
            x.copyTo(r);
            this.reduce(r);
            return r;
        }
    };
    Barrett.prototype.revert = function (x) {
        return x;
    };
    // x = x mod m (HAC 14.42)
    Barrett.prototype.reduce = function (x) {
        x.drShiftTo(this.m.t - 1, this.r2);
        if (x.t > this.m.t + 1) {
            x.t = this.m.t + 1;
            x.clamp();
        }
        this.mu.multiplyUpperTo(this.r2, this.m.t + 1, this.q3);
        this.m.multiplyLowerTo(this.q3, this.m.t + 1, this.r2);
        while (x.compareTo(this.r2) < 0)
            x.dAddOffset(1, this.m.t + 1);
        x.subTo(this.r2, x);
        while (x.compareTo(this.m) >= 0)
            x.subTo(this.m, x);
    };
    // r = x*y mod m; x,y != r
    Barrett.prototype.mulTo = function (x, y, r) {
        x.multiplyTo(y, r);
        this.reduce(r);
    };
    // r = x^2 mod m; x != r
    Barrett.prototype.sqrTo = function (x, r) {
        x.squareTo(r);
        this.reduce(r);
    };
    return Barrett;
})();
var Montgomery = (function () {
    function Montgomery(m) {
        this.m = m;
        this.mp = m.invDigit();
        this.mpl = this.mp & 0x7fff;
        this.mph = this.mp >> 15;
        this.um = (1 << (BigInteger.DB - 15)) - 1;
        this.mt2 = 2 * m.t;
    }
    // xR mod m
    Montgomery.prototype.convert = function (x) {
        var r = BigInteger.nbi();
        x.abs().dlShiftTo(this.m.t, r);
        r.divRemTo(this.m, null, r);
        if (x.s < 0 && r.compareTo(BigInteger.ZERO) > 0)
            this.m.subTo(r, r);
        return r;
    };
    // x/R mod m
    Montgomery.prototype.revert = function (x) {
        var r = BigInteger.nbi();
        x.copyTo(r);
        this.reduce(r);
        return r;
    };
    // x = x/R mod m (HAC 14.32)
    Montgomery.prototype.reduce = function (x) {
        while (x.t <= this.mt2)
            x[x.t++] = 0;
        for (var i = 0; i < this.m.t; ++i) {
            // faster way of calculating u0 = x[i]*mp mod DV
            var j = x[i] & 0x7fff;
            var u0 = (j * this.mpl + (((j * this.mph + (x[i] >> 15) * this.mpl) & this.um) << 15)) & BigInteger.DM;
            // use am to combine the multiply-shift-add into one call
            j = i + this.m.t;
            x[j] += this.m.am(0, u0, x, i, 0, this.m.t);
            // propagate carry
            while (x[j] >= BigInteger.DV) {
                x[j] -= BigInteger.DV;
                x[++j]++;
            }
        }
        x.clamp();
        x.drShiftTo(this.m.t, x);
        if (x.compareTo(this.m) >= 0)
            x.subTo(this.m, x);
    };
    // r = "xy/R mod m"; x,y != r
    Montgomery.prototype.mulTo = function (x, y, r) {
        x.multiplyTo(y, r);
        this.reduce(r);
    };
    // r = "x^2/R mod m"; x != r
    Montgomery.prototype.sqrTo = function (x, r) {
        x.squareTo(r);
        this.reduce(r);
    };
    return Montgomery;
})();
var NullExp = (function () {
    function NullExp() {
    }
    NullExp.prototype.convert = function (x) {
        return x;
    };
    NullExp.prototype.revert = function (x) {
        return x;
    };
    NullExp.prototype.mulTo = function (x, y, r) {
        x.multiplyTo(y, r);
    };
    NullExp.prototype.sqrTo = function (x, r) {
        x.squareTo(r);
    };
    return NullExp;
})();
/*!
 * Refactored to TypeScript
 * Basic JavaScript BN library - subset useful for RSA encryption. v1.3
 *
 * Copyright (c) 2005  Tom Wu
 * All Rights Reserved.
 * BSD License
 * http://www-cs-students.stanford.edu/~tjw/jsbn/LICENSE
 *
 * Copyright Stephan Thomas
 * Copyright bitaddress.org
 */
/////////////////////////////////////////////////////////////////
var BigInteger = (function () {
    function BigInteger(a, b, c) {
        if (!BigInteger._isinitialised)
            BigInteger.initVars();
        if (a != null)
            if ("number" == typeof a)
                this.fromNumber(a, b, c);
            else if (b == null && "string" != typeof a)
                this.fromString(a, 256);
            else
                this.fromString(a, b);
    }
    BigInteger.nbv = function (i) {
        var r = new BigInteger(null, null, null);
        r.fromInt(i);
        return r;
    };
    BigInteger.nbi = function () {
        return new BigInteger(null, null, null);
    };
    BigInteger.initVars = function () {
        BigInteger._isinitialised = true;
        if (BigInteger.j_lm && (navigator.appName == "Microsoft Internet Explorer")) {
            BigInteger.prototype.am = BigInteger.prototype.am2;
            BigInteger.dbits = 30;
        }
        else if (BigInteger.j_lm && (navigator.appName != "Netscape")) {
            BigInteger.prototype.am = BigInteger.prototype.am1;
            BigInteger.dbits = 26;
        }
        else {
            BigInteger.prototype.am = BigInteger.prototype.am3;
            BigInteger.dbits = 28;
        }
        BigInteger.DB = BigInteger.dbits;
        BigInteger.DM = ((1 << BigInteger.dbits) - 1);
        BigInteger.DV = (1 << BigInteger.dbits);
        BigInteger.BI_FP = 52;
        BigInteger.FV = Math.pow(2, BigInteger.BI_FP);
        BigInteger.F1 = BigInteger.BI_FP - BigInteger.dbits;
        BigInteger.F2 = 2 * BigInteger.dbits - BigInteger.BI_FP;
        var rr = "0".charCodeAt(0);
        for (var vv = 0; vv <= 9; ++vv)
            BigInteger.BI_RC[rr++] = vv;
        rr = "a".charCodeAt(0);
        for (var vv = 10; vv < 36; ++vv)
            BigInteger.BI_RC[rr++] = vv;
        rr = "A".charCodeAt(0);
        for (var vv = 10; vv < 36; ++vv)
            BigInteger.BI_RC[rr++] = vv;
    };
    // am: Compute w_j += (x*this_i), propagate carries,
    // c is initial carry, returns final carry.
    // c < 3*dvalue, x < 2*dvalue, this_i < dvalue
    // We need to select the fastest one that works in this environment.
    // am1: use a single mult and divide to get the high bits,
    // max digit bits should be 26 because
    // max internal value = 2*dvalue^2-2*dvalue (< 2^53)
    BigInteger.prototype.am1 = function (i, x, w, j, c, n) {
        while (--n >= 0) {
            var v = x * this[i++] + w[j] + c;
            c = Math.floor(v / 0x4000000);
            w[j++] = v & 0x3ffffff;
        }
        return c;
    };
    // am2 avoids a big mult-and-extract completely.
    // Max digit bits should be <= 30 because we do bitwise ops
    // on values up to 2*hdvalue^2-hdvalue-1 (< 2^31)
    BigInteger.prototype.am2 = function (i, x, w, j, c, n) {
        var xl = x & 0x7fff, xh = x >> 15;
        while (--n >= 0) {
            var l = this[i] & 0x7fff;
            var h = this[i++] >> 15;
            var m = xh * l + h * xl;
            l = xl * l + ((m & 0x7fff) << 15) + w[j] + (c & 0x3fffffff);
            c = (l >>> 30) + (m >>> 15) + xh * h + (c >>> 30);
            w[j++] = l & 0x3fffffff;
        }
        return c;
    };
    // Alternately, set max digit bits to 28 since some
    // browsers slow down when dealing with 32-bit numbers.
    BigInteger.prototype.am3 = function (i, x, w, j, c, n) {
        var xl = x & 0x3fff, xh = x >> 14;
        while (--n >= 0) {
            var l = this[i] & 0x3fff;
            var h = this[i++] >> 14;
            var m = xh * l + h * xl;
            l = xl * l + ((m & 0x3fff) << 14) + w[j] + c;
            c = (l >> 28) + (m >> 14) + xh * h;
            w[j++] = l & 0xfffffff;
        }
        return c;
    };
    BigInteger.prototype.am = function (i, x, w, j, c, n) {
        throw ("class not initialised");
        return c;
    };
    BigInteger.prototype.fromInt = function (x) {
        this.t = 1;
        this.s = (x < 0) ? -1 : 0;
        if (x > 0)
            this[0] = x;
        else if (x < -1)
            this[0] = x + BigInteger.DV;
        else
            this.t = 0;
    };
    /**
     * Turns a byte array into a big integer.
     *
     * This function will interpret a byte array as a big integer in big
     * endian notation and ignore leading zeros.
     */
    BigInteger.fromByteArrayUnsigned = function (ba) {
        if (!ba.length) {
            return BigInteger.nbv(0);
        }
        else if (ba[0] & 0x80) {
            // Prepend a zero so the BigInteger class doesn't mistake this
            // for a negative integer.
            return new BigInteger([0].concat(ba), null, null);
        }
        else {
            return new BigInteger(ba, null, null);
        }
    };
    BigInteger.prototype.toByteArrayUnsigned = function () {
        var ba = this.abs().toByteArray();
        if (ba.length) {
            if (ba[0] == 0) {
                ba = ba.slice(1);
            }
            return ba.map(function (v) {
                return (v < 0) ? v + 256 : v;
            });
        }
        else {
            // Empty array, nothing to do
            return ba;
        }
    };
    BigInteger.prototype.fromString = function (s, b) {
        var k;
        if (b == 16)
            k = 4;
        else if (b == 8)
            k = 3;
        else if (b == 256)
            k = 8; // byte array
        else if (b == 2)
            k = 1;
        else if (b == 32)
            k = 5;
        else if (b == 4)
            k = 2;
        else {
            this.fromRadix(s, b);
            return;
        }
        this.t = 0;
        this.s = 0;
        var i = s.length, mi = false, sh = 0;
        while (--i >= 0) {
            var x = (k == 8) ? s[i] & 0xff : this.intAt(s, i);
            if (x < 0) {
                if (s.charAt(i) == "-")
                    mi = true;
                continue;
            }
            mi = false;
            if (sh == 0)
                this[this.t++] = x;
            else if (sh + k > BigInteger.DB) {
                this[this.t - 1] |= (x & ((1 << (BigInteger.DB - sh)) - 1)) << sh;
                this[this.t++] = (x >> (BigInteger.DB - sh));
            }
            else
                this[this.t - 1] |= x << sh;
            sh += k;
            if (sh >= BigInteger.DB)
                sh -= BigInteger.DB;
        }
        if (k == 8 && (s[0] & 0x80) != 0) {
            this.s = -1;
            if (sh > 0)
                this[this.t - 1] |= ((1 << (BigInteger.DB - sh)) - 1) << sh;
        }
        this.clamp();
        if (mi)
            BigInteger.ZERO.subTo(this, this);
    };
    BigInteger.prototype.fromRadix = function (s, b) {
        this.fromInt(0);
        if (b == null)
            b = 10;
        var cs = this.chunkSize(b);
        var d = Math.pow(b, cs), mi = false, j = 0, w = 0;
        for (var i = 0; i < s.length; ++i) {
            var x = this.intAt(s, i);
            if (x < 0) {
                if (s.charAt(i) == "-" && this.signum() == 0)
                    mi = true;
                continue;
            }
            w = b * w + x;
            if (++j >= cs) {
                this.dMultiply(d);
                this.dAddOffset(w, 0);
                j = 0;
                w = 0;
            }
        }
        if (j > 0) {
            this.dMultiply(Math.pow(b, j));
            this.dAddOffset(w, 0);
        }
        if (mi)
            BigInteger.ZERO.subTo(this, this);
    };
    // (protected) alternate constructor
    BigInteger.prototype.fromNumber = function (a, b, c) {
        if ("number" == typeof b) {
            // new BigInteger(int,int,RNG)
            if (a < 2)
                this.fromInt(1);
            else {
                this.fromNumber(a, c, null);
                if (!this.testBit(a - 1))
                    this.bitwiseTo(BigInteger.ONE.shiftLeft(a - 1), this.op_or, this);
                if (this.isEven())
                    this.dAddOffset(1, 0); // force odd
                while (!this.isProbablePrime(b)) {
                    this.dAddOffset(2, 0);
                    if (this.bitLength() > a)
                        this.subTo(BigInteger.ONE.shiftLeft(a - 1), this);
                }
            }
        }
        else {
            // new BigInteger(int,RNG)
            var x = new Array(), t = a & 7;
            x.length = (a >> 3) + 1;
            b.nextBytes(x);
            if (t > 0)
                x[0] &= ((1 << t) - 1);
            else
                x[0] = 0;
            this.fromString(x, 256);
        }
    };
    BigInteger.prototype.toRadix = function (b) {
        if (b == null)
            b = 10;
        if (this.signum() == 0 || b < 2 || b > 36)
            return "0";
        var cs = this.chunkSize(b);
        var a = Math.pow(b, cs);
        var d = BigInteger.nbv(a), y = BigInteger.nbi(), z = BigInteger.nbi(), r = "";
        this.divRemTo(d, y, z);
        while (y.signum() > 0) {
            r = (a + z.intValue()).toString(b).substr(1) + r;
            y.divRemTo(d, y, z);
        }
        return z.intValue().toString(b) + r;
    };
    BigInteger.prototype.compareTo = function (a) {
        var r = this.s - a.s;
        if (r != 0)
            return r;
        var i = this.t;
        r = i - a.t;
        if (r != 0)
            return (this.s < 0) ? -r : r;
        while (--i >= 0)
            if ((r = this[i] - a[i]) != 0)
                return r;
        return 0;
    };
    BigInteger.prototype.op_xor = function (x, y) {
        return x ^ y;
    };
    BigInteger.prototype.op_andnot = function (x, y) {
        return x & ~y;
    };
    BigInteger.prototype.andNot = function (a) {
        var r = BigInteger.nbi();
        this.bitwiseTo(a, this.op_andnot, r);
        return r;
    };
    BigInteger.prototype.op_and = function (x, y) {
        return x & y;
    };
    BigInteger.prototype.and = function (a) {
        var r = BigInteger.nbi();
        this.bitwiseTo(a, this.op_and, r);
        return r;
    };
    // (public) ~this
    BigInteger.prototype.not = function () {
        var r = BigInteger.nbi();
        for (var i = 0; i < this.t; ++i)
            r[i] = BigInteger.DM & ~this[i];
        r.t = this.t;
        r.s = ~this.s;
        return r;
    };
    BigInteger.prototype.bitLength = function () {
        if (this.t <= 0)
            return 0;
        return BigInteger.DB * (this.t - 1) + this.nbits(this[this.t - 1] ^ (this.s & BigInteger.DM));
    };
    BigInteger.prototype.signum = function () {
        if (this.s < 0)
            return -1;
        else if (this.t <= 0 || (this.t == 1 && this[0] <= 0))
            return 0;
        else
            return 1;
    };
    // (protected) return "-1/this % 2^DB"; useful for Mont. reduction
    // justification:
    //         xy == 1 (mod m)
    //         xy =  1+km
    //   xy(2-xy) = (1+km)(1-km)
    // x[y(2-xy)] = 1-k^2m^2
    // x[y(2-xy)] == 1 (mod m^2)
    // if y is 1/x mod m, then y(2-xy) is 1/x mod m^2
    // should reduce x and y(2-xy) by m^2 at each step to keep size bounded.
    // JS multiply "overflows" differently from C/C++, so care is needed here.
    BigInteger.prototype.invDigit = function () {
        if (this.t < 1)
            return 0;
        var x = this[0];
        if ((x & 1) == 0)
            return 0;
        var y = x & 3; // y == 1/x mod 2^2
        y = (y * (2 - (x & 0xf) * y)) & 0xf; // y == 1/x mod 2^4
        y = (y * (2 - (x & 0xff) * y)) & 0xff; // y == 1/x mod 2^8
        y = (y * (2 - (((x & 0xffff) * y) & 0xffff))) & 0xffff; // y == 1/x mod 2^16
        // last step - calculate inverse mod DV directly;
        // assumes 16 < DB <= 32 and assumes ability to handle 48-bit ints
        y = (y * (2 - x * y % BigInteger.DV)) % BigInteger.DV; // y == 1/x mod 2^dbits
        // we really want the negative inverse, and -DV < y < DV
        return (y > 0) ? BigInteger.DV - y : -y;
    };
    // return index of lowest 1-bit in x, x < 2^31
    BigInteger.prototype.lbit = function (x) {
        if (x == 0)
            return -1;
        var r = 0;
        if ((x & 0xffff) == 0) {
            x >>= 16;
            r += 16;
        }
        if ((x & 0xff) == 0) {
            x >>= 8;
            r += 8;
        }
        if ((x & 0xf) == 0) {
            x >>= 4;
            r += 4;
        }
        if ((x & 3) == 0) {
            x >>= 2;
            r += 2;
        }
        if ((x & 1) == 0)
            ++r;
        return r;
    };
    // return number of 1 bits in x
    BigInteger.prototype.cbit = function (x) {
        var r = 0;
        while (x != 0) {
            x &= x - 1;
            ++r;
        }
        return r;
    };
    // (public) returns index of lowest 1-bit (or -1 if none)
    BigInteger.prototype.getLowestSetBit = function () {
        for (var i = 0; i < this.t; ++i)
            if (this[i] != 0)
                return i * BigInteger.DB + this.lbit(this[i]);
        if (this.s < 0)
            return this.t * BigInteger.DB;
        return -1;
    };
    // (public) return number of set bits
    BigInteger.prototype.bitCount = function () {
        var r = 0, x = this.s & BigInteger.DM;
        for (var i = 0; i < this.t; ++i)
            r += this.cbit(this[i] ^ x);
        return r;
    };
    // (public) true iff nth bit is set
    BigInteger.prototype.testBit = function (n) {
        var j = Math.floor(n / BigInteger.DB);
        if (j >= this.t)
            return (this.s != 0);
        return ((this[j] & (1 << (n % BigInteger.DB))) != 0);
    };
    BigInteger.prototype.setBit = function (n) {
        return this.changeBit(n, this.op_or);
    };
    BigInteger.prototype.clearBit = function (n) {
        return this.changeBit(n, this.op_andnot);
    };
    BigInteger.prototype.flipBit = function (n) {
        return this.changeBit(n, this.op_xor);
    };
    // (public) this + a
    BigInteger.prototype.add = function (a) {
        var r = BigInteger.nbi();
        this.addTo(a, r);
        return r;
    };
    BigInteger.prototype.subtract = function (a) {
        var r = BigInteger.nbi();
        this.subTo(a, r);
        return r;
    };
    BigInteger.prototype.multiply = function (a) {
        var r = BigInteger.nbi();
        this.multiplyTo(a, r);
        return r;
    };
    // (public) this / a
    BigInteger.prototype.divide = function (a) {
        var r = BigInteger.nbi();
        this.divRemTo(a, r, null);
        return r;
    };
    // (public) this % a
    BigInteger.prototype.remainder = function (a) {
        var r = BigInteger.nbi();
        this.divRemTo(a, null, r);
        return r;
    };
    // (public) [this/a,this%a]
    BigInteger.prototype.divideAndRemainder = function (a) {
        var q = BigInteger.nbi(), r = BigInteger.nbi();
        this.divRemTo(a, q, r);
        return new Array(q, r);
    };
    BigInteger.prototype.negate = function () {
        var r = BigInteger.nbi();
        BigInteger.ZERO.subTo(this, r);
        return r;
    };
    BigInteger.prototype.mod = function (a) {
        var r = BigInteger.nbi();
        this.abs().divRemTo(a, null, r);
        if (this.s < 0 && r.compareTo(BigInteger.ZERO) > 0)
            a.subTo(r, r);
        return r;
    };
    BigInteger.prototype.squareTo = function (r) {
        var x = this.abs();
        var i = r.t = 2 * x.t;
        while (--i >= 0)
            r[i] = 0;
        for (i = 0; i < x.t - 1; ++i) {
            var c = x.am(i, x[i], r, 2 * i, 0, 1);
            if ((r[i + x.t] += x.am(i + 1, 2 * x[i], r, 2 * i + 1, c, x.t - i - 1)) >= BigInteger.DV) {
                r[i + x.t] -= BigInteger.DV;
                r[i + x.t + 1] = 1;
            }
        }
        if (r.t > 0)
            r[r.t - 1] += x.am(i, x[i], r, 2 * i, 0, 1);
        r.s = 0;
        r.clamp();
    };
    BigInteger.prototype.op_or = function (x, y) {
        return x | y;
    };
    BigInteger.prototype.shiftLeft = function (n) {
        var r = BigInteger.nbi();
        if (n < 0)
            this.rShiftTo(-n, r);
        else
            this.lShiftTo(n, r);
        return r;
    };
    BigInteger.prototype.abs = function () {
        return (this.s < 0) ? this.negate() : this;
    };
    BigInteger.prototype.isProbablePrime = function (t) {
        var lplen = BigInteger.lowprimes.length;
        var i, x = this.abs();
        if (x.t == 1 && x[0] <= BigInteger.lowprimes[lplen - 1]) {
            for (i = 0; i < lplen; ++i)
                if (x[0] == BigInteger.lowprimes[i])
                    return true;
            return false;
        }
        if (x.isEven())
            return false;
        i = 1;
        while (i < lplen) {
            var m = BigInteger.lowprimes[i], j = i + 1;
            while (j < lplen && m < BigInteger.lplim)
                m *= BigInteger.lowprimes[j++];
            m = x.modInt(m);
            while (i < j)
                if (m % BigInteger.lowprimes[i++] == 0)
                    return false;
        }
        return x.millerRabin(t);
    };
    // (public)
    BigInteger.prototype.clone = function () {
        var r = BigInteger.nbi();
        this.copyTo(r);
        return r;
    };
    // (public) return value as integer
    BigInteger.prototype.intValue = function () {
        if (this.s < 0) {
            if (this.t == 1)
                return this[0] - BigInteger.DV;
            else if (this.t == 0)
                return -1;
        }
        else if (this.t == 1)
            return this[0];
        else if (this.t == 0)
            return 0;
        // assumes 16 < DB < 32
        return ((this[1] & ((1 << (32 - BigInteger.DB)) - 1)) << BigInteger.DB) | this[0];
    };
    // (public) return value as byte
    BigInteger.prototype.byteValue = function () {
        return (this.t == 0) ? this.s : (this[0] << 24) >> 24;
    };
    // (public) return value as short (assumes DB>=16)
    BigInteger.prototype.shortValue = function () {
        return (this.t == 0) ? this.s : (this[0] << 16) >> 16;
    };
    // (public) convert to bigendian byte array
    BigInteger.prototype.toByteArray = function () {
        var i = this.t, r = new Array();
        r[0] = this.s;
        var p = BigInteger.DB - (i * BigInteger.DB) % 8, d, k = 0;
        if (i-- > 0) {
            if (p < BigInteger.DB && (d = this[i] >> p) != (this.s & BigInteger.DM) >> p)
                r[k++] = d | (this.s << (BigInteger.DB - p));
            while (i >= 0) {
                if (p < 8) {
                    d = (this[i] & ((1 << p) - 1)) << (8 - p);
                    d |= this[--i] >> (p += BigInteger.DB - 8);
                }
                else {
                    d = (this[i] >> (p -= 8)) & 0xff;
                    if (p <= 0) {
                        p += BigInteger.DB;
                        --i;
                    }
                }
                if ((d & 0x80) != 0)
                    d |= -256;
                if (k == 0 && (this.s & 0x80) != (d & 0x80))
                    ++k;
                if (k > 0 || d != this.s)
                    r[k++] = d;
            }
        }
        return r;
    };
    BigInteger.prototype.equals = function (a) {
        return (this.compareTo(a) == 0);
    };
    BigInteger.prototype.min = function (a) {
        return (this.compareTo(a) < 0) ? this : a;
    };
    BigInteger.prototype.max = function (a) {
        return (this.compareTo(a) > 0) ? this : a;
    };
    BigInteger.prototype.lShiftTo = function (n, r) {
        var bs = n % BigInteger.DB;
        var cbs = BigInteger.DB - bs;
        var bm = (1 << cbs) - 1;
        var ds = Math.floor(n / BigInteger.DB), c = (this.s << bs) & BigInteger.DM, i;
        for (i = this.t - 1; i >= 0; --i) {
            r[i + ds + 1] = (this[i] >> cbs) | c;
            c = (this[i] & bm) << bs;
        }
        for (i = ds - 1; i >= 0; --i)
            r[i] = 0;
        r[ds] = c;
        r.t = this.t + ds + 1;
        r.s = this.s;
        r.clamp();
    };
    BigInteger.prototype.rShiftTo = function (n, r) {
        r.s = this.s;
        var ds = Math.floor(n / BigInteger.DB);
        if (ds >= this.t) {
            r.t = 0;
            return;
        }
        var bs = n % BigInteger.DB;
        var cbs = BigInteger.DB - bs;
        var bm = (1 << bs) - 1;
        r[0] = this[ds] >> bs;
        for (var i = ds + 1; i < this.t; ++i) {
            r[i - ds - 1] |= (this[i] & bm) << cbs;
            r[i - ds] = this[i] >> bs;
        }
        if (bs > 0)
            r[this.t - ds - 1] |= (this.s & bm) << cbs;
        r.t = this.t - ds;
        r.clamp();
    };
    BigInteger.prototype.clamp = function () {
        var c = this.s & BigInteger.DM;
        while (this.t > 0 && this[this.t - 1] == c)
            --this.t;
    };
    BigInteger.prototype.nbits = function (x) {
        var r = 1, t;
        if ((t = x >>> 16) != 0) {
            x = t;
            r += 16;
        }
        if ((t = x >> 8) != 0) {
            x = t;
            r += 8;
        }
        if ((t = x >> 4) != 0) {
            x = t;
            r += 4;
        }
        if ((t = x >> 2) != 0) {
            x = t;
            r += 2;
        }
        if ((t = x >> 1) != 0) {
            x = t;
            r += 1;
        }
        return r;
    };
    BigInteger.prototype.shiftRight = function (n) {
        var r = BigInteger.nbi();
        if (n < 0)
            this.lShiftTo(-n, r);
        else
            this.rShiftTo(n, r);
        return r;
    };
    // (public) 1/this % m (HAC 14.61)
    BigInteger.prototype.modInverse = function (m) {
        var ac = m.isEven();
        if ((this.isEven() && ac) || m.signum() == 0)
            return BigInteger.ZERO;
        var u = m.clone(), v = this.clone();
        var a = BigInteger.nbv(1), b = BigInteger.nbv(0), c = BigInteger.nbv(0), d = BigInteger.nbv(1);
        while (u.signum() != 0) {
            while (u.isEven()) {
                u.rShiftTo(1, u);
                if (ac) {
                    if (!a.isEven() || !b.isEven()) {
                        a.addTo(this, a);
                        b.subTo(m, b);
                    }
                    a.rShiftTo(1, a);
                }
                else if (!b.isEven())
                    b.subTo(m, b);
                b.rShiftTo(1, b);
            }
            while (v.isEven()) {
                v.rShiftTo(1, v);
                if (ac) {
                    if (!c.isEven() || !d.isEven()) {
                        c.addTo(this, c);
                        d.subTo(m, d);
                    }
                    c.rShiftTo(1, c);
                }
                else if (!d.isEven())
                    d.subTo(m, d);
                d.rShiftTo(1, d);
            }
            if (u.compareTo(v) >= 0) {
                u.subTo(v, u);
                if (ac)
                    a.subTo(c, a);
                b.subTo(d, b);
            }
            else {
                v.subTo(u, v);
                if (ac)
                    c.subTo(a, c);
                d.subTo(b, d);
            }
        }
        if (v.compareTo(BigInteger.ONE) != 0)
            return BigInteger.ZERO;
        if (d.compareTo(m) >= 0)
            return d.subtract(m);
        if (d.signum() < 0)
            d.addTo(m, d);
        else
            return d;
        if (d.signum() < 0)
            return d.add(m);
        else
            return d;
    };
    // (public) return string representation in given radix
    BigInteger.prototype.toString = function (b) {
        if (this.s < 0)
            return "-" + this.negate().toString(b);
        var k;
        if (b == 16)
            k = 4;
        else if (b == 8)
            k = 3;
        else if (b == 2)
            k = 1;
        else if (b == 32)
            k = 5;
        else if (b == 4)
            k = 2;
        else
            return this.toRadix(b);
        var km = (1 << k) - 1, d, m = false, r = "", i = this.t;
        var p = BigInteger.DB - (i * BigInteger.DB) % k;
        if (i-- > 0) {
            if (p < BigInteger.DB && (d = this[i] >> p) > 0) {
                m = true;
                r = this.int2char(d);
            }
            while (i >= 0) {
                if (p < k) {
                    d = (this[i] & ((1 << p) - 1)) << (k - p);
                    d |= this[--i] >> (p += BigInteger.DB - k);
                }
                else {
                    d = (this[i] >> (p -= k)) & km;
                    if (p <= 0) {
                        p += BigInteger.DB;
                        --i;
                    }
                }
                if (d > 0)
                    m = true;
                if (m)
                    r += this.int2char(d);
            }
        }
        return m ? r : "0";
    };
    // (public) gcd(this,a) (HAC 14.54)
    BigInteger.prototype.gcd = function (a) {
        var x = (this.s < 0) ? this.negate() : this.clone();
        var y = (a.s < 0) ? a.negate() : a.clone();
        if (x.compareTo(y) < 0) {
            var t = x;
            x = y;
            y = t;
        }
        var i = x.getLowestSetBit(), g = y.getLowestSetBit();
        if (g < 0)
            return x;
        if (i < g)
            g = i;
        if (g > 0) {
            x.rShiftTo(g, x);
            y.rShiftTo(g, y);
        }
        while (x.signum() > 0) {
            if ((i = x.getLowestSetBit()) > 0)
                x.rShiftTo(i, x);
            if ((i = y.getLowestSetBit()) > 0)
                y.rShiftTo(i, y);
            if (x.compareTo(y) >= 0) {
                x.subTo(y, x);
                x.rShiftTo(1, x);
            }
            else {
                y.subTo(x, y);
                y.rShiftTo(1, y);
            }
        }
        if (g > 0)
            y.lShiftTo(g, y);
        return y;
    };
    BigInteger.prototype.drShiftTo = function (n, r) {
        for (var i = n; i < this.t; ++i)
            r[i - n] = this[i];
        r.t = Math.max(this.t - n, 0);
        r.s = this.s;
    };
    BigInteger.prototype.multiplyLowerTo = function (a, n, r) {
        var i = Math.min(this.t + a.t, n);
        r.s = 0; // assumes a,this >= 0
        r.t = i;
        while (i > 0)
            r[--i] = 0;
        var j;
        for (j = r.t - this.t; i < j; ++i)
            r[i + this.t] = this.am(0, a[i], r, i, 0, this.t);
        for (j = Math.min(a.t, n); i < j; ++i)
            this.am(0, a[i], r, i, 0, n - i);
        r.clamp();
    };
    BigInteger.prototype.multiplyUpperTo = function (a, n, r) {
        --n;
        var i = r.t = this.t + a.t - n;
        r.s = 0; // assumes a,this >= 0
        while (--i >= 0)
            r[i] = 0;
        for (i = Math.max(n - this.t, 0); i < a.t; ++i)
            r[this.t + i - n] = this.am(n - i, a[i], r, 0, 0, this.t + i - n);
        r.clamp();
        r.drShiftTo(1, r);
    };
    BigInteger.prototype.dlShiftTo = function (n, r) {
        var i;
        for (i = this.t - 1; i >= 0; --i)
            r[i + n] = this[i];
        for (i = n - 1; i >= 0; --i)
            r[i] = 0;
        r.t = this.t + n;
        r.s = this.s;
    };
    BigInteger.prototype.copyTo = function (r) {
        for (var i = this.t - 1; i >= 0; --i)
            r[i] = this[i];
        r.t = this.t;
        r.s = this.s;
    };
    BigInteger.prototype.bitwiseTo = function (a, op, r) {
        var i, f, m = Math.min(a.t, this.t);
        for (i = 0; i < m; ++i)
            r[i] = op(this[i], a[i]);
        if (a.t < this.t) {
            f = a.s & BigInteger.DM;
            for (i = m; i < this.t; ++i)
                r[i] = op(this[i], f);
            r.t = this.t;
        }
        else {
            f = this.s & BigInteger.DM;
            for (i = m; i < a.t; ++i)
                r[i] = op(f, a[i]);
            r.t = a.t;
        }
        r.s = op(this.s, a.s);
        r.clamp();
    };
    BigInteger.prototype.isEven = function () {
        return ((this.t > 0) ? (this[0] & 1) : this.s) == 0;
    };
    BigInteger.prototype.dAddOffset = function (n, w) {
        if (n == 0)
            return;
        while (this.t <= w)
            this[this.t++] = 0;
        this[w] += n;
        while (this[w] >= BigInteger.DV) {
            this[w] -= BigInteger.DV;
            if (++w >= this.t)
                this[this.t++] = 0;
            ++this[w];
        }
    };
    BigInteger.prototype.modInt = function (n) {
        if (n <= 0)
            return 0;
        var d = BigInteger.DV % n, r = (this.s < 0) ? n - 1 : 0;
        if (this.t > 0)
            if (d == 0)
                r = this[0] % n;
            else
                for (var i = this.t - 1; i >= 0; --i)
                    r = (d * r + this[i]) % n;
        return r;
    };
    // (protected) true if probably prime (HAC 4.24, Miller-Rabin)
    BigInteger.prototype.millerRabin = function (t) {
        var n1 = this.subtract(BigInteger.ONE);
        var k = n1.getLowestSetBit();
        if (k <= 0)
            return false;
        var r = n1.shiftRight(k);
        t = (t + 1) >> 1;
        if (t > BigInteger.lowprimes.length)
            t = BigInteger.lowprimes.length;
        var a = BigInteger.nbi();
        for (var i = 0; i < t; ++i) {
            //Pick bases at random, instead of starting at 2
            a.fromInt(BigInteger.lowprimes[Math.floor(Math.random() * BigInteger.lowprimes.length)]);
            var y = a.modPow(r, this);
            if (y.compareTo(BigInteger.ONE) != 0 && y.compareTo(n1) != 0) {
                var j = 1;
                while (j++ < k && y.compareTo(n1) != 0) {
                    y = y.modPowInt(2, this);
                    if (y.compareTo(BigInteger.ONE) == 0)
                        return false;
                }
                if (y.compareTo(n1) != 0)
                    return false;
            }
        }
        return true;
    };
    BigInteger.prototype.subTo = function (a, r) {
        var i = 0, c = 0, m = Math.min(a.t, this.t);
        while (i < m) {
            c += this[i] - a[i];
            r[i++] = c & BigInteger.DM;
            c >>= BigInteger.DB;
        }
        if (a.t < this.t) {
            c -= a.s;
            while (i < this.t) {
                c += this[i];
                r[i++] = c & BigInteger.DM;
                c >>= BigInteger.DB;
            }
            c += this.s;
        }
        else {
            c += this.s;
            while (i < a.t) {
                c -= a[i];
                r[i++] = c & BigInteger.DM;
                c >>= BigInteger.DB;
            }
            c -= a.s;
        }
        r.s = (c < 0) ? -1 : 0;
        if (c < -1)
            r[i++] = BigInteger.DV + c;
        else if (c > 0)
            r[i++] = c;
        r.t = i;
        r.clamp();
    };
    BigInteger.prototype.multiplyTo = function (a, r) {
        var x = this.abs(), y = a.abs();
        var i = x.t;
        r.t = i + y.t;
        while (--i >= 0)
            r[i] = 0;
        for (i = 0; i < y.t; ++i)
            r[i + x.t] = x.am(0, y[i], r, i, 0, x.t);
        r.s = 0;
        r.clamp();
        if (this.s != a.s)
            BigInteger.ZERO.subTo(r, r);
    };
    BigInteger.prototype.changeBit = function (n, op) {
        var r = BigInteger.ONE.shiftLeft(n);
        this.bitwiseTo(r, op, r);
        return r;
    };
    BigInteger.prototype.addTo = function (a, r) {
        var i = 0, c = 0, m = Math.min(a.t, this.t);
        while (i < m) {
            c += this[i] + a[i];
            r[i++] = c & BigInteger.DM;
            c >>= BigInteger.DB;
        }
        if (a.t < this.t) {
            c += a.s;
            while (i < this.t) {
                c += this[i];
                r[i++] = c & BigInteger.DM;
                c >>= BigInteger.DB;
            }
            c += this.s;
        }
        else {
            c += this.s;
            while (i < a.t) {
                c += a[i];
                r[i++] = c & BigInteger.DM;
                c >>= BigInteger.DB;
            }
            c += a.s;
        }
        r.s = (c < 0) ? -1 : 0;
        if (c > 0)
            r[i++] = c;
        else if (c < -1)
            r[i++] = BigInteger.DV + c;
        r.t = i;
        r.clamp();
    };
    BigInteger.prototype.divRemTo = function (m, q, r) {
        var pm = m.abs();
        if (pm.t <= 0)
            return;
        var pt = this.abs();
        if (pt.t < pm.t) {
            if (q != null)
                q.fromInt(0);
            if (r != null)
                this.copyTo(r);
            return;
        }
        if (r == null)
            r = BigInteger.nbi();
        var y = BigInteger.nbi(), ts = this.s, ms = m.s;
        var nsh = BigInteger.DB - this.nbits(pm[pm.t - 1]); // normalize modulus
        if (nsh > 0) {
            pm.lShiftTo(nsh, y);
            pt.lShiftTo(nsh, r);
        }
        else {
            pm.copyTo(y);
            pt.copyTo(r);
        }
        var ys = y.t;
        var y0 = y[ys - 1];
        if (y0 == 0)
            return;
        var yt = y0 * (1 << BigInteger.F1) + ((ys > 1) ? y[ys - 2] >> BigInteger.F2 : 0);
        var d1 = BigInteger.FV / yt, d2 = (1 << BigInteger.F1) / yt, e = 1 << BigInteger.F2;
        var i = r.t, j = i - ys, t = (q == null) ? BigInteger.nbi() : q;
        y.dlShiftTo(j, t);
        if (r.compareTo(t) >= 0) {
            r[r.t++] = 1;
            r.subTo(t, r);
        }
        BigInteger.ONE.dlShiftTo(ys, t);
        t.subTo(y, y); // "negative" y so we can replace sub with am later
        while (y.t < ys)
            y[y.t++] = 0;
        while (--j >= 0) {
            // Estimate quotient digit
            var qd = (r[--i] == y0) ? BigInteger.DM : Math.floor(r[i] * d1 + (r[i - 1] + e) * d2);
            if ((r[i] += y.am(0, qd, r, j, 0, ys)) < qd) {
                y.dlShiftTo(j, t);
                r.subTo(t, r);
                while (r[i] < --qd)
                    r.subTo(t, r);
            }
        }
        if (q != null) {
            r.drShiftTo(ys, q);
            if (ts != ms)
                BigInteger.ZERO.subTo(q, q);
        }
        r.t = ys;
        r.clamp();
        if (nsh > 0)
            r.rShiftTo(nsh, r); // Denormalize remainder
        if (ts < 0)
            BigInteger.ZERO.subTo(r, r);
    };
    BigInteger.prototype.int2char = function (n) {
        return BigInteger.BI_RM.charAt(n);
    };
    BigInteger.prototype.intAt = function (s, i) {
        var c = BigInteger.BI_RC[s.charCodeAt(i)];
        return (c == null) ? -1 : c;
    };
    BigInteger.prototype.dMultiply = function (n) {
        this[this.t] = this.am(0, n - 1, this, 0, 0, this.t);
        ++this.t;
        this.clamp();
    };
    BigInteger.prototype.chunkSize = function (r) {
        return Math.floor(Math.LN2 * BigInteger.DB / Math.log(r));
    };
    // (protected) this^e, e < 2^32, doing sqr and mul with "r" (HAC 14.79)
    BigInteger.prototype.exp = function (e, z) {
        if (e > 0xffffffff || e < 1)
            return BigInteger.ONE;
        var r = BigInteger.nbi(), r2 = BigInteger.nbi(), g = z.convert(this), i = this.nbits(e) - 1;
        g.copyTo(r);
        while (--i >= 0) {
            z.sqrTo(r, r2);
            if ((e & (1 << i)) > 0)
                z.mulTo(r2, g, r);
            else {
                var t = r;
                r = r2;
                r2 = t;
            }
        }
        return z.revert(r);
    };
    BigInteger.prototype.square = function () {
        var e = BigInteger.nbi();
        this.squareTo(e);
        return e;
    };
    BigInteger.prototype.pow = function (e) {
        return this.exp(e, new NullExp());
    };
    BigInteger.prototype.modPow = function (e, m) {
        var i = e.bitLength(), k, r = BigInteger.nbv(1), z;
        if (i <= 0)
            return r;
        else if (i < 18)
            k = 1;
        else if (i < 48)
            k = 3;
        else if (i < 144)
            k = 4;
        else if (i < 768)
            k = 5;
        else
            k = 6;
        if (i < 8)
            z = new Classic(m);
        else if (m.isEven())
            z = new Barrett(m);
        else
            z = new Montgomery(m);
        // precomputation
        var g = new Array(), n = 3, k1 = k - 1, km = (1 << k) - 1;
        g[1] = z.convert(this);
        if (k > 1) {
            var g2 = BigInteger.nbi();
            z.sqrTo(g[1], g2);
            while (n <= km) {
                g[n] = BigInteger.nbi();
                z.mulTo(g2, g[n - 2], g[n]);
                n += 2;
            }
        }
        var j = e.t - 1, w, is1 = true, r2 = BigInteger.nbi(), t;
        i = this.nbits(e[j]) - 1;
        while (j >= 0) {
            if (i >= k1)
                w = (e[j] >> (i - k1)) & km;
            else {
                w = (e[j] & ((1 << (i + 1)) - 1)) << (k1 - i);
                if (j > 0)
                    w |= e[j - 1] >> (BigInteger.DB + i - k1);
            }
            n = k;
            while ((w & 1) == 0) {
                w >>= 1;
                --n;
            }
            if ((i -= n) < 0) {
                i += BigInteger.DB;
                --j;
            }
            if (is1) {
                g[w].copyTo(r);
                is1 = false;
            }
            else {
                while (n > 1) {
                    z.sqrTo(r, r2);
                    z.sqrTo(r2, r);
                    n -= 2;
                }
                if (n > 0)
                    z.sqrTo(r, r2);
                else {
                    t = r;
                    r = r2;
                    r2 = t;
                }
                z.mulTo(r2, g[w], r);
            }
            while (j >= 0 && (e[j] & (1 << i)) == 0) {
                z.sqrTo(r, r2);
                t = r;
                r = r2;
                r2 = t;
                if (--i < 0) {
                    i = BigInteger.DB - 1;
                    --j;
                }
            }
        }
        return z.revert(r);
    };
    BigInteger._isinitialised = false;
    BigInteger.canary = 0xdeadbeefcafe;
    BigInteger.j_lm = ((BigInteger.canary & 0xffffff) == 0xefcafe);
    BigInteger.BI_RM = "0123456789abcdefghijklmnopqrstuvwxyz";
    BigInteger.BI_RC = [];
    BigInteger.lowprimes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307, 311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389, 397, 401, 409, 419, 421, 431, 433, 439, 443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503, 509, 521, 523, 541, 547, 557, 563, 569, 571, 577, 587, 593, 599, 601, 607, 613, 617, 619, 631, 641, 643, 647, 653, 659, 661, 673, 677, 683, 691, 701, 709, 719, 727, 733, 739, 743, 751, 757, 761, 769, 773, 787, 797, 809, 811, 821, 823, 827, 829, 839, 853, 857, 859, 863, 877, 881, 883, 887, 907, 911, 919, 929, 937, 941, 947, 953, 967, 971, 977, 983, 991, 997];
    BigInteger.lplim = (1 << 26) / BigInteger.lowprimes[BigInteger.lowprimes.length - 1];
    BigInteger.valueOf = BigInteger.nbv;
    BigInteger.ZERO = BigInteger.nbv(0);
    BigInteger.ONE = BigInteger.nbv(1);
    return BigInteger;
})();
module.exports = BigInteger;

},{}],3:[function(require,module,exports){
var BigInteger = require("../lib/BigInteger");
function integerToBytes(e, t) {
    var n = e.toByteArrayUnsigned();
    if (t < n.length)
        n = n.slice(n.length - t);
    else
        while (t > n.length)
            n.unshift(0);
    return n;
}
function secp256k1() {
    var e = new BigInteger("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F", 16), t = BigInteger.ZERO, n = new BigInteger("7", 16), r = new BigInteger("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141", 16), i = BigInteger.ONE, s = new ECCurveFp(e, t, n), o = s.decodePointHex("0479BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8");
    return new X9ECParameters(s, o, r, i);
}
exports.secp256k1 = secp256k1;
// Convert a byte array to a hex string
function bytesToHex(bytes) {
    for (var hex = [], i = 0; i < bytes.length; i++) {
        hex.push((bytes[i] >>> 4).toString(16));
        hex.push((bytes[i] & 0xF).toString(16));
    }
    return hex.join("");
}
function getPublicKey(bn) {
    var curve = secp256k1();
    var curvePt = curve.getG().multiply(bn);
    var x = curvePt.getX().toBigInteger();
    var y = curvePt.getY().toBigInteger();
    // returns x,y as big ints
    return {
        x: bytesToHex(integerToBytes(x, 32)),
        y: bytesToHex(integerToBytes(y, 32)),
        yParity: y.isEven() ? "even" : "odd"
    };
}
exports.getPublicKey = getPublicKey;
var ECFieldElementFp = (function () {
    function ECFieldElementFp(e, t) {
        this.x = t,
            this.q = e;
    }
    ECFieldElementFp.prototype.equals = function (e) {
        return e == this ? !0 : this.q.equals(e.q) && this.x.equals(e.x);
    };
    ECFieldElementFp.prototype.toBigInteger = function () {
        return this.x;
    };
    ECFieldElementFp.prototype.negate = function () {
        return new ECFieldElementFp(this.q, this.x.negate().mod(this.q));
    };
    ECFieldElementFp.prototype.add = function (e) {
        return new ECFieldElementFp(this.q, this.x.add(e.toBigInteger()).mod(this.q));
    };
    ECFieldElementFp.prototype.subtract = function (e) {
        return new ECFieldElementFp(this.q, this.x.subtract(e.toBigInteger()).mod(this.q));
    };
    ECFieldElementFp.prototype.multiply = function (e) {
        return new ECFieldElementFp(this.q, this.x.multiply(e.toBigInteger()).mod(this.q));
    };
    ECFieldElementFp.prototype.square = function () {
        return new ECFieldElementFp(this.q, this.x.square().mod(this.q));
    };
    ECFieldElementFp.prototype.divide = function (e) {
        return new ECFieldElementFp(this.q, this.x.multiply(e.toBigInteger().modInverse(this.q)).mod(this.q));
    };
    ECFieldElementFp.prototype.getByteLength = function () {
        return Math.floor((this.toBigInteger().bitLength() + 7) / 8);
    };
    return ECFieldElementFp;
})();
exports.ECFieldElementFp = ECFieldElementFp; //class fieldelement
var ECCurveFp = (function () {
    function ECCurveFp(e, t, n) {
        this.q = e,
            this.a = this.fromBigInteger(t),
            this.b = this.fromBigInteger(n),
            this.infinity = new ECPointFp(this, null, null);
    }
    ECCurveFp.prototype.getQ = function () {
        return this.q;
    };
    ECCurveFp.prototype.getA = function () {
        return this.a;
    };
    ECCurveFp.prototype.getB = function () {
        return this.b;
    };
    ECCurveFp.prototype.equals = function (e) {
        return e == this ? !0 : this.q.equals(e.q) && this.a.equals(e.a) && this.b.equals(e.b);
    };
    ECCurveFp.prototype.getInfinity = function () {
        return this.infinity;
    };
    ECCurveFp.prototype.fromBigInteger = function (e) {
        return new ECFieldElementFp(this.q, e);
    };
    ECCurveFp.prototype.decodePointHex = function (e) {
        switch (parseInt(e.substr(0, 2), 16)) {
            case 0:
                return this.infinity;
            case 2:
            case 3:
                return null;
            case 4:
            case 6:
            case 7:
                var t = (e.length - 2) / 2, n = e.substr(2, t), r = e.substr(t + 2, t);
                return new ECPointFp(this, this.fromBigInteger(new BigInteger(n, 16)), this.fromBigInteger(new BigInteger(r, 16)));
            default:
                return null;
        }
    };
    return ECCurveFp;
})();
exports.ECCurveFp = ECCurveFp; //class ECCurveFp
var ECPointFp = (function () {
    function ECPointFp(e, t, n, r) {
        this.curve = e;
        this.x = t;
        this.y = n;
        r == null ? this.z = BigInteger.ONE : this.z = r;
        this.zinv = null;
    }
    ECPointFp.prototype.getX = function () {
        return this.zinv == null && (this.zinv = this.z.modInverse(this.curve.q)),
            this.curve.fromBigInteger(this.x.toBigInteger().multiply(this.zinv).mod(this.curve.q));
    };
    ECPointFp.prototype.getY = function () {
        return this.zinv == null && (this.zinv = this.z.modInverse(this.curve.q)),
            this.curve.fromBigInteger(this.y.toBigInteger().multiply(this.zinv).mod(this.curve.q));
    };
    ECPointFp.prototype.equals = function (e) {
        if (e == this)
            return !0;
        if (this.isInfinity())
            return e.isInfinity();
        if (e.isInfinity())
            return this.isInfinity();
        var t, n;
        return t = e.y.toBigInteger().multiply(this.z).subtract(this.y.toBigInteger().multiply(e.z)).mod(this.curve.q),
            t.equals(BigInteger.ZERO) ? (n = e.x.toBigInteger().multiply(this.z).subtract(this.x.toBigInteger().multiply(e.z)).mod(this.curve.q), n.equals(BigInteger.ZERO)) : !1;
    };
    ECPointFp.prototype.isInfinity = function () {
        return this.x == null && this.y == null ? !0 : this.z.equals(BigInteger.ZERO) && !this.y.toBigInteger().equals(BigInteger.ZERO);
    };
    ECPointFp.prototype.negate = function () {
        return new ECPointFp(this.curve, this.x, this.y.negate(), this.z);
    };
    ECPointFp.prototype.add = function (e) {
        if (this.isInfinity())
            return e;
        if (e.isInfinity())
            return this;
        var t = e.y.toBigInteger().multiply(this.z).subtract(this.y.toBigInteger().multiply(e.z)).mod(this.curve.q), n = e.x.toBigInteger().multiply(this.z).subtract(this.x.toBigInteger().multiply(e.z)).mod(this.curve.q);
        if (BigInteger.ZERO.equals(n))
            return BigInteger.ZERO.equals(t) ? this.twice() : this.curve.getInfinity();
        var r = new BigInteger("3"), i = this.x.toBigInteger(), s = this.y.toBigInteger(), o = e.x.toBigInteger(), u = e.y.toBigInteger(), a = n.square(), f = a.multiply(n), l = i.multiply(a), c = t.square().multiply(this.z), h = c.subtract(l.shiftLeft(1)).multiply(e.z).subtract(f).multiply(n).mod(this.curve.q), p = l.multiply(r).multiply(t).subtract(s.multiply(f)).subtract(c.multiply(t)).multiply(e.z).add(t.multiply(f)).mod(this.curve.q), d = f.multiply(this.z).multiply(e.z).mod(this.curve.q);
        return new ECPointFp(this.curve, this.curve.fromBigInteger(h), this.curve.fromBigInteger(p), d);
    };
    ECPointFp.prototype.twice = function () {
        if (this.isInfinity())
            return this;
        if (this.y.toBigInteger().signum() == 0)
            return this.curve.getInfinity();
        var e = new BigInteger("3"), t = this.x.toBigInteger(), n = this.y.toBigInteger(), r = n.multiply(this.z), i = r.multiply(n).mod(this.curve.q), s = this.curve.a.toBigInteger(), o = t.square().multiply(e);
        BigInteger.ZERO.equals(s) || (o = o.add(this.z.square().multiply(s))),
            o = o.mod(this.curve.q);
        var u = o.square().subtract(t.shiftLeft(3).multiply(i)).shiftLeft(1).multiply(r).mod(this.curve.q), a = o.multiply(e).multiply(t).subtract(i.shiftLeft(1)).shiftLeft(2).multiply(i).subtract(o.square().multiply(o)).mod(this.curve.q), f = r.square().multiply(r).shiftLeft(3).mod(this.curve.q);
        return new ECPointFp(this.curve, this.curve.fromBigInteger(u), this.curve.fromBigInteger(a), f);
    };
    ECPointFp.prototype.multiply = function (e) {
        if (this.isInfinity())
            return this;
        if (e.signum() == 0)
            return this.curve.getInfinity();
        var t = e, n = t.multiply(new BigInteger("3")), r = this.negate(), i = this, s;
        for (s = n.bitLength() - 2; s > 0; --s) {
            i = i.twice();
            var o = n.testBit(s), u = t.testBit(s);
            o != u && (i = i.add(o ? this : r));
        }
        return i;
    };
    ECPointFp.prototype.multiplyTwo = function (e, t, n) {
        var r;
        e.bitLength() > n.bitLength() ? r = e.bitLength() - 1 : r = n.bitLength() - 1;
        var i = this.curve.getInfinity(), s = this.add(t);
        while (r >= 0)
            i = i.twice(), e.testBit(r) ? n.testBit(r) ? i = i.add(s) : i = i.add(this) : n.testBit(r) && (i = i.add(t)), --r;
        return i;
    };
    ECPointFp.prototype.getEncoded = function (e) {
        var t = this.getX().toBigInteger(), n = this.getY().toBigInteger(), r = integerToBytes(t, 32);
        return e ? n.isEven() ? r.unshift(2) : r.unshift(3) : (r.unshift(4), r = r.concat(integerToBytes(n, 32))),
            r;
    };
    ECPointFp.prototype.decodeFrom = function (e, t) {
        var n = t[0], r = t.length - 1, i = t.slice(1, 1 + r / 2), s = t.slice(1 + r / 2, 1 + r);
        i.unshift(0),
            s.unshift(0);
        var o = new BigInteger(i), u = new BigInteger(s);
        return new ECPointFp(e, e.fromBigInteger(o), e.fromBigInteger(u));
    };
    ECPointFp.prototype.add2D = function (e) {
        if (this.isInfinity())
            return e;
        if (e.isInfinity())
            return this;
        if (this.x.equals(e.x))
            return this.y.equals(e.y) ? this.twice() : this.curve.getInfinity();
        var t = e.x.subtract(this.x), n = e.y.subtract(this.y), r = n.divide(t), i = r.square().subtract(this.x).subtract(e.x), s = r.multiply(this.x.subtract(i)).subtract(this.y);
        return new ECPointFp(this.curve, i, s);
    };
    ECPointFp.prototype.twice2D = function () {
        if (this.isInfinity())
            return this;
        if (this.y.toBigInteger().signum() == 0)
            return this.curve.getInfinity();
        var e = this.curve.fromBigInteger(BigInteger.valueOf(2)), t = this.curve.fromBigInteger(BigInteger.valueOf(3)), n = this.x.square().multiply(t).add(this.curve.a).divide(this.y.multiply(e)), r = n.square().subtract(this.x.multiply(e)), i = n.multiply(this.x.subtract(r)).subtract(this.y);
        return new ECPointFp(this.curve, r, i);
    };
    ECPointFp.prototype.multiply2D = function (e) {
        if (this.isInfinity())
            return this;
        if (e.signum() == 0)
            return this.curve.getInfinity();
        var t = e, n = t.multiply(new BigInteger("3")), r = this.negate(), i = this, s;
        for (s = n.bitLength() - 2; s > 0; --s) {
            i = i.twice();
            var o = n.testBit(s), u = t.testBit(s);
            o != u && (i = i.add2D(o ? this : r));
        }
        return i;
    };
    ECPointFp.prototype.isOnCurve = function () {
        var e = this.getX().toBigInteger(), t = this.getY().toBigInteger(), n = this.curve.getA().toBigInteger(), r = this.curve.getB().toBigInteger(), i = this.curve.getQ(), s = t.multiply(t).mod(i), o = e.multiply(e).multiply(e).add(n.multiply(e)).add(r).mod(i);
        return s.equals(o);
    };
    ECPointFp.prototype.toString = function () {
        return "(" + this.getX().toBigInteger().toString() + "," + this.getY().toBigInteger().toString() + ")";
    };
    ECPointFp.prototype.validate = function () {
        var e = this.curve.getQ();
        if (this.isInfinity())
            throw new Error("Point is at infinity.");
        var t = this.getX().toBigInteger(), n = this.getY().toBigInteger();
        if (t.compareTo(BigInteger.ONE) < 0 || t.compareTo(e.subtract(BigInteger.ONE)) > 0)
            throw new Error("x coordinate out of bounds");
        if (n.compareTo(BigInteger.ONE) < 0 || n.compareTo(e.subtract(BigInteger.ONE)) > 0)
            throw new Error("y coordinate out of bounds");
        if (!this.isOnCurve())
            throw new Error("Point is not on the curve.");
        if (this.multiply(e).isInfinity())
            throw new Error("Point is not a scalar multiple of G.");
        return !0;
    };
    return ECPointFp;
})();
exports.ECPointFp = ECPointFp; //class ECPointFp
var X9ECParameters = (function () {
    function X9ECParameters(e, t, n, r) {
        this.curve = e,
            this.g = t,
            this.n = n,
            this.h = r;
    }
    X9ECParameters.prototype.getCurve = function () {
        return this.curve;
    };
    X9ECParameters.prototype.getG = function () {
        return this.g;
    };
    X9ECParameters.prototype.getN = function () {
        return this.n;
    };
    X9ECParameters.prototype.getH = function () {
        return this.h;
    };
    X9ECParameters.prototype.fromHex = function (e) {
        return new BigInteger(e, 16);
    };
    return X9ECParameters;
})();
exports.X9ECParameters = X9ECParameters;

},{"../lib/BigInteger":2}],4:[function(require,module,exports){
var BigInteger = require("../lib/BigInteger");
var Base58 = require("../lib/Base58");
//module Peercoin {
//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
var Crypto = (function () {
    function Crypto() {
    }
    // Bit-wise rotate left
    Crypto.rotl = function (n, b) {
        return (n << b) | (n >>> (32 - b));
    };
    // Bit-wise rotate right
    Crypto.rotr = function (n, b) {
        return (n << (32 - b)) | (n >>> b);
    };
    // Swap big-endian to little-endian and vice versa
    Crypto.endian = function (n) {
        // If number given, swap endian
        if (n.constructor == Number) {
            return Crypto.rotl(n, 8) & 0x00FF00FF |
                Crypto.rotl(n, 24) & 0xFF00FF00;
        }
        // Else, assume array and swap all items
        for (var i = 0; i < n.length; i++)
            n[i] = Crypto.endian(n[i]);
        return n;
    };
    // Generate an array of any length of random bytes
    Crypto.randomBytes = function (bytes) {
        for (var words = [], i = 0, b = 0; i < bytes.length; i++, b += 8)
            words[b >>> 5] |= (bytes[i] & 0xFF) << (24 - b % 32);
        return words;
    };
    // Convert a byte array to big-endian 32-bit words
    Crypto.bytesToWords = function (bytes) {
        for (var words = [], i = 0, b = 0; i < bytes.length; i++, b += 8)
            words[b >>> 5] |= (bytes[i] & 0xFF) << (24 - b % 32);
        return words;
    };
    // Convert big-endian 32-bit words to a byte array
    Crypto.wordsToBytes = function (words) {
        for (var bytes = [], b = 0; b < words.length * 32; b += 8)
            bytes.push((words[b >>> 5] >>> (24 - b % 32)) & 0xFF);
        return bytes;
    };
    // Convert a byte array to a hex string
    Crypto.bytesToHex = function (bytes) {
        for (var hex = [], i = 0; i < bytes.length; i++) {
            hex.push((bytes[i] >>> 4).toString(16));
            hex.push((bytes[i] & 0xF).toString(16));
        }
        return hex.join("");
    };
    // Convert a hex string to a byte array
    Crypto.hexToBytes = function (hex) {
        for (var bytes = [], c = 0; c < hex.length; c += 2)
            bytes.push(parseInt(hex.substr(c, 2), 16));
        return bytes;
    };
    // Convert a byte array to a base-64 string
    Crypto.bytesToBase64 = function (bytes) {
        for (var base64 = [], i = 0; i < bytes.length; i += 3) {
            var triplet = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
            for (var j = 0; j < 4; j++) {
                if (i * 8 + j * 6 <= bytes.length * 8)
                    base64.push(Crypto.base64map.charAt((triplet >>> 6 * (3 - j)) & 0x3F));
                else
                    base64.push("=");
            }
        }
        return base64.join("");
    };
    // Convert a base-64 string to a byte array
    Crypto.base64ToBytes = function (base64) {
        // Remove non-base-64 characters
        base64 = base64.replace(/[^A-Z0-9+\/]/ig, "");
        for (var bytes = [], i = 0, imod4 = 0; i < base64.length; imod4 = ++i % 4) {
            if (imod4 == 0)
                continue;
            bytes.push(((Crypto.base64map.indexOf(base64.charAt(i - 1)) & (Math.pow(2, -2 * imod4 + 8) - 1)) << (imod4 * 2)) |
                (Crypto.base64map.indexOf(base64.charAt(i)) >>> (6 - imod4 * 2)));
        }
        return bytes;
    };
    // Convert a byte array to little-endian 32-bit words
    Crypto.bytesToLWords = function (bytes) {
        var output = Array(bytes.length >> 2);
        for (var i = 0; i < output.length; i++)
            output[i] = 0;
        for (var i = 0; i < bytes.length * 8; i += 8)
            output[i >> 5] |= (bytes[i / 8] & 0xFF) << (i % 32);
        return output;
    };
    // Convert little-endian 32-bit words to a byte array
    Crypto.lWordsToBytes = function (words) {
        var output = [];
        for (var i = 0; i < words.length * 32; i += 8)
            output.push((words[i >> 5] >>> (i % 32)) & 0xff);
        return output;
    };
    Crypto.integerToBytes = function (e, t) {
        var n = e.toByteArrayUnsigned();
        if (t < n.length)
            n = n.slice(n.length - t);
        else
            while (t > n.length)
                n.unshift(0);
        return n;
    };
    Crypto.safe_add = function (x, y) {
        var lsw = (x & 0xFFFF) + (y & 0xFFFF);
        var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
    };
    /*
     * Bitwise rotate a 32-bit number to the left.
     */
    Crypto.bit_rol = function (num, cnt) {
        return (num << cnt) | (num >>> (32 - cnt));
    };
    Crypto.rmd160_f = function (j, x, y, z) {
        if (j >= 80)
            throw ("rmd160_f: j out of range");
        return (0 <= j && j <= 15) ? (x ^ y ^ z) :
            (16 <= j && j <= 31) ? (x & y) | (~x & z) :
                (32 <= j && j <= 47) ? (x | ~y) ^ z :
                    (48 <= j && j <= 63) ? (x & z) | (y & ~z) :
                        x ^ (y | ~z);
    };
    Crypto.rmd160_K1 = function (j) {
        if (j >= 80)
            throw ("rmd160_K1: j out of range");
        return (0 <= j && j <= 15) ? 0x00000000 :
            (16 <= j && j <= 31) ? 0x5a827999 :
                (32 <= j && j <= 47) ? 0x6ed9eba1 :
                    (48 <= j && j <= 63) ? 0x8f1bbcdc
                        : 0xa953fd4e;
    };
    Crypto.rmd160_K2 = function (j) {
        if (j >= 80)
            throw ("rmd160_K2: j out of range");
        return (0 <= j && j <= 15) ? 0x50a28be6 :
            (16 <= j && j <= 31) ? 0x5c4dd124 :
                (32 <= j && j <= 47) ? 0x6d703ef3 :
                    (48 <= j && j <= 63) ? 0x7a6d76e9 :
                        0x00000000;
    };
    Crypto._rmd160 = function (message) {
        // Convert to byte array
        if (message.constructor == String)
            message = Crypto.UTF8.stringToBytes(message);
        var x = Crypto.bytesToLWords(message), len = message.length * 8;
        /* append padding */
        x[len >> 5] |= 0x80 << (len % 32);
        x[(((len + 64) >>> 9) << 4) + 14] = len;
        var h0 = 0x67452301;
        var h1 = 0xefcdab89;
        var h2 = 0x98badcfe;
        var h3 = 0x10325476;
        var h4 = 0xc3d2e1f0;
        var safe_add = Crypto.safe_add;
        var bit_rol = Crypto.bit_rol;
        var rmd160_f = Crypto.rmd160_f;
        var rmd160_K1 = Crypto.rmd160_K1;
        var rmd160_K2 = Crypto.rmd160_K2;
        for (var i = 0, xlh = x.length; i < xlh; i += 16) {
            var T;
            var A1 = h0, B1 = h1, C1 = h2, D1 = h3, E1 = h4;
            var A2 = h0, B2 = h1, C2 = h2, D2 = h3, E2 = h4;
            for (var j = 0; j <= 79; ++j) {
                T = safe_add(A1, rmd160_f(j, B1, C1, D1));
                T = safe_add(T, x[i + Crypto.rmd160_r1[j]]);
                T = safe_add(T, rmd160_K1(j));
                T = safe_add(bit_rol(T, Crypto.rmd160_s1[j]), E1);
                A1 = E1;
                E1 = D1;
                D1 = bit_rol(C1, 10);
                C1 = B1;
                B1 = T;
                T = safe_add(A2, rmd160_f(79 - j, B2, C2, D2));
                T = safe_add(T, x[i + Crypto.rmd160_r2[j]]);
                T = safe_add(T, rmd160_K2(j));
                T = safe_add(bit_rol(T, Crypto.rmd160_s2[j]), E2);
                A2 = E2;
                E2 = D2;
                D2 = bit_rol(C2, 10);
                C2 = B2;
                B2 = T;
            }
            T = safe_add(h1, safe_add(C1, D2));
            h1 = safe_add(h2, safe_add(D1, E2));
            h2 = safe_add(h3, safe_add(E1, A2));
            h3 = safe_add(h4, safe_add(A1, B2));
            h4 = safe_add(h0, safe_add(B1, C2));
            h0 = T;
        }
        return [h0, h1, h2, h3, h4];
    };
    Crypto._sha256 = function (message) {
        // Convert to byte array
        if (message.constructor == String)
            message = Crypto.UTF8.stringToBytes(message);
        /* else, assume byte array already */
        var m = Crypto.bytesToWords(message), l = message.length * 8, H = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
            0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19], w = [], a, b, c, d, e, f, g, h, t1, t2;
        // Padding
        m[l >> 5] |= 0x80 << (24 - l % 32);
        m[((l + 64 >> 9) << 4) + 15] = l;
        for (var i = 0, ml = m.length; i < ml; i += 16) {
            a = H[0];
            b = H[1];
            c = H[2];
            d = H[3];
            e = H[4];
            f = H[5];
            g = H[6];
            h = H[7];
            for (var j = 0; j < 64; j++) {
                if (j < 16)
                    w[j] = m[j + i];
                else {
                    var gamma0x = w[j - 15], gamma1x = w[j - 2], gamma0 = ((gamma0x << 25) | (gamma0x >>> 7)) ^
                        ((gamma0x << 14) | (gamma0x >>> 18)) ^
                        (gamma0x >>> 3), gamma1 = ((gamma1x << 15) | (gamma1x >>> 17)) ^
                        ((gamma1x << 13) | (gamma1x >>> 19)) ^
                        (gamma1x >>> 10);
                    w[j] = gamma0 + (w[j - 7] >>> 0) +
                        gamma1 + (w[j - 16] >>> 0);
                }
                var ch = e & f ^ ~e & g, maj = a & b ^ a & c ^ b & c, sigma0 = ((a << 30) | (a >>> 2)) ^
                    ((a << 19) | (a >>> 13)) ^
                    ((a << 10) | (a >>> 22)), sigma1 = ((e << 26) | (e >>> 6)) ^
                    ((e << 21) | (e >>> 11)) ^
                    ((e << 7) | (e >>> 25));
                t1 = (h >>> 0) + sigma1 + ch + (Crypto.K[j]) + (w[j] >>> 0);
                t2 = sigma0 + maj;
                h = g;
                g = f;
                f = e;
                e = (d + t1) >>> 0;
                d = c;
                c = b;
                b = a;
                a = (t1 + t2) >>> 0;
            }
            H[0] += a;
            H[1] += b;
            H[2] += c;
            H[3] += d;
            H[4] += e;
            H[5] += f;
            H[6] += g;
            H[7] += h;
        }
        return H;
    };
    /**
 * RIPEMD160 e.g.: HashUtil.RIPEMD160(hash, {asBytes : true})
 */
    Crypto.RIPEMD160 = function (message, options) {
        var ret, digestbytes = Crypto.lWordsToBytes(Crypto._rmd160(message));
        if (options && options.asBytes) {
            ret = digestbytes;
        }
        else if (options && options.asString) {
            ret = Crypto.charenc.Binary.bytesToString(digestbytes);
        }
        else {
            ret = Crypto.bytesToHex(digestbytes);
        }
        return ret;
    };
    // Public API
    /**
     * SHA256 e.g.: HashUtil.SHA256(hash, {asBytes : true})
     */
    Crypto.SHA256 = function (message, options) {
        var ret, digestbytes = Crypto.wordsToBytes(Crypto._sha256(message));
        if (options && options.asBytes) {
            ret = digestbytes;
        }
        else if (options && options.asString) {
            ret = Crypto.charenc.Binary.bytesToString(digestbytes);
        }
        else {
            ret = Crypto.bytesToHex(digestbytes);
        }
        return ret;
    };
    Crypto.base64map = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    Crypto.charenc = {
        Binary: {
            // Convert a string to a byte array
            stringToBytes: function (str) {
                for (var bytes = [], i = 0; i < str.length; i++)
                    bytes.push(str.charCodeAt(i) & 0xFF);
                return bytes;
            },
            // Convert a byte array to a string
            bytesToString: function (bytes) {
                for (var str = [], i = 0; i < bytes.length; i++)
                    str.push(String.fromCharCode(bytes[i]));
                return str.join("");
            }
        },
        UTF8: {
            // Convert a string to a byte array
            stringToBytes: function (str) {
                return Crypto.charenc.Binary.stringToBytes(decodeURIComponent(encodeURIComponent(str)));
            },
            // Convert a byte array to a string
            bytesToString: function (bytes) {
                return decodeURIComponent(encodeURIComponent(Crypto.charenc.Binary.bytesToString(bytes)));
            }
        }
    };
    Crypto.UTF8 = Crypto.charenc.UTF8;
    Crypto.rmd160_r1 = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
        7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
        3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
        1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
        4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13
    ];
    Crypto.rmd160_r2 = [
        5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
        6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
        15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
        8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
        12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11
    ];
    Crypto.rmd160_s1 = [
        11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
        7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
        11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
        11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
        9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6
    ];
    Crypto.rmd160_s2 = [
        8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
        9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
        9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
        15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
        8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11
    ];
    // Constants
    Crypto.K = [0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5,
        0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
        0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3,
        0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
        0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC,
        0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
        0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7,
        0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
        0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13,
        0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
        0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3,
        0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
        0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5,
        0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
        0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208,
        0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2];
    return Crypto;
})();
exports.Crypto = Crypto; //crypto
//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
var Address = (function () {
    function Address(bytes) {
        if ("string" == typeof bytes) {
            bytes = this.decodeString(bytes);
        }
        this.hash = bytes;
        this.version = Address.networkVersion;
    }
    Address.prototype.decodeString = function (str) {
        var bytes = Base58.decode(str);
        var hash = bytes.slice(0, 21);
        var checksum = Crypto.SHA256(Crypto.SHA256(hash, { asBytes: true }), { asBytes: true });
        if (checksum[0] != bytes[21] ||
            checksum[1] != bytes[22] ||
            checksum[2] != bytes[23] ||
            checksum[3] != bytes[24]) {
            throw "Checksum validation failed!";
        }
        var version = hash.shift();
        if (version != Address.networkVersion) {
            throw "Version " + version + " not supported!";
        }
        return hash;
    };
    Address.prototype.getHashBase64 = function () {
        return Crypto.bytesToBase64(this.hash);
    };
    Address.prototype.toString = function () {
        // Get a copy of the hash
        var hash = this.hash.slice(0);
        // Version
        hash.unshift(this.version);
        var checksum = Crypto.SHA256(Crypto.SHA256(hash, {
            asBytes: true
        }), {
            asBytes: true
        });
        var bytes = hash.concat(checksum.slice(0, 4));
        return Base58.encode(bytes);
    };
    Address.networkVersion = 0x37; // Peercoin mainnet
    return Address;
})();
exports.Address = Address;
//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
var Mint = (function () {
    function Mint() {
    }
    Mint.DiffToTarget = function (diff) {
        //floor it
        diff = (diff | 0);
        var mantissa = 0x0000ffff / diff;
        var exp = 1;
        var tmp = mantissa;
        while (tmp >= 256.0) {
            tmp /= 256.0;
            exp++;
        }
        for (var i = 0; i < exp; i++) {
            mantissa *= 256.0;
        }
        var bn = new BigInteger('' + (mantissa | 0), 10);
        bn = bn.shiftLeft((26 - exp) * 8);
        return bn;
    };
    Mint.IncCompact = function (compact) {
        var mantissa = compact & 0x007fffff;
        var neg = compact & 0x00800000;
        var exponent = (compact >> 24);
        if (exponent <= 3) {
            mantissa += (1 << (8 * (3 - exponent)));
        }
        else {
            mantissa++;
        }
        if (mantissa >= 0x00800000) {
            mantissa >>= 8;
            exponent++;
        }
        return (exponent << 24) | mantissa | neg;
    };
    // BigToCompact converts a whole number N to a compact representation using
    // an unsigned 32-bit number.  The compact representation only provides 23 bits
    // of precision, so values larger than (2^23 - 1) only encode the most
    // significant digits of the number.  See CompactToBig for details.
    Mint.BigToCompact = function (n) {
        // No need to do any work if it's zero.
        if (n.equals(BigInteger.ZERO)) {
            return 0;
        }
        // Since the base for the exponent is 256, the exponent can be treated
        // as the number of bytes.  So, shift the number right or left
        // accordingly.  This is equivalent to:
        // mantissa = mantissa / 256^(exponent-3)
        var mantissa; // uint32   var	mantissa = compact & 0x007fffff,
        var exponent = n.toByteArrayUnsigned().length;
        if (exponent <= 3) {
            mantissa = n.and(new BigInteger('4294967295', 10)).intValue();
            mantissa <<= 8 * (3 - exponent);
        }
        else {
            // Use a copy to avoid modifying the caller's original number.
            var tn = new BigInteger(n.toString(10), 10);
            mantissa = tn.shiftRight(8 * (exponent - 3)).and(new BigInteger('4294967295', 10)).intValue();
        }
        // When the mantissa already has the sign bit set, the number is too
        // large to fit into the available 23-bits, so divide the number by 256
        // and increment the exponent accordingly.
        if ((mantissa & 0x00800000) != 0) {
            mantissa >>= 8;
            exponent++;
        }
        // Pack the exponent, sign bit, and mantissa into an unsigned 32-bit
        // int and return it.
        var compact = ((exponent << 24) | mantissa);
        if (n.compareTo(BigInteger.ZERO) < 0) {
            compact |= 0x00800000;
        }
        return compact;
    };
    Mint.CompactToDiff = function (bits) {
        var nShift = (bits >> 24) & 0xff;
        var diff = 1.0 * (0x0000ffff) / (bits & 0x00ffffff);
        for (var n = 0; nShift < 29; nShift++) {
            diff *= 256.0;
        }
        for (var n = 0; nShift > 29; nShift--) {
            diff /= 256.0;
        }
        return diff;
    };
    ///////////////////////////////////////////////////////////////////////////////////////////////
    // CompactToBig converts a compact representation of a whole number N to an
    // unsigned 32-bit number.  The representation is similar to IEEE754 floating
    // point numbers.
    //
    // Like IEEE754 floating point, there are three basic components: the sign,
    // the exponent, and the mantissa.  They are broken out as follows:
    //
    //	* the most significant 8 bits represent the unsigned base 256 exponent
    // 	* bit 23 (the 24th bit) represents the sign bit
    //	* the least significant 23 bits represent the mantissa
    //
    //	-------------------------------------------------
    //	|   Exponent     |    Sign    |    Mantissa     |
    //	-------------------------------------------------
    //	| 8 bits [31-24] | 1 bit [23] | 23 bits [22-00] |
    //	-------------------------------------------------
    //
    // The formula to calculate N is:
    // 	N = (-1^sign) * mantissa * 256^(exponent-3)
    //
    // This compact form is only used in bitcoin to encode unsigned 256-bit numbers
    // which represent difficulty targets, thus there really is not a need for a
    // sign bit, but it is implemented here to stay consistent with bitcoind.
    Mint.CompactToBig = function (compact) {
        // Extract the mantissa, sign bit, and exponent.
        var mantissa = compact & 0x007fffff, isNegative = (compact & 0x00800000) != 0, exponent = (compact >> 24) >>> 0;
        // Since the base for the exponent is 256, the exponent can be treated
        // as the number of bytes to represent the full 256-bit number.  So,
        // treat the exponent as the number of bytes and shift the mantissa
        // right or left accordingly.  This is equivalent to:
        // N = mantissa * 256^(exponent-3)
        var bn;
        if (exponent <= 3) {
            mantissa >>= 8 * (3 - exponent);
            bn = new BigInteger('' + mantissa, 10);
        }
        else {
            bn = new BigInteger('' + mantissa, 10);
            bn = bn.shiftLeft(8 * (exponent - 3));
        }
        // Make it negative if the sign bit is set.
        if (isNegative) {
            bn = bn.multiply(new BigInteger('-1', 10, null));
        }
        return bn;
    };
    Mint.day = 60 * 60 * 24;
    Mint.stakeMaxAge = 90 * Mint.day;
    Mint.coin = 1000000;
    Mint.coinDay = Mint.coin * Mint.day;
    Mint.minStakeMinAge = 2592000;
    return Mint;
})();
//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////	
var StakeKernelTemplate = (function () {
    function StakeKernelTemplate(tpl, manager) {
        this.BlockFromTime = tpl.BlockFromTime; // int64
        this.StakeModifier = tpl.StakeModifier; //uint64  => BigInteger!!!
        this.PrevTxOffset = tpl.PrevTxOffset; //uint32
        this.PrevTxTime = tpl.PrevTxTime; //int64
        this.PrevTxOutIndex = tpl.PrevTxOutIndex; //uint32
        this.PrevTxOutValue = tpl.PrevTxOutValue; //int64
        this.UnspentOutputs = manager;
        this.IsProtocolV03 = ('IsProtocolV03' in tpl) ? tpl.IsProtocolV03 : true; //bool
        this.StakeMinAge = ('StakeMinAge' in tpl) ? tpl.StakeMinAge : Mint.minStakeMinAge; //int64
        this.Bits = ('Bits' in tpl) ? tpl.Bits : this.setBitsWithDifficulty(parseFloat("10.33")); //uint32
        this.Results = [];
        this.maxResults = 7;
    }
    StakeKernelTemplate.prototype.setBitsWithDifficulty = function (diff) {
        this.Bits = Mint.BigToCompact(Mint.DiffToTarget(diff));
        return this.Bits;
    };
    StakeKernelTemplate.prototype.checkStakeKernelHash = function () {
        var retobj = { success: false, minTarget: BigInteger.ZERO, hash: [] };
        if (this.UnspentOutputs.TxTime < this.PrevTxTime) {
            console.log("CheckStakeKernelHash() : nTime violation");
            return retobj;
        }
        if (this.BlockFromTime + this.StakeMinAge > this.UnspentOutputs.TxTime) {
            console.log("CheckStakeKernelHash() : min age violation");
            return retobj;
        }
        var bnTargetPerCoinDay = Mint.CompactToBig(this.Bits);
        var timeReduction = (this.IsProtocolV03) ? timeReduction = this.StakeMinAge : 0;
        var nTimeWeight = this.UnspentOutputs.TxTime - this.PrevTxTime; // int64
        if (nTimeWeight > Mint.stakeMaxAge) {
            nTimeWeight = Mint.stakeMaxAge;
        }
        nTimeWeight -= timeReduction;
        var bnCoinDayWeight; // *big.Int
        var valueTime = this.PrevTxOutValue * nTimeWeight;
        if (valueTime > 0) {
            bnCoinDayWeight = new BigInteger('' + (Math.floor(valueTime / Mint.coinDay)), 10);
        }
        else {
            // overflow, calc w/ big.Int or return error?
            // err = errors.New("valueTime overflow")
            // return
            var t1 = new BigInteger('' + (24 * 60 * 60), 10);
            var t2 = new BigInteger('' + (Mint.coin), 10);
            var t3 = new BigInteger('' + (this.PrevTxOutValue), 10);
            var t4 = new BigInteger('' + (nTimeWeight), 10);
            bnCoinDayWeight = ((t3.multiply(t4)).divide(t2)).divide(t1);
        }
        var targetInt = bnCoinDayWeight.multiply(bnTargetPerCoinDay);
        var buf = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        var _o_ = 0;
        if (this.IsProtocolV03) {
            var d = this.StakeModifier.toByteArrayUnsigned().reverse();
            for (var i = 0; i < 8; i++) {
                buf[_o_] = d[i];
                _o_++;
            }
        }
        else {
            var d2 = this.Bits;
            for (var i = 0; i < 4; i++) {
                buf[_o_] = (d2 & 0xff);
                d2 >>= 8;
                _o_++;
            }
        }
        var data = [this.BlockFromTime, this.PrevTxOffset, this.PrevTxTime, this.PrevTxOutIndex, this.UnspentOutputs.TxTime];
        for (var k = 0, arrayLength = data.length; k < arrayLength; k++) {
            var dn = data[k];
            for (var i = 0; i < 4; i++) {
                buf[_o_] = (dn & 0xff);
                dn >>= 8;
                _o_++;
            }
        }
        var hashProofOfStake = (Crypto.SHA256(Crypto.SHA256(buf, { asBytes: true }), { asBytes: true })).reverse();
        var hashProofOfStakeInt = BigInteger.fromByteArrayUnsigned(hashProofOfStake);
        if (hashProofOfStakeInt.compareTo(targetInt) > 0) {
            return retobj;
        }
        retobj.minTarget = hashProofOfStakeInt.divide(bnCoinDayWeight).subtract(BigInteger.ONE);
        retobj.success = true;
        retobj.hash = hashProofOfStake;
        return retobj;
    };
    return StakeKernelTemplate;
})();
//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
var UnspentOutputsToStake = (function () {
    function UnspentOutputsToStake() {
        this.arrStakeKernelTemplates = []; //
        this.Bits = Mint.BigToCompact(Mint.DiffToTarget(parseFloat("15"))); //uint32
        this.TxTime = (Date.now() / 1000 | 0); //int64
        this.StartTime = this.TxTime;
        this.MaxTime = this.TxTime + 3600;
        this.Stop = false;
        this.Results = [];
        this.orgtpl = [];
    }
    UnspentOutputsToStake.prototype.add = function (tpldata) {
        var addrfound = this.orgtpl.some(function (el) {
            if ((el.PrevTxOffset == tpldata.PrevTxOffset && el.PrevTxOutIndex == tpldata.PrevTxOutIndex &&
                el.PrevTxOutValue == tpldata.PrevTxOutValue &&
                el.StakeModifier.toString() == tpldata.StakeModifier.toString())) {
                return true;
            }
        });
        if (!addrfound) {
            this.orgtpl.push(tpldata);
            this.arrStakeKernelTemplates.push(new StakeKernelTemplate(tpldata, this));
        }
    };
    UnspentOutputsToStake.prototype.setBitsWithDifficulty = function (diff) {
        var _this = this;
        var that = this;
        this.Bits = Mint.BigToCompact(Mint.DiffToTarget(diff));
        this.arrStakeKernelTemplates.forEach(function (element) { element.Bits = _this.Bits; });
    };
    UnspentOutputsToStake.prototype.setStartStop = function (start, stop) {
        var that = this;
        that.TxTime = start;
        that.StartTime = that.TxTime;
        that.MaxTime = stop;
    };
    UnspentOutputsToStake.prototype.stop = function () {
        this.Stop = true;
    };
    UnspentOutputsToStake.prototype.findStakeAt = function () {
        var _this = this;
        var stakesfound = [];
        //filter out oudated templates
        var newarrKT = [];
        this.arrStakeKernelTemplates.forEach(function (element, index, array) {
            if ((element.UnspentOutputs.TxTime < element.PrevTxTime) ||
                (element.BlockFromTime + element.StakeMinAge > element.UnspentOutputs.TxTime)) {
            }
            else {
                newarrKT.push(element);
            }
        });
        this.arrStakeKernelTemplates = newarrKT;
        this.arrStakeKernelTemplates.forEach(function (element, index, array) {
            if (!_this.Stop) {
                var resultobj = element.checkStakeKernelHash(); //{succes: succes, hash, minTarget:minTarget}
                if (resultobj.success) {
                    var comp = Mint.IncCompact(Mint.BigToCompact(resultobj.minTarget));
                    var diff = Mint.CompactToDiff(comp);
                    if (diff < 0.25) {
                        console.log('hmmm is this min diff ok: ' + diff);
                    }
                    var res = {
                        "foundstake": _this.TxTime,
                        "mindifficulty": ((diff * 10) / 10)
                    };
                    element.Results.push(res);
                    stakesfound.push(res);
                }
            }
        });
        return stakesfound;
    };
    UnspentOutputsToStake.prototype.recursiveFind = function (ob) {
        var _this = this;
        ob.progressWhen++;
        this.TxTime++;
        var res = this.findStakeAt();
        if (res.length > 0) {
            ob.mintcallback(res);
            this.Results.push(res);
        }
        var loopfunc = ob.setZeroTimeout;
        if (ob.progressWhen > 555 / this.arrStakeKernelTemplates.length) {
            ob.progressWhen = 0;
            ob.progresscallback(((this.TxTime - this.StartTime) / (1.0 * (this.MaxTime - this.StartTime))), ((this.MaxTime - this.TxTime) / 60.0).toFixed(1) + ' min remaining');
            loopfunc = setTimeout;
        }
        if (!this.Stop && this.TxTime < this.MaxTime)
            loopfunc(function () { return _this.recursiveFind(ob); }, 40);
        else
            ob.progresscallback(100, 'done');
    };
    UnspentOutputsToStake.prototype.findStake = function (mintcallback, progresscallback, setZeroTimeout) {
        var _this = this;
        if (this.arrStakeKernelTemplates.length > 0) {
            var ob = {
                progressWhen: 0,
                mintcallback: mintcallback,
                progresscallback: progresscallback,
                setZeroTimeout: setZeroTimeout
            };
            setZeroTimeout(function () { return _this.recursiveFind(ob); });
        }
    };
    return UnspentOutputsToStake;
})();
exports.UnspentOutputsToStake = UnspentOutputsToStake;
function valueToBigInt(valueBuffer) {
    if (valueBuffer instanceof BigInteger)
        return valueBuffer;
    // Prepend zero byte to prevent interpretation as negative integer
    return BigInteger.fromByteArrayUnsigned(valueBuffer);
}
exports.valueToBigInt = valueToBigInt;
/**
 * Format a Peercoin value as a string.
 *
 * Takes a BigInteger or byte-array and returns that amount of Peercoins in a
 * nice standard formatting.
 *
 * Examples:
 * 12.3555
 * 0.1234
 * 900.99998888
 * 34.00
 */
function formatValue(valueBuffer) {
    var value = valueToBigInt(valueBuffer).toString();
    var integerPart = value.length > 8 ? value.substr(0, value.length - 8) : '0';
    var decimalPart = value.length > 8 ? value.substr(value.length - 8) : value;
    while (decimalPart.length < 8)
        decimalPart = "0" + decimalPart;
    decimalPart = decimalPart.replace(/0*$/, '');
    while (decimalPart.length < 2)
        decimalPart += "0";
    return integerPart + "." + decimalPart;
}
exports.formatValue = formatValue;
/**
 * Parse a floating point string as a Peercoin value.
 *
 * Keep in mind that parsing user input is messy. You should always display
 * the parsed value back to the user to make sure we understood his input
 * correctly.
 */
function parseValue(valueString) {
    // TODO: Detect other number formats (e.g. comma as decimal separator)
    var valueComp = valueString.split('.');
    var integralPart = valueComp[0];
    var fractionalPart = valueComp[1] || "0";
    while (fractionalPart.length < 8)
        fractionalPart += "0";
    fractionalPart = fractionalPart.replace(/^0+/g, '');
    var value = BigInteger.valueOf(parseInt(integralPart));
    value = value.multiply(BigInteger.valueOf(100000000));
    value = value.add(BigInteger.valueOf(parseInt(fractionalPart)));
    return value;
}
exports.parseValue = parseValue;
/*
export function integerToBytes(e: BigInteger, t:number):number[] {
   var n = e.toByteArrayUnsigned();
   if (t < n.length)
      n = n.slice(n.length - t);
   else
      while (t > n.length)
         n.unshift(0);
   return n
}*/

},{"../lib/Base58":1,"../lib/BigInteger":2}],5:[function(require,module,exports){



//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
//var $ = require('jquery');
var BigInteger = require('./lib/BigInteger');
var Peercoin = require('./lib/Peercoin');  
var Base58 = require('./lib/Base58'); 
var ECurve = require('./lib/ECurve'); 

var zeroes = "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

function init() {
  var p="correct horse battery staple";
  $("#passphrase").val(p);
  handleInp(Peercoin.Crypto.SHA256(p, null));
  
  $("#passphrase").on("input", passphraseChanged);
  
}

function passphraseChanged (evt) {
  var phraseSHA;
  if (!evt || evt.currentTarget.value === "") {
    phraseSHA = zeroes.substr(0,64);
  } else {
    phraseSHA = Peercoin.Crypto.SHA256(evt.currentTarget.value, null);
  }
  handleInp(phraseSHA);
}
function handleInp(phraseSHA){
    // show private key
  $(".pk").text(phraseSHA);

  //display private key things
  displayPrivateKey(phraseSHA);

  //display public key things (this will call public address things as well)
  displayPublicKeyAndAddress(phraseSHA);
}
// input is private key hex
function displayPublicKeyAndAddress (hx) {

  // convert to int
  var privateKeyBN = BigInteger.fromByteArrayUnsigned(Peercoin.Crypto.hexToBytes(hx));
  if (privateKeyBN > 0) {
    var pubKey = ECurve.getPublicKey(privateKeyBN);
    $(".public-x").addClass("hex-container");
    $(".public-y").addClass("hex-container");
    $(".public-x").text(pubKey.x.toString());
    $(".public-y").text(pubKey.y.toString());

    // unhide things from invalid key
    $(".public-y-even-odd").show();
    $("#parity-arrow").css("visibility", "visible");
    $(".public-key-x-lead").css("visibility", "visible");

    var pub_key;
    if (pubKey.yParity === "even") {
      $(".public-y-even-odd").text("is EVEN.");
      $(".public-y-even-odd").css("color", "forestgreen");
      $(".public-key-x-lead").text("02");
      $(".public-key-x-lead").css("background-color", "forestgreen");
      $("#parity-arrow").attr("class", "green");
      pub_key = "02";
    } else {
      $(".public-y-even-odd").text("is ODD.");
      $(".public-y-even-odd").css("color", "firebrick");
      $(".public-key-x-lead").text("03");
      $(".public-key-x-lead").css("background-color", "firebrick");
      $("#parity-arrow").attr("class", "red");
      pub_key = "03";
    }
    var pub_key_x = pubKey.x.toString();
    $(".public-key-x").text(pub_key_x);
    pub_key += pub_key_x;

    // display public address
    displayPublicAddress(pub_key);

  } else {
    // set up for when key is invalid
    $(".public-y-even-odd").hide();
    $("#parity-arrow").css("visibility", "hidden");
    $(".public-x").text("n/a");
    $(".public-y").text("n/a");

    $(".public-key-x-lead").text("N/");
    $(".public-key-x-lead").css("background-color", "white");
    $(".public-key-x").text("A");


    $(".ripe160.hex-padding").text("N/A");
    $(".ripe160.hex-middle").html("&nbsp;N/A");

    $(".address-checksum").text("");
    $(".public-address").text("N/A");
  }
}

function displayPublicAddress (hx) {
  var sha = Peercoin.Crypto.SHA256(Peercoin.Crypto.hexToBytes(hx), null);
  var hash160 = Peercoin.Crypto.RIPEMD160(Peercoin.Crypto.hexToBytes(sha), null);
  $(".ripe160").text(hash160);

  var hashAndBytes = Peercoin.Crypto.hexToBytes(hash160);
  hashAndBytes.unshift(Peercoin.Address.networkVersion);//Peercoin Public Address lead Hex value 
  var versionAndRipe = Peercoin.Crypto.bytesToHex(hashAndBytes);
  var check = computeChecksum(versionAndRipe);
  $(".address-checksum").text(check.checksum);

  var address = Base58.encode(Peercoin.Crypto.hexToBytes(versionAndRipe + check.checksum));
  $(".public-address").text(address);
  $("#qr").html('<img src="http://chart.apis.google.com/chart?cht=qr&chl='+address+'&chs=220x220" border="0" alt="Peercoin Address" />');
}

// input is private key hex
function displayPrivateKey (hx) {
  // show checksum
  var pkWIF = "B7" + hx + "01"; //compressionflag
  var check = computeChecksum(pkWIF);
  $(".checksum-pk").text(check.checksum);
  $("#non-checksum").text(check.nonChecksum);
  pkWIF += check.checksum;

  // show private wif
  var address = Base58.encode(Peercoin.Crypto.hexToBytes(pkWIF));
  $(".private-wif").text(address);
}
 
function computeChecksum (hx) {
  var firstSHA = Peercoin.Crypto.SHA256(Peercoin.Crypto.hexToBytes(hx));
  var secondSHA = Peercoin.Crypto.SHA256(Peercoin.Crypto.hexToBytes(firstSHA));
  return {
    checksum: secondSHA.substr(0,8).toUpperCase(),
    nonChecksum: secondSHA.substr(8,secondSHA.length).toUpperCase()
  };
}
 
$(document).ready(init);



},{"./lib/Base58":1,"./lib/BigInteger":2,"./lib/ECurve":3,"./lib/Peercoin":4}]},{},[5]);
