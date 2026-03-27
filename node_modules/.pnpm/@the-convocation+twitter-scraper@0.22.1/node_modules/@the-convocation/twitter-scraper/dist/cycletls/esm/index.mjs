import initCycleTLS from 'cycletls';
import { Headers } from 'headers-polyfill';
import debug from 'debug';

const CHROME_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36";
const CHROME_JA3 = "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-10-35-16-11-51-27-65037-43-45-18-23-5-65281-13-17613,4588-29-23-24,0";
const CHROME_JA4R = "t13d1516h2_002f,0035,009c,009d,1301,1302,1303,c013,c014,c02b,c02c,c02f,c030,cca8,cca9_0005,000a,000b,000d,0012,0017,001b,0023,002b,002d,0033,44cd,fe0d,ff01_0403,0804,0401,0503,0805,0501,0806,0601";
const CHROME_HTTP2_FINGERPRINT = "1:65536;2:0;4:6291456;6:262144|15663105|0|m,a,s,p";
const CHROME_HEADER_ORDER = [
  // HTTP/2 pseudo-headers (Chrome 144 order: method, authority, scheme, path)
  ":method",
  ":authority",
  ":scheme",
  ":path",
  // Chrome Client Hints (mandatory for modern detection bypass)
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  // Standard browser headers
  "upgrade-insecure-requests",
  "user-agent",
  "accept",
  "origin",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-user",
  "sec-fetch-dest",
  "referer",
  "accept-encoding",
  "accept-language",
  "priority",
  // Authentication headers
  "authorization",
  "x-csrf-token",
  "x-guest-token",
  "x-twitter-auth-type",
  "x-twitter-active-user",
  "x-twitter-client-language",
  "x-client-transaction-id",
  "x-xp-forwarded-for",
  // POST-specific
  "content-type",
  "cookie"
];

const log = debug("twitter-scraper:cycletls");
let cycleTLSInstance = null;
async function initCycleTLSFetch() {
  if (!cycleTLSInstance) {
    log("Initializing CycleTLS...");
    cycleTLSInstance = await initCycleTLS();
    log("CycleTLS initialized successfully");
  }
  return cycleTLSInstance;
}
function cycleTLSExit() {
  if (cycleTLSInstance) {
    log("Exiting CycleTLS...");
    cycleTLSInstance.exit();
    cycleTLSInstance = null;
  }
}
async function cycleTLSFetch(input, init) {
  const instance = await initCycleTLSFetch();
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init?.method || "GET").toUpperCase();
  log(`Making ${method} request to ${url}`);
  const headers = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      init.headers.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, init.headers);
    }
  }
  let body;
  if (init?.body) {
    if (typeof init.body === "string") {
      body = init.body;
    } else if (init.body instanceof URLSearchParams) {
      body = init.body.toString();
    } else {
      body = init.body.toString();
    }
  }
  const options = {
    body,
    headers,
    ja3: CHROME_JA3,
    ja4r: CHROME_JA4R,
    http2Fingerprint: CHROME_HTTP2_FINGERPRINT,
    headerOrder: CHROME_HEADER_ORDER,
    orderAsProvided: true,
    disableGrease: false,
    userAgent: headers["user-agent"] || CHROME_USER_AGENT
  };
  try {
    const response = await instance(
      url,
      options,
      method.toLowerCase()
    );
    const responseHeaders = new Headers();
    if (response.headers) {
      Object.entries(response.headers).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((v) => {
            responseHeaders.append(key, v);
          });
        } else if (typeof value === "string") {
          responseHeaders.set(key, value);
        }
      });
    }
    let responseBody = "";
    if (typeof response.text === "function") {
      responseBody = await response.text();
    } else if (response.body) {
      responseBody = response.body;
    }
    const fetchResponse = new Response(responseBody, {
      status: response.status,
      statusText: "",
      // CycleTLS doesn't provide status text
      headers: responseHeaders
    });
    return fetchResponse;
  } catch (error) {
    log(`CycleTLS request failed: ${error}`);
    throw error;
  }
}

export { cycleTLSExit, cycleTLSFetch };
//# sourceMappingURL=index.mjs.map
