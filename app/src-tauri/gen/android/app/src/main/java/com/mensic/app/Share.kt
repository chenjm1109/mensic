package com.mensic.app

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import androidx.core.content.FileProvider
import java.io.File

/**
 * 移动端「导出」的唯一落点：把字节写进应用缓存，再交给**系统分享面板**。
 *
 * 为什么是分享面板而不是「另存为」：Android 没有桌面那种系统保存对话框（Tauri 的 dialog
 * 插件在移动端也不提供），而 ACTION_SEND 是系统级标准出口 —— 用户可以存到「文件」、相册、
 * 发给微信 / 钉钉等，一个入口覆盖所有用途。
 *
 * 调用链：TS `saveFileAs()` → Rust `share_file` → JNI → `NativeRenderer.shareFile` → 本对象。
 * 文件写在 `cacheDir/share/`（`res/xml/file_paths.xml` 里已声明 `<cache-path>`，
 * FileProvider 才允许把这个目录的 URI 授给别的应用）。
 */
object Share {
  /** 项目名可能带 / : * 之类：换掉，保证是合法的文件名（也避免 URI 编码问题） */
  private fun safeName(name: String): String =
    name.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifBlank { "export" }

  /**
   * @return 空串 = 已唤起分享面板；非空 = 失败原因（Rust 侧原样抛给前端）
   */
  @JvmStatic
  fun share(context: Context?, name: String, mime: String, bytes: ByteArray): String {
    val ctx = context?.applicationContext ?: return "分享失败：应用上下文缺失"
    return try {
      val dir = File(ctx.cacheDir, "share").apply { mkdirs() }
      val file = File(dir, safeName(name))
      file.writeBytes(bytes)
      val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", file)
      val send = Intent(Intent.ACTION_SEND).apply {
        type = mime
        putExtra(Intent.EXTRA_STREAM, uri)
        // ClipData + 读权限：部分接收方（相册 / 文件管理器）只认 clipData 里的 URI
        clipData = android.content.ClipData.newRawUri(file.name, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      // 从 JNI（tokio 线程）进来：startActivity 要回主线程；没有 Activity 上下文时必须 NEW_TASK
      val chooser = Intent.createChooser(send, file.name)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      Handler(Looper.getMainLooper()).post {
        runCatching { ctx.startActivity(chooser) }
      }
      ""
    } catch (e: Throwable) {
      e.message ?: e.toString()
    }
  }
}
