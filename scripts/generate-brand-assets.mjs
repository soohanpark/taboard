import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { captureScenarios } from "./store-capture-scenarios.mjs";

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

const cropPng = async (
  sourcePath,
  outputPath,
  { x, y, width, height, opaque = false },
) => {
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
    opaque ? "rgb24" : "rgba",
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

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

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
    ["banner", path.join(root, "icons", "banner.png"), true],
    [
      "smallPromo",
      path.join(root, "store-assets", "promo", "small-promo-440x280.png"),
      true,
    ],
  ];
  for (const [name, outputPath, opaque = false] of outputs) {
    await cropPng(sheetPath, outputPath, { ...regions[name], opaque });
  }
};

await renderStaticAssets();

const finalDefs = () => `
  ${iconDefs("final-brand")}
  <linearGradient id="screen-bg" x1="0" y1="0" x2="1" y2="1">
    <stop stop-color="#19386F"/>
    <stop offset="0.42" stop-color="#0B1324"/>
    <stop offset="1" stop-color="#060B15"/>
  </linearGradient>
  <linearGradient id="marquee-bg" x1="0" y1="0" x2="1" y2="1">
    <stop stop-color="#214A91"/>
    <stop offset="0.34" stop-color="#0B1324"/>
    <stop offset="1" stop-color="#060B15"/>
  </linearGradient>
  <filter id="ui-shadow" x="-20%" y="-30%" width="140%" height="170%">
    <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#02050B" flood-opacity="0.5"/>
  </filter>`;

const screenshotGroup = ({ scenario, dataUri, x, y }) => {
  const headlineSize = scenario.id === "local-first-sync" ? 39 : 42;
  return `
    <svg x="${x}" y="${y}" width="1280" height="800" viewBox="0 0 1280 800" overflow="hidden">
      <rect width="1280" height="800" fill="url(#screen-bg)"/>
      <circle cx="1150" cy="-80" r="320" fill="#2F6BFF" opacity="0.11"/>
      <text x="40" y="34" fill="#78A1FF" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="2.4">TABOARD</text>
      <text x="40" y="82" fill="#F7FAFF" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="${headlineSize}" font-weight="720" letter-spacing="-1.2">${escapeXml(scenario.headline)}</text>
      <text x="42" y="116" fill="#A9B9D6" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="18" font-weight="520">${escapeXml(scenario.supportingCopy)}</text>
      ${iconGroup({ x: 1176, y: 24, size: 72, id: "final-brand" })}
      <g filter="url(#ui-shadow)">
        <image href="${dataUri}" x="40" y="150" width="1200" height="581.25" preserveAspectRatio="none"/>
        <rect x="40.5" y="150.5" width="1199" height="580.25" fill="none" stroke="#6E92D9" stroke-opacity="0.35"/>
      </g>
    </svg>`;
};

const marqueeGroup = ({ dataUri, x, y }) => `
  <svg x="${x}" y="${y}" width="1400" height="560" viewBox="0 0 1400 560" overflow="hidden">
    <rect width="1400" height="560" fill="url(#marquee-bg)"/>
    <circle cx="1330" cy="-40" r="340" fill="#2F6BFF" opacity="0.13"/>
    ${iconGroup({ x: 48, y: 42, size: 112, id: "final-brand" })}
    <text x="174" y="111" fill="#F7FAFF" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="54" font-weight="720" letter-spacing="-2">Taboard</text>
    <text x="58" y="245" fill="#F7FAFF" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="45" font-weight="720" letter-spacing="-1.3">Make every tab count.</text>
    <text x="61" y="286" fill="#8FB0FF" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="20" font-weight="560">Tabs · boards · notes · todos</text>
    <g transform="rotate(-2 1060 280)" filter="url(#ui-shadow)">
      <image href="${dataUri}" x="650" y="72" width="820" height="397.2" preserveAspectRatio="none"/>
      <rect x="650.5" y="72.5" width="819" height="396.2" fill="none" stroke="#6E92D9" stroke-opacity="0.45"/>
    </g>
  </svg>`;

const renderFinalAssets = async () => {
  const placements = [
    { x: 0, y: 0 },
    { x: 1280, y: 0 },
    { x: 0, y: 800 },
    { x: 1280, y: 800 },
    { x: 0, y: 1600 },
  ];
  const captures = [];
  for (const scenario of captureScenarios) {
    const capturePath = path.join(root, "store-assets", ".work", scenario.filename);
    try {
      await access(capturePath, fsConstants.R_OK);
    } catch {
      throw new Error(
        `Raw capture ${scenario.filename} is missing. Run npm run assets:capture first.`,
      );
    }
    const bytes = await readFile(capturePath);
    captures.push(`data:image/png;base64,${bytes.toString("base64")}`);
  }

  const sheet = composeSvg({
    width: 2680,
    height: 2400,
    defs: finalDefs(),
    body: [
      ...captureScenarios.map((scenario, index) =>
        screenshotGroup({
          scenario,
          dataUri: captures[index],
          ...placements[index],
        }),
      ),
      marqueeGroup({ dataUri: captures[0], x: 1280, y: 1600 }),
    ].join(""),
  });
  const sheetPath = path.join(workDir, "final-sheet.png");
  await renderSvgSheet("final-sheet", sheet, sheetPath, 2680, 2400);

  for (const [index, scenario] of captureScenarios.entries()) {
    await cropPng(
      sheetPath,
      path.join(root, "store-assets", "screenshots", scenario.filename),
      { ...placements[index], width: 1280, height: 800, opaque: true },
    );
  }
  await cropPng(
    sheetPath,
    path.join(root, "store-assets", "promo", "marquee-1400x560.png"),
    { x: 1280, y: 1600, width: 1400, height: 560, opaque: true },
  );
};

if (!staticOnly) await renderFinalAssets();

console.log(`Generated ${staticOnly ? "static brand" : "brand"} assets.`);
