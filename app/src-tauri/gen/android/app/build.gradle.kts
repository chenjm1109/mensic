import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
    // 原生 CPython（Python 3.10–3.14）+ 预编译科学计算包，供 App 内渲染使用
    // 版本号必需：settings.gradle 里把它映射到 com.chaquo.python:gradle
    id("com.chaquo.python") version "17.0.0"
}

// 由 -PabiList 传入（与 rust 插件保持一致）；Chaquopy 必须显式知道 ABI
val chaquopyAbis =
    (findProperty("abiList") as? String)
        ?.split(',')
        ?.map { it.trim() }
        ?.filter { it.isNotEmpty() }
        ?.takeIf { it.isNotEmpty() }
        ?: listOf("arm64-v8a")

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// 正式签名配置放在仓库外（默认 ~/.mensic/release-keystore.properties），
// 可用 MENSIC_ANDROID_KEY_PROPERTIES 覆盖；keystore 与密码都不得进入提交历史。
val keystorePropertiesFile = file(
    System.getenv("MENSIC_ANDROID_KEY_PROPERTIES")
        ?: "${System.getProperty("user.home")}/.mensic/release-keystore.properties"
)
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 37
    namespace = "com.mensic.app"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.mensic.app"
        minSdk = 24
        targetSdk = 37
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
        ndk {
            abiFilters.addAll(chaquopyAbis)
        }
    }
    /**
     * Release 签名：优先使用仓库外的 release-keystore.properties。
     *
     * 正式分发包必须配置这个文件（keystore 与密码都不入库）；没有配置时退回 debug
     * keystore，只保证本地能编译，不能作为公开版本发布——否则以后换正式密钥时，
     * 已安装用户只能卸载重装（本地数据会丢）。
     */
    signingConfigs {
        create("release") {
            val storePath = keystoreProperties.getProperty("storeFile")
            if (!storePath.isNullOrBlank() && file(storePath).exists()) {
                storeFile = file(storePath)
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            } else {
                logger.warn(
                    "未配置 release keystore（~/.mensic/release-keystore.properties）；本次 release 使用 debug 签名，仅限本地测试"
                )
                storeFile = File(System.getProperty("user.home"), ".android/debug.keystore")
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            optimization {
               enable = true
            }
            proguardFiles(
                *fileTree(".") {
                  include("**/*.pro")
                  exclude("build/**")
                }.files.toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

/**
 * Rust 插件会为 4 个 ABI 都建 flavor（arm64/arm/x86/x86_64），但 Chaquopy 的 CPython 3.12
 * 只支持 64 位（arm64-v8a / x86_64）——不支持的变体直接禁用，否则配置阶段就会失败。
 */
androidComponents {
    beforeVariants(selector().withFlavor("abi" to "arm")) { it.enable = false }
    beforeVariants(selector().withFlavor("abi" to "x86")) { it.enable = false }
}

rust {
    rootDirRel = "../../../"
}

/**
 * Chaquopy：把原生 CPython 与预编译包打进 APK。
 *
 * 版本选择：
 * - Python 3.12：与本机构建机一致（pip/pyc 需要构建机 Python 主次版本匹配），
 *   也与桌面 sidecar 的 CPython 3.12.9 同版本。
 * - matplotlib/numpy/pandas 只能取 Chaquopy 索引里 cp312 的最新版（3.8.2 / 1.26.2 / 2.1.3），
 *   与桌面的 3.10.8 / 2.4.6 / 3.0.2 存在代差 —— 这是预编译索引的硬限制。
 * - matplotlib 的 mpl-data（字体/样式）必须是真实文件，故 extractPackages。
 */
chaquopy {
    defaultConfig {
        version = "3.12"
        buildPython("python")
        pip {
            install("numpy==1.26.2")
            install("pandas==2.1.3")
            install("matplotlib==3.8.2")
            install("pyyaml==6.0.3")
        }
        extractPackages("matplotlib")
    }
    sourceSets {
        getByName("main") {
            // 由 scripts/sync-android-python.mjs 生成（render.py / sidecar.py / 字体）
            srcDir("../../../../android/python")
        }
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = file("tauri.build.gradle.kts"))
