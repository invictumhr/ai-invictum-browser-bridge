import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const fixturePath = fileURLToPath(new URL("./basic-form.html", import.meta.url));
const fixture = await readFile(fixturePath);
const kitchenSinkPath = fileURLToPath(new URL("./kitchen-sink.html", import.meta.url));
const kitchenSink = await readFile(kitchenSinkPath);
const terminalPath = fileURLToPath(new URL("./xterm-terminal.html", import.meta.url));
const terminal = await readFile(terminalPath);
const frame = Buffer.from(
  `<!doctype html><html><head><title>Fixture frame</title></head><body>
    <h2>Frame content</h2>
    <label>Frame note <input id="frame-note" value="Initial frame value" /></label>
    <div id="frame-editor" role="textbox" aria-label="Frame rich text" contenteditable="true">Initial frame text</div>
    <button id="frame-button">Frame action</button>
  </body></html>`,
  "utf8",
);
const basicAuthSuccess = Buffer.from(
  "<!doctype html><html><head><title>Basic Auth success</title></head><body><h1 id=auth-success>Basic authentication succeeded</h1></body></html>",
  "utf8",
);
const challengedAuthNonces = new Set();
const fixturePort = Number(process.env.INVICTUM_FIXTURE_PORT ?? "47822");
if (!Number.isInteger(fixturePort) || fixturePort < 1_024 || fixturePort > 65_535) {
  throw new Error("INVICTUM_FIXTURE_PORT must be an integer between 1024 and 65535");
}
const fixtureOrigin = `http://127.0.0.1:${fixturePort}`;

const server = createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  if (request.url?.startsWith("/api/echo")) {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      let received = null;
      try {
        received = rawBody.length === 0 ? null : JSON.parse(rawBody);
      } catch {
        received = rawBody;
      }
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({
          ok: true,
          method: request.method,
          title: "Fixture API",
          token: "fixture-private-token",
          received,
        }),
      );
    });
    return;
  }
  if (request.url?.startsWith("/basic-auth")) {
    const parsed = new URL(request.url, fixtureOrigin);
    const rawNonce = parsed.searchParams.get("nonce")?.slice(0, 64) || "default";
    const nonce = /^[A-Za-z0-9._-]+$/.test(rawNonce) ? rawNonce : "default";
    const expected = `Basic ${Buffer.from("fixture-user:fixture-password").toString("base64")}`;
    if (!challengedAuthNonces.has(nonce) || request.headers.authorization !== expected) {
      challengedAuthNonces.add(nonce);
      response.statusCode = 401;
      response.setHeader("WWW-Authenticate", `Basic realm="Invictum fixture ${nonce}"`);
      response.end("Authentication required");
      return;
    }
    response.end(basicAuthSuccess);
    return;
  }
  if (request.url?.startsWith("/frame")) {
    response.end(frame);
    return;
  }
  if (request.url?.startsWith("/basic-form")) {
    response.end(fixture);
    return;
  }
  if (request.url?.startsWith("/kitchen-sink")) {
    response.end(kitchenSink);
    return;
  }
  if (request.url?.startsWith("/xterm-terminal")) {
    response.end(terminal);
    return;
  }
  response.statusCode = 302;
  response.setHeader("Location", "/basic-form?session=fixture-secret#form");
  response.end();
});

server.listen(fixturePort, "127.0.0.1", () => {
  process.stdout.write(`Invictum fixture listening at ${fixtureOrigin}/basic-form\n`);
});
