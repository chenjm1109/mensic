# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# JNI 入口：Rust 侧按「固定类名 + 方法签名」调用（见 src-tauri/src/android_bridge.rs），
# R8 默认会把只被 JNI 引用的方法当作死代码删掉 / 改名 —— release 包导出时会报
# `no static "Lcom/mensic/app/renderer/NativeRenderer;..."`。
# 这里保留 NativeRenderer 的类名、native 方法（Java_..._nativeRegister）以及
# call / shareFile / init 这几个静态入口。
-keep class com.mensic.app.renderer.NativeRenderer {
    native <methods>;
    public static <methods>;
}