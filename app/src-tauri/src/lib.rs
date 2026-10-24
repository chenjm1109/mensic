mod renderer;

#[cfg(target_os = "android")]
mod android_bridge;

use renderer::{renderer_call, renderer_call_text, renderer_info, RendererState};
use tauri::Manager;

/// 写入用户通过「另存为」对话框选定的文件（绝对路径）。
///
/// 说明：走自定义命令而不是 fs 插件，避免为任意用户路径配置过宽的 fs scope ——
/// 路径来自原生保存对话框，由用户显式选择。
#[tauri::command]
fn write_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &contents).map_err(|e| e.to_string())
}

/// 移动端导出：把字节交给**系统分享面板**（桌面 / 网页不走这里，走各自的保存方式）。
///
/// 移动端没有「另存为」对话框，所以导出的最后一公里由 Kotlin 侧写缓存 + `ACTION_SEND` 完成；
/// 前端 `saveFileAs()` 在 `isTauri() && isMobile()` 时调用它。
#[tauri::command]
fn share_file(name: String, mime: String, bytes: Vec<u8>) -> Result<(), String> {
    #[cfg(target_os = "android")]
    let result = crate::android_bridge::share(&name, &mime, &bytes);
    #[cfg(not(target_os = "android"))]
    let result = {
        let _ = (name, mime, bytes);
        Err("share_file 只在移动端可用".to_string())
    };
    result
}

/// 旧品牌（identifier `com.mensic.app` 之前是 `com.vizart.app`）的项目数据 → 新目录的一次性搬运。
///
/// 换 identifier 之后 `BaseDirectory.AppData` 变成 `%APPDATA%\com.mensic.app`，
/// 不搬的话老用户打开就是空应用。只在「新目录还没有 mensic/」且「旧目录存在」时复制一次。
/// ⚠️ 这里的 `com.vizart.app` 是**历史目录名**，不要跟着品牌改（改了就读不到旧数据）。
#[cfg(desktop)]
fn migrate_legacy_data(app: &tauri::AppHandle) {
    let Ok(new_base) = app.path().app_data_dir() else {
        return;
    };
    let new_root = new_base.join("mensic");
    if new_root.exists() {
        return;
    }
    let Some(appdata) = new_base.parent() else {
        return;
    };
    let old_root = appdata.join("com.vizart.app").join("vizart");
    if !old_root.is_dir() {
        return;
    }
    match copy_dir_all(&old_root, &new_root) {
        Ok(()) => println!(
            "[mensic] 已迁移旧数据：{} -> {}",
            old_root.display(),
            new_root.display()
        ),
        Err(e) => eprintln!("[mensic] 迁移旧数据失败：{e}（不影响启动，旧项目仍留在原目录）"),
    }
}

#[cfg(desktop)]
fn copy_dir_all(from: &std::path::Path, to: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // 原生剪贴板（「复制 / 粘贴颜色」用它，避免 WebView 弹权限气泡）
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(RendererState::default())
        .invoke_handler(tauri::generate_handler![
            write_file,
            share_file,
            renderer_info,
            renderer_call,
            renderer_call_text
        ])
        .setup(|app| {
            // 品牌改名换了 identifier：先把旧目录里的项目搬过来（一次，之后 no-op）
            #[cfg(desktop)]
            migrate_legacy_data(app.handle());
            // 窗口是 `visible: false` 创建的（避免冷启动白屏），首帧之后由前端调用 `show()`。
            // ⚠️ 这里再兜一层：万一前端那条路走不通（权限缺失、JS 报错、前端根本没跑起来），
            //    2.5s 后也把窗口显示出来 —— 宁可看到白屏，也不能让用户看到「启动了但没有窗口」。
            //    （曾经就是漏了 `core:window:allow-show`，导致窗口永远不出现。）
            if let Some(win) = app.get_webview_window("main") {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(2500));
                    if !win.is_visible().unwrap_or(true) {
                        let _ = win.show();
                    }
                    let _ = win.set_focus();
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("运行 mensic 时发生错误");

    app.run(|handle, event| {
        // 退出时结束本端渲染 sidecar，避免残留进程
        if let tauri::RunEvent::Exit = event {
            if let Some(state) = handle.try_state::<RendererState>() {
                renderer::shutdown(&state);
            }
        }
    });
}
