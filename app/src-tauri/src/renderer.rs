//! 本端原生渲染器：随包 Python sidecar 的进程管理与 IPC 桥接。
//!
//! 设计要点：
//! - **常驻单进程**：Python 启动一次（含 matplotlib 导入）后常驻，避免每次渲染重新导入。
//! - **定长帧协议**：`[uint32 LE 长度][JSON]` 请求；`[uint8 状态][uint32 LE 长度][载荷]` 响应。
//!   二进制安全，PNG/ZIP 不经 base64，直接走通道。
//! - **自动重启**：进程若退出，下次调用自动重新拉起；单次调用失败重试一次。
//! - **移动端天然降级**：找不到可执行文件即报错，上层注册表会回退到 Pyodide。

use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

/// sidecar 上报的运行环境信息（同时用于「可用性探测」）
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RendererInfo {
    pub python: String,
    pub matplotlib: String,
    pub version: String,
    /// 随包可用的 Python 包，上层据此判断某案例能否用本端原生渲染
    pub packages: Vec<String>,
}

#[derive(Default)]
#[cfg_attr(target_os = "android", allow(dead_code))]
pub(crate) struct Renderer {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    stdout: Option<BufReader<ChildStdout>>,
}

/// 全局渲染器状态（跨命令共享）
#[derive(Default)]
pub struct RendererState(pub(crate) Arc<Mutex<Renderer>>);

const EXE_NAME: &str = if cfg!(windows) { "mensic-render.exe" } else { "mensic-render" };

/// 候选可执行文件路径，按优先级排列（覆盖打包/开发两种形态）
/// 仅桌面使用；安卓走进程内 Chaquopy（见 android_bridge.rs）。
#[cfg_attr(target_os = "android", allow(dead_code))]
fn candidate_paths(app: &AppHandle) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        out.push(dir.join("binaries").join("mensic-render").join(EXE_NAME));
        out.push(dir.join(EXE_NAME));
    }
    if let Ok(cur) = std::env::current_exe() {
        if let Some(dir) = cur.parent() {
            out.push(dir.join(EXE_NAME));
            out.push(dir.join("binaries").join("mensic-render").join(EXE_NAME));
        }
    }
    if cfg!(debug_assertions) {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        out.push(manifest.join("binaries").join("mensic-render").join(EXE_NAME));
        out.push(manifest.join("binaries").join(EXE_NAME));
    }
    out
}

#[cfg_attr(target_os = "android", allow(dead_code))]
fn spawn(app: &AppHandle) -> Result<(Child, ChildStdin, BufReader<ChildStdout>), String> {
    // 显式覆盖（开发/测试）：MENSIC_RENDER_BIN 指向可执行文件，MENSIC_RENDER_ARGS 追加参数
    let (program, args): (PathBuf, Vec<String>) = if let Ok(bin) = std::env::var("MENSIC_RENDER_BIN") {
        let extra = std::env::var("MENSIC_RENDER_ARGS")
            .map(|s| s.split_whitespace().map(|x| x.to_string()).collect())
            .unwrap_or_default();
        (PathBuf::from(bin), extra)
    } else {
        let found = candidate_paths(app).into_iter().find(|p| p.is_file());
        match found {
            Some(p) => (p, Vec::new()),
            None => {
                return Err(
                    "未找到本端原生渲染器可执行文件（mensic-render）。请先执行 `npm run build:renderer`。"
                        .into(),
                )
            }
        }
    };

    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("无法启动本端渲染器（{}）：{e}", program.display()))?;
    let stdin = child.stdin.take().ok_or("无法获取渲染器 stdin")?;
    let stdout = BufReader::new(child.stdout.take().ok_or("无法获取渲染器 stdout")?);

    // 渲染器的日志走 stderr，后台排空避免管道写满阻塞
    if let Some(err) = child.stderr.take() {
        std::thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                eprintln!("{line}");
            }
        });
    }

    Ok((child, stdin, stdout))
}

#[cfg_attr(target_os = "android", allow(dead_code))]
impl Renderer {
    fn reset(&mut self) {
        if let Some(mut c) = self.child.take() {
            let _ = c.kill();
            let _ = c.wait();
        }
        self.stdin = None;
        self.stdout = None;
    }

    fn ensure(&mut self, app: &AppHandle) -> Result<(), String> {
        if let Some(child) = self.child.as_mut() {
            match child.try_wait() {
                Ok(None) => return Ok(()), // 仍在运行
                _ => self.reset(),         // 已退出：重启
            }
        }
        let (child, stdin, stdout) = spawn(app)?;
        self.child = Some(child);
        self.stdin = Some(stdin);
        self.stdout = Some(stdout);
        Ok(())
    }

    fn exchange(&mut self, body: &[u8]) -> Result<(u8, Vec<u8>), String> {
        {
            let stdin = self.stdin.as_mut().ok_or("渲染器 stdin 不可用")?;
            let mut frame = Vec::with_capacity(4 + body.len());
            frame.extend_from_slice(&(body.len() as u32).to_le_bytes());
            frame.extend_from_slice(body);
            stdin.write_all(&frame).map_err(|e| e.to_string())?;
            stdin.flush().map_err(|e| e.to_string())?;
        }
        let stdout = self.stdout.as_mut().ok_or("渲染器 stdout 不可用")?;
        let mut head = [0u8; 5];
        stdout
            .read_exact(&mut head)
            .map_err(|e| format!("渲染器无响应：{e}"))?;
        let status = head[0];
        let len = u32::from_le_bytes([head[1], head[2], head[3], head[4]]) as usize;
        let mut payload = vec![0u8; len];
        if len > 0 {
            stdout
                .read_exact(&mut payload)
                .map_err(|e| format!("渲染器输出不完整：{e}"))?;
        }
        Ok((status, payload))
    }

    fn call(&mut self, app: &AppHandle, op: &str, spec: &serde_json::Value) -> Result<(u8, Vec<u8>), String> {
        let body = serde_json::to_vec(&serde_json::json!({ "op": op, "spec": spec }))
            .map_err(|e| e.to_string())?;
        let mut last = String::from("渲染器调用失败");
        for _ in 0..2 {
            self.ensure(app)?;
            match self.exchange(&body) {
                Ok(v) => return Ok(v),
                Err(e) => {
                    last = e;
                    self.reset(); // 进程可能已崩溃：重启后重试一次
                }
            }
        }
        Err(last)
    }
}

fn lock(state: &State<'_, RendererState>) -> Arc<Mutex<Renderer>> {
    state.0.clone()
}

/// 平台分派：桌面走 sidecar 进程；安卓走进程内 Kotlin + Chaquopy（JNI）。
/// 两者对外都是「op + spec → (status, payload)」，因此上层命令无需区分。
#[cfg(not(target_os = "android"))]
fn platform_call(
    app: &AppHandle,
    arc: &Arc<Mutex<Renderer>>,
    op: &str,
    spec: &serde_json::Value,
) -> Result<(u8, Vec<u8>), String> {
    let mut r = arc.lock().map_err(|_| "渲染器状态锁被污染".to_string())?;
    r.call(app, op, spec)
}

#[cfg(target_os = "android")]
fn platform_call(
    _app: &AppHandle,
    _arc: &Arc<Mutex<Renderer>>,
    op: &str,
    spec: &serde_json::Value,
) -> Result<(u8, Vec<u8>), String> {
    let spec_json = if spec.is_null() {
        String::new()
    } else {
        serde_json::to_string(spec).map_err(|e| e.to_string())?
    };
    let bytes = crate::android_bridge::call(op, &spec_json)?;
    Ok((0, bytes))
}

/// 探测/获取本端渲染器信息（会拉起进程并等它就绪）
#[tauri::command]
pub async fn renderer_info(app: AppHandle, state: State<'_, RendererState>) -> Result<RendererInfo, String> {
    let arc = lock(&state);
    tauri::async_runtime::spawn_blocking(move || {
        let (status, payload) = platform_call(&app, &arc, "info", &serde_json::Value::Null)?;
        if status != 0 {
            return Err(String::from_utf8_lossy(&payload).into_owned());
        }
        serde_json::from_slice::<RendererInfo>(&payload).map_err(|e| format!("渲染器信息解析失败：{e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 二进制调用（PNG / SVG / ZIP）
#[tauri::command]
pub async fn renderer_call(
    app: AppHandle,
    state: State<'_, RendererState>,
    op: String,
    spec: serde_json::Value,
) -> Result<tauri::ipc::Response, String> {
    let arc = lock(&state);
    let payload = tauri::async_runtime::spawn_blocking(move || {
        let (status, payload) = platform_call(&app, &arc, &op, &spec)?;
        if status != 0 {
            // RENDER_ERROR: 前缀用于区分「渲染失败（用户数据等问题）」与「渲染器不可用」，
            // 上层对前者不会降级到 Pyodide（否则只是白等一次运行时准备）。
            return Err(format!("RENDER_ERROR:{}", String::from_utf8_lossy(&payload)));
        }
        Ok(payload)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(payload))
}

/// 文本调用（run.py 源码）
#[tauri::command]
pub async fn renderer_call_text(
    app: AppHandle,
    state: State<'_, RendererState>,
    op: String,
    spec: serde_json::Value,
) -> Result<String, String> {
    let arc = lock(&state);
    tauri::async_runtime::spawn_blocking(move || {
        let (status, payload) = platform_call(&app, &arc, &op, &spec)?;
        if status != 0 {
            return Err(format!("RENDER_ERROR:{}", String::from_utf8_lossy(&payload)));
        }
        Ok(String::from_utf8_lossy(&payload).into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 退出时结束 sidecar，避免残留进程（安卓为进程内渲染，无需处理）
#[cfg(not(target_os = "android"))]
pub fn shutdown(state: &RendererState) {
    if let Ok(mut r) = state.0.lock() {
        r.reset();
    }
}

#[cfg(target_os = "android")]
pub fn shutdown(_state: &RendererState) {}
