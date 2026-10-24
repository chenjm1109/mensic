# 文档

面向使用者的说明在仓库根 [README.md](../README.md)（English）、[中文](../README.zh.md)；
这里放**实现方案**，写给要改代码的人。

## 架构

| 文档 | 讲什么 |
| --- | --- |
| [渲染后端与多端方案](architecture/渲染后端与多端方案.md) | 一份 `render.py` 怎么同时跑在 Pyodide（Web / 安卓）与本端 CPython sidecar（桌面）上；后端选择、降级、冻结流程、安卓打包链路 |
| [手绘图形实现方案](architecture/手绘图形实现方案.md) | 纸张卡片 / 撕边 / rough.js 烘焙到 canvas 的做法与约束 |

## 运维

| 文档 | 讲什么 |
| --- | --- |
| [安卓工程](operations/android.md) | `src-tauri/gen/android` 哪些入库、我们手改了哪些文件、`tauri android init --force` 之后怎么办、打包时的符号链接报错为什么不用管 |

## 规则

- [AGENTS.md](../AGENTS.md)：动手前必须知道的工程约束（语义色 token、字号、组件复用、持久化、移动端、验证命令）。改代码前先读它。

## 目录

```
app/        应用本体（Tauri 桌面 + 安卓，Vite + React + TS）
catalog/    案例库（meta.yaml + 各引擎实现 + 数据），内容源
design/     设计令牌 tokens.yaml
docs/       本目录
```
