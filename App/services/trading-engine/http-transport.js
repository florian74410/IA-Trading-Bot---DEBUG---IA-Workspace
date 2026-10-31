
"use strict";

const https = require("https");

function requestJson({ method = "GET", url, headers = {}, body = null, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const data = body == null ? null : (typeof body === "string" ? body : JSON.stringify(body));

    const req = https.request({
      method,
      hostname: target.hostname,
      port: target.port || 443,
      path: target.pathname + target.search,
      headers: {
        "Accept": "application/json",
        ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}),
        ...headers
      },
      timeout: timeoutMs
    }, res => {
      let chunks = "";
      res.setEncoding("utf8");
      res.on("data", c => chunks += c);
      res.on("end", () => {
        let parsed = chunks;
        try { parsed = chunks ? JSON.parse(chunks) : null; } catch (_) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on("timeout", () => req.destroy(new Error("HTTP timeout")));
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

module.exports = { requestJson };
