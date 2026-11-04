// webhookPost.js - Sends a webhook POST to the IP address that the webhook check accepted.
// The DNS answer for a name can change between the check and the send (DNS rebinding).
// So this send does not ask DNS again. It connects to the checked address.
// The TLS certificate is still checked against the host name of the URL.
// It does not follow redirects. The caller treats a 3xx answer as a failure.
// Copyright (C) 2026 Quantrail Data Private Limited

import https from "node:https";

const SEND_TIMEOUT_MS = 15000;
// A webhook answer is short. More text than this is not kept.
const MAX_ANSWER_CHARS = 64 * 1024;

// url: the https webhook URL. address: the IP address from validateWebhookUrl.
// options.ca: extra trusted certificates, only for tests.
export function postJsonToAddress(url, address, body, { ca } = {}) {
  const target = new URL(url);
  const payload = JSON.stringify(body);
  const family = address.includes(":") ? 6 : 4;

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: target.hostname.replace(/^\[(.*)\]$/, "$1"),
        port: target.port || 443,
        path: target.pathname + target.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        ca,
        timeout: SEND_TIMEOUT_MS,
        // Always answer with the checked address, never with a new DNS answer.
        lookup: (name, lookupOptions, callback) => {
          if (lookupOptions && lookupOptions.all) callback(null, [{ address, family }]);
          else callback(null, address, family);
        },
      },
      (response) => {
        let answerText = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          if (answerText.length < MAX_ANSWER_CHARS) answerText += chunk;
        });
        response.on("end", () => {
          const status = response.statusCode;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            json: async () => JSON.parse(answerText),
          });
        });
      },
    );
    request.on("timeout", () => {
      request.destroy(new Error(`The webhook did not answer in ${SEND_TIMEOUT_MS / 1000} seconds.`));
    });
    request.on("error", reject);
    request.end(payload);
  });
}
