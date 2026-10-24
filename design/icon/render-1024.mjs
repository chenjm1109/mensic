// 把 design/icon/12-donut.svg 渲染成一张 1024 的 PNG（给 `tauri icon` 当源图）
// 用本机 Edge 的 headless 截图，不引额外的图像依赖。
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const tmp = "C:/Users/52270/AppData/Local/Temp/opencode";
const svg = readFileSync(new URL("12-donut.svg", import.meta.url), "utf8").replace(
  /width="512" height="512"/,
  'width="1024" height="1024"',
);

writeFileSync(
  `${tmp}/icon-source.html`,
  `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent;overflow:hidden}
    svg{display:block;width:1024px;height:1024px}
  </style></head><body>${svg}</body></html>`,
  "utf8",
);

const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const out = new URL("source-1024.png", import.meta.url).pathname.slice(1);

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
    "--window-size=1024,1024",
    `--screenshot=${out}`,
    `file:///${tmp}/icon-source.html`,
  ],
  { stdio: "ignore" },
);

console.log("wrote", out);
