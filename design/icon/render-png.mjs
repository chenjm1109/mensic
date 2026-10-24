// 把指定的 SVG 渲染成方形透明 PNG（给 tauri icon 的自适应前景层 / 单色层用）
// 用法：node design/icon/render-png.mjs <in.svg> <out.png> [size]
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const [input, outputArg, sizeArg] = process.argv.slice(2);
const output = resolve(outputArg);
const size = Number(sizeArg ?? 1024);
const tmp = "C:/Users/52270/AppData/Local/Temp/opencode";
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const svg = readFileSync(input, "utf8")
  .replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)
  .replace(/viewBox="0 0 512 512"/, 'viewBox="0 0 512 512"');

const html = `${tmp}/render-${size}.html`;
writeFileSync(
  html,
  `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent;overflow:hidden}
    svg{display:block;width:${size}px;height:${size}px}
  </style></head><body>${svg}</body></html>`,
  "utf8",
);

execFileSync(
  edge,
  [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--default-background-color=00000000",
    `--user-data-dir=${tmp}/edge-icon`,
    `--window-size=${size},${size}`,
    `--screenshot=${output}`,
    `file:///${html}`,
  ],
  { stdio: "ignore" },
);

console.log(`rendered ${output} (${size}px)`);
