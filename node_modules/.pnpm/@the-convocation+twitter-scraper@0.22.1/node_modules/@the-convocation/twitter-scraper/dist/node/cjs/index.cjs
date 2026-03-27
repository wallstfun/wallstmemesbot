'use strict';

var debug = require('debug');
var toughCookie = require('tough-cookie');
var setCookie = require('set-cookie-parser');
var headersPolyfill = require('headers-polyfill');
var fetch = require('cross-fetch');
var typebox = require('@sinclair/typebox');
var value = require('@sinclair/typebox/value');
var OTPAuth = require('otpauth');
var stringify = require('json-stable-stringify');
var tls = require('node:tls');
var node_crypto = require('node:crypto');

function _interopNamespaceDefault(e) {
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var OTPAuth__namespace = /*#__PURE__*/_interopNamespaceDefault(OTPAuth);

class ApiError extends Error {
  constructor(response, data) {
    super(
      `Response status: ${response.status} | headers: ${JSON.stringify(
        headersToString(response.headers)
      )} | data: ${typeof data === "string" ? data : JSON.stringify(data)}`
    );
    this.response = response;
    this.data = data;
  }
  static async fromResponse(response) {
    let data = void 0;
    try {
      if (response.headers.get("content-type")?.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }
    } catch {
      try {
        data = await response.text();
      } catch {
      }
    }
    return new ApiError(response, data);
  }
}
function headersToString(headers) {
  const result = [];
  headers.forEach((value, key) => {
    result.push(`${key}: ${value}`);
  });
  return result.join("\n");
}
class AuthenticationError extends Error {
  constructor(message) {
    super(message || "Authentication failed");
    this.name = "AuthenticationError";
  }
}

const log$8 = debug("twitter-scraper:rate-limit");
class WaitingRateLimitStrategy {
  async onRateLimit({ response: res }) {
    const xRateLimitLimit = res.headers.get("x-rate-limit-limit");
    const xRateLimitRemaining = res.headers.get("x-rate-limit-remaining");
    const xRateLimitReset = res.headers.get("x-rate-limit-reset");
    log$8(
      `Rate limit event: limit=${xRateLimitLimit}, remaining=${xRateLimitRemaining}, reset=${xRateLimitReset}`
    );
    if (xRateLimitRemaining == "0" && xRateLimitReset) {
      const currentTime = (/* @__PURE__ */ new Date()).valueOf() / 1e3;
      const timeDeltaMs = 1e3 * (parseInt(xRateLimitReset) - currentTime);
      await new Promise((resolve) => setTimeout(resolve, timeDeltaMs));
    }
  }
}
class ErrorRateLimitStrategy {
  async onRateLimit({ response: res }) {
    throw await ApiError.fromResponse(res);
  }
}

const log$7 = debug("twitter-scraper:castle");
var FieldEncoding = /* @__PURE__ */ ((FieldEncoding2) => {
  FieldEncoding2[FieldEncoding2["Empty"] = -1] = "Empty";
  FieldEncoding2[FieldEncoding2["Marker"] = 1] = "Marker";
  FieldEncoding2[FieldEncoding2["Byte"] = 3] = "Byte";
  FieldEncoding2[FieldEncoding2["EncryptedBytes"] = 4] = "EncryptedBytes";
  FieldEncoding2[FieldEncoding2["CompactInt"] = 5] = "CompactInt";
  FieldEncoding2[FieldEncoding2["RoundedByte"] = 6] = "RoundedByte";
  FieldEncoding2[FieldEncoding2["RawAppend"] = 7] = "RawAppend";
  return FieldEncoding2;
})(FieldEncoding || {});
const TWITTER_CASTLE_PK = "AvRa79bHyJSYSQHnRpcVtzyxetSvFerx";
const XXTEA_KEY = [1164413191, 3891440048, 185273099, 2746598870];
const PER_FIELD_KEY_TAIL = [
  16373134,
  643144773,
  1762804430,
  1186572681,
  1164413191
];
const TS_EPOCH = 1535e6;
const SDK_VERSION = 27008;
const TOKEN_VERSION = 11;
const FP_PART = {
  DEVICE: 0,
  // Part 1: hardware/OS/rendering fingerprint
  BROWSER: 4,
  // Part 2: browser environment fingerprint
  TIMING: 7
  // Part 3: timing-based fingerprint
};
const DEFAULT_PROFILE = {
  locale: "en-US",
  language: "en",
  timezone: "America/New_York",
  screenWidth: 1920,
  screenHeight: 1080,
  availableWidth: 1920,
  availableHeight: 1032,
  // 1080 minus Windows taskbar (~48px)
  gpuRenderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)",
  deviceMemoryGB: 8,
  hardwareConcurrency: 24,
  colorDepth: 24,
  devicePixelRatio: 1
};
const SCREEN_RESOLUTIONS = [
  { w: 1920, h: 1080, ah: 1032 },
  { w: 2560, h: 1440, ah: 1392 },
  { w: 1366, h: 768, ah: 720 },
  { w: 1536, h: 864, ah: 816 },
  { w: 1440, h: 900, ah: 852 },
  { w: 1680, h: 1050, ah: 1002 },
  { w: 3840, h: 2160, ah: 2112 }
];
const DEVICE_MEMORY_VALUES = [4, 8, 8, 16];
const HARDWARE_CONCURRENCY_VALUES = [4, 8, 8, 12, 16, 24];
function randomizeBrowserProfile() {
  const screen = SCREEN_RESOLUTIONS[randInt(0, SCREEN_RESOLUTIONS.length - 1)];
  return {
    ...DEFAULT_PROFILE,
    screenWidth: screen.w,
    screenHeight: screen.h,
    availableWidth: screen.w,
    availableHeight: screen.ah,
    // gpuRenderer intentionally NOT randomized — see JSDoc above
    deviceMemoryGB: DEVICE_MEMORY_VALUES[randInt(0, DEVICE_MEMORY_VALUES.length - 1)],
    hardwareConcurrency: HARDWARE_CONCURRENCY_VALUES[randInt(0, HARDWARE_CONCURRENCY_VALUES.length - 1)]
  };
}
function getRandomBytes(n) {
  const buf = new Uint8Array(n);
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
}
function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}
function randFloat(min, max) {
  return min + Math.random() * (max - min);
}
function concat(...arrays) {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}
function toHex(input) {
  return Array.from(input).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2)
    out[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return out;
}
function textEnc(s) {
  return new TextEncoder().encode(s);
}
function u8(...vals) {
  return new Uint8Array(vals);
}
function be16(v) {
  return u8(v >>> 8 & 255, v & 255);
}
function be32(v) {
  return u8(v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255);
}
function xorBytes(data, key) {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
  return out;
}
function xorNibbles(nibbles, keyNibble) {
  const k = parseInt(keyNibble, 16);
  return nibbles.split("").map((n) => (parseInt(n, 16) ^ k).toString(16)).join("");
}
function base64url(data) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64url");
  }
  let bin = "";
  for (let i = 0; i < data.length; i++) bin += String.fromCharCode(data[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function xxteaEncrypt(data, key) {
  const padLen = Math.ceil(data.length / 4) * 4;
  const padded = new Uint8Array(padLen);
  padded.set(data);
  const n = padLen / 4;
  const v = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    v[i] = (padded[i * 4] | padded[i * 4 + 1] << 8 | padded[i * 4 + 2] << 16 | padded[i * 4 + 3] << 24) >>> 0;
  }
  if (n <= 1) return padded;
  const k = new Uint32Array(key.map((x) => x >>> 0));
  const DELTA = 2654435769;
  const u = n - 1;
  let sum = 0;
  let z = v[u];
  let y;
  let rounds = 6 + Math.floor(52 / (u + 1));
  while (rounds-- > 0) {
    sum = sum + DELTA >>> 0;
    const e = sum >>> 2 & 3;
    for (let p = 0; p < u; p++) {
      y = v[p + 1];
      const mx2 = ((z >>> 5 ^ y << 2) >>> 0) + ((y >>> 3 ^ z << 4) >>> 0) ^ ((sum ^ y) >>> 0) + ((k[p & 3 ^ e] ^ z) >>> 0);
      v[p] = v[p] + mx2 >>> 0;
      z = v[p];
    }
    y = v[0];
    const mx = ((z >>> 5 ^ y << 2) >>> 0) + ((y >>> 3 ^ z << 4) >>> 0) ^ ((sum ^ y) >>> 0) + ((k[u & 3 ^ e] ^ z) >>> 0);
    v[u] = v[u] + mx >>> 0;
    z = v[u];
  }
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = v[i] & 255;
    out[i * 4 + 1] = v[i] >>> 8 & 255;
    out[i * 4 + 2] = v[i] >>> 16 & 255;
    out[i * 4 + 3] = v[i] >>> 24 & 255;
  }
  return out;
}
function fieldEncrypt(data, fieldIndex, initTime) {
  return xxteaEncrypt(data, [
    fieldIndex,
    Math.floor(initTime),
    ...PER_FIELD_KEY_TAIL
  ]);
}
function encodeTimestampBytes(ms) {
  let t = Math.floor(ms / 1e3 - TS_EPOCH);
  t = Math.max(Math.min(t, 268435455), 0);
  return be32(t);
}
function xorAndAppendKey(buf, key) {
  const hex = toHex(buf);
  const keyNib = (key & 15).toString(16);
  return xorNibbles(hex.substring(1), keyNib) + keyNib;
}
function encodeTimestampEncrypted(ms) {
  const tsBytes = encodeTimestampBytes(ms);
  const slice = Math.floor(ms) % 1e3;
  const sliceBytes = be16(slice);
  const k = randInt(0, 15);
  return xorAndAppendKey(tsBytes, k) + xorAndAppendKey(sliceBytes, k);
}
function deriveAndXor(keyHex, sliceLen, rotChar, data) {
  const sub = keyHex.substring(0, sliceLen).split("");
  if (sub.length === 0) return data;
  const rot = parseInt(rotChar, 16) % sub.length;
  const rotated = sub.slice(rot).concat(sub.slice(0, rot)).join("");
  return xorBytes(data, fromHex(rotated));
}
function customFloatEncode(expBits, manBits, value) {
  if (value === 0) return 0;
  let n = Math.abs(value);
  let exp = 0;
  while (2 <= n) {
    n /= 2;
    exp++;
  }
  while (n < 1 && n > 0) {
    n *= 2;
    exp--;
  }
  exp = Math.min(exp, (1 << expBits) - 1);
  const frac = n - Math.floor(n);
  let mantissa = 0;
  if (frac > 0) {
    let pos = 1;
    let tmp = frac;
    while (tmp !== 0 && pos <= manBits) {
      tmp *= 2;
      const bit = Math.floor(tmp);
      mantissa |= bit << manBits - pos;
      tmp -= bit;
      pos++;
    }
  }
  return exp << manBits | mantissa;
}
function encodeFloatVal(v) {
  const n = Math.max(v, 0);
  if (n <= 15) return 64 | customFloatEncode(2, 4, n + 1);
  return 128 | customFloatEncode(4, 3, n - 14);
}
function encodeField(index, encoding, val, initTime) {
  const hdr = u8((31 & index) << 3 | 7 & encoding);
  if (encoding === -1 /* Empty */ || encoding === 1 /* Marker */)
    return hdr;
  let body;
  switch (encoding) {
    case 3 /* Byte */:
      body = u8(val);
      break;
    case 6 /* RoundedByte */:
      body = u8(Math.round(val));
      break;
    case 5 /* CompactInt */: {
      const v = val;
      body = v <= 127 ? u8(v) : be16(1 << 15 | 32767 & v);
      break;
    }
    case 4 /* EncryptedBytes */: {
      if (initTime == null) {
        throw new Error("initTime is required for EncryptedBytes encoding");
      }
      const enc = fieldEncrypt(val, index, initTime);
      body = concat(u8(enc.length), enc);
      break;
    }
    case 7 /* RawAppend */:
      body = val instanceof Uint8Array ? val : u8(val);
      break;
    default:
      body = new Uint8Array(0);
  }
  return concat(hdr, body);
}
function encodeBits(bits, byteSize) {
  const numBytes = byteSize / 8;
  const arr = new Uint8Array(numBytes);
  for (const bit of bits) {
    const bi = numBytes - 1 - Math.floor(bit / 8);
    if (bi >= 0 && bi < numBytes) arr[bi] |= 1 << bit % 8;
  }
  return arr;
}
function screenDimBytes(screen, avail) {
  const r = 32767 & screen;
  const e = 65535 & avail;
  return r === e ? be16(32768 | r) : concat(be16(r), be16(e));
}
function boolsToBin(arr, totalBits) {
  const e = arr.length > totalBits ? arr.slice(0, totalBits) : arr;
  const c = e.length;
  let r = 0;
  for (let i = c - 1; i >= 0; i--) {
    if (e[i]) r |= 1 << c - i - 1;
  }
  if (c < totalBits) r <<= totalBits - c;
  return r;
}
function encodeCodecPlayability() {
  const codecs = {
    webm: 2,
    // VP8/VP9
    mp4: 2,
    // H.264
    ogg: 0,
    // Theora (Chrome dropped support)
    aac: 2,
    // AAC audio
    xm4a: 1,
    // M4A container
    wav: 2,
    // PCM audio
    mpeg: 2,
    // MP3 audio
    ogg2: 2
    // Vorbis audio
  };
  const bits = Object.values(codecs).map((c) => c.toString(2).padStart(2, "0")).join("");
  return be16(parseInt(bits, 2));
}
const TIMEZONE_ENUM = {
  "America/New_York": 0,
  "America/Sao_Paulo": 1,
  "America/Chicago": 2,
  "America/Los_Angeles": 3,
  "America/Mexico_City": 4,
  "Asia/Shanghai": 5
};
function getTimezoneInfo(tz) {
  const knownOffsets = {
    "America/New_York": { offset: 20, dstDiff: 4 },
    "America/Chicago": { offset: 24, dstDiff: 4 },
    "America/Los_Angeles": { offset: 32, dstDiff: 4 },
    "America/Denver": { offset: 28, dstDiff: 4 },
    "America/Sao_Paulo": { offset: 12, dstDiff: 4 },
    "America/Mexico_City": { offset: 24, dstDiff: 4 },
    "Asia/Shanghai": { offset: 246, dstDiff: 0 },
    "Asia/Tokyo": { offset: 220, dstDiff: 0 },
    "Europe/London": { offset: 0, dstDiff: 4 },
    "Europe/Berlin": { offset: 252, dstDiff: 4 },
    UTC: { offset: 0, dstDiff: 0 }
  };
  try {
    const now = /* @__PURE__ */ new Date();
    const jan = new Date(now.getFullYear(), 0, 1);
    const jul = new Date(now.getFullYear(), 6, 1);
    const getOffset = (date, zone) => {
      const utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
      const local = new Date(date.toLocaleString("en-US", { timeZone: zone }));
      return (utc.getTime() - local.getTime()) / 6e4;
    };
    const currentOffset = getOffset(now, tz);
    const janOffset = getOffset(jan, tz);
    const julOffset = getOffset(jul, tz);
    const dstDifference = Math.abs(janOffset - julOffset);
    return {
      offset: Math.floor(currentOffset / 15) & 255,
      dstDiff: Math.floor(dstDifference / 15) & 255
    };
  } catch {
    return knownOffsets[tz] || { offset: 20, dstDiff: 4 };
  }
}
function buildDeviceFingerprint(initTime, profile, userAgent) {
  const tz = getTimezoneInfo(profile.timezone);
  const { Byte, EncryptedBytes, CompactInt, RoundedByte, RawAppend } = FieldEncoding;
  const encryptedUA = fieldEncrypt(textEnc(userAgent), 12, initTime);
  const uaPayload = concat(u8(1), u8(encryptedUA.length), encryptedUA);
  const fields = [
    encodeField(0, Byte, 1),
    // Platform: Win32
    encodeField(1, Byte, 0),
    // Vendor: Google Inc.
    encodeField(2, EncryptedBytes, textEnc(profile.locale), initTime),
    // Locale
    encodeField(3, RoundedByte, profile.deviceMemoryGB * 10),
    // Device memory (GB * 10)
    encodeField(
      4,
      RawAppend,
      concat(
        // Screen dimensions (width + height)
        screenDimBytes(profile.screenWidth, profile.availableWidth),
        screenDimBytes(profile.screenHeight, profile.availableHeight)
      )
    ),
    encodeField(5, CompactInt, profile.colorDepth),
    // Screen color depth
    encodeField(6, CompactInt, profile.hardwareConcurrency),
    // CPU logical cores
    encodeField(7, RoundedByte, profile.devicePixelRatio * 10),
    // Pixel ratio (* 10)
    encodeField(8, RawAppend, u8(tz.offset, tz.dstDiff)),
    // Timezone offset info
    // MIME type hash — captured from Chrome 144 on Windows 10.
    // Source: yubie-re/castleio-gen (Python SDK, MIT license).
    encodeField(9, RawAppend, u8(2, 125, 95, 201, 167)),
    // Browser plugins hash — Chrome no longer exposes plugins to navigator.plugins,
    // so this is a fixed hash. Source: yubie-re/castleio-gen (Python SDK, MIT license).
    encodeField(10, RawAppend, u8(5, 114, 147, 2, 8)),
    encodeField(
      11,
      RawAppend,
      // Browser feature flags
      concat(u8(12), encodeBits([0, 1, 2, 3, 4, 5, 6], 16))
    ),
    encodeField(12, RawAppend, uaPayload),
    // User agent (encrypted)
    // Canvas font rendering hash — generated by Castle.io SDK's canvas fingerprinting (text rendering).
    // Captured from Chrome 144 on Windows 10. Source: yubie-re/castleio-gen (Python SDK, MIT license).
    encodeField(13, EncryptedBytes, textEnc("54b4b5cf"), initTime),
    encodeField(
      14,
      RawAppend,
      // Media input devices
      concat(u8(3), encodeBits([0, 1, 2], 8))
    ),
    // Fields 15 (DoNotTrack) and 16 (JavaEnabled) intentionally omitted
    encodeField(17, Byte, 0),
    // productSub type
    // Canvas circle rendering hash — generated by Castle.io SDK's canvas fingerprinting (arc drawing).
    // Captured from Chrome 144 on Windows 10. Source: yubie-re/castleio-gen (Python SDK, MIT license).
    encodeField(18, EncryptedBytes, textEnc("c6749e76"), initTime),
    encodeField(19, EncryptedBytes, textEnc(profile.gpuRenderer), initTime),
    // WebGL renderer
    encodeField(
      20,
      EncryptedBytes,
      // Epoch locale string
      textEnc("12/31/1969, 7:00:00 PM"),
      initTime
    ),
    encodeField(
      21,
      RawAppend,
      // WebDriver flags (none set)
      concat(u8(8), encodeBits([], 8))
    ),
    encodeField(22, CompactInt, 33),
    // eval.toString() length
    // Field 23 (navigator.buildID) intentionally omitted (Chrome doesn't have it)
    encodeField(24, CompactInt, 12549),
    // Max recursion depth
    encodeField(25, Byte, 0),
    // Recursion error message type
    encodeField(26, Byte, 1),
    // Recursion error name type
    encodeField(27, CompactInt, 4644),
    // Stack trace string length
    encodeField(28, RawAppend, u8(0)),
    // Touch support metric
    encodeField(29, Byte, 3),
    // Undefined call error type
    // Navigator properties hash — hash of enumerable navigator property names.
    // Captured from Chrome 144 on Windows 10. Source: yubie-re/castleio-gen (Python SDK, MIT license).
    encodeField(30, RawAppend, u8(93, 197, 171, 181, 136)),
    encodeField(31, RawAppend, encodeCodecPlayability())
    // Codec playability
  ];
  const data = concat(...fields);
  const sizeIdx = (7 & FP_PART.DEVICE) << 5 | 31 & fields.length;
  return concat(u8(sizeIdx), data);
}
function buildBrowserFingerprint(profile, initTime) {
  const { Byte, EncryptedBytes, CompactInt, Marker, RawAppend } = FieldEncoding;
  const timezoneField = profile.timezone in TIMEZONE_ENUM ? encodeField(1, Byte, TIMEZONE_ENUM[profile.timezone]) : encodeField(1, EncryptedBytes, textEnc(profile.timezone), initTime);
  const fields = [
    encodeField(0, Byte, 0),
    // Constant marker
    timezoneField,
    // Timezone
    encodeField(
      2,
      EncryptedBytes,
      // Language list
      textEnc(`${profile.locale},${profile.language}`),
      initTime
    ),
    encodeField(6, CompactInt, 0),
    // Expected property count
    encodeField(
      10,
      RawAppend,
      // Castle data bitfield
      concat(u8(4), encodeBits([1, 2, 3], 8))
    ),
    encodeField(12, CompactInt, 80),
    // Negative error string length
    encodeField(13, RawAppend, u8(9, 0, 0)),
    // Driver check values
    encodeField(
      17,
      RawAppend,
      // Chrome feature flags
      concat(u8(13), encodeBits([1, 5, 8, 9, 10], 16))
    ),
    encodeField(18, Marker, 0),
    // Device logic expected
    encodeField(21, RawAppend, u8(0, 0, 0, 0)),
    // Class properties count
    encodeField(22, EncryptedBytes, textEnc(profile.locale), initTime),
    // User locale (secondary)
    encodeField(
      23,
      RawAppend,
      // Worker capabilities
      concat(u8(2), encodeBits([0], 8))
    ),
    encodeField(
      24,
      RawAppend,
      // Inner/outer dimension diff
      concat(be16(0), be16(randInt(10, 30)))
    )
  ];
  const data = concat(...fields);
  const sizeIdx = (7 & FP_PART.BROWSER) << 5 | 31 & fields.length;
  return concat(u8(sizeIdx), data);
}
function buildTimingFingerprint(initTime) {
  const minute = new Date(initTime).getUTCMinutes();
  const fields = [
    encodeField(3, 5 /* CompactInt */, 1),
    // Time since window.open (ms)
    encodeField(4, 5 /* CompactInt */, minute)
    // Castle init time (minutes)
  ];
  const data = concat(...fields);
  const sizeIdx = (7 & FP_PART.TIMING) << 5 | 31 & fields.length;
  return concat(u8(sizeIdx), data);
}
const EventType = {
  CLICK: 0,
  FOCUS: 5,
  BLUR: 6,
  ANIMATIONSTART: 18,
  MOUSEMOVE: 21,
  MOUSELEAVE: 25,
  MOUSEENTER: 26,
  RESIZE: 27
};
const HAS_TARGET_FLAG = 128;
const TARGET_UNKNOWN = 63;
function generateEventLog() {
  const simpleEvents = [
    EventType.MOUSEMOVE,
    EventType.ANIMATIONSTART,
    EventType.MOUSELEAVE,
    EventType.MOUSEENTER,
    EventType.RESIZE
  ];
  const targetedEvents = [
    EventType.CLICK,
    EventType.BLUR,
    EventType.FOCUS
  ];
  const allEvents = [...simpleEvents, ...targetedEvents];
  const count = randInt(30, 70);
  const eventBytes = [];
  for (let i = 0; i < count; i++) {
    const eventId = allEvents[randInt(0, allEvents.length - 1)];
    if (targetedEvents.includes(eventId)) {
      eventBytes.push(eventId | HAS_TARGET_FLAG);
      eventBytes.push(TARGET_UNKNOWN);
    } else {
      eventBytes.push(eventId);
    }
  }
  const inner = concat(u8(0), be16(count), new Uint8Array(eventBytes));
  return concat(be16(inner.length), inner);
}
function buildBehavioralBitfield() {
  const flags = new Array(15).fill(false);
  flags[2] = true;
  flags[3] = true;
  flags[5] = true;
  flags[6] = true;
  flags[9] = true;
  flags[11] = true;
  flags[12] = true;
  const packedBits = boolsToBin(flags, 16);
  const encoded = 6 << 20 | 2 << 16 | 65535 & packedBits;
  return u8(encoded >>> 16 & 255, encoded >>> 8 & 255, encoded & 255);
}
const NO_DATA = -1;
function buildFloatMetrics() {
  const metrics = [
    // ── Mouse & key timing ──
    randFloat(40, 50),
    //  0: Mouse angle vector mean
    NO_DATA,
    //  1: Touch angle vector (no touch device)
    randFloat(70, 80),
    //  2: Key same-time difference
    NO_DATA,
    //  3: (unused)
    randFloat(60, 70),
    //  4: Mouse down-to-up time mean
    NO_DATA,
    //  5: (unused)
    0,
    //  6: (zero placeholder)
    0,
    //  7: Mouse click time difference
    // ── Duration distributions ──
    randFloat(60, 80),
    //  8: Mouse down-up duration median
    randFloat(5, 10),
    //  9: Mouse down-up duration std deviation
    randFloat(30, 40),
    // 10: Key press duration median
    randFloat(2, 5),
    // 11: Key press duration std deviation
    // ── Touch metrics (all disabled for desktop) ──
    NO_DATA,
    NO_DATA,
    NO_DATA,
    NO_DATA,
    // 12-15
    NO_DATA,
    NO_DATA,
    NO_DATA,
    NO_DATA,
    // 16-19
    // ── Mouse trajectory analysis ──
    randFloat(150, 180),
    // 20: Mouse movement angle mean
    randFloat(3, 6),
    // 21: Mouse movement angle std deviation
    randFloat(150, 180),
    // 22: Mouse movement angle mean (500ms window)
    randFloat(3, 6),
    // 23: Mouse movement angle std (500ms window)
    randFloat(0, 2),
    // 24: Mouse position deviation X
    randFloat(0, 2),
    // 25: Mouse position deviation Y
    0,
    0,
    // 26-27: (zero placeholders)
    // ── Touch sequential/gesture metrics (disabled) ──
    NO_DATA,
    NO_DATA,
    // 28-29
    NO_DATA,
    NO_DATA,
    // 30-31
    // ── Key pattern analysis ──
    0,
    0,
    // 32-33: Letter-digit transition ratio
    0,
    0,
    // 34-35: Digit-invalid transition ratio
    0,
    0,
    // 36-37: Double-invalid transition ratio
    // ── Mouse vector differences ──
    1,
    0,
    // 38-39: Mouse vector diff (mean, std)
    1,
    0,
    // 40-41: Mouse vector diff 2 (mean, std)
    randFloat(0, 4),
    // 42: Mouse vector diff (500ms mean)
    randFloat(0, 3),
    // 43: Mouse vector diff (500ms std)
    // ── Rounded movement metrics ──
    randFloat(25, 50),
    // 44: Mouse time diff (rounded mean)
    randFloat(25, 50),
    // 45: Mouse time diff (rounded std)
    randFloat(25, 50),
    // 46: Mouse vector diff (rounded mean)
    randFloat(25, 30),
    // 47: Mouse vector diff (rounded std)
    // ── Speed change analysis ──
    randFloat(0, 2),
    // 48: Mouse speed change mean
    randFloat(0, 1),
    // 49: Mouse speed change std
    randFloat(0, 1),
    // 50: Mouse vector 500ms aggregate
    // ── Trailing ──
    1,
    // 51: Universal flag
    0
    // 52: Terminator
  ];
  const out = new Uint8Array(metrics.length);
  for (let i = 0; i < metrics.length; i++) {
    out[i] = metrics[i] === NO_DATA ? 0 : encodeFloatVal(metrics[i]);
  }
  return out;
}
function buildEventCounts() {
  const counts = [
    randInt(100, 200),
    //  0: mousemove events
    randInt(1, 5),
    //  1: keyup events
    randInt(1, 5),
    //  2: click events
    0,
    //  3: touchstart events (none on desktop)
    randInt(0, 5),
    //  4: keydown events
    0,
    //  5: touchmove events (none)
    0,
    //  6: mousedown-mouseup pairs
    0,
    //  7: vector diff samples
    randInt(0, 5),
    //  8: wheel events
    randInt(0, 11),
    //  9: (internal counter)
    randInt(0, 1)
    // 10: (internal counter)
  ];
  return concat(new Uint8Array(counts), u8(counts.length));
}
function buildBehavioralData() {
  return concat(
    buildBehavioralBitfield(),
    buildFloatMetrics(),
    buildEventCounts()
  );
}
function buildTokenHeader(uuid, publisherKey, initTime) {
  const timestamp = fromHex(encodeTimestampEncrypted(initTime));
  const version = be16(SDK_VERSION);
  const pkBytes = textEnc(publisherKey);
  const uuidBytes = fromHex(uuid);
  return concat(timestamp, version, pkBytes, uuidBytes);
}
function generateLocalCastleToken(userAgent, profileOverride) {
  const now = Date.now();
  const profile = { ...DEFAULT_PROFILE, ...profileOverride };
  const initTime = now - randFloat(2 * 60 * 1e3, 30 * 60 * 1e3);
  log$7("Generating local Castle.io v11 token");
  const deviceFp = buildDeviceFingerprint(initTime, profile, userAgent);
  const browserFp = buildBrowserFingerprint(profile, initTime);
  const timingFp = buildTimingFingerprint(initTime);
  const eventLog = generateEventLog();
  const behavioral = buildBehavioralData();
  const fingerprintData = concat(
    deviceFp,
    browserFp,
    timingFp,
    eventLog,
    behavioral,
    u8(255)
  );
  const sendTime = Date.now();
  const timestampKey = encodeTimestampEncrypted(sendTime);
  const xorPass1 = deriveAndXor(
    timestampKey,
    4,
    timestampKey[3],
    fingerprintData
  );
  const tokenUuid = toHex(getRandomBytes(16));
  const withTimestampPrefix = concat(fromHex(timestampKey), xorPass1);
  const xorPass2 = deriveAndXor(
    tokenUuid,
    8,
    tokenUuid[9],
    withTimestampPrefix
  );
  const header = buildTokenHeader(tokenUuid, TWITTER_CASTLE_PK, initTime);
  const plaintext = concat(header, xorPass2);
  const encrypted = xxteaEncrypt(plaintext, XXTEA_KEY);
  const paddingBytes = encrypted.length - plaintext.length;
  const versioned = concat(u8(TOKEN_VERSION, paddingBytes), encrypted);
  const randomByte = getRandomBytes(1)[0];
  const checksum = versioned.length * 2 & 255;
  const withChecksum = concat(versioned, u8(checksum));
  const xored = xorBytes(withChecksum, u8(randomByte));
  const finalPayload = concat(u8(randomByte), xored);
  const token = base64url(finalPayload);
  log$7(
    `Generated castle token: ${token.length} chars, cuid: ${tokenUuid.substring(
      0,
      6
    )}...`
  );
  return { token, cuid: tokenUuid };
}

const log$6 = debug("twitter-scraper:requests");
async function updateCookieJar(cookieJar, headers) {
  let setCookieHeaders = [];
  if (typeof headers.getSetCookie === "function") {
    setCookieHeaders = headers.getSetCookie();
  } else {
    const setCookieHeader = headers.get("set-cookie");
    if (setCookieHeader) {
      setCookieHeaders = setCookie.splitCookiesString(setCookieHeader);
    }
  }
  if (setCookieHeaders.length > 0) {
    for (const cookieStr of setCookieHeaders) {
      const cookie = toughCookie.Cookie.parse(cookieStr);
      if (!cookie) {
        log$6(`Failed to parse cookie: ${cookieStr.substring(0, 100)}`);
        continue;
      }
      if (cookie.maxAge === 0 || cookie.expires && cookie.expires < /* @__PURE__ */ new Date()) {
        if (cookie.key === "ct0") {
          log$6(`Skipping deletion of ct0 cookie (Max-Age=0)`);
        }
        continue;
      }
      try {
        const url = `${cookie.secure ? "https" : "http"}://${cookie.domain}${cookie.path}`;
        await cookieJar.setCookie(cookie, url);
        if (cookie.key === "ct0") {
          log$6(
            `Successfully set ct0 cookie with value: ${cookie.value.substring(
              0,
              20
            )}...`
          );
        }
      } catch (err) {
        log$6(`Failed to set cookie ${cookie.key}: ${err}`);
        if (cookie.key === "ct0") {
          log$6(`FAILED to set ct0 cookie! Error: ${err}`);
        }
      }
    }
  } else if (typeof document !== "undefined") {
    for (const cookie of document.cookie.split(";")) {
      const hardCookie = toughCookie.Cookie.parse(cookie);
      if (hardCookie) {
        await cookieJar.setCookie(hardCookie, document.location.toString());
      }
    }
  }
}

const log$5 = debug("twitter-scraper:xpff");
let isoCrypto = null;
async function getCrypto() {
  if (isoCrypto != null) {
    return isoCrypto;
  }
  if (typeof crypto === "undefined") {
    log$5("Global crypto is undefined, importing from crypto module...");
    const { webcrypto } = await import('crypto');
    isoCrypto = webcrypto;
    return webcrypto;
  }
  isoCrypto = crypto;
  return crypto;
}
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const crypto2 = await getCrypto();
  const hashBuffer = await crypto2.subtle.digest("SHA-256", msgBuffer);
  return new Uint8Array(hashBuffer);
}
function buf2hex(buffer) {
  return [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
class XPFFHeaderGenerator {
  constructor(seed) {
    this.seed = seed;
  }
  async deriveKey(guestId) {
    const combined = `${this.seed}${guestId}`;
    const result = await sha256(combined);
    return result;
  }
  async generateHeader(plaintext, guestId) {
    log$5(`Generating XPFF key for guest ID: ${guestId}`);
    const key = await this.deriveKey(guestId);
    const crypto2 = await getCrypto();
    const nonce = crypto2.getRandomValues(new Uint8Array(12));
    const cipher = await crypto2.subtle.importKey(
      "raw",
      key,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );
    const encrypted = await crypto2.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce
      },
      cipher,
      new TextEncoder().encode(plaintext)
    );
    const combined = new Uint8Array(nonce.length + encrypted.byteLength);
    combined.set(nonce);
    combined.set(new Uint8Array(encrypted), nonce.length);
    const result = buf2hex(combined.buffer);
    log$5(`XPFF header generated for guest ID ${guestId}: ${result}`);
    return result;
  }
}
const xpffBaseKey = "0e6be1f1e21ffc33590b888fd4dc81b19713e570e805d4e5df80a493c9571a05";
function xpffPlain() {
  const timestamp = Date.now();
  return JSON.stringify({
    navigator_properties: {
      hasBeenActive: "true",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      webdriver: "false"
    },
    created_at: timestamp
  });
}
async function generateXPFFHeader(guestId) {
  const generator = new XPFFHeaderGenerator(xpffBaseKey);
  const plaintext = xpffPlain();
  return generator.generateHeader(plaintext, guestId);
}

const log$4 = debug("twitter-scraper:auth");
function withTransform(fetchFn, transform) {
  return async (input, init) => {
    const fetchArgs = await transform?.request?.(input, init) ?? [
      input,
      init
    ];
    const res = await fetchFn(...fetchArgs);
    return await transform?.response?.(res) ?? res;
  };
}
class TwitterGuestAuth {
  constructor(bearerToken, options) {
    this.options = options;
    this.fetch = withTransform(options?.fetch ?? fetch, options?.transform);
    this.rateLimitStrategy = options?.rateLimitStrategy ?? new WaitingRateLimitStrategy();
    this.bearerToken = bearerToken;
    this.jar = new toughCookie.CookieJar();
  }
  async onRateLimit(event) {
    await this.rateLimitStrategy.onRateLimit(event);
  }
  cookieJar() {
    return this.jar;
  }
  isLoggedIn() {
    return Promise.resolve(false);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  login(_username, _password, _email) {
    return this.updateGuestToken();
  }
  logout() {
    this.deleteToken();
    this.jar = new toughCookie.CookieJar();
    return Promise.resolve();
  }
  deleteToken() {
    delete this.guestToken;
    delete this.guestCreatedAt;
  }
  hasToken() {
    return this.guestToken != null;
  }
  authenticatedAt() {
    if (this.guestCreatedAt == null) {
      return null;
    }
    return new Date(this.guestCreatedAt);
  }
  /**
   * Install only authentication credentials (bearer token, guest token, cookies)
   * without browser fingerprint or platform headers. Useful for callers that
   * build their own header set (e.g. the login flow).
   */
  async installAuthCredentials(headers, bearerTokenOverride) {
    const tokenToUse = bearerTokenOverride ?? this.bearerToken;
    headers.set("authorization", `Bearer ${tokenToUse}`);
    if (!bearerTokenOverride) {
      if (this.shouldUpdate()) {
        await this.updateGuestToken();
      }
      if (this.guestToken) {
        headers.set("x-guest-token", this.guestToken);
      }
    }
    headers.set("cookie", await this.getCookieString());
  }
  async installTo(headers, url, bearerTokenOverride) {
    await this.installAuthCredentials(headers, bearerTokenOverride);
    headers.set("user-agent", CHROME_USER_AGENT);
    if (!headers.has("accept")) {
      headers.set("accept", "*/*");
    }
    headers.set("accept-language", "en-US,en;q=0.9");
    headers.set("sec-ch-ua", CHROME_SEC_CH_UA);
    headers.set("sec-ch-ua-mobile", "?0");
    headers.set("sec-ch-ua-platform", '"Windows"');
    headers.set("referer", "https://x.com/");
    headers.set("origin", "https://x.com");
    headers.set("sec-fetch-site", "same-site");
    headers.set("sec-fetch-mode", "cors");
    headers.set("sec-fetch-dest", "empty");
    headers.set("priority", "u=1, i");
    if (!headers.has("content-type") && (url.includes("api.x.com/graphql/") || url.includes("x.com/i/api/graphql/"))) {
      headers.set("content-type", "application/json");
    }
    await this.installCsrfToken(headers);
    if (this.options?.experimental?.xpff) {
      const guestId = await this.guestId();
      if (guestId != null) {
        const xpffHeader = await generateXPFFHeader(guestId);
        headers.set("x-xp-forwarded-for", xpffHeader);
      }
    }
  }
  async installCsrfToken(headers) {
    const cookies = await this.getCookies();
    const xCsrfToken = cookies.find((cookie) => cookie.key === "ct0");
    if (xCsrfToken) {
      headers.set("x-csrf-token", xCsrfToken.value);
    }
  }
  async setCookie(key, value) {
    const cookie = toughCookie.Cookie.parse(`${key}=${value}`);
    if (!cookie) {
      throw new Error("Failed to parse cookie.");
    }
    await this.jar.setCookie(cookie, this.getCookieJarUrl());
    if (typeof document !== "undefined") {
      document.cookie = cookie.toString();
    }
  }
  async getCookies() {
    return this.jar.getCookies(this.getCookieJarUrl());
  }
  async getCookieString() {
    const cookies = await this.getCookies();
    return cookies.map((cookie) => `${cookie.key}=${cookie.value}`).join("; ");
  }
  async removeCookie(key) {
    const store = this.jar.store;
    const cookies = await this.jar.getCookies(this.getCookieJarUrl());
    for (const cookie of cookies) {
      if (!cookie.domain || !cookie.path) continue;
      await store.removeCookie(cookie.domain, cookie.path, key);
      if (typeof document !== "undefined") {
        document.cookie = `${cookie.key}=; Max-Age=0; path=${cookie.path}; domain=${cookie.domain}`;
      }
    }
  }
  getCookieJarUrl() {
    return typeof document !== "undefined" ? document.location.toString() : "https://x.com";
  }
  async guestId() {
    const cookies = await this.getCookies();
    const guestIdCookie = cookies.find((cookie) => cookie.key === "guest_id");
    return guestIdCookie ? guestIdCookie.value : null;
  }
  /**
   * Updates the authentication state with a new guest token from the Twitter API.
   */
  async updateGuestToken() {
    try {
      await this.updateGuestTokenCore();
    } catch (err) {
      log$4("Failed to update guest token; this may cause issues:", err);
    }
  }
  async updateGuestTokenCore() {
    const guestActivateUrl = "https://api.x.com/1.1/guest/activate.json";
    const headers = new headersPolyfill.Headers({
      authorization: `Bearer ${this.bearerToken}`,
      "user-agent": CHROME_USER_AGENT,
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/x-www-form-urlencoded",
      "sec-ch-ua": CHROME_SEC_CH_UA,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      origin: "https://x.com",
      referer: "https://x.com/",
      "sec-fetch-site": "same-site",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      cookie: await this.getCookieString()
    });
    log$4(`Making POST request to ${guestActivateUrl}`);
    const res = await this.fetch(guestActivateUrl, {
      method: "POST",
      headers
    });
    await updateCookieJar(this.jar, res.headers);
    if (!res.ok) {
      throw new AuthenticationError(await res.text());
    }
    const o = await flexParseJson(res);
    if (o == null || o["guest_token"] == null) {
      throw new AuthenticationError("guest_token not found.");
    }
    const newGuestToken = o["guest_token"];
    if (typeof newGuestToken !== "string") {
      throw new AuthenticationError("guest_token was not a string.");
    }
    this.guestToken = newGuestToken;
    this.guestCreatedAt = /* @__PURE__ */ new Date();
    await this.setCookie("gt", newGuestToken);
    log$4(`Updated guest token (length: ${newGuestToken.length})`);
  }
  /**
   * Returns if the authentication token needs to be updated or not.
   * @returns `true` if the token needs to be updated; `false` otherwise.
   */
  shouldUpdate() {
    return !this.hasToken() || this.guestCreatedAt != null && this.guestCreatedAt < new Date((/* @__PURE__ */ new Date()).valueOf() - 3 * 60 * 60 * 1e3);
  }
}

class Platform {
  async randomizeCiphers() {
    const platform = await Platform.importPlatform();
    await platform?.randomizeCiphers();
  }
  static async importPlatform() {
    {
      const { platform } = await Promise.resolve().then(function () { return index; });
      return platform;
    }
  }
}

const log$3 = debug("twitter-scraper:xctxid");
let linkedom = null;
async function linkedomImport() {
  if (!linkedom) {
    const mod = await import('linkedom');
    linkedom = mod;
    return mod;
  }
  return linkedom;
}
async function parseHTML(html) {
  if (typeof window !== "undefined") {
    const { defaultView } = new DOMParser().parseFromString(html, "text/html");
    if (!defaultView) {
      throw new Error("Failed to get defaultView from parsed HTML.");
    }
    return defaultView;
  } else {
    const { DOMParser: DOMParser2 } = await linkedomImport();
    return new DOMParser2().parseFromString(html, "text/html").defaultView;
  }
}
async function handleXMigration(fetchFn) {
  const headers = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "ja",
    "cache-control": "no-cache",
    pragma: "no-cache",
    priority: "u=0, i",
    "sec-ch-ua": CHROME_SEC_CH_UA,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "user-agent": CHROME_USER_AGENT
  };
  const response = await fetchFn("https://x.com", {
    headers
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch X homepage: ${response.statusText}`);
  }
  const htmlText = await response.text();
  let dom = await parseHTML(htmlText);
  let document = dom.window.document;
  const migrationRedirectionRegex = new RegExp(
    "(http(?:s)?://(?:www\\.)?(twitter|x){1}\\.com(/x)?/migrate([/?])?tok=[a-zA-Z0-9%\\-_]+)+",
    "i"
  );
  const metaRefresh = document.querySelector("meta[http-equiv='refresh']");
  const metaContent = metaRefresh ? metaRefresh.getAttribute("content") || "" : "";
  const migrationRedirectionUrl = migrationRedirectionRegex.exec(metaContent) || migrationRedirectionRegex.exec(htmlText);
  if (migrationRedirectionUrl) {
    const redirectResponse = await fetchFn(migrationRedirectionUrl[0]);
    if (!redirectResponse.ok) {
      throw new Error(
        `Failed to follow migration redirection: ${redirectResponse.statusText}`
      );
    }
    const redirectHtml = await redirectResponse.text();
    dom = await parseHTML(redirectHtml);
    document = dom.window.document;
  }
  const migrationForm = document.querySelector("form[name='f']") || document.querySelector("form[action='https://x.com/x/migrate']");
  if (migrationForm) {
    const url = migrationForm.getAttribute("action") || "https://x.com/x/migrate";
    const method = migrationForm.getAttribute("method") || "POST";
    const requestPayload = new FormData();
    const inputFields = migrationForm.querySelectorAll("input");
    for (const element of Array.from(inputFields)) {
      const name = element.getAttribute("name");
      const value = element.getAttribute("value");
      if (name && value) {
        requestPayload.append(name, value);
      }
    }
    const formResponse = await fetchFn(url, {
      method,
      body: requestPayload,
      headers
    });
    if (!formResponse.ok) {
      throw new Error(
        `Failed to submit migration form: ${formResponse.statusText}`
      );
    }
    const formHtml = await formResponse.text();
    dom = await parseHTML(formHtml);
    document = dom.window.document;
  }
  return document;
}
let cachedDocumentPromise = null;
let cachedDocumentTimestamp = 0;
const DOCUMENT_CACHE_TTL = 5 * 60 * 1e3;
async function getCachedDocument(fetchFn) {
  const now = Date.now();
  if (!cachedDocumentPromise || now - cachedDocumentTimestamp > DOCUMENT_CACHE_TTL) {
    log$3("Fetching fresh x.com document for transaction ID generation");
    cachedDocumentTimestamp = now;
    cachedDocumentPromise = handleXMigration(fetchFn).catch((err) => {
      cachedDocumentPromise = null;
      throw err;
    });
  } else {
    log$3("Using cached x.com document for transaction ID generation");
  }
  return cachedDocumentPromise;
}
let ClientTransaction = null;
async function clientTransaction() {
  if (!ClientTransaction) {
    const mod = await import('x-client-transaction-id');
    ClientTransaction = mod.ClientTransaction;
    return mod.ClientTransaction;
  }
  return ClientTransaction;
}
async function generateTransactionId(url, fetchFn, method) {
  const parsedUrl = new URL(url);
  const path = parsedUrl.pathname;
  log$3(`Generating transaction ID for ${method} ${path}`);
  const document = await getCachedDocument(fetchFn);
  const ClientTransactionClass = await clientTransaction();
  const transaction = await ClientTransactionClass.create(document);
  const transactionId = await transaction.generateTransactionId(method, path);
  log$3(`Transaction ID: ${transactionId}`);
  return transactionId;
}

const CHROME_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36";
const CHROME_SEC_CH_UA = '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"';

const log$2 = debug("twitter-scraper:api");
const bearerToken = "AAAAAAAAAAAAAAAAAAAAAFQODgEAAAAAVHTp76lzh3rFzcHbmHVvQxYYpTw%3DckAlMINMjmCwxUcaXbAN4XqJVdgMJaHqNOFgPMK0zN1qLqLQCF";
const bearerToken2 = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
async function jitter(maxMs) {
  const jitter2 = Math.random() * maxMs;
  await new Promise((resolve) => setTimeout(resolve, jitter2));
}
async function requestApi(url, auth, method = "GET", platform = new Platform(), headers = new headersPolyfill.Headers(), bearerTokenOverride) {
  log$2(`Making ${method} request to ${url}`);
  await auth.installTo(headers, url, bearerTokenOverride);
  await platform.randomizeCiphers();
  if (auth instanceof TwitterGuestAuth && auth.options?.experimental?.xClientTransactionId) {
    const transactionId = await generateTransactionId(
      url,
      auth.fetch.bind(auth),
      method
    );
    headers.set("x-client-transaction-id", transactionId);
  }
  let res;
  do {
    const fetchParameters = [
      url,
      {
        method,
        headers,
        credentials: "include"
      }
    ];
    try {
      res = await auth.fetch(...fetchParameters);
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }
      return {
        success: false,
        err
      };
    }
    await updateCookieJar(auth.cookieJar(), res.headers);
    if (res.status === 429) {
      log$2("Rate limit hit, waiting for retry...");
      await auth.onRateLimit({
        fetchParameters,
        response: res
      });
    }
  } while (res.status === 429);
  if (!res.ok) {
    return {
      success: false,
      err: await ApiError.fromResponse(res)
    };
  }
  const value = await flexParseJson(res);
  if (res.headers.get("x-rate-limit-incoming") == "0") {
    auth.deleteToken();
    return { success: true, value };
  } else {
    return { success: true, value };
  }
}
async function flexParseJson(res) {
  try {
    return await res.json();
  } catch {
    log$2("Failed to parse response as JSON, trying text parse...");
    const text = await res.text();
    log$2("Response text:", text);
    return JSON.parse(text);
  }
}
function addApiFeatures(o) {
  return {
    ...o,
    rweb_lists_timeline_redesign_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    tweetypie_unmention_optimization_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    longform_notetweets_rich_text_read_enabled: true,
    responsive_web_enhance_cards_enabled: false,
    subscriptions_verification_info_enabled: true,
    subscriptions_verification_info_reason_enabled: true,
    subscriptions_verification_info_verified_since_enabled: true,
    super_follow_badge_privacy_enabled: false,
    super_follow_exclusive_tweet_notifications_enabled: false,
    super_follow_tweet_api_enabled: false,
    super_follow_user_api_enabled: false,
    android_graphql_skip_api_media_color_palette: false,
    creator_subscriptions_subscription_count_enabled: false,
    blue_business_profile_image_shape_enabled: false,
    unified_cards_ad_metadata_container_dynamic_card_content_query_enabled: false
  };
}
function addApiParams(params, includeTweetReplies) {
  params.set("include_profile_interstitial_type", "1");
  params.set("include_blocking", "1");
  params.set("include_blocked_by", "1");
  params.set("include_followed_by", "1");
  params.set("include_want_retweets", "1");
  params.set("include_mute_edge", "1");
  params.set("include_can_dm", "1");
  params.set("include_can_media_tag", "1");
  params.set("include_ext_has_nft_avatar", "1");
  params.set("include_ext_is_blue_verified", "1");
  params.set("include_ext_verified_type", "1");
  params.set("skip_status", "1");
  params.set("cards_platform", "Web-12");
  params.set("include_cards", "1");
  params.set("include_ext_alt_text", "true");
  params.set("include_ext_limited_action_results", "false");
  params.set("include_quote_count", "true");
  params.set("include_reply_count", "1");
  params.set("tweet_mode", "extended");
  params.set("include_ext_collab_control", "true");
  params.set("include_ext_views", "true");
  params.set("include_entities", "true");
  params.set("include_user_entities", "true");
  params.set("include_ext_media_color", "true");
  params.set("include_ext_media_availability", "true");
  params.set("include_ext_sensitive_media_warning", "true");
  params.set("include_ext_trusted_friends_metadata", "true");
  params.set("send_error_codes", "true");
  params.set("simple_quoted_tweet", "true");
  params.set("include_tweet_replies", `${includeTweetReplies}`);
  params.set(
    "ext",
    "mediaStats,highlightedLabel,hasNftAvatar,voiceInfo,birdwatchPivot,enrichments,superFollowMetadata,unmentionInfo,editControl,collab_control,vibe"
  );
  return params;
}

const log$1 = debug("twitter-scraper:auth-user");
const TwitterUserAuthSubtask = typebox.Type.Object({
  subtask_id: typebox.Type.String(),
  enter_text: typebox.Type.Optional(typebox.Type.Object({}))
});
const _TwitterUserAuth = class _TwitterUserAuth extends TwitterGuestAuth {
  constructor(bearerToken, options) {
    super(bearerToken, options);
    this.subtaskHandlers = /* @__PURE__ */ new Map();
    this.initializeDefaultHandlers();
  }
  /**
   * Register a custom subtask handler or override an existing one
   * @param subtaskId The ID of the subtask to handle
   * @param handler The handler function that processes the subtask
   */
  registerSubtaskHandler(subtaskId, handler) {
    this.subtaskHandlers.set(subtaskId, handler);
  }
  initializeDefaultHandlers() {
    this.subtaskHandlers.set(
      "LoginJsInstrumentationSubtask",
      this.handleJsInstrumentationSubtask.bind(this)
    );
    this.subtaskHandlers.set(
      "LoginEnterUserIdentifierSSO",
      this.handleEnterUserIdentifierSSO.bind(this)
    );
    this.subtaskHandlers.set(
      "LoginEnterAlternateIdentifierSubtask",
      this.handleEnterAlternateIdentifierSubtask.bind(this)
    );
    this.subtaskHandlers.set(
      "LoginEnterPassword",
      this.handleEnterPassword.bind(this)
    );
    this.subtaskHandlers.set(
      "AccountDuplicationCheck",
      this.handleAccountDuplicationCheck.bind(this)
    );
    this.subtaskHandlers.set(
      "LoginTwoFactorAuthChallenge",
      this.handleTwoFactorAuthChallenge.bind(this)
    );
    this.subtaskHandlers.set("LoginAcid", this.handleAcid.bind(this));
    this.subtaskHandlers.set(
      "LoginSuccessSubtask",
      this.handleSuccessSubtask.bind(this)
    );
  }
  async isLoggedIn() {
    const cookies = await this.getCookies();
    return cookies.some((c) => c.key === "ct0") && cookies.some((c) => c.key === "auth_token");
  }
  async login(username, password, email, twoFactorSecret) {
    await this.preflight();
    if (!this.guestToken) {
      await this.updateGuestToken();
    }
    const credentials = {
      username,
      password,
      email,
      twoFactorSecret
    };
    let next = await this.initLogin();
    while (next.status === "success" && next.response.subtasks?.length) {
      const flowToken = next.response.flow_token;
      if (flowToken == null) {
        throw new Error("flow_token not found.");
      }
      const subtaskId = next.response.subtasks[0].subtask_id;
      const configuredDelay = this.options?.experimental?.flowStepDelay;
      const delay = configuredDelay !== void 0 ? configuredDelay : 1e3 + Math.floor(Math.random() * 2e3);
      if (delay > 0) {
        log$1(`Waiting ${delay}ms before handling subtask: ${subtaskId}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const handler = this.subtaskHandlers.get(subtaskId);
      if (handler) {
        next = await handler(subtaskId, next.response, credentials, {
          sendFlowRequest: this.executeFlowTask.bind(this),
          getFlowToken: () => flowToken
        });
      } else {
        throw new Error(`Unknown subtask ${subtaskId}`);
      }
    }
    if (next.status === "error") {
      throw next.err;
    }
  }
  /**
   * Pre-flight request to establish Cloudflare cookies and session context.
   * Mimics a real browser visiting x.com before starting the login API flow.
   */
  async preflight() {
    try {
      const headers = new headersPolyfill.Headers({
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua": CHROME_SEC_CH_UA,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "user-agent": CHROME_USER_AGENT
      });
      log$1("Pre-flight: fetching https://x.com/i/flow/login");
      const res = await this.fetch("https://x.com/i/flow/login", {
        redirect: "follow",
        headers
      });
      await updateCookieJar(this.jar, res.headers);
      log$1(`Pre-flight response: ${res.status}`);
      try {
        const html = await res.text();
        const gtMatch = html.match(/document\.cookie="gt=(\d+)/);
        if (gtMatch) {
          this.guestToken = gtMatch[1];
          this.guestCreatedAt = /* @__PURE__ */ new Date();
          await this.setCookie("gt", gtMatch[1]);
          log$1(`Extracted guest token from HTML (length: ${gtMatch[1].length})`);
        }
      } catch (err) {
        log$1("Failed to extract guest token from HTML (non-fatal):", err);
      }
    } catch (err) {
      log$1("Pre-flight request failed (non-fatal):", err);
    }
  }
  async logout() {
    if (!this.hasToken()) {
      return;
    }
    try {
      const logoutUrl = "https://api.x.com/1.1/account/logout.json";
      const headers = new headersPolyfill.Headers();
      await this.installTo(headers, logoutUrl);
      await this.fetch(logoutUrl, {
        method: "POST",
        headers
      });
    } catch (error) {
      log$1("Error during logout:", error);
    } finally {
      this.deleteToken();
      this.jar = new toughCookie.CookieJar();
    }
  }
  async installTo(headers, url, bearerTokenOverride) {
    await super.installTo(headers, url, bearerTokenOverride);
    headers.set("x-twitter-auth-type", "OAuth2Session");
    headers.set("x-twitter-active-user", "yes");
    headers.set("x-twitter-client-language", "en");
  }
  async initLogin() {
    await this.removeCookie("twitter_ads_id");
    await this.removeCookie("ads_prefs");
    await this.removeCookie("_twitter_sess");
    await this.removeCookie("zipbox_forms_auth_token");
    await this.removeCookie("lang");
    await this.removeCookie("bouncer_reset_cookie");
    await this.removeCookie("twid");
    await this.removeCookie("twitter_ads_idb");
    await this.removeCookie("email_uid");
    await this.removeCookie("external_referer");
    await this.removeCookie("aa_u");
    return await this.executeFlowTask({
      flow_name: "login",
      input_flow_data: {
        flow_context: {
          debug_overrides: {},
          start_location: {
            location: "manual_link"
          }
        }
      },
      subtask_versions: {
        action_list: 2,
        alert_dialog: 1,
        app_download_cta: 1,
        check_logged_in_account: 1,
        choice_selection: 3,
        contacts_live_sync_permission_prompt: 0,
        cta: 7,
        email_verification: 2,
        end_flow: 1,
        enter_date: 1,
        enter_email: 2,
        enter_password: 5,
        enter_phone: 2,
        enter_recaptcha: 1,
        enter_text: 5,
        enter_username: 2,
        generic_urt: 3,
        in_app_notification: 1,
        interest_picker: 3,
        js_instrumentation: 1,
        menu_dialog: 1,
        notifications_permission_prompt: 2,
        open_account: 2,
        open_home_timeline: 1,
        open_link: 1,
        phone_verification: 4,
        privacy_options: 1,
        security_key: 3,
        select_avatar: 4,
        select_banner: 2,
        settings_list: 7,
        show_code: 1,
        sign_up: 2,
        sign_up_review: 4,
        tweet_selection_urt: 1,
        update_users: 1,
        upload_media: 1,
        user_recommendations_list: 4,
        user_recommendations_urt: 1,
        wait_spinner: 3,
        web_modal: 1
      }
    });
  }
  async handleJsInstrumentationSubtask(subtaskId, prev, _credentials, api) {
    const subtasks = prev.subtasks;
    const jsSubtask = subtasks?.find((s) => s.subtask_id === subtaskId);
    const jsUrl = jsSubtask?.js_instrumentation?.url;
    let metricsResponse = "{}";
    if (jsUrl) {
      try {
        metricsResponse = await this.executeJsInstrumentation(jsUrl);
        log$1(
          `JS instrumentation executed successfully, response length: ${metricsResponse.length}`
        );
      } catch (err) {
        log$1("Failed to execute JS instrumentation (falling back to {})", err);
      }
    }
    return await api.sendFlowRequest({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          js_instrumentation: {
            response: metricsResponse,
            link: "next_link"
          }
        }
      ]
    });
  }
  // 512KB
  /**
   * Fetches and executes the JS instrumentation script to generate browser
   * fingerprinting data. The result is written to an input element named
   * 'ui_metrics'.
   *
   * In browser environments, uses a hidden iframe with native DOM APIs.
   * In Node.js, uses linkedom (for DOM) and the vm module for execution.
   *
   * @security This method executes **remote JavaScript** fetched from Twitter's servers.
   * - In browsers, execution is isolated in a disposable iframe.
   * - In Node.js, `vm.runInContext` is used for convenience, NOT for security.
   *   Node's `vm` module provides NO security sandbox — a malicious script can
   *   trivially escape the context (e.g., via `this.constructor.constructor('return process')()`).
   *   The only real trust boundary is that scripts are fetched from Twitter's known CDN URLs.
   *   Setting `process: undefined` etc. in the sandbox context is cosmetic and does not
   *   prevent escape.
   * - A maximum script size limit (512KB) and a 5-second timeout provide basic sanity checks.
   */
  async executeJsInstrumentation(url) {
    log$1(`Fetching JS instrumentation from: ${url}`);
    const response = await this.fetch(url);
    const scriptContent = await response.text();
    log$1(`JS instrumentation script fetched, length: ${scriptContent.length}`);
    if (scriptContent.length > _TwitterUserAuth.JS_INSTRUMENTATION_MAX_SIZE) {
      log$1(
        `WARNING: JS instrumentation script exceeds size limit (${scriptContent.length} > ${_TwitterUserAuth.JS_INSTRUMENTATION_MAX_SIZE}), skipping execution`
      );
      return "{}";
    }
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      return this.executeJsInstrumentationBrowser(scriptContent);
    }
    return this.executeJsInstrumentationNode(scriptContent);
  }
  /**
   * Execute JS instrumentation in a browser environment using a hidden iframe.
   * The iframe provides natural isolation — the script gets its own document
   * and window, and we can override setTimeout without affecting the host page.
   */
  async executeJsInstrumentationBrowser(scriptContent) {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    try {
      const iframeWin = iframe.contentWindow;
      const iframeDoc = iframe.contentDocument;
      if (!iframeWin || !iframeDoc) {
        log$1("WARNING: Could not access iframe document/window");
        return "{}";
      }
      const input = iframeDoc.createElement("input");
      input.name = "ui_metrics";
      input.type = "hidden";
      iframeDoc.body.appendChild(input);
      iframeWin.setTimeout = (fn) => fn();
      const script = iframeDoc.createElement("script");
      script.textContent = scriptContent;
      iframeDoc.body.appendChild(script);
      const value = input.value;
      if (value) {
        log$1(`JS instrumentation result extracted, length: ${value.length}`);
        return value;
      }
      log$1("WARNING: No ui_metrics value found after script execution");
      return "{}";
    } finally {
      document.body.removeChild(iframe);
    }
  }
  /**
   * Execute JS instrumentation in Node.js using linkedom for DOM emulation
   * and the vm module for sandboxed script execution.
   *
   * @security Node's `vm` module does NOT provide a security sandbox. A
   * malicious script can trivially escape the context. The only real trust
   * boundary is that scripts come from Twitter's CDN. The undefined globals
   * (process, require, etc.) are cosmetic — they do not prevent sandbox escape.
   */
  async executeJsInstrumentationNode(scriptContent) {
    const { parseHTML } = await import('linkedom');
    const { document: doc, window: win } = parseHTML(
      '<html><head></head><body><input name="ui_metrics" type="hidden" value="" /></body></html>'
    );
    if (typeof doc.getElementsByName !== "function") {
      doc.getElementsByName = (name) => doc.querySelectorAll(`[name="${name}"]`);
    }
    const vm = await import('vm');
    const origSetTimeout = win.setTimeout;
    win.setTimeout = (fn) => fn();
    try {
      Object.defineProperty(doc, "readyState", {
        value: "complete",
        writable: true,
        configurable: true
      });
    } catch {
    }
    const sandbox = {
      document: doc,
      window: win,
      Date,
      JSON,
      parseInt,
      // Deny access to Node.js internals to limit sandbox escape surface
      process: void 0,
      require: void 0,
      global: void 0,
      globalThis: void 0
    };
    vm.runInNewContext(scriptContent, sandbox, { timeout: 5e3 });
    win.setTimeout = origSetTimeout;
    const inputs = doc.getElementsByName("ui_metrics");
    if (inputs && inputs.length > 0) {
      const value = inputs[0].value || inputs[0].getAttribute("value");
      if (value) {
        log$1(`JS instrumentation result extracted, length: ${value.length}`);
        return value;
      }
    }
    log$1("WARNING: No ui_metrics value found after script execution");
    return "{}";
  }
  async handleEnterAlternateIdentifierSubtask(subtaskId, _prev, credentials, api) {
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          enter_text: {
            text: credentials.email,
            link: "next_link"
          }
        }
      ]
    });
  }
  async handleEnterUserIdentifierSSO(subtaskId, _prev, credentials, api) {
    let castleToken;
    try {
      castleToken = await this.generateCastleToken();
      log$1(`Castle token generated, length: ${castleToken.length}`);
    } catch (err) {
      log$1("Failed to generate castle token (continuing without it):", err);
    }
    const settingsList = {
      setting_responses: [
        {
          key: "user_identifier",
          response_data: {
            text_data: { result: credentials.username }
          }
        }
      ],
      link: "next_link"
    };
    if (castleToken) {
      settingsList.castle_token = castleToken;
    }
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          settings_list: settingsList
        }
      ]
    });
  }
  /**
   * Generates a Castle.io device fingerprint token for the login flow.
   * Uses local token generation (Castle.io v11 format) to avoid external
   * API dependencies and rate limits.
   */
  async generateCastleToken() {
    const userAgent = CHROME_USER_AGENT;
    const browserProfile = this.options?.experimental?.browserProfile;
    const { token, cuid } = generateLocalCastleToken(userAgent, browserProfile);
    await this.setCookie("__cuid", cuid);
    log$1(
      `Castle token generated locally, length: ${token.length}, cuid: ${cuid.substring(0, 6)}...`
    );
    return token;
  }
  async handleEnterPassword(subtaskId, _prev, credentials, api) {
    let castleToken;
    try {
      castleToken = await this.generateCastleToken();
      log$1(`Castle token for password step, length: ${castleToken.length}`);
    } catch (err) {
      log$1(
        "Failed to generate castle token for password (continuing without):",
        err
      );
    }
    const enterPassword = {
      password: credentials.password,
      link: "next_link"
    };
    if (castleToken) {
      enterPassword.castle_token = castleToken;
    }
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          enter_password: enterPassword
        }
      ]
    });
  }
  async handleAccountDuplicationCheck(subtaskId, _prev, _credentials, api) {
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          check_logged_in_account: {
            link: "AccountDuplicationCheck_false"
          }
        }
      ]
    });
  }
  async handleTwoFactorAuthChallenge(subtaskId, _prev, credentials, api) {
    if (!credentials.twoFactorSecret) {
      return {
        status: "error",
        err: new AuthenticationError(
          "Two-factor authentication is required but no secret was provided"
        )
      };
    }
    const totp = new OTPAuth__namespace.TOTP({ secret: credentials.twoFactorSecret });
    let lastResult;
    for (let attempts = 1; attempts < 4; attempts += 1) {
      const result = await api.sendFlowRequest({
        flow_token: api.getFlowToken(),
        subtask_inputs: [
          {
            subtask_id: subtaskId,
            enter_text: {
              link: "next_link",
              text: totp.generate()
            }
          }
        ]
      });
      if (result.status === "success") {
        return result;
      }
      lastResult = result;
      log$1(`2FA attempt ${attempts} failed: ${result.err.message}`);
      await new Promise((resolve) => setTimeout(resolve, 2e3 * attempts));
    }
    return lastResult;
  }
  async handleAcid(subtaskId, _prev, credentials, api) {
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          enter_text: {
            text: credentials.email,
            link: "next_link"
          }
        }
      ]
    });
  }
  async handleSuccessSubtask() {
    log$1("Successfully logged in with user credentials.");
    return {
      status: "success",
      response: {}
    };
  }
  async executeFlowTask(data) {
    let onboardingTaskUrl = "https://api.x.com/1.1/onboarding/task.json";
    if ("flow_name" in data) {
      onboardingTaskUrl = `https://api.x.com/1.1/onboarding/task.json?flow_name=${data.flow_name}`;
    }
    log$1(`Making POST request to ${onboardingTaskUrl}`);
    log$1(
      "Request data:",
      JSON.stringify(
        data,
        (key, value) => key === "password" ? "[REDACTED]" : value,
        2
      )
    );
    const headers = new headersPolyfill.Headers({
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/json",
      origin: "https://x.com",
      priority: "u=1, i",
      referer: "https://x.com/",
      "sec-ch-ua": CHROME_SEC_CH_UA,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "user-agent": CHROME_USER_AGENT,
      "x-twitter-active-user": "yes",
      "x-twitter-client-language": "en"
    });
    await this.installAuthCredentials(headers);
    if (this.options?.experimental?.xClientTransactionId) {
      const transactionId = await generateTransactionId(
        onboardingTaskUrl,
        this.fetch.bind(this),
        "POST"
      );
      headers.set("x-client-transaction-id", transactionId);
    }
    const bodyData = { ...data };
    if ("flow_name" in bodyData) {
      delete bodyData.flow_name;
    }
    let res;
    do {
      const fetchParameters = [
        onboardingTaskUrl,
        {
          credentials: "include",
          method: "POST",
          headers,
          body: JSON.stringify(bodyData)
        }
      ];
      try {
        res = await this.fetch(...fetchParameters);
      } catch (err) {
        if (!(err instanceof Error)) {
          throw err;
        }
        return {
          status: "error",
          err
        };
      }
      await updateCookieJar(this.jar, res.headers);
      log$1(`Response status: ${res.status}`);
      if (res.status === 429) {
        log$1("Rate limit hit, waiting before retrying...");
        await this.onRateLimit({
          fetchParameters,
          response: res
        });
      }
    } while (res.status === 429);
    let flow;
    try {
      flow = await flexParseJson(res);
    } catch {
      if (!res.ok) {
        return {
          status: "error",
          err: new ApiError(res, "Failed to parse response body")
        };
      }
      return {
        status: "error",
        err: new AuthenticationError("Failed to parse flow response.")
      };
    }
    log$1(
      "Flow response: status=%s subtasks=%s",
      flow.status,
      flow.subtasks?.map((s) => s.subtask_id).join(", ")
    );
    if (flow.errors?.length) {
      log$1("Twitter auth flow errors:", JSON.stringify(flow.errors, null, 2));
      if (flow.errors[0].code === 399) {
        const message = flow.errors[0].message || "";
        const challengeMatch = message.match(/g;[^:]+:[^:]+:[0-9]+/);
        if (challengeMatch) {
          log$1("Twitter challenge token detected:", challengeMatch[0]);
        }
        return {
          status: "error",
          err: new AuthenticationError(
            `Twitter blocked this login attempt due to suspicious activity (error 399). This is not an issue with your credentials - Twitter requires additional authentication.

Solutions:
1. Use cookie-based authentication (RECOMMENDED): Export cookies from your browser and use scraper.setCookies() - see README for details
2. Enable Two-Factor Authentication (2FA) on your account and provide totp_secret
3. Wait 15 minutes before retrying (Twitter rate limit for suspicious logins)
4. Login via browser first to establish device trust

Original error: ${message}`
          )
        };
      }
      return {
        status: "error",
        err: new AuthenticationError(
          `Authentication error (${flow.errors[0].code}): ${flow.errors[0].message}`
        )
      };
    }
    if (!res.ok) {
      return { status: "error", err: new ApiError(res, flow) };
    }
    if (flow?.flow_token == null) {
      return {
        status: "error",
        err: new AuthenticationError("flow_token not found.")
      };
    }
    if (typeof flow.flow_token !== "string") {
      return {
        status: "error",
        err: new AuthenticationError("flow_token was not a string.")
      };
    }
    const subtask = flow.subtasks?.length ? flow.subtasks[0] : void 0;
    if (subtask && !value.Check(TwitterUserAuthSubtask, subtask)) {
      log$1(
        "WARNING: Subtask failed schema validation: %s",
        subtask.subtask_id ?? "unknown"
      );
    }
    if (subtask && subtask.subtask_id === "DenyLoginSubtask") {
      return {
        status: "error",
        err: new AuthenticationError("Authentication error: DenyLoginSubtask")
      };
    }
    return {
      status: "success",
      response: flow
    };
  }
};
/**
 * Maximum allowed size (in bytes) for the JS instrumentation script.
 * Twitter's scripts are typically ~50-100KB. Anything significantly larger
 * may indicate tampering or an unexpected response.
 */
_TwitterUserAuth.JS_INSTRUMENTATION_MAX_SIZE = 512 * 1024;
let TwitterUserAuth = _TwitterUserAuth;

const endpoints = {
  UserTweets: "https://api.x.com/graphql/N2tFDY-MlrLxXJ9F_ZxJGA/UserTweets?variables=%7B%22userId%22%3A%2244196397%22%2C%22count%22%3A20%2C%22includePromotedContent%22%3Atrue%2C%22withQuickPromoteEligibilityTweetFields%22%3Atrue%2C%22withVoice%22%3Atrue%7D&features=%7B%22rweb_video_screen_enabled%22%3Afalse%2C%22profile_label_improvements_pcf_label_in_post_enabled%22%3Atrue%2C%22responsive_web_profile_redirect_enabled%22%3Afalse%2C%22rweb_tipjar_consumption_enabled%22%3Afalse%2C%22verified_phone_label_enabled%22%3Afalse%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22premium_content_api_read_enabled%22%3Afalse%2C%22communities_web_enable_tweet_community_results_fetch%22%3Atrue%2C%22c9s_tweet_anatomy_moderator_badge_enabled%22%3Atrue%2C%22responsive_web_grok_analyze_button_fetch_trends_enabled%22%3Afalse%2C%22responsive_web_grok_analyze_post_followups_enabled%22%3Atrue%2C%22responsive_web_jetfuel_frame%22%3Atrue%2C%22responsive_web_grok_share_attachment_enabled%22%3Atrue%2C%22responsive_web_grok_annotations_enabled%22%3Atrue%2C%22articles_preview_enabled%22%3Atrue%2C%22responsive_web_edit_tweet_api_enabled%22%3Atrue%2C%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue%2C%22view_counts_everywhere_api_enabled%22%3Atrue%2C%22longform_notetweets_consumption_enabled%22%3Atrue%2C%22responsive_web_twitter_article_tweet_consumption_enabled%22%3Atrue%2C%22tweet_awards_web_tipping_enabled%22%3Afalse%2C%22responsive_web_grok_show_grok_translated_post%22%3Atrue%2C%22responsive_web_grok_analysis_button_from_backend%22%3Atrue%2C%22post_ctas_fetch_enabled%22%3Atrue%2C%22freedom_of_speech_not_reach_fetch_enabled%22%3Atrue%2C%22standardized_nudges_misinfo%22%3Atrue%2C%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Atrue%2C%22longform_notetweets_rich_text_read_enabled%22%3Atrue%2C%22longform_notetweets_inline_media_enabled%22%3Atrue%2C%22responsive_web_grok_image_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_imagine_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_community_note_auto_translation_is_enabled%22%3Afalse%2C%22responsive_web_enhance_cards_enabled%22%3Afalse%7D&fieldToggles=%7B%22withArticlePlainText%22%3Afalse%7D",
  UserTweetsAndReplies: "https://api.x.com/graphql/2NDLUdBmT_IB5uGwZ3tHRg/UserTweetsAndReplies?variables=%7B%22userId%22%3A%221806359170830172162%22%2C%22count%22%3A20%2C%22includePromotedContent%22%3Atrue%2C%22withCommunity%22%3Atrue%2C%22withVoice%22%3Atrue%7D&features=%7B%22rweb_video_screen_enabled%22%3Afalse%2C%22profile_label_improvements_pcf_label_in_post_enabled%22%3Atrue%2C%22responsive_web_profile_redirect_enabled%22%3Afalse%2C%22rweb_tipjar_consumption_enabled%22%3Afalse%2C%22verified_phone_label_enabled%22%3Afalse%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22premium_content_api_read_enabled%22%3Afalse%2C%22communities_web_enable_tweet_community_results_fetch%22%3Atrue%2C%22c9s_tweet_anatomy_moderator_badge_enabled%22%3Atrue%2C%22responsive_web_grok_analyze_button_fetch_trends_enabled%22%3Afalse%2C%22responsive_web_grok_analyze_post_followups_enabled%22%3Atrue%2C%22responsive_web_jetfuel_frame%22%3Atrue%2C%22responsive_web_grok_share_attachment_enabled%22%3Atrue%2C%22responsive_web_grok_annotations_enabled%22%3Atrue%2C%22articles_preview_enabled%22%3Atrue%2C%22responsive_web_edit_tweet_api_enabled%22%3Atrue%2C%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue%2C%22view_counts_everywhere_api_enabled%22%3Atrue%2C%22longform_notetweets_consumption_enabled%22%3Atrue%2C%22responsive_web_twitter_article_tweet_consumption_enabled%22%3Atrue%2C%22tweet_awards_web_tipping_enabled%22%3Afalse%2C%22responsive_web_grok_show_grok_translated_post%22%3Atrue%2C%22responsive_web_grok_analysis_button_from_backend%22%3Atrue%2C%22post_ctas_fetch_enabled%22%3Atrue%2C%22freedom_of_speech_not_reach_fetch_enabled%22%3Atrue%2C%22standardized_nudges_misinfo%22%3Atrue%2C%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Atrue%2C%22longform_notetweets_rich_text_read_enabled%22%3Atrue%2C%22longform_notetweets_inline_media_enabled%22%3Atrue%2C%22responsive_web_grok_image_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_imagine_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_community_note_auto_translation_is_enabled%22%3Afalse%2C%22responsive_web_enhance_cards_enabled%22%3Afalse%7D&fieldToggles=%7B%22withArticlePlainText%22%3Afalse%7D",
  UserLikedTweets: "https://api.x.com/graphql/Pcw-j9lrSeDMmkgnIejJiQ/Likes?variables=%7B%22userId%22%3A%222244196397%22%2C%22count%22%3A20%2C%22includePromotedContent%22%3Afalse%2C%22withClientEventToken%22%3Afalse%2C%22withBirdwatchNotes%22%3Afalse%2C%22withVoice%22%3Atrue%7D&features=%7B%22rweb_video_screen_enabled%22%3Afalse%2C%22profile_label_improvements_pcf_label_in_post_enabled%22%3Atrue%2C%22responsive_web_profile_redirect_enabled%22%3Afalse%2C%22rweb_tipjar_consumption_enabled%22%3Afalse%2C%22verified_phone_label_enabled%22%3Afalse%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22premium_content_api_read_enabled%22%3Afalse%2C%22communities_web_enable_tweet_community_results_fetch%22%3Atrue%2C%22c9s_tweet_anatomy_moderator_badge_enabled%22%3Atrue%2C%22responsive_web_grok_analyze_button_fetch_trends_enabled%22%3Afalse%2C%22responsive_web_grok_analyze_post_followups_enabled%22%3Atrue%2C%22responsive_web_jetfuel_frame%22%3Atrue%2C%22responsive_web_grok_share_attachment_enabled%22%3Atrue%2C%22responsive_web_grok_annotations_enabled%22%3Atrue%2C%22articles_preview_enabled%22%3Atrue%2C%22responsive_web_edit_tweet_api_enabled%22%3Atrue%2C%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue%2C%22view_counts_everywhere_api_enabled%22%3Atrue%2C%22longform_notetweets_consumption_enabled%22%3Atrue%2C%22responsive_web_twitter_article_tweet_consumption_enabled%22%3Atrue%2C%22tweet_awards_web_tipping_enabled%22%3Afalse%2C%22responsive_web_grok_show_grok_translated_post%22%3Atrue%2C%22responsive_web_grok_analysis_button_from_backend%22%3Atrue%2C%22post_ctas_fetch_enabled%22%3Atrue%2C%22freedom_of_speech_not_reach_fetch_enabled%22%3Atrue%2C%22standardized_nudges_misinfo%22%3Atrue%2C%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Atrue%2C%22longform_notetweets_rich_text_read_enabled%22%3Atrue%2C%22longform_notetweets_inline_media_enabled%22%3Atrue%2C%22responsive_web_grok_image_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_imagine_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_community_note_auto_translation_is_enabled%22%3Afalse%2C%22responsive_web_enhance_cards_enabled%22%3Afalse%7D&fieldToggles=%7B%22withArticlePlainText%22%3Afalse%7D",
  UserByScreenName: "https://api.x.com/graphql/AWbeRIdkLtqTRN7yL_H8yw/UserByScreenName?variables=%7B%22screen_name%22%3A%22elonmusk%22%2C%22withGrokTranslatedBio%22%3Atrue%7D&features=%7B%22hidden_profile_subscriptions_enabled%22%3Atrue%2C%22profile_label_improvements_pcf_label_in_post_enabled%22%3Atrue%2C%22responsive_web_profile_redirect_enabled%22%3Afalse%2C%22rweb_tipjar_consumption_enabled%22%3Afalse%2C%22verified_phone_label_enabled%22%3Afalse%2C%22subscriptions_verification_info_is_identity_verified_enabled%22%3Atrue%2C%22subscriptions_verification_info_verified_since_enabled%22%3Atrue%2C%22highlights_tweets_tab_ui_enabled%22%3Atrue%2C%22responsive_web_twitter_article_notes_tab_enabled%22%3Atrue%2C%22subscriptions_feature_can_gift_premium%22%3Atrue%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%7D&fieldToggles=%7B%22withPayments%22%3Afalse%2C%22withAuxiliaryUserLabels%22%3Atrue%7D",
  TweetDetail: "https://api.x.com/graphql/YCNdW_ZytXfV9YR3cJK9kw/TweetDetail?variables=%7B%22focalTweetId%22%3A%221985465713096794294%22%2C%22with_rux_injections%22%3Afalse%2C%22rankingMode%22%3A%22Relevance%22%2C%22includePromotedContent%22%3Atrue%2C%22withCommunity%22%3Atrue%2C%22withQuickPromoteEligibilityTweetFields%22%3Atrue%2C%22withBirdwatchNotes%22%3Atrue%2C%22withVoice%22%3Atrue%7D&features=%7B%22rweb_video_screen_enabled%22%3Afalse%2C%22profile_label_improvements_pcf_label_in_post_enabled%22%3Atrue%2C%22responsive_web_profile_redirect_enabled%22%3Afalse%2C%22rweb_tipjar_consumption_enabled%22%3Afalse%2C%22verified_phone_label_enabled%22%3Afalse%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22premium_content_api_read_enabled%22%3Afalse%2C%22communities_web_enable_tweet_community_results_fetch%22%3Atrue%2C%22c9s_tweet_anatomy_moderator_badge_enabled%22%3Atrue%2C%22responsive_web_grok_analyze_button_fetch_trends_enabled%22%3Afalse%2C%22responsive_web_grok_analyze_post_followups_enabled%22%3Atrue%2C%22responsive_web_jetfuel_frame%22%3Atrue%2C%22responsive_web_grok_share_attachment_enabled%22%3Atrue%2C%22responsive_web_grok_annotations_enabled%22%3Atrue%2C%22articles_preview_enabled%22%3Atrue%2C%22responsive_web_edit_tweet_api_enabled%22%3Atrue%2C%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue%2C%22view_counts_everywhere_api_enabled%22%3Atrue%2C%22longform_notetweets_consumption_enabled%22%3Atrue%2C%22responsive_web_twitter_article_tweet_consumption_enabled%22%3Atrue%2C%22tweet_awards_web_tipping_enabled%22%3Afalse%2C%22responsive_web_grok_show_grok_translated_post%22%3Atrue%2C%22responsive_web_grok_analysis_button_from_backend%22%3Atrue%2C%22post_ctas_fetch_enabled%22%3Atrue%2C%22freedom_of_speech_not_reach_fetch_enabled%22%3Atrue%2C%22standardized_nudges_misinfo%22%3Atrue%2C%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Atrue%2C%22longform_notetweets_rich_text_read_enabled%22%3Atrue%2C%22longform_notetweets_inline_media_enabled%22%3Atrue%2C%22responsive_web_grok_image_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_imagine_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_community_note_auto_translation_is_enabled%22%3Afalse%2C%22responsive_web_enhance_cards_enabled%22%3Afalse%7D&fieldToggles=%7B%22withArticleRichContentState%22%3Atrue%2C%22withArticlePlainText%22%3Afalse%2C%22withGrokAnalyze%22%3Afalse%2C%22withDisallowedReplyControls%22%3Afalse%7D",
  TweetResultByRestId: "https://api.x.com/graphql/4PdbzTmQ5PTjz9RiureISQ/TweetResultByRestId?variables=%7B%22tweetId%22%3A%221985465713096794294%22%2C%22includePromotedContent%22%3Atrue%2C%22withBirdwatchNotes%22%3Atrue%2C%22withVoice%22%3Atrue%2C%22withCommunity%22%3Atrue%7D&features=%7B%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22premium_content_api_read_enabled%22%3Afalse%2C%22communities_web_enable_tweet_community_results_fetch%22%3Atrue%2C%22c9s_tweet_anatomy_moderator_badge_enabled%22%3Atrue%2C%22responsive_web_grok_analyze_button_fetch_trends_enabled%22%3Afalse%2C%22responsive_web_grok_analyze_post_followups_enabled%22%3Atrue%2C%22responsive_web_jetfuel_frame%22%3Atrue%2C%22responsive_web_grok_share_attachment_enabled%22%3Atrue%2C%22responsive_web_grok_annotations_enabled%22%3Atrue%2C%22articles_preview_enabled%22%3Atrue%2C%22responsive_web_edit_tweet_api_enabled%22%3Atrue%2C%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue%2C%22view_counts_everywhere_api_enabled%22%3Atrue%2C%22longform_notetweets_consumption_enabled%22%3Atrue%2C%22responsive_web_twitter_article_tweet_consumption_enabled%22%3Atrue%2C%22tweet_awards_web_tipping_enabled%22%3Afalse%2C%22responsive_web_grok_show_grok_translated_post%22%3Atrue%2C%22responsive_web_grok_analysis_button_from_backend%22%3Atrue%2C%22post_ctas_fetch_enabled%22%3Atrue%2C%22freedom_of_speech_not_reach_fetch_enabled%22%3Atrue%2C%22standardized_nudges_misinfo%22%3Atrue%2C%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Atrue%2C%22longform_notetweets_rich_text_read_enabled%22%3Atrue%2C%22longform_notetweets_inline_media_enabled%22%3Atrue%2C%22profile_label_improvements_pcf_label_in_post_enabled%22%3Atrue%2C%22responsive_web_profile_redirect_enabled%22%3Afalse%2C%22rweb_tipjar_consumption_enabled%22%3Afalse%2C%22verified_phone_label_enabled%22%3Afalse%2C%22responsive_web_grok_image_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_imagine_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_community_note_auto_translation_is_enabled%22%3Afalse%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%2C%22responsive_web_enhance_cards_enabled%22%3Afalse%7D&fieldToggles=%7B%22withArticleRichContentState%22%3Atrue%2C%22withArticlePlainText%22%3Afalse%7D",
  ListTweets: "https://api.x.com/graphql/Uv3buKIUElzL3Iuc0L0O5g/ListLatestTweetsTimeline?variables=%7B%22listId%22%3A%221736495155002106192%22%2C%22count%22%3A20%7D&features=%7B%22rweb_video_screen_enabled%22%3Afalse%2C%22profile_label_improvements_pcf_label_in_post_enabled%22%3Atrue%2C%22responsive_web_profile_redirect_enabled%22%3Afalse%2C%22rweb_tipjar_consumption_enabled%22%3Afalse%2C%22verified_phone_label_enabled%22%3Afalse%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22premium_content_api_read_enabled%22%3Afalse%2C%22communities_web_enable_tweet_community_results_fetch%22%3Atrue%2C%22c9s_tweet_anatomy_moderator_badge_enabled%22%3Atrue%2C%22responsive_web_grok_analyze_button_fetch_trends_enabled%22%3Afalse%2C%22responsive_web_grok_analyze_post_followups_enabled%22%3Atrue%2C%22responsive_web_jetfuel_frame%22%3Atrue%2C%22responsive_web_grok_share_attachment_enabled%22%3Atrue%2C%22responsive_web_grok_annotations_enabled%22%3Atrue%2C%22articles_preview_enabled%22%3Atrue%2C%22responsive_web_edit_tweet_api_enabled%22%3Atrue%2C%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue%2C%22view_counts_everywhere_api_enabled%22%3Atrue%2C%22longform_notetweets_consumption_enabled%22%3Atrue%2C%22responsive_web_twitter_article_tweet_consumption_enabled%22%3Atrue%2C%22tweet_awards_web_tipping_enabled%22%3Afalse%2C%22responsive_web_grok_show_grok_translated_post%22%3Atrue%2C%22responsive_web_grok_analysis_button_from_backend%22%3Atrue%2C%22post_ctas_fetch_enabled%22%3Atrue%2C%22freedom_of_speech_not_reach_fetch_enabled%22%3Atrue%2C%22standardized_nudges_misinfo%22%3Atrue%2C%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Atrue%2C%22longform_notetweets_rich_text_read_enabled%22%3Atrue%2C%22longform_notetweets_inline_media_enabled%22%3Atrue%2C%22responsive_web_grok_image_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_imagine_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_community_note_auto_translation_is_enabled%22%3Afalse%2C%22responsive_web_enhance_cards_enabled%22%3Afalse%7D",
  SearchTimeline: "https://api.x.com/graphql/ML-n2SfAxx5S_9QMqNejbg/SearchTimeline?variables=%7B%22rawQuery%22%3A%22twitter%22%2C%22count%22%3A20%2C%22querySource%22%3A%22typed_query%22%2C%22product%22%3A%22Top%22%2C%22withGrokTranslatedBio%22%3Afalse%7D&features=%7B%22rweb_video_screen_enabled%22%3Afalse%2C%22profile_label_improvements_pcf_label_in_post_enabled%22%3Atrue%2C%22responsive_web_profile_redirect_enabled%22%3Afalse%2C%22rweb_tipjar_consumption_enabled%22%3Afalse%2C%22verified_phone_label_enabled%22%3Afalse%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22premium_content_api_read_enabled%22%3Afalse%2C%22communities_web_enable_tweet_community_results_fetch%22%3Atrue%2C%22c9s_tweet_anatomy_moderator_badge_enabled%22%3Atrue%2C%22responsive_web_grok_analyze_button_fetch_trends_enabled%22%3Afalse%2C%22responsive_web_grok_analyze_post_followups_enabled%22%3Atrue%2C%22responsive_web_jetfuel_frame%22%3Atrue%2C%22responsive_web_grok_share_attachment_enabled%22%3Atrue%2C%22responsive_web_grok_annotations_enabled%22%3Atrue%2C%22articles_preview_enabled%22%3Atrue%2C%22responsive_web_edit_tweet_api_enabled%22%3Atrue%2C%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue%2C%22view_counts_everywhere_api_enabled%22%3Atrue%2C%22longform_notetweets_consumption_enabled%22%3Atrue%2C%22responsive_web_twitter_article_tweet_consumption_enabled%22%3Atrue%2C%22tweet_awards_web_tipping_enabled%22%3Afalse%2C%22responsive_web_grok_show_grok_translated_post%22%3Atrue%2C%22responsive_web_grok_analysis_button_from_backend%22%3Atrue%2C%22post_ctas_fetch_enabled%22%3Atrue%2C%22freedom_of_speech_not_reach_fetch_enabled%22%3Atrue%2C%22standardized_nudges_misinfo%22%3Atrue%2C%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Atrue%2C%22longform_notetweets_rich_text_read_enabled%22%3Atrue%2C%22longform_notetweets_inline_media_enabled%22%3Atrue%2C%22responsive_web_grok_image_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_imagine_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_community_note_auto_translation_is_enabled%22%3Afalse%2C%22responsive_web_enhance_cards_enabled%22%3Afalse%7D",
  Followers: "https://api.x.com/graphql/P7m4Qr-rJEB8KUluOenU6A/Followers?variables=%7B%22userId%22%3A%221806359170830172162%22%2C%22count%22%3A20%2C%22includePromotedContent%22%3Afalse%2C%22withGrokTranslatedBio%22%3Afalse%7D&features=%7B%22rweb_video_screen_enabled%22%3Afalse%2C%22profile_label_improvements_pcf_label_in_post_enabled%22%3Atrue%2C%22responsive_web_profile_redirect_enabled%22%3Afalse%2C%22rweb_tipjar_consumption_enabled%22%3Afalse%2C%22verified_phone_label_enabled%22%3Afalse%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22premium_content_api_read_enabled%22%3Afalse%2C%22communities_web_enable_tweet_community_results_fetch%22%3Atrue%2C%22c9s_tweet_anatomy_moderator_badge_enabled%22%3Atrue%2C%22responsive_web_grok_analyze_button_fetch_trends_enabled%22%3Afalse%2C%22responsive_web_grok_analyze_post_followups_enabled%22%3Atrue%2C%22responsive_web_jetfuel_frame%22%3Atrue%2C%22responsive_web_grok_share_attachment_enabled%22%3Atrue%2C%22responsive_web_grok_annotations_enabled%22%3Atrue%2C%22articles_preview_enabled%22%3Atrue%2C%22responsive_web_edit_tweet_api_enabled%22%3Atrue%2C%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue%2C%22view_counts_everywhere_api_enabled%22%3Atrue%2C%22longform_notetweets_consumption_enabled%22%3Atrue%2C%22responsive_web_twitter_article_tweet_consumption_enabled%22%3Atrue%2C%22tweet_awards_web_tipping_enabled%22%3Afalse%2C%22responsive_web_grok_show_grok_translated_post%22%3Atrue%2C%22responsive_web_grok_analysis_button_from_backend%22%3Atrue%2C%22post_ctas_fetch_enabled%22%3Atrue%2C%22freedom_of_speech_not_reach_fetch_enabled%22%3Atrue%2C%22standardized_nudges_misinfo%22%3Atrue%2C%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Atrue%2C%22longform_notetweets_rich_text_read_enabled%22%3Atrue%2C%22longform_notetweets_inline_media_enabled%22%3Atrue%2C%22responsive_web_grok_image_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_imagine_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_community_note_auto_translation_is_enabled%22%3Afalse%2C%22responsive_web_enhance_cards_enabled%22%3Afalse%7D",
  Following: "https://api.x.com/graphql/T5wihsMTYHncY7BB4YxHSg/Following?variables=%7B%22userId%22%3A%221806359170830172162%22%2C%22count%22%3A20%2C%22includePromotedContent%22%3Afalse%2C%22withGrokTranslatedBio%22%3Afalse%7D&features=%7B%22rweb_video_screen_enabled%22%3Afalse%2C%22profile_label_improvements_pcf_label_in_post_enabled%22%3Atrue%2C%22responsive_web_profile_redirect_enabled%22%3Afalse%2C%22rweb_tipjar_consumption_enabled%22%3Afalse%2C%22verified_phone_label_enabled%22%3Afalse%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22premium_content_api_read_enabled%22%3Afalse%2C%22communities_web_enable_tweet_community_results_fetch%22%3Atrue%2C%22c9s_tweet_anatomy_moderator_badge_enabled%22%3Atrue%2C%22responsive_web_grok_analyze_button_fetch_trends_enabled%22%3Afalse%2C%22responsive_web_grok_analyze_post_followups_enabled%22%3Atrue%2C%22responsive_web_jetfuel_frame%22%3Atrue%2C%22responsive_web_grok_share_attachment_enabled%22%3Atrue%2C%22responsive_web_grok_annotations_enabled%22%3Atrue%2C%22articles_preview_enabled%22%3Atrue%2C%22responsive_web_edit_tweet_api_enabled%22%3Atrue%2C%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue%2C%22view_counts_everywhere_api_enabled%22%3Atrue%2C%22longform_notetweets_consumption_enabled%22%3Atrue%2C%22responsive_web_twitter_article_tweet_consumption_enabled%22%3Atrue%2C%22tweet_awards_web_tipping_enabled%22%3Afalse%2C%22responsive_web_grok_show_grok_translated_post%22%3Atrue%2C%22responsive_web_grok_analysis_button_from_backend%22%3Atrue%2C%22post_ctas_fetch_enabled%22%3Atrue%2C%22freedom_of_speech_not_reach_fetch_enabled%22%3Atrue%2C%22standardized_nudges_misinfo%22%3Atrue%2C%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Atrue%2C%22longform_notetweets_rich_text_read_enabled%22%3Atrue%2C%22longform_notetweets_inline_media_enabled%22%3Atrue%2C%22responsive_web_grok_image_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_imagine_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_community_note_auto_translation_is_enabled%22%3Afalse%2C%22responsive_web_enhance_cards_enabled%22%3Afalse%7D"
};
class ApiRequest {
  constructor(info) {
    this.url = info.url;
    this.variables = info.variables;
    this.features = info.features;
    this.fieldToggles = info.fieldToggles;
  }
  toRequestUrl() {
    const params = new URLSearchParams();
    if (this.variables) {
      const variablesStr = stringify(this.variables);
      if (variablesStr) params.set("variables", variablesStr);
    }
    if (this.features) {
      const featuresStr = stringify(this.features);
      if (featuresStr) params.set("features", featuresStr);
    }
    if (this.fieldToggles) {
      const fieldTogglesStr = stringify(this.fieldToggles);
      if (fieldTogglesStr) params.set("fieldToggles", fieldTogglesStr);
    }
    return `${this.url}?${params.toString()}`;
  }
}
function parseEndpointExample(example) {
  const { protocol, host, pathname, searchParams: query } = new URL(example);
  const base = `${protocol}//${host}${pathname}`;
  const variables = query.get("variables");
  const features = query.get("features");
  const fieldToggles = query.get("fieldToggles");
  return new ApiRequest({
    url: base,
    variables: variables ? JSON.parse(variables) : void 0,
    features: features ? JSON.parse(features) : void 0,
    fieldToggles: fieldToggles ? JSON.parse(fieldToggles) : void 0
  });
}
function createApiRequestFactory(endpoints2) {
  return Object.entries(endpoints2).map(([endpointName, endpointExample]) => {
    return {
      [`create${endpointName}Request`]: () => {
        return parseEndpointExample(endpointExample);
      }
    };
  }).reduce((agg, next) => {
    return Object.assign(agg, next);
  });
}
const apiRequestFactory = createApiRequestFactory(endpoints);

function getAvatarOriginalSizeUrl(avatarUrl) {
  return avatarUrl ? avatarUrl.replace("_normal", "") : void 0;
}
function parseProfile(legacy, isBlueVerified) {
  const profile = {
    avatar: getAvatarOriginalSizeUrl(legacy.profile_image_url_https),
    banner: legacy.profile_banner_url,
    biography: legacy.description,
    followersCount: legacy.followers_count,
    followingCount: legacy.friends_count,
    friendsCount: legacy.friends_count,
    mediaCount: legacy.media_count,
    isPrivate: legacy.protected ?? false,
    isVerified: legacy.verified,
    likesCount: legacy.favourites_count,
    listedCount: legacy.listed_count,
    location: legacy.location,
    name: legacy.name,
    pinnedTweetIds: legacy.pinned_tweet_ids_str,
    tweetsCount: legacy.statuses_count,
    url: `https://x.com/${legacy.screen_name}`,
    userId: legacy.id_str,
    username: legacy.screen_name,
    isBlueVerified: isBlueVerified ?? false,
    canDm: legacy.can_dm
  };
  if (legacy.created_at != null) {
    profile.joined = new Date(Date.parse(legacy.created_at));
  }
  const urls = legacy.entities?.url?.urls;
  if (urls?.length != null && urls?.length > 0) {
    profile.website = urls[0].expanded_url;
  }
  return profile;
}
async function getProfile(username, auth) {
  const request = apiRequestFactory.createUserByScreenNameRequest();
  request.variables.screen_name = username;
  const res = await requestApi(
    request.toRequestUrl(),
    auth,
    "GET",
    void 0,
    void 0,
    bearerToken2
  );
  if (!res.success) {
    return res;
  }
  const { value } = res;
  const { errors } = value;
  if ((!value.data || !value.data.user || !value.data.user.result) && errors != null && errors.length > 0) {
    return {
      success: false,
      err: new Error(errors.map((e) => e.message).join("\n"))
    };
  }
  if (!value.data || !value.data.user || !value.data.user.result) {
    return {
      success: false,
      err: new Error("User not found.")
    };
  }
  const { result: user } = value.data.user;
  const { legacy } = user;
  if (user.__typename === "UserUnavailable" && user?.reason === "Suspended") {
    return {
      success: false,
      err: new Error("User is suspended.")
    };
  }
  if (user.rest_id == null || user.rest_id.length === 0) {
    return {
      success: false,
      err: new Error("rest_id not found.")
    };
  }
  legacy.id_str = user.rest_id;
  legacy.screen_name ?? (legacy.screen_name = user.core?.screen_name);
  legacy.profile_image_url_https ?? (legacy.profile_image_url_https = user.avatar?.image_url);
  legacy.created_at ?? (legacy.created_at = user.core?.created_at);
  legacy.location ?? (legacy.location = user.location?.location);
  legacy.name ?? (legacy.name = user.core?.name);
  if (legacy.screen_name == null || legacy.screen_name.length === 0) {
    return {
      success: false,
      err: new Error(`User ${username} does not exist or is private.`)
    };
  }
  return {
    success: true,
    value: parseProfile(legacy, user.is_blue_verified)
  };
}
const idCache = /* @__PURE__ */ new Map();
async function getUserIdByScreenName(screenName, auth) {
  const cached = idCache.get(screenName);
  if (cached != null) {
    return { success: true, value: cached };
  }
  const profileRes = await getProfile(screenName, auth);
  if (!profileRes.success) {
    return profileRes;
  }
  const profile = profileRes.value;
  if (profile.userId != null) {
    idCache.set(screenName, profile.userId);
    return {
      success: true,
      value: profile.userId
    };
  }
  return {
    success: false,
    err: new Error("User ID is undefined.")
  };
}

async function* getUserTimeline(query, maxProfiles, fetchFunc) {
  let nProfiles = 0;
  let cursor = void 0;
  let consecutiveEmptyBatches = 0;
  while (nProfiles < maxProfiles) {
    const batch = await fetchFunc(
      query,
      maxProfiles,
      cursor
    );
    const { profiles, next } = batch;
    cursor = next;
    if (profiles.length === 0) {
      consecutiveEmptyBatches++;
      if (consecutiveEmptyBatches > 5) break;
    } else consecutiveEmptyBatches = 0;
    for (const profile of profiles) {
      if (nProfiles < maxProfiles) yield profile;
      else break;
      nProfiles++;
    }
    if (!next) break;
    await jitter(1e3);
  }
}
async function* getTweetTimeline(query, maxTweets, fetchFunc) {
  let nTweets = 0;
  let cursor = void 0;
  while (nTweets < maxTweets) {
    const batch = await fetchFunc(
      query,
      maxTweets,
      cursor
    );
    const { tweets, next } = batch;
    if (tweets.length === 0) {
      break;
    }
    for (const tweet of tweets) {
      if (nTweets < maxTweets) {
        cursor = next;
        yield tweet;
      } else {
        break;
      }
      nTweets++;
    }
    await jitter(1e3);
  }
}

function isFieldDefined(key) {
  return function(value) {
    return isDefined(value[key]);
  };
}
function isDefined(value) {
  return value != null;
}

const reHashtag = /\B(\#\S+\b)/g;
const reCashtag = /\B(\$\S+\b)/g;
const reTwitterUrl = /https:(\/\/t\.co\/([A-Za-z0-9]|[A-Za-z]){10})/g;
const reUsername = /\B(\@\S{1,15}\b)/g;
function parseMediaGroups(media) {
  const photos = [];
  const videos = [];
  let sensitiveContent = void 0;
  for (const m of media.filter(isFieldDefined("id_str")).filter(isFieldDefined("media_url_https"))) {
    if (m.type === "photo") {
      photos.push({
        id: m.id_str,
        url: m.media_url_https,
        alt_text: m.ext_alt_text
      });
    } else if (m.type === "video") {
      videos.push(parseVideo(m));
    } else if (m.type === "animated_gif") {
      videos.push(parseGif(m));
    }
    const sensitive = m.ext_sensitive_media_warning;
    if (sensitive != null) {
      sensitiveContent = sensitive.adult_content || sensitive.graphic_violence || sensitive.other;
    }
  }
  return { sensitiveContent, photos, videos };
}
function parseGif(m) {
  const gif = {
    id: m.id_str,
    preview: m.media_url_https
  };
  const variants = m.video_info?.variants ?? [];
  const url = variants.find((v) => v.content_type === "video/mp4")?.url;
  if (url) {
    gif.preview = url;
    gif.url = url;
  }
  return gif;
}
function parseVideo(m) {
  const video = {
    id: m.id_str,
    preview: m.media_url_https
  };
  let maxBitrate = 0;
  const variants = m.video_info?.variants ?? [];
  for (const variant of variants) {
    const bitrate = variant.bitrate;
    if (bitrate != null && bitrate > maxBitrate && variant.url != null) {
      let variantUrl = variant.url;
      const stringStart = 0;
      const tagSuffixIdx = variantUrl.indexOf("?tag=10");
      if (tagSuffixIdx !== -1) {
        variantUrl = variantUrl.substring(stringStart, tagSuffixIdx + 1);
      }
      video.url = variantUrl;
      maxBitrate = bitrate;
    }
  }
  return video;
}
function reconstructTweetHtml(tweet, photos, videos) {
  const media = [];
  let html = tweet.full_text ?? "";
  html = html.replace(reHashtag, linkHashtagHtml);
  html = html.replace(reCashtag, linkCashtagHtml);
  html = html.replace(reUsername, linkUsernameHtml);
  html = html.replace(reTwitterUrl, unwrapTcoUrlHtml(tweet, media));
  for (const { url } of photos) {
    if (media.indexOf(url) !== -1) {
      continue;
    }
    html += `<br><img src="${url}"/>`;
  }
  for (const { preview: url } of videos) {
    if (media.indexOf(url) !== -1) {
      continue;
    }
    html += `<br><img src="${url}"/>`;
  }
  html = html.replace(/\n/g, "<br>");
  return html;
}
function linkHashtagHtml(hashtag) {
  return `<a href="https://x.com/hashtag/${hashtag.replace(
    "#",
    ""
  )}">${hashtag}</a>`;
}
function linkCashtagHtml(cashtag) {
  return `<a href="https://x.com/search?q=%24${cashtag.replace(
    "$",
    ""
  )}">${cashtag}</a>`;
}
function linkUsernameHtml(username) {
  return `<a href="https://x.com/${username.replace("@", "")}">${username}</a>`;
}
function unwrapTcoUrlHtml(tweet, foundedMedia) {
  return function(tco) {
    for (const entity of tweet.entities?.urls ?? []) {
      if (tco === entity.url && entity.expanded_url != null) {
        return `<a href="${entity.expanded_url}">${tco}</a>`;
      }
    }
    for (const entity of tweet.extended_entities?.media ?? []) {
      if (tco === entity.url && entity.media_url_https != null) {
        foundedMedia.push(entity.media_url_https);
        return `<br><a href="${tco}"><img src="${entity.media_url_https}"/></a>`;
      }
    }
    return tco;
  };
}

function getLegacyTweetId(tweet) {
  if (tweet.id_str) {
    return tweet.id_str;
  }
  return tweet.conversation_id_str;
}
function parseLegacyTweet(coreUser, user, tweet, editControl) {
  if (tweet == null) {
    return {
      success: false,
      err: new Error("Tweet was not found in the timeline object.")
    };
  }
  if (user == null) {
    return {
      success: false,
      err: new Error("User was not found in the timeline object.")
    };
  }
  const tweetId = getLegacyTweetId(tweet);
  if (!tweetId) {
    return {
      success: false,
      err: new Error("Tweet ID was not found in object.")
    };
  }
  const hashtags = tweet.entities?.hashtags ?? [];
  const mentions = tweet.entities?.user_mentions ?? [];
  const media = tweet.extended_entities?.media ?? [];
  const pinnedTweets = new Set(
    user.pinned_tweet_ids_str ?? []
  );
  const urls = tweet.entities?.urls ?? [];
  const { photos, videos, sensitiveContent } = parseMediaGroups(media);
  const tweetVersions = editControl?.edit_tweet_ids ?? [tweetId];
  const name = user.name ?? coreUser?.name;
  const username = user.screen_name ?? coreUser?.screen_name;
  const tw = {
    __raw_UNSTABLE: tweet,
    bookmarkCount: tweet.bookmark_count,
    conversationId: tweet.conversation_id_str,
    id: tweetId,
    hashtags: hashtags.filter(isFieldDefined("text")).map((hashtag) => hashtag.text),
    likes: tweet.favorite_count,
    mentions: mentions.filter(isFieldDefined("id_str")).map((mention) => ({
      id: mention.id_str,
      username: mention.screen_name,
      name: mention.name
    })),
    name,
    permanentUrl: `https://x.com/${username}/status/${tweetId}`,
    photos,
    replies: tweet.reply_count,
    retweets: tweet.retweet_count,
    text: tweet.full_text,
    thread: [],
    urls: urls.filter(isFieldDefined("expanded_url")).map((url) => url.expanded_url),
    userId: tweet.user_id_str,
    username,
    videos,
    isQuoted: false,
    isReply: false,
    isEdited: tweetVersions.length > 1,
    versions: tweetVersions,
    isRetweet: false,
    isPin: false,
    sensitiveContent: false
  };
  if (tweet.created_at) {
    tw.timeParsed = new Date(Date.parse(tweet.created_at));
    tw.timestamp = Math.floor(tw.timeParsed.valueOf() / 1e3);
  }
  if (tweet.place?.id) {
    tw.place = tweet.place;
  }
  const quotedStatusIdStr = tweet.quoted_status_id_str;
  const inReplyToStatusIdStr = tweet.in_reply_to_status_id_str;
  const retweetedStatusIdStr = tweet.retweeted_status_id_str;
  const retweetedStatusResult = tweet.retweeted_status_result?.result;
  if (quotedStatusIdStr) {
    tw.isQuoted = true;
    tw.quotedStatusId = quotedStatusIdStr;
  }
  if (inReplyToStatusIdStr) {
    tw.isReply = true;
    tw.inReplyToStatusId = inReplyToStatusIdStr;
  }
  if (retweetedStatusIdStr || retweetedStatusResult) {
    tw.isRetweet = true;
    tw.retweetedStatusId = retweetedStatusIdStr;
    if (retweetedStatusResult) {
      const parsedResult = parseLegacyTweet(
        retweetedStatusResult?.core?.user_results?.result?.core,
        retweetedStatusResult?.core?.user_results?.result?.legacy,
        retweetedStatusResult?.legacy,
        retweetedStatusResult?.edit_control?.edit_control_initial
      );
      if (parsedResult.success) {
        tw.retweetedStatus = parsedResult.tweet;
      }
    }
  }
  const views = parseInt(tweet.ext_views?.count ?? "");
  if (!isNaN(views)) {
    tw.views = views;
  }
  if (pinnedTweets.has(tweetId)) {
    tw.isPin = true;
  }
  if (sensitiveContent) {
    tw.sensitiveContent = true;
  }
  tw.html = reconstructTweetHtml(tweet, tw.photos, tw.videos);
  return { success: true, tweet: tw };
}
function parseResult(result) {
  const noteTweetResultText = result?.note_tweet?.note_tweet_results?.result?.text;
  if (result?.legacy && noteTweetResultText) {
    result.legacy.full_text = noteTweetResultText;
  }
  const tweetResult = parseLegacyTweet(
    result?.core?.user_results?.result?.core,
    result?.core?.user_results?.result?.legacy,
    result?.legacy,
    result?.edit_control?.edit_control_initial
  );
  if (!tweetResult.success) {
    return tweetResult;
  }
  if (!tweetResult.tweet.views && result?.views?.count) {
    const views = parseInt(result.views.count);
    if (!isNaN(views)) {
      tweetResult.tweet.views = views;
    }
  }
  const quotedResult = result?.quoted_status_result?.result;
  if (quotedResult) {
    if (quotedResult.legacy && quotedResult.rest_id) {
      quotedResult.legacy.id_str = quotedResult.rest_id;
    }
    const quotedTweetResult = parseResult(quotedResult);
    if (quotedTweetResult.success) {
      tweetResult.tweet.quotedStatus = quotedTweetResult.tweet;
    }
  }
  return tweetResult;
}
const expectedEntryTypes = ["tweet", "profile-conversation"];
function getTimelineInstructionEntries(instruction) {
  const entries = instruction.entries ?? [];
  if (instruction.entry) {
    entries.push(instruction.entry);
  }
  return entries;
}
function parseTimelineTweetsV2(timeline) {
  let bottomCursor;
  let topCursor;
  const tweets = [];
  const instructions = timeline.data?.user?.result?.timeline?.timeline?.instructions ?? [];
  for (const instruction of instructions) {
    const entries = getTimelineInstructionEntries(instruction);
    for (const entry of entries) {
      const entryContent = entry.content;
      if (!entryContent) continue;
      if (entryContent.cursorType === "Bottom") {
        bottomCursor = entryContent.value;
        continue;
      } else if (entryContent.cursorType === "Top") {
        topCursor = entryContent.value;
        continue;
      }
      const idStr = entry.entryId;
      if (!expectedEntryTypes.some((entryType) => idStr.startsWith(entryType))) {
        continue;
      }
      if (entryContent.itemContent) {
        parseAndPush(tweets, entryContent.itemContent, idStr);
      } else if (entryContent.items) {
        for (const item of entryContent.items) {
          if (item.item?.itemContent) {
            parseAndPush(tweets, item.item.itemContent, idStr);
          }
        }
      }
    }
  }
  return { tweets, next: bottomCursor, previous: topCursor };
}
function parseTimelineEntryItemContentRaw(content, entryId, isConversation = false) {
  let result = content.tweet_results?.result ?? content.tweetResult?.result;
  if (result?.__typename === "Tweet" || result?.__typename === "TweetWithVisibilityResults" && result?.tweet) {
    if (result?.__typename === "TweetWithVisibilityResults")
      result = result.tweet;
    if (result?.legacy) {
      result.legacy.id_str = result.rest_id ?? entryId.replace("conversation-", "").replace("tweet-", "");
    }
    const tweetResult = parseResult(result);
    if (tweetResult.success) {
      if (isConversation) {
        if (content?.tweetDisplayType === "SelfThread") {
          tweetResult.tweet.isSelfThread = true;
        }
      }
      return tweetResult.tweet;
    }
  }
  return null;
}
function parseAndPush(tweets, content, entryId, isConversation = false) {
  const tweet = parseTimelineEntryItemContentRaw(
    content,
    entryId,
    isConversation
  );
  if (tweet) {
    tweets.push(tweet);
  }
}
function parseThreadedConversation(conversation) {
  const tweets = [];
  const instructions = conversation.data?.threaded_conversation_with_injections_v2?.instructions ?? [];
  for (const instruction of instructions) {
    const entries = getTimelineInstructionEntries(instruction);
    for (const entry of entries) {
      const entryContent = entry.content?.itemContent;
      if (entryContent) {
        parseAndPush(tweets, entryContent, entry.entryId, true);
      }
      for (const item of entry.content?.items ?? []) {
        const itemContent = item.item?.itemContent;
        if (itemContent) {
          parseAndPush(tweets, itemContent, entry.entryId, true);
        }
      }
    }
  }
  for (const tweet of tweets) {
    if (tweet.inReplyToStatusId) {
      for (const parentTweet of tweets) {
        if (parentTweet.id === tweet.inReplyToStatusId) {
          tweet.inReplyToStatus = parentTweet;
          break;
        }
      }
    }
    if (tweet.isSelfThread && tweet.conversationId === tweet.id) {
      for (const childTweet of tweets) {
        if (childTweet.isSelfThread && childTweet.id !== tweet.id) {
          tweet.thread.push(childTweet);
        }
      }
      if (tweet.thread.length === 0) {
        tweet.isSelfThread = false;
      }
    }
  }
  return tweets;
}

function parseSearchTimelineTweets(timeline) {
  let bottomCursor;
  let topCursor;
  const tweets = [];
  const instructions = timeline.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ?? [];
  for (const instruction of instructions) {
    if (instruction.type === "TimelineAddEntries" || instruction.type === "TimelineReplaceEntry") {
      if (instruction.entry?.content?.cursorType === "Bottom") {
        bottomCursor = instruction.entry.content.value;
        continue;
      } else if (instruction.entry?.content?.cursorType === "Top") {
        topCursor = instruction.entry.content.value;
        continue;
      }
      const entries = instruction.entries ?? [];
      for (const entry of entries) {
        const itemContent = entry.content?.itemContent;
        if (itemContent?.tweetDisplayType === "Tweet") {
          const tweetResultRaw = itemContent.tweet_results?.result;
          const tweetResult = parseLegacyTweet(
            tweetResultRaw?.core?.user_results?.result?.core,
            tweetResultRaw?.core?.user_results?.result?.legacy,
            tweetResultRaw?.legacy,
            tweetResultRaw?.edit_control?.edit_control_initial
          );
          if (tweetResult.success) {
            if (!tweetResult.tweet.views && tweetResultRaw?.views?.count) {
              const views = parseInt(tweetResultRaw.views.count);
              if (!isNaN(views)) {
                tweetResult.tweet.views = views;
              }
            }
            tweets.push(tweetResult.tweet);
          }
        } else if (entry.content?.cursorType === "Bottom") {
          bottomCursor = entry.content.value;
        } else if (entry.content?.cursorType === "Top") {
          topCursor = entry.content.value;
        }
      }
    }
  }
  return { tweets, next: bottomCursor, previous: topCursor };
}
function parseSearchTimelineUsers(timeline) {
  let bottomCursor;
  let topCursor;
  const profiles = [];
  const instructions = timeline.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ?? [];
  for (const instruction of instructions) {
    if (instruction.type === "TimelineAddEntries" || instruction.type === "TimelineReplaceEntry") {
      if (instruction.entry?.content?.cursorType === "Bottom") {
        bottomCursor = instruction.entry.content.value;
        continue;
      } else if (instruction.entry?.content?.cursorType === "Top") {
        topCursor = instruction.entry.content.value;
        continue;
      }
      const entries = instruction.entries ?? [];
      for (const entry of entries) {
        const itemContent = entry.content?.itemContent;
        if (itemContent?.userDisplayType === "User") {
          const userResultRaw = itemContent.user_results?.result;
          if (userResultRaw?.legacy) {
            const profile = parseProfile(
              userResultRaw.legacy,
              userResultRaw.is_blue_verified
            );
            if (!profile.userId) {
              profile.userId = userResultRaw.rest_id;
            }
            profiles.push(profile);
          }
        } else if (entry.content?.cursorType === "Bottom") {
          bottomCursor = entry.content.value;
        } else if (entry.content?.cursorType === "Top") {
          topCursor = entry.content.value;
        }
      }
    }
  }
  return { profiles, next: bottomCursor, previous: topCursor };
}

var SearchMode = /* @__PURE__ */ ((SearchMode2) => {
  SearchMode2[SearchMode2["Top"] = 0] = "Top";
  SearchMode2[SearchMode2["Latest"] = 1] = "Latest";
  SearchMode2[SearchMode2["Photos"] = 2] = "Photos";
  SearchMode2[SearchMode2["Videos"] = 3] = "Videos";
  SearchMode2[SearchMode2["Users"] = 4] = "Users";
  return SearchMode2;
})(SearchMode || {});
function searchTweets(query, maxTweets, searchMode, auth) {
  return getTweetTimeline(query, maxTweets, (q, mt, c) => {
    return fetchSearchTweets(q, mt, searchMode, auth, c);
  });
}
function searchProfiles(query, maxProfiles, auth) {
  return getUserTimeline(query, maxProfiles, (q, mt, c) => {
    return fetchSearchProfiles(q, mt, auth, c);
  });
}
async function fetchSearchTweets(query, maxTweets, searchMode, auth, cursor) {
  const timeline = await getSearchTimeline(
    query,
    maxTweets,
    searchMode,
    auth,
    cursor
  );
  return parseSearchTimelineTweets(timeline);
}
async function fetchSearchProfiles(query, maxProfiles, auth, cursor) {
  const timeline = await getSearchTimeline(
    query,
    maxProfiles,
    4 /* Users */,
    auth,
    cursor
  );
  return parseSearchTimelineUsers(timeline);
}
async function getSearchTimeline(query, maxItems, searchMode, auth, cursor) {
  if (!await auth.isLoggedIn()) {
    throw new AuthenticationError("Scraper is not logged-in for search.");
  }
  if (maxItems > 50) {
    maxItems = 50;
  }
  const searchTimelineRequest = apiRequestFactory.createSearchTimelineRequest();
  searchTimelineRequest.variables.rawQuery = query;
  searchTimelineRequest.variables.count = maxItems;
  searchTimelineRequest.variables.querySource = "typed_query";
  searchTimelineRequest.variables.product = "Top";
  if (cursor != null && cursor != "") {
    searchTimelineRequest.variables["cursor"] = cursor;
  }
  switch (searchMode) {
    case 1 /* Latest */:
      searchTimelineRequest.variables.product = "Latest";
      break;
    case 2 /* Photos */:
      searchTimelineRequest.variables.product = "Photos";
      break;
    case 3 /* Videos */:
      searchTimelineRequest.variables.product = "Videos";
      break;
    case 4 /* Users */:
      searchTimelineRequest.variables.product = "People";
      break;
  }
  const res = await requestApi(
    searchTimelineRequest.toRequestUrl(),
    auth,
    "GET",
    void 0,
    void 0,
    bearerToken2
  );
  if (!res.success) {
    throw res.err;
  }
  return res.value;
}

function parseRelationshipTimeline(timeline) {
  let bottomCursor;
  let topCursor;
  const profiles = [];
  const instructions = timeline.data?.user?.result?.timeline?.timeline?.instructions ?? [];
  for (const instruction of instructions) {
    if (instruction.type === "TimelineAddEntries" || instruction.type === "TimelineReplaceEntry") {
      if (instruction.entry?.content?.cursorType === "Bottom") {
        bottomCursor = instruction.entry.content.value;
        continue;
      }
      if (instruction.entry?.content?.cursorType === "Top") {
        topCursor = instruction.entry.content.value;
        continue;
      }
      const entries = instruction.entries ?? [];
      for (const entry of entries) {
        const itemContent = entry.content?.itemContent;
        if (itemContent?.userDisplayType === "User") {
          const userResultRaw = itemContent.user_results?.result;
          if (userResultRaw?.legacy) {
            const profile = parseProfile(
              userResultRaw.legacy,
              userResultRaw.is_blue_verified
            );
            if (!profile.userId) {
              profile.userId = userResultRaw.rest_id;
            }
            if (!profile.username && userResultRaw.core?.screen_name) {
              profile.username = userResultRaw.core.screen_name;
              profile.url = `https://x.com/${profile.username}`;
            }
            if (!profile.joined && userResultRaw.core?.created_at) {
              profile.joined = new Date(
                Date.parse(userResultRaw.core.created_at)
              );
            }
            profiles.push(profile);
          }
        } else if (entry.content?.cursorType === "Bottom") {
          bottomCursor = entry.content.value;
        } else if (entry.content?.cursorType === "Top") {
          topCursor = entry.content.value;
        }
      }
    }
  }
  return { profiles, next: bottomCursor, previous: topCursor };
}

function getFollowing(userId, maxProfiles, auth) {
  return getUserTimeline(userId, maxProfiles, (q, mt, c) => {
    return fetchProfileFollowing(q, mt, auth, c);
  });
}
function getFollowers(userId, maxProfiles, auth) {
  return getUserTimeline(userId, maxProfiles, (q, mt, c) => {
    return fetchProfileFollowers(q, mt, auth, c);
  });
}
async function fetchProfileFollowing(userId, maxProfiles, auth, cursor) {
  if (!await auth.isLoggedIn()) {
    throw new AuthenticationError(
      "Scraper is not logged-in for profile following."
    );
  }
  const timeline = await getFollowingTimeline(
    userId,
    maxProfiles,
    auth,
    cursor
  );
  return parseRelationshipTimeline(timeline);
}
async function fetchProfileFollowers(userId, maxProfiles, auth, cursor) {
  if (!await auth.isLoggedIn()) {
    throw new AuthenticationError(
      "Scraper is not logged-in for profile followers."
    );
  }
  const timeline = await getFollowersTimeline(
    userId,
    maxProfiles,
    auth,
    cursor
  );
  return parseRelationshipTimeline(timeline);
}
async function getFollowingTimeline(userId, maxItems, auth, cursor) {
  if (!auth.isLoggedIn()) {
    throw new AuthenticationError(
      "Scraper is not logged-in for profile following."
    );
  }
  if (maxItems > 50) {
    maxItems = 50;
  }
  const followingRequest = apiRequestFactory.createFollowingRequest();
  followingRequest.variables.userId = userId;
  followingRequest.variables.count = maxItems;
  followingRequest.variables.includePromotedContent = false;
  if (cursor != null && cursor != "") {
    followingRequest.variables.cursor = cursor;
  }
  const res = await requestApi(
    followingRequest.toRequestUrl(),
    auth,
    "GET",
    void 0,
    void 0,
    bearerToken2
  );
  if (!res.success) {
    throw res.err;
  }
  return res.value;
}
async function getFollowersTimeline(userId, maxItems, auth, cursor) {
  if (!auth.isLoggedIn()) {
    throw new AuthenticationError(
      "Scraper is not logged-in for profile followers."
    );
  }
  if (maxItems > 50) {
    maxItems = 50;
  }
  const followersRequest = apiRequestFactory.createFollowersRequest();
  followersRequest.variables.userId = userId;
  followersRequest.variables.count = maxItems;
  followersRequest.variables.includePromotedContent = false;
  if (cursor != null && cursor != "") {
    followersRequest.variables.cursor = cursor;
  }
  const res = await requestApi(
    followersRequest.toRequestUrl(),
    auth,
    "GET",
    void 0,
    void 0,
    bearerToken2
  );
  if (!res.success) {
    throw res.err;
  }
  return res.value;
}

async function getTrends(auth) {
  const params = new URLSearchParams();
  addApiParams(params, false);
  params.set("count", "20");
  params.set("candidate_source", "trends");
  params.set("include_page_configuration", "false");
  params.set("entity_tokens", "false");
  const res = await requestApi(
    `https://api.x.com/2/guide.json?${params.toString()}`,
    auth,
    "GET",
    void 0,
    void 0,
    bearerToken2
  );
  if (!res.success) {
    throw res.err;
  }
  const instructions = res.value.timeline?.instructions ?? [];
  if (instructions.length < 2) {
    throw new Error("No trend entries found.");
  }
  const entries = instructions[1].addEntries?.entries ?? [];
  if (entries.length < 2) {
    throw new Error("No trend entries found.");
  }
  const items = entries[1].content?.timelineModule?.items ?? [];
  const trends = [];
  for (const item of items) {
    const trend = item.item?.clientEventInfo?.details?.guideDetails?.transparentGuideDetails?.trendMetadata?.trendName;
    if (trend != null) {
      trends.push(trend);
    }
  }
  return trends;
}

function parseListTimelineTweets(timeline) {
  let bottomCursor;
  let topCursor;
  const tweets = [];
  const instructions = timeline.data?.list?.tweets_timeline?.timeline?.instructions ?? [];
  for (const instruction of instructions) {
    const entries = instruction.entries ?? [];
    for (const entry of entries) {
      const entryContent = entry.content;
      if (!entryContent) continue;
      if (entryContent.cursorType === "Bottom") {
        bottomCursor = entryContent.value;
        continue;
      } else if (entryContent.cursorType === "Top") {
        topCursor = entryContent.value;
        continue;
      }
      const idStr = entry.entryId;
      if (!idStr.startsWith("tweet") && !idStr.startsWith("list-conversation")) {
        continue;
      }
      if (entryContent.itemContent) {
        parseAndPush(tweets, entryContent.itemContent, idStr);
      } else if (entryContent.items) {
        for (const contentItem of entryContent.items) {
          if (contentItem.item && contentItem.item.itemContent && contentItem.entryId) {
            parseAndPush(
              tweets,
              contentItem.item.itemContent,
              contentItem.entryId.split("tweet-")[1]
            );
          }
        }
      }
    }
  }
  return { tweets, next: bottomCursor, previous: topCursor };
}

addApiFeatures({
  interactive_text_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_text_conversations_enabled: false,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: false,
  vibe_api_enabled: false
});
async function fetchTweets(userId, maxTweets, cursor, auth) {
  if (maxTweets > 200) {
    maxTweets = 200;
  }
  const userTweetsRequest = apiRequestFactory.createUserTweetsRequest();
  userTweetsRequest.variables.userId = userId;
  userTweetsRequest.variables.count = maxTweets;
  userTweetsRequest.variables.includePromotedContent = false;
  if (cursor != null && cursor != "") {
    userTweetsRequest.variables["cursor"] = cursor;
  }
  const res = await requestApi(
    userTweetsRequest.toRequestUrl(),
    auth,
    "GET",
    void 0,
    void 0,
    bearerToken2
  );
  if (!res.success) {
    throw res.err;
  }
  return parseTimelineTweetsV2(res.value);
}
async function fetchTweetsAndReplies(userId, maxTweets, cursor, auth) {
  if (maxTweets > 40) {
    maxTweets = 40;
  }
  const userTweetsRequest = apiRequestFactory.createUserTweetsAndRepliesRequest();
  userTweetsRequest.variables.userId = userId;
  userTweetsRequest.variables.count = maxTweets;
  userTweetsRequest.variables.includePromotedContent = false;
  if (cursor != null && cursor != "") {
    userTweetsRequest.variables["cursor"] = cursor;
  }
  const res = await requestApi(
    userTweetsRequest.toRequestUrl(),
    auth,
    "GET",
    void 0,
    void 0,
    bearerToken2
  );
  if (!res.success) {
    throw res.err;
  }
  return parseTimelineTweetsV2(res.value);
}
async function fetchListTweets(listId, maxTweets, cursor, auth) {
  if (maxTweets > 200) {
    maxTweets = 200;
  }
  const listTweetsRequest = apiRequestFactory.createListTweetsRequest();
  listTweetsRequest.variables.listId = listId;
  listTweetsRequest.variables.count = maxTweets;
  if (cursor != null && cursor != "") {
    listTweetsRequest.variables["cursor"] = cursor;
  }
  const res = await requestApi(
    listTweetsRequest.toRequestUrl(),
    auth,
    "GET",
    void 0,
    void 0,
    bearerToken2
  );
  if (!res.success) {
    throw res.err;
  }
  return parseListTimelineTweets(res.value);
}
function getTweets(user, maxTweets, auth) {
  return getTweetTimeline(user, maxTweets, async (q, mt, c) => {
    const userIdRes = await getUserIdByScreenName(q, auth);
    if (!userIdRes.success) {
      throw userIdRes.err;
    }
    const { value: userId } = userIdRes;
    return fetchTweets(userId, mt, c, auth);
  });
}
function getTweetsByUserId(userId, maxTweets, auth) {
  return getTweetTimeline(userId, maxTweets, (q, mt, c) => {
    return fetchTweets(q, mt, c, auth);
  });
}
function getTweetsAndReplies(user, maxTweets, auth) {
  return getTweetTimeline(user, maxTweets, async (q, mt, c) => {
    const userIdRes = await getUserIdByScreenName(q, auth);
    if (!userIdRes.success) {
      throw userIdRes.err;
    }
    const { value: userId } = userIdRes;
    return fetchTweetsAndReplies(userId, mt, c, auth);
  });
}
function getTweetsAndRepliesByUserId(userId, maxTweets, auth) {
  return getTweetTimeline(userId, maxTweets, (q, mt, c) => {
    return fetchTweetsAndReplies(q, mt, c, auth);
  });
}
async function fetchLikedTweets(userId, maxTweets, cursor, auth) {
  if (!await auth.isLoggedIn()) {
    throw new AuthenticationError(
      "Scraper is not logged-in for fetching liked tweets."
    );
  }
  if (maxTweets > 200) {
    maxTweets = 200;
  }
  const userTweetsRequest = apiRequestFactory.createUserLikedTweetsRequest();
  userTweetsRequest.variables.userId = userId;
  userTweetsRequest.variables.count = maxTweets;
  userTweetsRequest.variables.includePromotedContent = false;
  if (cursor != null && cursor != "") {
    userTweetsRequest.variables["cursor"] = cursor;
  }
  const res = await requestApi(
    userTweetsRequest.toRequestUrl(),
    auth,
    "GET",
    void 0,
    void 0,
    bearerToken2
  );
  if (!res.success) {
    throw res.err;
  }
  return parseTimelineTweetsV2(res.value);
}
function getLikedTweets(user, maxTweets, auth) {
  return getTweetTimeline(user, maxTweets, async (q, mt, c) => {
    const userIdRes = await getUserIdByScreenName(q, auth);
    if (!userIdRes.success) {
      throw userIdRes.err;
    }
    const { value: userId } = userIdRes;
    return fetchLikedTweets(userId, mt, c, auth);
  });
}
async function getTweetWhere(tweets, query) {
  const isCallback = typeof query === "function";
  for await (const tweet of tweets) {
    const matches = isCallback ? await query(tweet) : checkTweetMatches(tweet, query);
    if (matches) {
      return tweet;
    }
  }
  return null;
}
async function getTweetsWhere(tweets, query) {
  const isCallback = typeof query === "function";
  const filtered = [];
  for await (const tweet of tweets) {
    const matches = isCallback ? query(tweet) : checkTweetMatches(tweet, query);
    if (!matches) continue;
    filtered.push(tweet);
  }
  return filtered;
}
function checkTweetMatches(tweet, options) {
  return Object.keys(options).every((k) => {
    const key = k;
    return tweet[key] === options[key];
  });
}
async function getLatestTweet(user, includeRetweets, max, auth) {
  const timeline = getTweets(user, max, auth);
  return max === 1 ? (await timeline.next()).value : await getTweetWhere(timeline, { isRetweet: includeRetweets });
}
async function getTweet(id, auth) {
  const tweetDetailRequest = apiRequestFactory.createTweetDetailRequest();
  tweetDetailRequest.variables.focalTweetId = id;
  const res = await requestApi(
    tweetDetailRequest.toRequestUrl(),
    auth,
    "GET",
    void 0,
    void 0,
    bearerToken2
  );
  if (!res.success) {
    throw res.err;
  }
  if (!res.value) {
    return null;
  }
  const tweets = parseThreadedConversation(res.value);
  return tweets.find((tweet) => tweet.id === id) ?? null;
}
async function getTweetAnonymous(id, auth) {
  const tweetResultByRestIdRequest = apiRequestFactory.createTweetResultByRestIdRequest();
  tweetResultByRestIdRequest.variables.tweetId = id;
  const res = await requestApi(
    tweetResultByRestIdRequest.toRequestUrl(),
    auth,
    "GET",
    void 0,
    void 0,
    bearerToken2
  );
  if (!res.success) {
    throw res.err;
  }
  if (!res.value.data) {
    return null;
  }
  return parseTimelineEntryItemContentRaw(res.value.data, id);
}

async function* getDmConversationMessagesGenerator(conversationId, maxMessages, initialCursor, fetchFunc) {
  let nMessages = 0;
  let cursor = initialCursor;
  while (nMessages < maxMessages) {
    const batch = await fetchFunc(
      conversationId,
      maxMessages,
      cursor
    );
    const { conversation, next } = batch;
    if (!conversation?.entries || conversation?.entries?.length === 0) {
      break;
    }
    for (const entry of conversation.entries) {
      if (nMessages < maxMessages) {
        yield entry;
        nMessages++;
      } else {
        break;
      }
    }
    cursor = next;
    if (conversation.status === "AT_END" || !next) {
      break;
    }
    await jitter(1e3);
  }
}

async function fetchDmInbox(auth) {
  if (!await auth.isLoggedIn()) {
    throw new AuthenticationError(
      "Scraper is not logged-in for fetching direct messages."
    );
  }
  const params = new URLSearchParams();
  addApiParams(params, false);
  params.set("nsfw_filtering_enabled", "false");
  params.set("filter_low_quality", "true");
  params.set("include_quality", "all");
  params.set("include_ext_profile_image_shape", "1");
  params.set("dm_secret_conversations_enabled", "false");
  params.set("krs_registration_enabled", "false");
  params.set("include_ext_limited_action_results", "true");
  params.set("dm_users", "true");
  params.set("include_groups", "true");
  params.set("include_inbox_timelines", "true");
  params.set("supports_reactions", "true");
  params.set("supports_edit", "true");
  params.set("include_ext_edit_control", "true");
  params.set("include_ext_business_affiliations_label", "true");
  params.set("include_ext_parody_commentary_fan_label", "true");
  params.set(
    "ext",
    "mediaColor,altText,mediaStats,highlightedLabel,parodyCommentaryFanLabel,voiceInfo,birdwatchPivot,superFollowMetadata,unmentionInfo,editControl,article"
  );
  const res = await requestApi(
    `https://x.com/i/api/1.1/dm/inbox_initial_state.json?${params.toString()}`,
    auth
  );
  if (!res.success) {
    throw res.err;
  }
  return parseDmInbox(res.value);
}
async function parseDmInbox(inbox) {
  return inbox.inbox_initial_state;
}
async function getDmInbox(auth) {
  return await fetchDmInbox(auth);
}
async function fetchDmConversation(conversationId, cursor, auth) {
  if (!await auth.isLoggedIn()) {
    throw new AuthenticationError(
      "Scraper is not logged-in for fetching direct messages."
    );
  }
  const params = new URLSearchParams();
  addApiParams(params, false);
  params.set("context", "FETCH_DM_CONVERSATION_HISTORY");
  params.set("include_ext_profile_image_shape", "1");
  params.set("dm_secret_conversations_enabled", "false");
  params.set("krs_registration_enabled", "false");
  params.set("include_ext_limited_action_results", "true");
  params.set("dm_users", "true");
  params.set("include_groups", "true");
  params.set("include_inbox_timelines", "true");
  params.set("supports_reactions", "true");
  params.set("supports_edit", "true");
  params.set("include_conversation_info", "true");
  params.set(
    "ext",
    "mediaColor,altText,mediaStats,highlightedLabel,parodyCommentaryFanLabel,voiceInfo,birdwatchPivot,superFollowMetadata,unmentionInfo,editControl,article"
  );
  if (cursor) {
    if (cursor.maxId) {
      params.set("max_id", cursor.maxId);
    }
    if (cursor.minId) {
      params.set("min_id", cursor.minId);
    }
  }
  const url = `https://x.com/i/api/1.1/dm/conversation/${conversationId}.json?${params.toString()}`;
  const res = await requestApi(url, auth);
  if (!res.success) {
    throw res.err;
  }
  return parseDmConversation(res.value);
}
async function parseDmConversation(conversation) {
  return conversation.conversation_timeline;
}
async function getDmConversation(conversationId, cursor, auth) {
  return await fetchDmConversation(conversationId, cursor, auth);
}
function getDmMessages(conversationId, maxMessages, cursor, auth) {
  return getDmConversationMessagesGenerator(
    conversationId,
    maxMessages,
    cursor,
    async (id, _max, cursor2) => {
      const conversation = await fetchDmConversation(id, cursor2, auth);
      let next = void 0;
      if (cursor2?.minId && conversation.max_entry_id) {
        next = { minId: conversation.max_entry_id };
      } else if (conversation.min_entry_id) {
        next = { maxId: conversation.min_entry_id };
      }
      return {
        conversation,
        next
      };
    }
  );
}
function findDmConversationsByUserId(inbox, userId) {
  const conversations = [];
  for (const conversationId in inbox.conversations) {
    const conversation = inbox.conversations[conversationId];
    const hasUser = conversation.participants.some(
      (participant) => participant.user_id === userId
    );
    if (hasUser) {
      conversations.push(conversation);
    }
  }
  return conversations;
}

const log = debug("twitter-scraper:scraper");
const twUrl = "https://x.com";
class Scraper {
  /**
   * Creates a new Scraper object.
   * - Scrapers maintain their own guest tokens for Twitter's internal API.
   * - Reusing Scraper objects is recommended to minimize the time spent authenticating unnecessarily.
   */
  constructor(options) {
    this.options = options;
    this.subtaskHandlers = /* @__PURE__ */ new Map();
    this.token = bearerToken;
    this.useGuestAuth();
  }
  /**
   * Registers a subtask handler for the given subtask ID. This
   * will override any existing handler for the same subtask.
   * @param subtaskId The ID of the subtask to register the handler for.
   * @param subtaskHandler The handler function to register.
   */
  registerAuthSubtaskHandler(subtaskId, subtaskHandler) {
    this.subtaskHandlers.set(subtaskId, subtaskHandler);
    if (this.auth instanceof TwitterUserAuth) {
      this.auth.registerSubtaskHandler(subtaskId, subtaskHandler);
    }
    if (this.authTrends instanceof TwitterUserAuth) {
      this.authTrends.registerSubtaskHandler(subtaskId, subtaskHandler);
    }
  }
  /**
   * Applies all stored subtask handlers to the given auth instance.
   * @internal
   */
  applySubtaskHandlers(auth) {
    for (const [subtaskId, handler] of this.subtaskHandlers) {
      auth.registerSubtaskHandler(subtaskId, handler);
    }
  }
  /**
   * Initializes auth properties using a guest token.
   * Used when creating a new instance of this class, and when logging out.
   * @internal
   */
  useGuestAuth() {
    this.auth = new TwitterGuestAuth(this.token, this.getAuthOptions());
    this.authTrends = new TwitterGuestAuth(this.token, this.getAuthOptions());
  }
  /**
   * Fetches a Twitter profile.
   * @param username The Twitter username of the profile to fetch, without an `@` at the beginning.
   * @returns The requested {@link Profile}.
   */
  async getProfile(username) {
    const res = await getProfile(username, this.auth);
    return this.handleResponse(res);
  }
  /**
   * Fetches the user ID corresponding to the provided screen name.
   * @param screenName The Twitter screen name of the profile to fetch.
   * @returns The ID of the corresponding account.
   */
  async getUserIdByScreenName(screenName) {
    const res = await getUserIdByScreenName(screenName, this.auth);
    return this.handleResponse(res);
  }
  /**
   * Fetches tweets from Twitter.
   * @param query The search query. Any Twitter-compatible query format can be used.
   * @param maxTweets The maximum number of tweets to return.
   * @param includeReplies Whether or not replies should be included in the response.
   * @param searchMode The category filter to apply to the search. Defaults to `Top`.
   * @returns An {@link AsyncGenerator} of tweets matching the provided filters.
   */
  searchTweets(query, maxTweets, searchMode = SearchMode.Top) {
    return searchTweets(query, maxTweets, searchMode, this.auth);
  }
  /**
   * Fetches profiles from Twitter.
   * @param query The search query. Any Twitter-compatible query format can be used.
   * @param maxProfiles The maximum number of profiles to return.
   * @returns An {@link AsyncGenerator} of tweets matching the provided filter(s).
   */
  searchProfiles(query, maxProfiles) {
    return searchProfiles(query, maxProfiles, this.auth);
  }
  /**
   * Fetches tweets from Twitter.
   * @param query The search query. Any Twitter-compatible query format can be used.
   * @param maxTweets The maximum number of tweets to return.
   * @param includeReplies Whether or not replies should be included in the response.
   * @param searchMode The category filter to apply to the search. Defaults to `Top`.
   * @param cursor The search cursor, which can be passed into further requests for more results.
   * @returns A page of results, containing a cursor that can be used in further requests.
   */
  fetchSearchTweets(query, maxTweets, searchMode, cursor) {
    return fetchSearchTweets(query, maxTweets, searchMode, this.auth, cursor);
  }
  /**
   * Fetches profiles from Twitter.
   * @param query The search query. Any Twitter-compatible query format can be used.
   * @param maxProfiles The maximum number of profiles to return.
   * @param cursor The search cursor, which can be passed into further requests for more results.
   * @returns A page of results, containing a cursor that can be used in further requests.
   */
  fetchSearchProfiles(query, maxProfiles, cursor) {
    return fetchSearchProfiles(query, maxProfiles, this.auth, cursor);
  }
  /**
   * Fetches list tweets from Twitter.
   * @param listId The list id
   * @param maxTweets The maximum number of tweets to return.
   * @param cursor The search cursor, which can be passed into further requests for more results.
   * @returns A page of results, containing a cursor that can be used in further requests.
   */
  fetchListTweets(listId, maxTweets, cursor) {
    return fetchListTweets(listId, maxTweets, cursor, this.auth);
  }
  /**
   * Fetch the tweets a user has liked
   * @param userId The user whose liked tweets should be returned
   * @param maxTweets The maximum number of tweets to return.
   * @param cursor The search cursor, which can be passed into further requests for more results.
   * @returns A page of results, containing a cursor that can be used in further requests.
   */
  fetchLikedTweets(userId, maxTweets, cursor) {
    return fetchLikedTweets(userId, maxTweets, cursor, this.auth);
  }
  /**
   * Fetch the profiles a user is following
   * @param userId The user whose following should be returned
   * @param maxProfiles The maximum number of profiles to return.
   * @returns An {@link AsyncGenerator} of following profiles for the provided user.
   */
  getFollowing(userId, maxProfiles) {
    return getFollowing(userId, maxProfiles, this.auth);
  }
  /**
   * Fetch the profiles that follow a user
   * @param userId The user whose followers should be returned
   * @param maxProfiles The maximum number of profiles to return.
   * @returns An {@link AsyncGenerator} of profiles following the provided user.
   */
  getFollowers(userId, maxProfiles) {
    return getFollowers(userId, maxProfiles, this.auth);
  }
  /**
   * Fetches following profiles from Twitter.
   * @param userId The user whose following should be returned
   * @param maxProfiles The maximum number of profiles to return.
   * @param cursor The search cursor, which can be passed into further requests for more results.
   * @returns A page of results, containing a cursor that can be used in further requests.
   */
  fetchProfileFollowing(userId, maxProfiles, cursor) {
    return fetchProfileFollowing(userId, maxProfiles, this.auth, cursor);
  }
  /**
   * Fetches profile followers from Twitter.
   * @param userId The user whose following should be returned
   * @param maxProfiles The maximum number of profiles to return.
   * @param cursor The search cursor, which can be passed into further requests for more results.
   * @returns A page of results, containing a cursor that can be used in further requests.
   */
  fetchProfileFollowers(userId, maxProfiles, cursor) {
    return fetchProfileFollowers(userId, maxProfiles, this.auth, cursor);
  }
  /**
   * Fetches the current trends from Twitter.
   * @returns The current list of trends.
   */
  getTrends() {
    return getTrends(this.authTrends);
  }
  /**
   * Fetches tweets from a Twitter user.
   * @param user The user whose tweets should be returned.
   * @param maxTweets The maximum number of tweets to return. Defaults to `200`.
   * @returns An {@link AsyncGenerator} of tweets from the provided user.
   */
  getTweets(user, maxTweets = 200) {
    return getTweets(user, maxTweets, this.auth);
  }
  /**
   * Fetches liked tweets from a Twitter user. Requires authentication.
   * @param user The user whose likes should be returned.
   * @param maxTweets The maximum number of tweets to return. Defaults to `200`.
   * @returns An {@link AsyncGenerator} of liked tweets from the provided user.
   */
  getLikedTweets(user, maxTweets = 200) {
    return getLikedTweets(user, maxTweets, this.auth);
  }
  /**
   * Fetches tweets from a Twitter user using their ID.
   * @param userId The user whose tweets should be returned.
   * @param maxTweets The maximum number of tweets to return. Defaults to `200`.
   * @returns An {@link AsyncGenerator} of tweets from the provided user.
   */
  getTweetsByUserId(userId, maxTweets = 200) {
    return getTweetsByUserId(userId, maxTweets, this.auth);
  }
  /**
   * Fetches tweets and replies from a Twitter user.
   * @param user The user whose tweets should be returned.
   * @param maxTweets The maximum number of tweets to return. Defaults to `200`.
   * @returns An {@link AsyncGenerator} of tweets from the provided user.
   */
  getTweetsAndReplies(user, maxTweets = 200) {
    return getTweetsAndReplies(user, maxTweets, this.auth);
  }
  /**
   * Fetches tweets and replies from a Twitter user using their ID.
   * @param userId The user whose tweets should be returned.
   * @param maxTweets The maximum number of tweets to return. Defaults to `200`.
   * @returns An {@link AsyncGenerator} of tweets from the provided user.
   */
  getTweetsAndRepliesByUserId(userId, maxTweets = 200) {
    return getTweetsAndRepliesByUserId(userId, maxTweets, this.auth);
  }
  /**
   * Fetches the first tweet matching the given query.
   *
   * Example:
   * ```js
   * const timeline = scraper.getTweets('user', 200);
   * const retweet = await scraper.getTweetWhere(timeline, { isRetweet: true });
   * ```
   * @param tweets The {@link AsyncIterable} of tweets to search through.
   * @param query A query to test **all** tweets against. This may be either an
   * object of key/value pairs or a predicate. If this query is an object, all
   * key/value pairs must match a {@link Tweet} for it to be returned. If this query
   * is a predicate, it must resolve to `true` for a {@link Tweet} to be returned.
   * - All keys are optional.
   * - If specified, the key must be implemented by that of {@link Tweet}.
   */
  getTweetWhere(tweets, query) {
    return getTweetWhere(tweets, query);
  }
  /**
   * Fetches all tweets matching the given query.
   *
   * Example:
   * ```js
   * const timeline = scraper.getTweets('user', 200);
   * const retweets = await scraper.getTweetsWhere(timeline, { isRetweet: true });
   * ```
   * @param tweets The {@link AsyncIterable} of tweets to search through.
   * @param query A query to test **all** tweets against. This may be either an
   * object of key/value pairs or a predicate. If this query is an object, all
   * key/value pairs must match a {@link Tweet} for it to be returned. If this query
   * is a predicate, it must resolve to `true` for a {@link Tweet} to be returned.
   * - All keys are optional.
   * - If specified, the key must be implemented by that of {@link Tweet}.
   */
  getTweetsWhere(tweets, query) {
    return getTweetsWhere(tweets, query);
  }
  /**
   * Fetches the most recent tweet from a Twitter user.
   * @param user The user whose latest tweet should be returned.
   * @param includeRetweets Whether or not to include retweets. Defaults to `false`.
   * @returns The {@link Tweet} object or `null`/`undefined` if it couldn't be fetched.
   */
  getLatestTweet(user, includeRetweets = false, max = 200) {
    return getLatestTweet(user, includeRetweets, max, this.auth);
  }
  /**
   * Fetches a single tweet.
   * @param id The ID of the tweet to fetch.
   * @returns The {@link Tweet} object, or `null` if it couldn't be fetched.
   */
  getTweet(id) {
    if (this.auth instanceof TwitterUserAuth) {
      return getTweet(id, this.auth);
    } else {
      return getTweetAnonymous(id, this.auth);
    }
  }
  /**
   * Retrieves the direct message inbox for the authenticated user.
   *
   * @return A promise that resolves to an object representing the direct message inbox.
   */
  getDmInbox() {
    return getDmInbox(this.auth);
  }
  /**
   * Retrieves the direct message conversation for the specified conversation ID.
   *
   * @param conversationId - The unique identifier of the DM conversation to retrieve.
   * @param cursor - Use `maxId` to get messages before a message ID (older messages), or `minId` to get messages after a message ID (newer messages).
   * @return A promise that resolves to the timeline of the DM conversation.
   */
  getDmConversation(conversationId, cursor) {
    return getDmConversation(conversationId, cursor, this.auth);
  }
  /**
   * Retrieves direct messages from a specific conversation.
   *
   * @param conversationId - The unique identifier of the conversation to fetch messages from.
   * @param [maxMessages=20] - The maximum number of messages to retrieve per request.
   * @param cursor - Use `maxId` to get messages before a message ID (older messages), or `minId` to get messages after a message ID (newer messages).
   * @returns An {@link AsyncGenerator} of messages from the provided conversation.
   */
  getDmMessages(conversationId, maxMessages = 20, cursor) {
    return getDmMessages(conversationId, maxMessages, cursor, this.auth);
  }
  /**
   * Retrieves a list of direct message conversations for a specific user based on their user ID.
   *
   * @param inbox - The DM inbox containing all available conversations.
   * @param userId - The unique identifier of the user whose DM conversations are to be retrieved.
   * @return An array of DM conversations associated with the specified user ID.
   */
  findDmConversationsByUserId(inbox, userId) {
    return findDmConversationsByUserId(inbox, userId);
  }
  /**
   * Returns if the scraper has a guest token. The token may not be valid.
   * @returns `true` if the scraper has a guest token; otherwise `false`.
   */
  hasGuestToken() {
    return this.auth.hasToken() || this.authTrends.hasToken();
  }
  /**
   * Returns if the scraper is logged in as a real user.
   * @returns `true` if the scraper is logged in with a real user account; otherwise `false`.
   */
  async isLoggedIn() {
    return await this.auth.isLoggedIn() && await this.authTrends.isLoggedIn();
  }
  /**
   * Login to Twitter as a real Twitter account. This enables running
   * searches.
   * @param username The username of the Twitter account to login with.
   * @param password The password of the Twitter account to login with.
   * @param email The email to log in with, if you have email confirmation enabled.
   * @param twoFactorSecret The secret to generate two factor authentication tokens with, if you have two factor authentication enabled.
   */
  async login(username, password, email, twoFactorSecret) {
    const userAuth = new TwitterUserAuth(bearerToken2, this.getAuthOptions());
    this.applySubtaskHandlers(userAuth);
    await userAuth.login(username, password, email, twoFactorSecret);
    this.auth = userAuth;
    this.authTrends = userAuth;
  }
  /**
   * Log out of Twitter.
   */
  async logout() {
    await this.auth.logout();
    await this.authTrends.logout();
    this.useGuestAuth();
  }
  /**
   * Retrieves all cookies for the current session.
   * @returns All cookies for the current session.
   */
  async getCookies() {
    return await this.authTrends.cookieJar().getCookies(
      typeof document !== "undefined" ? document.location.toString() : twUrl
    );
  }
  /**
   * Set cookies for the current session.
   * @param cookies The cookies to set for the current session.
   */
  async setCookies(cookies) {
    const userAuth = new TwitterUserAuth(bearerToken2, this.getAuthOptions());
    this.applySubtaskHandlers(userAuth);
    for (const cookie of cookies) {
      if (cookie == null) continue;
      if (typeof cookie === "string") {
        try {
          await userAuth.cookieJar().setCookie(cookie, "https://x.com");
        } catch (err) {
          log(`Failed to parse cookie string: ${err.message}`);
        }
      } else {
        if (cookie.domain && cookie.domain.startsWith(".")) {
          cookie.domain = cookie.domain.substring(1);
          cookie.hostOnly = false;
        }
        const cookieDomain = cookie.domain || "x.com";
        const cookieUrl = `https://${cookieDomain}`;
        await userAuth.cookieJar().setCookie(cookie, cookieUrl);
      }
    }
    this.auth = userAuth;
    this.authTrends = userAuth;
    const isLoggedIn = await userAuth.isLoggedIn();
    if (!isLoggedIn) {
      const cookieString = await userAuth.cookieJar().getCookies(twUrl).then((c) => c.map((cookie) => cookie.key));
      if (cookieString.includes("ct0") && !cookieString.includes("auth_token")) {
        log(
          "auth_token cookie is missing. This is required for authenticated API access. The auth_token is an HttpOnly cookie that cannot be accessed via document.cookie. Export it using a browser extension (e.g., EditThisCookie) or DevTools Application tab."
        );
      }
    }
  }
  /**
   * Clear all cookies for the current session.
   */
  async clearCookies() {
    await this.auth.cookieJar().removeAllCookies();
    await this.authTrends.cookieJar().removeAllCookies();
  }
  /**
   * Sets the optional cookie to be used in requests.
   * @param _cookie The cookie to be used in requests.
   * @deprecated This function no longer represents any part of Twitter's auth flow.
   * @returns This scraper instance.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  withCookie(_cookie) {
    console.warn(
      "Warning: Scraper#withCookie is deprecated and will be removed in a later version. Use Scraper#login or Scraper#setCookies instead."
    );
    return this;
  }
  /**
   * Sets the optional CSRF token to be used in requests.
   * @param _token The CSRF token to be used in requests.
   * @deprecated This function no longer represents any part of Twitter's auth flow.
   * @returns This scraper instance.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  withXCsrfToken(_token) {
    console.warn(
      "Warning: Scraper#withXCsrfToken is deprecated and will be removed in a later version."
    );
    return this;
  }
  getAuthOptions() {
    return {
      fetch: this.options?.fetch,
      transform: this.options?.transform,
      rateLimitStrategy: this.options?.rateLimitStrategy,
      experimental: {
        xClientTransactionId: this.options?.experimental?.xClientTransactionId,
        xpff: this.options?.experimental?.xpff,
        flowStepDelay: this.options?.experimental?.flowStepDelay,
        browserProfile: this.options?.experimental?.browserProfile
      }
    };
  }
  handleResponse(res) {
    if (!res.success) {
      throw res.err;
    }
    return res.value;
  }
}

const ORIGINAL_CIPHERS = tls.DEFAULT_CIPHERS;
const TOP_N_SHUFFLE = 8;
const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = node_crypto.randomBytes(4).readUint32LE() % array.length;
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};
const randomizeCiphers = () => {
  do {
    const cipherList = ORIGINAL_CIPHERS.split(":");
    const shuffled = shuffleArray(cipherList.slice(0, TOP_N_SHUFFLE));
    const retained = cipherList.slice(TOP_N_SHUFFLE);
    tls.DEFAULT_CIPHERS = [...shuffled, ...retained].join(":");
  } while (tls.DEFAULT_CIPHERS === ORIGINAL_CIPHERS);
};

class NodePlatform {
  randomizeCiphers() {
    randomizeCiphers();
    return Promise.resolve();
  }
}
const platform = new NodePlatform();

var index = /*#__PURE__*/Object.freeze({
  __proto__: null,
  platform: platform
});

exports.ApiError = ApiError;
exports.AuthenticationError = AuthenticationError;
exports.ErrorRateLimitStrategy = ErrorRateLimitStrategy;
exports.Scraper = Scraper;
exports.SearchMode = SearchMode;
exports.WaitingRateLimitStrategy = WaitingRateLimitStrategy;
exports.randomizeBrowserProfile = randomizeBrowserProfile;
//# sourceMappingURL=index.cjs.map
