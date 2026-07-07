import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { access, mkdir, readFile, rm, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureScenarios } from "./store-capture-scenarios.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const workDir = path.join(root, "store-assets", ".work");
const profileDir = path.join(workDir, "capture-profile");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const rawOnly = process.argv.includes("--raw-only");

await access(chrome, fsConstants.X_OK);
await mkdir(workDir, { recursive: true });

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
]);

const serialize = (value) =>
  JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");

const injectCaptureBootstrap = (html, scenario) => {
  const withoutRemoteFonts = html.replace(
    /<link\b[^>]*href="https:\/\/cdn\.jsdelivr\.net[^>]*>/gs,
    "",
  );
  const injection = `
    <script>globalThis.__TABOARD_CAPTURE__ = ${serialize(scenario)};</script>
    <script src="/store-assets/source/capture-bootstrap.js"></script>
  `;
  return withoutRemoteFonts.replace("</head>", `${injection}</head>`);
};

const serveFile = async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const pathname = requestUrl.pathname === "/" ? "/newtab/index.html" : requestUrl.pathname;
  const filePath = path.resolve(root, `.${decodeURIComponent(pathname)}`);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    let contents = await readFile(filePath);
    if (pathname === "/newtab/index.html") {
      const captureId = requestUrl.searchParams.get("capture");
      const scenario = captureScenarios.find(({ id }) => id === captureId);
      if (!scenario) {
        response.writeHead(400).end("Unknown capture scenario");
        return;
      }
      contents = Buffer.from(injectCaptureBootstrap(contents.toString(), scenario));
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes.get(path.extname(filePath)) ?? "application/octet-stream",
    });
    response.end(contents);
  } catch (error) {
    response.writeHead(error?.code === "ENOENT" ? 404 : 500).end("Not found");
  }
};

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const readPngDimensions = async (filePath) => {
  const bytes = await readFile(filePath);
  if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`${filePath} is not a valid PNG.`);
  }
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

const capturePage = async (url, outputPath) => {
  await rm(outputPath, { force: true });
  const args = [
    "--headless=new",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-extensions",
    "--force-device-scale-factor=1",
    "--window-size=1280,620",
    "--default-background-color=FFFFFFFF",
    "--virtual-time-budget=3500",
    `--user-data-dir=${profileDir}`,
    `--screenshot=${outputPath}`,
    url,
  ];
  const child = spawn(chrome, args, {
    cwd: root,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  let exitResult = null;
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const exited = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      exitResult = { code, signal };
      resolve(exitResult);
    });
  });

  const deadline = Date.now() + 45_000;
  let previousSize = -1;
  let stableChecks = 0;
  while (Date.now() < deadline) {
    try {
      const info = await stat(outputPath);
      stableChecks = info.size > 24 && info.size === previousSize ? stableChecks + 1 : 0;
      previousSize = info.size;
      if (stableChecks >= 2) break;
    } catch {
      // Chrome has not written the screenshot yet.
    }
    if (exitResult && exitResult.code !== 0) {
      throw new Error(`Chrome exited before capture (${exitResult.code}).\n${stderr}`);
    }
    await delay(100);
  }

  if (stableChecks < 2) {
    child.kill("SIGKILL");
    throw new Error(`Chrome did not capture ${url} within 45 seconds.\n${stderr}`);
  }
  if (!exitResult) {
    child.kill("SIGTERM");
    await Promise.race([exited, delay(2_000)]);
  }
  if (!exitResult) child.kill("SIGKILL");

  const dimensions = await readPngDimensions(outputPath);
  if (dimensions[0] !== 1280 || dimensions[1] !== 620) {
    throw new Error(`${outputPath} is ${dimensions.join("x")}, expected 1280x620.`);
  }
};

await rm(profileDir, { recursive: true, force: true });
const server = createServer((request, response) => {
  serveFile(request, response).catch((error) => {
    response.writeHead(500).end(error.message);
  });
});

try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Capture server did not expose a TCP port.");
  }

  for (const scenario of captureScenarios) {
    const url = `http://127.0.0.1:${address.port}/newtab/index.html?capture=${encodeURIComponent(scenario.id)}`;
    const outputPath = path.join(workDir, scenario.filename);
    await capturePage(url, outputPath);
    console.log(`Captured ${scenario.filename}`);
  }

  if (!rawOnly) {
    const result = spawnSync(process.execPath, [
      path.join(root, "scripts", "generate-brand-assets.mjs"),
    ], {
      cwd: root,
      encoding: "utf8",
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error("Final store asset generation failed.");
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(profileDir, { recursive: true, force: true });
}

console.log(`Generated five ${rawOnly ? "raw " : ""}store captures.`);
