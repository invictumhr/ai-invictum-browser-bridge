import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const baseUrl = (process.env.INVICTUM_CONTROL_URL ?? "http://127.0.0.1:47820").replace(/\/$/, "");
const iterationArgument = process.argv.slice(2).find((argument) => argument !== "--");
const parsedIterations = iterationArgument === undefined ? 20 : Number(iterationArgument);
if (!Number.isInteger(parsedIterations) || parsedIterations < 1 || parsedIterations > 1_000) {
  throw new Error("Soak iterations must be an integer from 1 to 1000");
}
const iterations = parsedIterations;
const dataDirectory = join(
  process.env.LOCALAPPDATA ?? join(homedir(), ".invictum-browser-bridge"),
  "InvictumBrowserBridge",
);
const tokenPath = join(dataDirectory, "control-token");

const sleep = (milliseconds) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

const health = async () => {
  const response = await fetch(`${baseUrl}/v1/health`, { signal: AbortSignal.timeout(2_000) });
  if (!response.ok) throw new Error(`health returned HTTP ${response.status}`);
  return response.json();
};

const ensureAuthority = async () => {
  try {
    return await health();
  } catch {
    const entry = resolve("apps/desktop/dist/index.js");
    if (!existsSync(entry)) throw new Error("Desktop build is missing; run pnpm build first");
    const child = spawn(process.execPath, [entry], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: process.env,
    });
    child.unref();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await sleep(100);
      try {
        return await health();
      } catch {
        // Bounded wait for both loopback listeners.
      }
    }
    throw new Error("Desktop Authority did not start within 5 seconds");
  }
};

await ensureAuthority();
if (!existsSync(tokenPath)) throw new Error(`Control token is missing: ${tokenPath}`);
const token = readFileSync(tokenPath, "utf8").trim();
const latencies = [];
for (let index = 0; index < iterations; index += 1) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/v1/call`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: "system.ping",
      parameters: {},
      context: {
        sessionId: "resilience-soak",
        agentId: "resilience-soak",
        clientId: "resilience-soak",
        sessionAuthorized: true,
      },
    }),
    signal: AbortSignal.timeout(5_000),
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true) {
    throw new Error(`iteration ${index + 1} failed: ${JSON.stringify(body)}`);
  }
  latencies.push(performance.now() - startedAt);
  await sleep(100);
}

const sorted = [...latencies].sort((left, right) => left - right);
const percentile = (value) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))];
process.stdout.write(
  `${JSON.stringify({
    ok: true,
    iterations,
    minMs: Math.round(sorted[0] * 10) / 10,
    p50Ms: Math.round(percentile(0.5) * 10) / 10,
    p95Ms: Math.round(percentile(0.95) * 10) / 10,
    maxMs: Math.round(sorted.at(-1) * 10) / 10,
    scope: "read-only full native round trip; run again after sleep/restart/browser update",
  })}\n`,
);
