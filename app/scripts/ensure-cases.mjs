// 保证 `src/gallery/cases.json` 存在（它是生成物，不入库）。
//
// 给 `predev` / `prebuild` / `precheck` 用：已经有清单就直接过（不拖慢启动），
// 缺了才跑一次完整同步。日常改完案例要刷新清单，请显式跑 `npm run sync:catalog`。
//
// ⚠️ 发版（`npm run apk` / `dist`）会把清单切成发布集（只剩已发布案例）：
//    · `npm run dev`（不带参数）发现那种状态会**自动切回全量** —— 否则打过一次包，开发时画廊就只剩几张；
//    · `npm run build` 用 `--keep-mode`，**不切** —— 发版流程里 dist 必须和发布集一致。
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_ROOT } from "./python-env.mjs";

const KEEP_MODE = process.argv.includes("--keep-mode");
const casesJson = join(APP_ROOT, "src", "gallery", "cases.json");
const lockFile = join(APP_ROOT, ".gallery-lock.json");
const publicCases = join(APP_ROOT, "public", "cases");

const run = (args) => spawnSync(process.execPath, args, { cwd: APP_ROOT, stdio: "inherit" });
const fullSync = () => {
  const sync = run([join(APP_ROOT, "scripts", "sync-catalog.mjs")]);
  if (sync.status !== 0) process.exit(sync.status ?? 1);
  const thumbs = run([join(APP_ROOT, "scripts", "gen-thumbnails.mjs"), "--missing"]);
  process.exit(thumbs.status ?? 0);
};

/** 上一次同步是不是发布集（只含 published） */
function wasReleaseSync() {
  try {
    return JSON.parse(readFileSync(lockFile, "utf8")).mode === "release";
  } catch {
    return false;
  }
}

if (existsSync(casesJson)) {
  if (wasReleaseSync() && !KEEP_MODE) {
    console.log("[catalog] 上次是发布集同步，切回全量（开发要看所有案例）……");
    fullSync();
  }
  if (!existsSync(publicCases)) {
    console.warn("[catalog] 有 cases.json 但缺 public/cases → 跑一次 npm run sync:catalog");
  }
  process.exit(0);
}

console.log("[catalog] 还没有 cases.json（生成物），先同步一次……");
fullSync();
