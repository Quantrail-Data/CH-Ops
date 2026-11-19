// Saves API answers while recording, and gives them back while checking.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { FIXTURES_DIR } from "./settings.js";

// Body fields that change on every run. They are left out of the key.
const CHANGING_BODY_FIELDS = ["queryId", "query_id", "requestId", "nonce", "timestamp"];

function cleanBody(bodyText) {
  if (!bodyText) return "";
  try {
    const body = JSON.parse(bodyText);
    for (const field of CHANGING_BODY_FIELDS) delete body[field];
    return JSON.stringify(body);
  } catch {
    return bodyText;
  }
}

// One key for each different request.
export function requestKey(method, url, bodyText) {
  const address = new URL(url);
  return `${method} ${address.pathname}${address.search} ${cleanBody(bodyText)}`;
}

function routeKey(method, url) {
  const address = new URL(url);
  return `${method} ${address.pathname}`;
}

// Answer fields that change on every call. Two answers that differ only in
// these fields count as the same answer.
const CHANGING_ANSWER_FIELDS = ["queryId", "query_id", "elapsed", "elapsed_ns", "elapsedMs", "durationMs"];

function answerWithoutChangingFields(bodyText) {
  try {
    return JSON.stringify(JSON.parse(bodyText), (key, value) => (CHANGING_ANSWER_FIELDS.includes(key) ? undefined : value));
  } catch {
    return bodyText;
  }
}

// The file is gzipped, because the answers are large and repeat a lot.
export function fixtureFile(dataset) {
  return path.join(FIXTURES_DIR, dataset, "api.json.gz");
}

export function loadFixtures(dataset) {
  const file = fixtureFile(dataset);
  if (!fs.existsSync(file)) return { meta: {}, answers: {} };
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
}

export function saveFixtures(dataset, fixtures) {
  const file = fixtureFile(dataset);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(fixtures), { level: 9 }));
}

// Recording: send each API call to the real backend and keep the answer.
export async function startRecording(page, fixtures, onRequestDone) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const key = requestKey(request.method(), request.url(), request.postData());
    try {
      const response = await route.fetch();
      const body = await response.text();
      const answer = {
        status: response.status(),
        contentType: response.headers()["content-type"] || "application/json",
        body,
      };
      fixtures.answers[key] = fixtures.answers[key] || [];
      // Keep each different answer once, in order. Polling pages get a list.
      const comparable = answerWithoutChangingFields(body);
      const known = fixtures.answers[key].some(
        (saved) => saved.status === answer.status && answerWithoutChangingFields(saved.body) === comparable,
      );
      if (!known) fixtures.answers[key].push(answer);
      await route.fulfill({ status: answer.status, contentType: answer.contentType, body });
    } catch (error) {
      await route.abort().catch(() => {});
      // Requests that are still open when the browser closes are not a problem.
      if (!String(error.message).includes("closed")) {
        console.log(`Request failed while recording: ${key.slice(0, 160)} ${error.message.split("\n")[0]}`);
      }
    } finally {
      onRequestDone?.();
    }
  });
}

// Checking: answer each API call from the fixture file. No backend is needed.
export async function startReplay(page, fixtures, missing, onRequestDone) {
  const answersByRoute = {};
  for (const [key, answers] of Object.entries(fixtures.answers)) {
    const [method, address] = key.split(" ");
    const routeName = `${method} ${address.split("?")[0]}`;
    answersByRoute[routeName] = answersByRoute[routeName] || answers;
  }
  const timesUsed = {};

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const key = requestKey(request.method(), request.url(), request.postData());
    let answers = fixtures.answers[key];
    if (!answers) {
      // Not recorded. The check reports it. The page still gets an answer of
      // the same kind, so it does not stop.
      missing.push(key);
      answers = answersByRoute[routeKey(request.method(), request.url())] || [
        { status: 599, contentType: "application/json", body: JSON.stringify({ error: "Not recorded" }) },
      ];
    }
    const used = timesUsed[key] || 0;
    timesUsed[key] = used + 1;
    const answer = answers[Math.min(used, answers.length - 1)];
    await route.fulfill({ status: answer.status, contentType: answer.contentType, body: answer.body });
    onRequestDone?.();
  });
}
