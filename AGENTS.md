# 工程规则（AI 协作）

只写动手前必须知道的约束：一条一行，不写理由、实测数字和历史。理由放代码注释。

## Git 与计划

- 除非明确要求，不要 commit、push、打标签、变基、重置或改写历史。
- 除非明确要求，不要创建或更新计划文件。

## 通用

- 与现有结构、命名、风格一致；优先复用既有模块。
- 目录分工：**`app/` = 应用**（Tauri 桌面 + 安卓，唯一产品）；**`catalog/` = 案例库**（模板内容源）；**`design/tokens.yaml` = 设计令牌**；**`docs/` = 文档**。
- 改案例只动 `catalog/`；改应用只动 `app/`；不要把案例资源塞进 `app/src`。
- `app/`：shadcn/ui + Tailwind，Typora 式极简（细边框、无投影）。
- Python 只有一个环境：`app/.renderer-venv`（`npm run setup:python` 建）；缩略图、清单、冻结渲染器都用它，不要调系统 `python`。
- 运行期资源（Pyodide / 轮子 / 中文字体）用 `npm run setup:assets` 准备；`app/public/` 不入库，别手工提交或往库里塞。
- 界面自身的插画 / 背景图放 `src/assets/`（随代码打包）；不要引用 `public/gallery/*` 或 `public/cases/*` 的生成物 —— 发布构建会把未发布案例的资源裁掉。大面积模糊要**烘进图里**，不要用 CSS `filter: blur()`（安卓 WebView 会跳过超大合成层的滤镜）。
- 安卓工程 `app/src-tauri/gen/android` **入库**（含手改的 manifest / gradle / Kotlin）；忽略项见 `app/.gitignore`，手改说明见 `docs/operations/android.md`。
- 换应用图标：`npx tauri icon <源图.png>`（会写 `src-tauri/icons/**` 与 `gen/android` 的 mipmap）。`build.rs` 已监听 `icons/`，重编即生效；Windows 任务栏若还显示旧图，那是资源管理器图标缓存（`ie4uinit.exe -show`）。
- 案例发不发只看 `catalog/**/meta.yaml` 的 `status: published`（缺省 draft）；发布包由 `npm run apk` / `npm run dist` 自动裁剪，不要再用运行时开关或管理员模式控制可见性。

## 颜色与主题

- 不写死颜色（`#hex`、`bg-white`、`bg-gray-*`）；只用语义 token：`bg-surface` / `surface-2` / `surface-3`、`text-ink` / `ink-2` / `ink-3` / `ink-4`、`border-line` / `line-2`、`var(--brand*)`；shadcn token 可直接用。
- 主题色阶只由 `core/brand.ts` 的 `brandTokens(hex, dark)` 推导；默认主题色是应用原生玫红，不要改默认值。
- 主题色也有工具类：`bg-brand-soft` / `text-brand-strong` / `border-brand-line` …（`styles.css` 的 `@theme inline` 映射到 `--brand*`）。
- 亮暗模式落到 `<html class="dark">`，由 `store.ts` 的 `applyTheme` 应用。
- canvas 类组件读不到 CSS 变量时，按 `store.mode` 在 JS 里取两套值。
- 图表与导出图保持自身配色，不跟随 UI 主题色。

## 文案与多语言

- 词条键 = 源码里的中文原文；缺失自动回退中文；变量写 `{v1}` / `{v2}`。
- 用全局 `t`，不要逐组件 import；memo 里用到文案时把 `store.locale` 加进依赖。
- 应用名用 `useAppName()`；改了界面文案必须同步 `core/i18n/en.ts` 的同名键（含标点）。
- 数据不翻译（项目名、列名、案例标题与说明）。

## 持久化

- 外观设置 → `localStorage["mensic.settings.v1"]`，统一走 `persistAppearance`。
- 项目数据：桌面 / 安卓走 `%APPDATA%/<identifier>/mensic/`（`projects/` + `covers/` + `templates/`），网页走 IndexedDB（库名 `mensic`）；入口统一在 `platform/storage.ts`。
- 只在本次运行内有效的状态 → sessionStorage，不要用 localStorage。
- 改名（vizart → mensic）前的旧键 / 旧库 / 旧目录只允许出现在**迁移代码**里，别在业务代码里引用。

## 组件（同类交互只有一套）

- 交互基元走 animate-ui：`components/ui/<x>.tsx` 只转发；应用代码不要直接 `import "@radix-ui/react-*"`，基元从 `radix-ui` 聚合包引入。
- 选项高亮用 highlight 组件，底色统一 `bg-brand-soft`（DropdownMenu / Select / Combobox 同一套）；「禁用」样式必须写 `data-[disabled=true]:`。
- 工具栏只有 `components/ui/toolbar-button.tsx`；互斥项共用滑动墨迹（`glide` 默认），独立开关必须 `glide={false}`。
- 悬停只用 `hover:bg-surface-3`，不等于选中。
- Dialog 默认居中；底部统一 `DialogFooter`、多个按钮等宽，不要写死 `min-width`。
- 动效 150–220ms、缓动 `[0.4,0,0.2,1]`；按压反馈用 CSS `:active`（`active:scale-[0.99]`），不要 Motion `whileTap`。

## 设置项（Cell）

- 一行设置只用 `Cell` / `CellGroup`；独立项 = `Cell`，关联项 = `CellGroup`（可带组标题、脚注）。
- 控件在右列并贴右边缘；整列等宽用 `controlWidth`，控件撑满用 `controlFill`。
- 滑块、按钮组、分段选择器、色板放 `Cell` 的 children；右列控件可同时保留。
- 整行可点用 `onClick`；可点的 `Cell` 里不要再放交互控件。
- `variant`：`boxed`（设置页、对话框）/ `plain`（编辑器侧边栏）；`size`：`sm` / `md`。
- 标题行固定 `min-h-8`，行高不由控件决定。
- `plain` 组标题：小字 + 发丝线；文字用 `var(--brand-strong)`、线用 `var(--brand-line)`；标题与脚注不 `px-1`。
- 恢复默认只有 `RestoreButton`：走 `Cell` 的 `restore` prop（不要塞进 `control`），只在当前值 ≠ 默认值时出现，不新增其他恢复入口。
  - 它渲染在控件列第一位，`RestoreButton` 自带 `-ml-[38px]`，不占控件宽度；`controlFill` 行不要用。
  - 改回默认值必须清掉覆盖，不留与默认相同的脏数据。
- 所有滚动容器带 `[scrollbar-gutter:stable]`。
- 轻提示只有 `notify()` + 根部 `<Toaster />`；文案在调用点用 `t()` 翻好。
- 颜色的复制 / 粘贴只在 `ColorField` 里做，粘贴用 `parseHexColor()` 校验。

## 字号（TYPO）

- 不写裸字号（`text-[12.5px]` 之类），一律用 `core/typography.ts` 的 `TYPO`。
- 对话框标题 / 说明由 `ui/dialog` 统一给，调用点不要再覆盖。
- 字体族固定：正文 `--font-sans`，代码 / 宽字符 `font-mono`。

## 图形元素

- `meta.yaml` 的 `elements:` 声明 `{key,label,size,opacity}`；默认值由对应案例参数给，不另写一份。
- 覆盖存 `project.elements[元素][分组]`，只存改过的项；分组 key 即分组列取值，不分组用 `"*"`。
- 元素配色只在元素块里改；一块三行（颜色 / 大小 / 透明度），不加额外「恢复默认」行。
- 元素块与其余参数之间只留发丝分隔线，不加分区级间距。

## 页面装饰

- 页面分三组：画布（尺寸 + 背景色）、绘图区（背景色 + 边框）、网格线。
- 绘图区边框直接控制上下左右四条边，没有整圈开关；四边全显示 = 不写覆盖。
- 边框 / 网格线是「接管」语义：不写 = 用模板自己的，只有用户改了才写。
- 面板显示的默认色必须按当前主题预设解析（`useTokenDefaults`）。
- `mergeTokensOverride` 与 `hasTokensOverride` 必须遍历所有子块，不要枚举键。
- 渲染器的 `rcParams` 是全局单例：相关键每次写确定值，未设置时写 `rcParamsDefault`。
- 刻度朝向走 `presentation.ticks.direction`：不写 = 外，关掉才写 `"in"`。

## 字体

- 字体是一级分区 `FontPanel`；分区标题已叫「字体」，组不再带组标题。
- `font.cjk` / `font.latin` 中英分开；渲染时英文字体在前、中文字体在后、内置 CJK 兜底。
- 两个下拉按字形覆盖过滤（`font_list` 的 `cjk` / `latin`），不要按名字猜；显示 `label`、存 `name`；设计默认族不参与过滤。
- 超长选项用 `Combobox`，不要用 `Select`；Select 的高亮不要加 `onPointerMove`。
- 全局字号 / 字重显示真正在用的值；坐标轴字号留空 = 跟随全局，字重选「跟随全局」= 不写覆盖。
- 只有「跟随全局」，不要「跟随主题」。
- 轴标签颜色走 `color.label`；刻度与标题走 `color.text`，刻度不能回落 `label`。

## 移动端

- 禁止整页缩放：viewport + `html, body { touch-action: pan-x pan-y }` + `MainActivity` 的 `disableWebViewZoom()`，三者都要。
- 自绘光标（`CustomCursor`）只在 `hover: hover` + `pointer: fine` 时启用，且 `pointerType === "touch"` 的 enter / down / move 一律不显示（触摸时既不跟随也不留圈）。
- 捏合缩放只允许出现在数据表格与图表 / 图片预览；新增区域照 `ZoomPane` 写。
- 安卓沉浸式全屏 + 锁定横屏（`sensorLandscape`）；回到前台要重新收起系统栏。
- 安卓系统返回只走 `app/src/app/android-back.ts`（`onBackButtonPress`）：弹层优先关、非首页等价左上角返回（`goUpOf`）、首页连按两次才退出。不要在 Kotlin 里覆写 `onBackPressed`，也不要另写一套页面回退规则。
- 首页是按可用空间整体缩放的海报：用 `useSize` 只缩不放，新元素放进缩放盒，不用 `vw` / `vh` 定位。
- 画廊详情页：轮播给 `min-h`、矮视口用 `TYPO_SHORT`、根容器 `overflow-y-auto` + stable gutter。
- 移动端导出**只走系统分享面板**：一律用 `saveFileAs()`（移动端 → `share_file` → Kotlin `ACTION_SEND`），不要用「另存为」对话框或 `downloadBlob`（WebView 不处理 `<a download>`）。导出失败必须 `notify` 出来，不要写进预览的 `error` 状态。
- 打安卓包用 **`cd app && npm run apk`**，产物在 **`app/apk/mensic-<版本>-arm64.apk`**（`apk/` 已 gitignore）。脚本会先同步 Python、编 `.so`、替代符号链接、再让 Gradle 跳过 rust 任务打包；不要去记 `gen/android/app/build/...` 那种深路径。
- 发版产物统一汇总在 **`app/release/`**（`mensic-<版本>-{windows-x64.msi,windows-x64-setup.exe,android-arm64.apk}`，已 gitignore）：`npm run dist` / `npm run apk` 结束会自动复制，不要让人去 `target/release/bundle/...` 里翻。

## 顶栏（PageTopBar）

- 文件夹进出的过场纸只裁在**内容区**里（`Projects.tsx` 的 `FolderMorph`），顶栏始终露着：回退按钮不参与过场，面包屑 / 工具栏按 `viewScope` 立刻形变，内容区等纸盖满再切 `scope`。

- 返回按钮的位置与抬高量全站统一，不要在调用点改；中间工具栏 / Tab 组必须与它同高。
- 页面标题 / 面包屑走 `leading` 槽：`TYPO.heading`、槽高 `h-9`、`whitespace-nowrap`、不占位。
- 创作页批量只从长按卡片进入；收藏与项目包导入不要加回来。

## 纸张卡片

- 纸张只用 `PaperLayers`；撕边传 `seed`（= 卡片 id），同一 id 形状固定。
- 投影最多两条 `drop-shadow`；纸面用 SVG `path` + CSS `filter`，盒子 `inset-0`。
- 不要用 `clip-path`，也不要把纸面烘焙成 canvas。
- 压在纸上的层必须走同一条毛边路径，且放在带 `filter` 的元素之外。
- 创作页瀑布流必须是 CSS `columns`（`columns-1 sm:columns-4`），不要用任意断点。

## 数据表格

- 缩放只缩表格自身，状态存 sessionStorage；字号写进三个 `*FontStyle`，`fontFamily` 不能是 `inherit`。
- 粘贴自己监听 `paste` 事件（TSV），关闭库内置 paste；不要改成逗号分隔。
- `Ctrl+A` 自己接管；不要只传 `onGridSelectionChange`，必须同时传 `gridSelection`。
- 复制回调收到的已是数据坐标，不要再减行号偏移。
- 删除要作用于整个选区：整行在 `gridSel.rows`，框选在 `gridSel.current.range`（见 `features/data/selection.ts`）。

## 不要加回来

- 「主题配色」分区、收藏、项目包导入、第二套工具栏 / 下拉。

## 验证

- 渲染器、手势、表格、样式覆盖等改动后跑 `cd app && npm run check`（跑完 `scripts/check-*` 全部脚本）。
