/*
 * Canopy core — shared engine code.
 * Runs unchanged in Google Apps Script (V8), Node.js (tests/local server) and the browser.
 * Every core file attaches to one global namespace: Canopy.
 */
(function (root) {
  var C = (root.Canopy = root.Canopy || {});
  var U = (C.util = {});

  U.str = function (v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString();
    return String(v).trim();
  };

  /** Normalise free text for matching (case/whitespace/punctuation-insensitive). */
  U.norm = function (v) {
    return U.str(v)
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(the|inc|llc|nfp)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  U.normEmail = function (v) {
    return U.str(v).toLowerCase();
  };

  U.isEmail = function (v) {
    return /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i.test(U.str(v));
  };

  /** Only http(s) URLs are ever published or linked. */
  U.isHttpUrl = function (v) {
    return /^https?:\/\/[^\s<>"']+\.[^\s<>"']+$/i.test(U.str(v));
  };

  U.safeUrl = function (v) {
    var s = U.str(v);
    return U.isHttpUrl(s) ? s : '';
  };

  U.yes = function (v) {
    if (v === true) return true;
    var s = U.str(v).toLowerCase();
    return s === 'yes' || s === 'true' || s === 'y' || s === '1' || s === 'on';
  };

  U.yn = function (v) {
    return U.yes(v) ? 'yes' : 'no';
  };

  U.clip = function (v, max) {
    var s = U.str(v);
    return s.length > max ? s.slice(0, max) : s;
  };

  U.slug = function (v) {
    return U.norm(v).replace(/ /g, '-').slice(0, 40) || 'item';
  };

  U.makeId = function (prefix, ctx) {
    var raw = ctx && ctx.uuid ? ctx.uuid() : String(Math.random()).slice(2) + Date.now();
    return prefix + '-' + String(raw).replace(/[^a-z0-9]/gi, '').slice(0, 10).toLowerCase();
  };

  U.nowIso = function (ctx) {
    return (ctx && ctx.now ? ctx.now() : new Date()).toISOString();
  };

  U.parseJson = function (s, fallback) {
    try {
      return JSON.parse(s);
    } catch (e) {
      return fallback;
    }
  };

  U.list = function (v) {
    if (Array.isArray(v)) return v.map(U.str).filter(Boolean);
    return U.str(v)
      .split(/[;\n]|,(?![^(]*\))/)
      .map(function (x) {
        return x.trim();
      })
      .filter(Boolean);
  };

  /* ---------------- SHA-256 (portable, synchronous) ---------------- */
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function utf8(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        c = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00);
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  U.sha256 = function (str) {
    var bytes = utf8(String(str));
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (var s = 7; s >= 0; s--) bytes.push(s >= 4 ? 0 : (bitLen >>> (s * 8)) & 0xff);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var W = new Array(64);
    for (var off = 0; off < bytes.length; off += 64) {
      for (var t = 0; t < 16; t++) {
        W[t] = (bytes[off + 4 * t] << 24) | (bytes[off + 4 * t + 1] << 16) | (bytes[off + 4 * t + 2] << 8) | bytes[off + 4 * t + 3];
      }
      for (t = 16; t < 64; t++) {
        var x = W[t - 15], y = W[t - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[t] + W[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (v) {
      return ('00000000' + (v >>> 0).toString(16)).slice(-8);
    }).join('');
  };

  U.newToken = function (ctx) {
    var a = ctx && ctx.uuid ? ctx.uuid() : String(Math.random());
    var b = ctx && ctx.uuid ? ctx.uuid() : String(Math.random());
    return U.sha256(a + ':' + b + ':' + Date.now()).slice(0, 32);
  };

  U.tokenHash = function (token) {
    return U.sha256('canopy-token:' + U.str(token));
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
