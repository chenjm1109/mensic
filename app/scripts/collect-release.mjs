// 发版产物汇总：把 `npm run dist` / `npm run apk` 的产物复制到 **app/release/**。
//
// 为什么要有这一层：Tauri / Gradle 的原始输出埋在 target/release/bundle/… 和
// gen/android/app/build/… 里，层级太深、名字还带 `_x64_en-US` 这类平台后缀，分发时不好找。
// 这里统一成「浅目录 + 固定命名」：
//
//   app/release/mensic-<版本>-windows-x64.msi
//   app/release/mensic-<版本>-windows-x64-setup.exe
//   app/release/mensic-<版本>-android-arm64.apk
//
// 用法：
//   node scripts/collect-release.mjs          # 有什么收什么（两个平台都看）
//   node scripts/collect-release.mjs win      # 只收 Windows（dist 之后）
//   node scripts/collect-release.mjs android  # 只收安卓（apk 之后）
//
// `release/` 已 gitignore（单个包 100MB+）。源产物不存在就跳过，不报错 —— 例如只打安卓时。
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "release");

// 版本号与产品名以 tauri.conf.json 为准（安装包实际的版本就是它）
const conf = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf8"));
const product = String(conf.productName ?? "app").replace(/[^\w.-]+/g, "-");
const version = String(conf.version ?? "0.0.0");

/**
 * 取目录里最新的那个文件。
 * @param {string} dir
 * @param {(name: string) => boolean} match
 */
function newest(dir, match) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter(match)
    .map((n) => join(dir, n))
    .filter((p) => statSync(p).isFile());
  if (files.length === 0) return null;
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0];
}

/**
 * @param {string | null} src
 * @param {string} name
 */
function put(src, name) {
  if (!src) {
    console.log(`  · 跳过 ${name}（源产物不存在）`);
    return;
  }
  mkdirSync(OUT, { recursive: true });
  const dst = join(OUT, name);
  const s = statSync(src);
  // 已经收过同一份就不再覆盖：Windows 上 copyFile 会保留源文件时间，
  // 所以「大小相同 + 目标不旧于源」就说明是同一份 —— 重跑脚本不会因为目标被
  // Explorer 预览 / 安装器占用而报 EBUSY。
  if (existsSync(dst)) {
    const d = statSync(dst);
    if (d.size === s.size && d.mtimeMs >= s.mtimeMs) {
      console.log(`  = ${dst}  ${(d.size / 1024 / 1024).toFixed(1)} MB（已是最新）`);
      return;
    }
  }
  try {
    copyFileSync(src, dst);
  } catch (e) {
    if (e && (e.code === "EBUSY" || e.code === "EPERM")) {
      console.warn(
        `  ! ${name} 被占用，这次没覆盖（关掉正在打开 / 安装的包后重跑 npm run release:collect）`,
      );
      return;
    }
    throw e;
  }
  const mb = (statSync(dst).size / 1024 / 1024).toFixed(1);
  console.log(`  ✓ ${dst}  ${mb} MB`);
}

const only = process.argv.slice(2);
const wantWin = only.length === 0 || only.includes("win");
const wantAndroid = only.length === 0 || only.includes("android");

console.log(`\n[release] 汇总 ${product} ${version} → ${OUT}`);

if (wantWin) {
  const bundle = join(ROOT, "src-tauri", "target", "release", "bundle");
  put(newest(join(bundle, "msi"), (n) => n.endsWith(".msi")), `${product}-${version}-windows-x64.msi`);
  put(
    newest(join(bundle, "nsis"), (n) => n.endsWith("-setup.exe")),
    `${product}-${version}-windows-x64-setup.exe`,
  );
}

if (wantAndroid) {
  // `npm run apk` 已把成品放在 app/apk/（带 ABI 的名字），这里再做一份统一命名的
  const apk = join(ROOT, "apk");
  put(
    newest(apk, (n) => n.endsWith(`-${version}-arm64.apk`)) ?? newest(apk, (n) => n.endsWith("-arm64.apk")),
    `${product}-${version}-android-arm64.apk`,
  );
}
