package com.mensic.app.renderer

import android.content.Context
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import com.mensic.app.Share

/**
 * 原生渲染桥：App 进程内的 CPython（Chaquopy）←→ 与桌面/导出**同源**的 render.py。
 *
 * 调用链：TS → Rust(renderer_call) → JNI → 本类 → Chaquopy → mensic_entry → render.py
 *
 * 与桌面 sidecar 的区别仅在于「宿主」：桌面是独立进程 + stdin/stdout 帧协议，
 * 这里是进程内直接调用同一个 `OPS`（见 android/python/mensic_entry.py）。
 */
object NativeRenderer {
    @Volatile
    private var appContext: Context? = null

    init {
        // Tauri 的 Rust 库（crate-type 含 cdylib）
        System.loadLibrary("mensic_lib")
    }

    /**
     * 把本类的 Class 引用交给 Rust（必须由 Java 线程调用，此时 class loader 正确）。
     * Rust 侧缓存成全局引用，后续从任意线程调用。
     */
    private external fun nativeRegister(clazz: Class<*>)

    /** 在 MainActivity.onCreate 里调用一次 */
    @JvmStatic
    fun init(context: Context) {
        appContext = context.applicationContext
        nativeRegister(NativeRenderer::class.java)
    }

    private fun ensureStarted(): Context {
        val ctx = appContext ?: error("NativeRenderer 未初始化（缺少 NativeRenderer.init 调用）")
        if (!Python.isStarted()) {
            // 较慢（约 1-3s），必须在后台线程调用
            Python.start(AndroidPlatform(ctx))
        }
        return ctx
    }

    /**
     * 渲染入口，返回 PNG / SVG / ZIP 字节或 UTF-8 文本。
     * op ∈ {info, render_png, render_svg, case_script, package_zip}
     *
     * 注意：本方法会阻塞（首次调用要启动 Python 运行时），只能从后台线程调用。
     */
    @JvmStatic
    fun call(op: String, specJson: String): ByteArray {
        ensureStarted()
        val mod = Python.getInstance().getModule("mensic_entry")
        return mod.callAttr("call", op, specJson).toJava(ByteArray::class.java)
    }

    /**
     * 把一份字节交给系统分享面板（导出 PNG / SVG / CSV / ZIP / `.mensic` 都走这里）。
     *
     * 放在本类里只是为了复用已经注册好的 Class 引用与 `appContext`；
     * 具体实现见 `com.mensic.app.Share`。
     *
     * @return 空串 = 已唤起面板；非空 = 失败原因（Rust 侧原样抛给前端）
     */
    @JvmStatic
    fun shareFile(name: String, mime: String, bytes: ByteArray): String =
        Share.share(appContext, name, mime, bytes)
}
