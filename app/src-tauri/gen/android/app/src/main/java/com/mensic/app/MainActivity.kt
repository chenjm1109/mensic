package com.mensic.app

import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.WindowManager
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.mensic.app.renderer.NativeRenderer

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // 注册原生渲染桥：把 Context 与本类引用交给 Rust（后续渲染从任意线程走 JNI）。
    // 预热由前端驱动（App 空闲时调 renderer_call("info")），不在这里占用主线程。
    NativeRenderer.init(this)
    goImmersive()
    applyImeInsets()
    disableWebViewZoom()
  }

  override fun onResume() {
    super.onResume()
    // 从后台回来 / 分屏切换后系统会把状态栏放回来，重新收起（沉浸式必须「粘」）
    goImmersive()
  }

  /**
   * 沉浸式全屏：隐藏状态栏与导航栏，像游戏一样铺满整屏。
   *
   * BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE：用户在边缘划一下仍能临时唤出状态栏，
   * 松手后自动收起 —— 不这么做就彻底没法看时间了。
   * 内容本身已经 edge-to-edge（enableEdgeToEdge），所以这里只是把两条系统栏收走，
   * 不需要给页面留安全区：页面顶部的返回按钮在最左边，刘海在正中，不会打架。
   */
  private fun goImmersive() {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    WindowInsetsControllerCompat(window, window.decorView).apply {
      hide(WindowInsetsCompat.Type.systemBars())
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }
    // 让内容也铺进刘海区（否则「隐藏状态栏」后刘海那条仍会被切成黑边）
    window.attributes = window.attributes.apply {
      @Suppress("DEPRECATION")
      layoutInDisplayCutoutMode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
      } else {
        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      }
    }
  }

  /**
   * 键盘（IME）弹出时把 WebView 真正压矮。
   *
   * targetSdk 35+ 开始系统强制 edge-to-edge，`adjustResize` 不再自动缩窗口；
   * 而 Tauri 安卓的 `visualViewport` 又拿不到键盘高度。只靠前端算，网页会一直按整屏高度排版，
   * 底部输入框 / 下拉 / 弹窗就被键盘直接盖住。
   *
   * 所以这里直接读 `WindowInsetsCompat.Type.ime()`，把键盘高度垫成根视图的底部 padding：
   * WebView 的实际尺寸变小后，页面里的 `vh` / flex / 滚动容器 / 弹层定位都会跟着正确。
   *
   * Android 10 及以下仍由 manifest 的 `adjustResize` 负责，这里只在 11+ 生效，避免双重缩小。
   */
  private fun applyImeInsets() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
    val root = window.decorView
    ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
      val imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      view.setPadding(view.paddingLeft, view.paddingTop, view.paddingRight, imeBottom)
      insets
    }
    ViewCompat.requestApplyInsets(root)
  }

  /**
   * 关掉 WebView 自身的整页缩放（原生兜底）。
   *
   * 网页侧已经有两道防线（index.html 的 `user-scalable=no`、styles.css 的 `touch-action`），
   * 但 Android WebView 的 viewport meta 只在 `setUseWideViewPort(true)` 下才完全生效，
   * 而 wry 没设它 —— 所以这里再把 WebView 的 zoom 能力整个关掉，不依赖页面配置。
   *
   * 关的是**整页缩放**：应用内部的缩放（数据表格、图表预览）都是页面里 JS 自己算的，
   * 不经过 WebView 的 zoom，因此不受影响。
   * WebView 由 Rust 侧创建、晚于 onCreate，所以用 layout 监听等它出现。
   */
  private fun disableWebViewZoom() {
    val root = window.decorView as? ViewGroup ?: return
    val apply = {
      val webView = findWebView(root)
      if (webView != null) {
        webView.settings.setSupportZoom(false)
        webView.settings.builtInZoomControls = false
        webView.settings.displayZoomControls = false
        true
      } else {
        false
      }
    }
    if (apply()) return
    root.viewTreeObserver.addOnGlobalLayoutListener(object : ViewTreeObserver.OnGlobalLayoutListener {
      override fun onGlobalLayout() {
        if (apply()) root.viewTreeObserver.removeOnGlobalLayoutListener(this)
      }
    })
  }

  private fun findWebView(view: View): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        findWebView(view.getChildAt(i))?.let { return it }
      }
    }
    return null
  }
}
