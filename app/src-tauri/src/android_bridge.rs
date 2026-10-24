//! 安卓原生渲染桥：Rust ←→ Kotlin（Chaquopy）之间的 JNI 通道。
//!
//! 为什么要走 JNI 而不是 Tauri 移动插件：
//! 已有的 `renderer_*` 命令与前端调用链完全不用改 —— 安卓上把「sidecar 进程」换成
//! 「进程内 Kotlin/Chaquopy」即可，降级链、能力探测、（反）序列化协议全部复用。
//!
//! 关键点：
//! - Kotlin 在 `MainActivity.onCreate`（Java 线程、class loader 正确）里把
//!   `NativeRenderer::class.java` 交给我们，我们缓存成**全局引用**；
//! - 渲染发生在 tokio 的阻塞线程上，因此每次调用自行 attach 到 JavaVM；
//! - Chaquopy 的 `call` 会阻塞（首次含 Python 运行时启动），所以绝不能在主线程调用。
#![cfg(target_os = "android")]

use std::borrow::Cow;
use std::sync::OnceLock;

use jni::objects::{GlobalRef, JByteArray, JClass, JObject, JString, JValue};
use jni::{JNIEnv, JavaVM};

static CLASS: OnceLock<GlobalRef> = OnceLock::new();

/// 由 Kotlin 调用：`NativeRenderer.init()` → `nativeRegister(NativeRenderer::class.java)`
#[no_mangle]
pub extern "system" fn Java_com_mensic_app_renderer_NativeRenderer_nativeRegister<'local>(
    env: JNIEnv<'local>,
    _this: JObject<'local>,
    clazz: JClass<'local>,
) {
    match env.new_global_ref(clazz) {
        Ok(g) => {
            let _ = CLASS.set(g);
        }
        Err(e) => {
            eprintln!("[mensic] 注册原生渲染类失败：{e}");
        }
    }
}

fn java_vm() -> Result<JavaVM, String> {
    let ctx = ndk_context::android_context();
    unsafe { JavaVM::from_raw(ctx.vm().cast()) }.map_err(|e| format!("获取 JavaVM 失败：{e}"))
}

/// 取出并清除挂起的 Java 异常，转成可读信息
fn take_exception(env: &mut JNIEnv) -> Option<String> {
    if !env.exception_check().unwrap_or(false) {
        return None;
    }
    let throwable = env.exception_occurred().ok();
    let _ = env.exception_clear();
    let throwable = throwable?;
    let tv = env
        .call_method(&throwable, "toString", "()Ljava/lang/String;", &[])
        .ok()?;
    let jobj = tv.l().ok()?;
    // 用 from_raw 避免依赖 JObject→JString 的转换实现（同一 local ref，安全）
    let js = unsafe { JString::from_raw(jobj.as_raw()) };
    let jstr = env.get_string(&js).ok()?;
    Some(Cow::<str>::from(&*jstr).into_owned())
}

/// 调用 `NativeRenderer.shareFile(name, mime, bytes): String`（返回空串 = 已唤起分享面板）
pub fn share(name: &str, mime: &str, bytes: &[u8]) -> Result<(), String> {
    let class = CLASS
        .get()
        .ok_or_else(|| "原生桥未初始化（NativeRenderer.init 未执行）".to_string())?;
    let vm = java_vm()?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|e| format!("attach 到 JavaVM 失败：{e}"))?;

    let jname = env
        .new_string(name)
        .map_err(|e| format!("构造参数失败：{e}"))?;
    let jmime = env
        .new_string(mime)
        .map_err(|e| format!("构造参数失败：{e}"))?;
    let jbytes = env
        .byte_array_from_slice(bytes)
        .map_err(|e| format!("构造字节数组失败：{e}"))?;

    let result = env.call_static_method(
        &*class,
        "shareFile",
        "(Ljava/lang/String;Ljava/lang/String;[B)Ljava/lang/String;",
        &[
            JValue::Object(&jname),
            JValue::Object(&jmime),
            JValue::Object(&jbytes),
        ],
    );

    let value = match result {
        Ok(v) => v,
        Err(e) => {
            return Err(match take_exception(&mut env) {
                Some(msg) => msg,
                None => format!("分享调用失败：{e}"),
            })
        }
    };

    let obj = match value {
        jni::objects::JValueGen::Object(o) => o,
        _ => return Err("分享返回类型异常".to_string()),
    };
    if obj.is_null() {
        return Ok(());
    }
    let js = unsafe { JString::from_raw(obj.as_raw()) };
    let msg = env
        .get_string(&js)
        .map(|s| Cow::<str>::from(&*s).into_owned())
        .unwrap_or_default();
    if msg.is_empty() {
        Ok(())
    } else {
        Err(msg)
    }
}

/// 调用 `NativeRenderer.call(op, specJson): ByteArray`
pub fn call(op: &str, spec_json: &str) -> Result<Vec<u8>, String> {
    let class = CLASS
        .get()
        .ok_or_else(|| "原生渲染桥未初始化（NativeRenderer.init 未执行）".to_string())?;
    let vm = java_vm()?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|e| format!("attach 到 JavaVM 失败：{e}"))?;

    let op_str = env
        .new_string(op)
        .map_err(|e| format!("构造参数失败：{e}"))?;
    let spec_str = env
        .new_string(spec_json)
        .map_err(|e| format!("构造参数失败：{e}"))?;

    // `&GlobalRef` 本身实现了 Desc<JClass>，直接传即可（避免 JObject→JClass 转换）
    let result = env.call_static_method(
        &*class,
        "call",
        "(Ljava/lang/String;Ljava/lang/String;)[B",
        &[JValue::Object(&op_str), JValue::Object(&spec_str)],
    );

    let value = match result {
        Ok(v) => v,
        Err(e) => {
            return Err(match take_exception(&mut env) {
                Some(msg) => msg,
                None => format!("原生渲染调用失败：{e}"),
            })
        }
    };

    let obj = match value {
        jni::objects::JValueGen::Object(o) => o,
        _ => return Err("原生渲染返回类型异常".to_string()),
    };
    if obj.is_null() {
        return Err("原生渲染返回了空结果".to_string());
    }
    let arr = unsafe { JByteArray::from_raw(obj.as_raw()) };
    env.convert_byte_array(arr)
        .map_err(|e| format!("读取渲染结果失败：{e}"))
}
