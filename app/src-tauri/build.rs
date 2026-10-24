fn main() {
    // 图标是**编译期**嵌进 exe 的（tauri-build 生成 resource.rc → 链接进 PE 资源）。
    // 它默认不监听 icons/，换完图标不重跑这里，exe 会一直带着旧图标。
    println!("cargo:rerun-if-changed=icons");
    println!("cargo:rerun-if-changed=app-icon.png");
    tauri_build::build()
}
