// 打安卓安装包，并把成品放到**好找的浅目录**：app/apk/
//
//   npm run apk
//
// 产物：
//   app/apk/<产品名>-<版本>-arm64.apk   ← 这一份可以直接 adb install / 发出去
//   app/apk/latest-arm64.apk            ← 最新一份的副本（名字固定，方便脚本引用）
//
// ── 为什么要绕这一圈 ────────────────────────────────────────────────
// 本机没开 Windows「开发者模式」，Tauri CLI 最后一步会尝试把
// `target/aarch64-linux-android/release/libmensic_lib.so` **符号链接**进 jniLibs，
// 必然报「Creation symbolic link is not allowed for this system」。
// 但那一刻 .so 已经编好了，所以：
//   1) 跑 CLI 只为编出 .so（放行这一条已知报错，其它错误照常失败）
//   2) 手动把 .so 复制进 jniLibs/arm64-v8a/（不用符号链接）
//   3) Gradle 加 `-x rustBuild*` 跳过 rust 任务，编 Kotlin 并打包
// 顺带先做一次 `android:sync-python`：render.py / sidecar.py 是生成物，
// 不同步的话 APK 里会带着旧渲染器。
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// PowerShell 会把 Node 的 DeprecationWarning（shell:true + 参数）当报错铺一屏；
// 这里传的都是固定参数，静音它，别让真正的报错被淹掉。
process.on("warning", (w) => {
  if (w.name !== "DeprecationWarning") console.warn(w);
});

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IS_WIN = process.platform === "win32";
const ANDROID = join(ROOT, "src-tauri", "gen", "android");
const SO = join(ROOT, "src-tauri", "target", "aarch64-linux-android", "release", "libmensic_lib.so");
const JNI = join(ANDROID, "app", "src", "main", "jniLibs", "arm64-v8a", "libmensic_lib.so");
const OUT_DIR = join(ROOT, "apk");
/** 输出用的 ABI 名：arm64v8a 太难读，这里叫 arm64 */
const ABI_LABEL = "arm64";

const started = Date.now();
const step = (msg) => console.log(`\n\x1b[1m▶ ${msg}\x1b[0m`);
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const die = (msg) => {
  console.error(`\n\x1b[31m✗ ${msg}\x1b[0m\n`);
  process.exit(1);
};

/** 跑一条命令，返回 { status, out }；输出原样透传，方便看进度。
 *
 *  `.cmd` / `.bat`（npx、gradlew）必须经 `cmd.exe /c` 才能执行；这里**不用** spawn 的
 *  `shell: true` —— 那条路会发 DEP0190 警告，PowerShell 会把它当报错铺一屏。
 *  参数都是写死的（没有用户输入），自己串成一行是安全的。 */
function run(cmd, args, cwd) {
  const isBat = /\.(cmd|bat)$/i.test(cmd);
  const file = isBat ? process.env.ComSpec || "cmd.exe" : cmd;
  const argv = isBat ? ["/d", "/s", "/c", `${cmd} ${args.join(" ")}`] : args;
  const r = spawnSync(file, argv, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  // 透传（去掉满屏的 vite/rollup 注释，只留有用部分）
  process.stdout.write(
    out
      .split("\n")
      .filter((l) => !/\/\*#__PURE__\*\/|annotation that Rollup cannot interpret|^\s*$/.test(l))
      .map((l) => `  ${l}`)
      .join("\n"),
  );
  if (!out.endsWith("\n")) process.stdout.write("\n");
  return { status: r.status ?? 1, out };
}

const tauriConf = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf8"));
const product = String(tauriConf.productName ?? "app").replace(/[^\w.-]+/g, "-");
const version = String(tauriConf.version ?? "0.0.0");

/* 0) 安卓工程必须在（它随仓库提交，正常不用再生成） */
if (!existsSync(join(ANDROID, "app", "build.gradle.kts"))) {
  die(`没找到安卓工程：${ANDROID}\n      → 先跑一次 npx tauri android init（生成后请一并提交）`);
}

/* 发布集：只把 `status: published` 的案例打进包（并清掉 public/ 里非发布案例的残留） */
step("同步发布集（catalog → public/，仅 status: published）");
{
  const sync = run(process.execPath, [join(ROOT, "scripts", "sync-catalog.mjs"), "--release"], ROOT);
  if (sync.status !== 0) die("同步发布集失败（见上面的输出）");
  const thumbs = run(process.execPath, [join(ROOT, "scripts", "gen-thumbnails.mjs"), "--missing", "--strict"], ROOT);
  if (thumbs.status !== 0) die("生成缩略图失败（见上面的输出）");

  const releaseCases = JSON.parse(readFileSync(join(ROOT, "src", "gallery", "cases.json"), "utf8"));
  const missing = releaseCases.filter((c) => !existsSync(join(ROOT, "public", "gallery", `${c.id}.png`)));
  if (missing.length) die(`发布集有 ${missing.length} 个案例缺缩略图：${missing.map((c) => c.id).join(", ")}`);
  ok(`发布集 ${releaseCases.length} 个案例：${releaseCases.map((c) => c.title).join(" / ")}`);
}

/* 1) 同步安卓侧 python（render.py / sidecar.py 是生成物） */
step("同步安卓侧 Python（render.py / sidecar.py）");
{
  const r = run(process.execPath, [join(ROOT, "scripts", "sync-android-python.mjs")], ROOT);
  if (r.status !== 0) die("同步 Python 失败（见上面的输出）");
  ok("已同步");
}

/* 2) 编 .so（CLI 会在「建符号链接」那一步报错，属预期） */
step("编译 Rust（tauri android build --target aarch64 --apk）");
{
  const r = run(IS_WIN ? "npx.cmd" : "npx", ["tauri", "android", "build", "--target", "aarch64", "--apk"], ROOT);
  const symlinkOnly = /Creation symbolic link is not allowed/i.test(r.out);
  if (r.status !== 0 && !symlinkOnly) die("tauri android build 失败（原因见上面的输出）");
  if (symlinkOnly) {
    ok("已编出 .so（最后的符号链接那步按预期跳过）");
  } else {
    ok("tauri android build 完成");
  }
}

/* 3) 校验 .so 存在（是否重新编译由 cargo 决定：源码没变时它不会重写这个文件） */
if (!existsSync(SO)) die(`没找到 ${SO}（编译没产出 .so，先看上面的报错）`);
ok(`.so ${(statSync(SO).size / 1024 / 1024).toFixed(1)} MB · ${new Date(statSync(SO).mtimeMs).toLocaleString()}`);

step("复制 .so 到 jniLibs（代替符号链接）");
mkdirSync(dirname(JNI), { recursive: true });
copyFileSync(SO, JNI);
ok("已复制");

/* 4) Gradle 打包（跳过 rust 任务，编 Kotlin + 打包） */
step("Gradle 打包（assembleUniversalRelease）");
{
  const args = [
    "assembleUniversalRelease",
    "-PtargetList=aarch64",
    "-ParchList=arm64",
    "-PabiList=arm64-v8a",
    "-x",
    "rustBuildUniversalRelease",
    "-x",
    "rustBuildArm64Release",
  ];
  const r = run(IS_WIN ? "gradlew.bat" : "./gradlew", args, ANDROID);  if (r.status !== 0) die("Gradle 打包失败（原因见上面的输出）");
  ok("打包完成");
}

/* 5) 把成品放到浅目录，并打印绝对路径 */
const apkDir = join(ANDROID, "app", "build", "outputs", "apk", "universal", "release");
const apks = existsSync(apkDir)
  ? readdirSync(apkDir)
      .filter((n) => n.endsWith(".apk"))
      .map((n) => join(apkDir, n))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  : [];
if (apks.length === 0) die(`没找到 apk（${apkDir}）`);
if (statSync(apks[0]).mtimeMs < started - 5000) {
  console.log("  ⚠ 这次 Gradle 认为没有变化（UP-TO-DATE），沿用上次打好的包");
}

mkdirSync(OUT_DIR, { recursive: true });
// 清掉上一版（同前缀的旧包），避免目录里堆着几个版本分不清
for (const n of readdirSync(OUT_DIR)) {
  if (n.startsWith(`${product}-`) && n.endsWith(".apk")) rmSync(join(OUT_DIR, n), { force: true });
}
const named = join(OUT_DIR, `${product}-${version}-${ABI_LABEL}.apk`);
copyFileSync(apks[0], named);
copyFileSync(apks[0], join(OUT_DIR, `latest-${ABI_LABEL}.apk`));

const mb = (statSync(named).size / 1024 / 1024).toFixed(1);
// 用「APK 本身的打包时间」而不是复制时间：copyFileSync 会保留源文件时间戳，写实际的更准
const when = new Date(statSync(apks[0]).mtimeMs).toLocaleString();
console.log(`
\x1b[1m\x1b[32m✓ 安装包已就绪\x1b[0m

  \x1b[1m${named}\x1b[0m
  （另有 latest-${ABI_LABEL}.apk，内容相同、名字固定）

  ${mb} MB · ${when} · ${product} ${version} · arm64-v8a

  安装：
    adb install -r "${named}"
`);
