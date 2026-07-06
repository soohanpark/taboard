import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const workDir = path.join(root, "store-assets", ".work", "render");
const staticOnly = process.argv.includes("--static-only");

const palette = {
  midnight: "#0B1324",
  cobalt: "#2F6BFF",
  ice: "#F7FAFF",
};

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ffmpeg = "/opt/homebrew/bin/ffmpeg";
await access(chrome, fsConstants.X_OK);
await access(ffmpeg, fsConstants.X_OK);

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stderr || result.stdout}`,
    );
  }
};

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const renderWithChrome = async (args, outputPath) => {
  await rm(outputPath, { force: true });
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
      throw new Error(`Chrome exited before rendering (${exitResult.code}).\n${stderr}`);
    }
    await delay(100);
  }

  if (stableChecks < 2) {
    child.kill("SIGKILL");
    throw new Error(`Chrome did not render ${outputPath} within 45 seconds.\n${stderr}`);
  }

  if (!exitResult) {
    child.kill("SIGTERM");
    await Promise.race([exited, delay(2_000)]);
  }
  if (!exitResult) child.kill("SIGKILL");
};

const renderSvgSheet = async (name, svg, outputPath, width, height) => {
  await mkdir(workDir, { recursive: true });
  const sourcePath = path.join(workDir, `${name}.svg`);
  const profilePath = path.join(workDir, `chrome-${name}`);
  await writeFile(sourcePath, svg);
  await rm(profilePath, { recursive: true, force: true });
  await renderWithChrome([
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-extensions",
    "--force-device-scale-factor=1",
    `--window-size=${width},${height}`,
    "--default-background-color=00000000",
    `--user-data-dir=${profilePath}`,
    `--screenshot=${outputPath}`,
    pathToFileURL(sourcePath).href,
  ], outputPath);
  await rm(profilePath, { recursive: true, force: true });
};

const cropPng = async (sourcePath, outputPath, { x, y, width, height }) => {
  await mkdir(path.dirname(outputPath), { recursive: true });
  run(ffmpeg, [
    "-y",
    "-loglevel",
    "error",
    "-i",
    sourcePath,
    "-vf",
    `crop=${width}:${height}:${x}:${y}`,
    "-frames:v",
    "1",
    "-pix_fmt",
    "rgba",
    outputPath,
  ]);
};

const iconDefs = (id = "brand") => `
  <linearGradient id="${id}-midnight" x1="26" y1="20" x2="104" y2="112" gradientUnits="userSpaceOnUse">
    <stop stop-color="#172A50"/>
    <stop offset="0.52" stop-color="${palette.midnight}"/>
    <stop offset="1" stop-color="#060B15"/>
  </linearGradient>
  <radialGradient id="${id}-glow" cx="0" cy="0" r="1" gradientTransform="translate(0 0) rotate(35) scale(1100 640)" gradientUnits="userSpaceOnUse">
    <stop stop-color="#244F99"/>
    <stop offset="0.5" stop-color="${palette.midnight}"/>
    <stop offset="1" stop-color="#060B15"/>
  </radialGradient>`;

const iconGroup = ({ x, y, size, id = "brand", flat = false }) => `
  <g transform="translate(${x} ${y}) scale(${size / 128})">
    <rect x="16" y="16" width="96" height="96" rx="22" fill="${
      flat ? palette.midnight : `url(#${id}-midnight)`
    }"/>
    <rect x="16.5" y="16.5" width="95" height="95" rx="21.5" fill="none" stroke="${palette.cobalt}" stroke-opacity="0.28"/>
    <rect x="36" y="35" width="56" height="13" rx="4" fill="${palette.cobalt}"/>
    <rect x="36" y="55" width="17" height="38" rx="4" fill="${palette.ice}"/>
    <rect x="60" y="55" width="32" height="15" rx="4" fill="${palette.ice}"/>
    <rect x="60" y="78" width="32" height="15" rx="4" fill="${palette.cobalt}"/>
  </g>`;

const composeSvg = ({ width, height, body, defs = "" }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>${defs}</defs>
  ${body}
</svg>`;

const bannerGroup = ({ x, y }) => `
  <g transform="translate(${x} ${y})">
    <rect width="1024" height="358" fill="url(#banner-glow)"/>
    <circle cx="885" cy="-20" r="220" fill="#2F6BFF" opacity="0.12"/>
    <circle cx="980" cy="335" r="180" fill="#2F6BFF" opacity="0.08"/>
    ${iconGroup({ x: 54, y: 57, size: 244, id: "banner" })}
    <text x="342" y="185" fill="#F7FAFF" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="104" font-weight="720" letter-spacing="-4">Taboard</text>
    <text x="349" y="233" fill="#85A8FF" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="27" font-weight="560" letter-spacing="0.3">Tabs, organized.</text>
  </g>`;

const smallPromoGroup = ({ x, y }) => `
  <g transform="translate(${x} ${y})">
    <rect width="440" height="280" fill="url(#small-promo-glow)"/>
    <circle cx="408" cy="26" r="138" fill="#2F6BFF" opacity="0.14"/>
    ${iconGroup({ x: 31, y: 76, size: 128, id: "small-promo" })}
    <text x="171" y="137" fill="#F7FAFF" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="45" font-weight="720" letter-spacing="-1.8">Taboard</text>
    <text x="174" y="173" fill="#85A8FF" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="19" font-weight="560">Tabs, organized.</text>
  </g>`;

const renderStaticAssets = async () => {
  const regions = {
    origin: { x: 0, y: 0, width: 1024, height: 1024 },
    icon128: { x: 1040, y: 0, width: 128, height: 128 },
    icon48: { x: 1184, y: 0, width: 48, height: 48 },
    icon32: { x: 1248, y: 0, width: 32, height: 32 },
    icon16: { x: 1296, y: 0, width: 16, height: 16 },
    banner: { x: 0, y: 1040, width: 1024, height: 358 },
    smallPromo: { x: 1040, y: 144, width: 440, height: 280 },
  };
  const sheet = composeSvg({
    width: 1480,
    height: 1398,
    defs: [iconDefs("brand"), iconDefs("banner"), iconDefs("small-promo")].join(""),
    body: `
      ${iconGroup({ x: 0, y: 0, size: 1024, id: "brand" })}
      ${iconGroup({ x: 1040, y: 0, size: 128, id: "brand" })}
      ${iconGroup({ x: 1184, y: 0, size: 48, id: "brand" })}
      ${iconGroup({ x: 1248, y: 0, size: 32, id: "brand" })}
      ${iconGroup({ x: 1296, y: 0, size: 16, id: "brand", flat: true })}
      ${bannerGroup({ x: 0, y: 1040 })}
      ${smallPromoGroup({ x: 1040, y: 144 })}
    `,
  });
  const sheetPath = path.join(workDir, "static-sheet.png");
  await renderSvgSheet("static-sheet", sheet, sheetPath, 1480, 1398);

  const outputs = [
    ["origin", path.join(root, "icons", "origin.png")],
    ["icon16", path.join(root, "icons", "icon16.png")],
    ["icon32", path.join(root, "icons", "icon32.png")],
    ["icon48", path.join(root, "icons", "icon48.png")],
    ["icon128", path.join(root, "icons", "icon128.png")],
    ["banner", path.join(root, "icons", "banner.png")],
    [
      "smallPromo",
      path.join(root, "store-assets", "promo", "small-promo-440x280.png"),
    ],
  ];
  for (const [name, outputPath] of outputs) {
    await cropPng(sheetPath, outputPath, regions[name]);
  }
};

await renderStaticAssets();

if (!staticOnly) {
  const overview = path.join(
    root,
    "store-assets",
    ".work",
    "01-overview.png",
  );
  try {
    await access(overview, fsConstants.R_OK);
  } catch {
    throw new Error(
      "Raw store captures are missing. Run npm run assets:capture first.",
    );
  }
}

console.log(`Generated ${staticOnly ? "static brand" : "brand"} assets.`);
