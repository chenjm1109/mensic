/**
 * 字号规范 —— 全站统一，页面里不要再随手写 `text-[12.5px]` 这种裸值。
 *
 * 与 `core/spacing.ts` 同一套思路：**只导出 Tailwind 字面量 class**
 * （Tailwind 靠扫源码找类名，拼出来的字符串它扫不到），所以这里是常量而不是函数。
 *
 * 分层（由大到小，共 8 级）。定这 8 级的依据：改造前全站散着 **18 种**字号，
 * 其中 11 / 11.5 / 12 / 12.5 / 13 / 13.5 / 14 / 14.5 / 15 挤在一起（一百多处），
 * 谁也说不清哪一级该用哪个 —— 于是按「用途」收敛成下面这几级：
 *
 *   display   68px  首页字标（全站唯一）
 *   title     40px  页面主标题：图鉴 / 创作 / 设置 / 文件夹名
 *   heading   26px  首页入口卡标题
 *   subtitle  17px  卡片标题、对话框标题
 *   bodyLg    15px  设置页 Cell 标题（宽松档）
 *   body      13px  输入框、正文、说明（宽松档的说明文字）
 *   label     12px  参数栏 Cell 标题、面板分区标题、表格、胶囊
 *   caption   11px  脚注、状态角标
 *
 * 与 Cell 的关系（`components/ui/cell.tsx`）：Cell 的 `size`
 *   sm（参数栏）= 标题 `label` / 说明 `caption`
 *   md（设置页）= 标题 `bodyLg` / 说明 `body`
 *
 * 不在这里管的：字重（`font-medium` / `font-semibold` 就近写）；
 * 字体族只有两套，已固定在 styles.css —— 正文 `--font-sans`（ZhuoKai + 系统回退），
 * 代码/数字宽字符用 `font-mono`。
 */
export const TYPO = {
  display: "text-[68px]",
  title: "text-[40px]",
  heading: "text-[26px]",
  subtitle: "text-[17px]",
  bodyLg: "text-[15px]",
  body: "text-[13px]",
  label: "text-[12px]",
  caption: "text-[11px]",
} as const;

/**
 * **视口很矮时**（手机横屏 ≈390px 高）的一档降级：还是同一套等级，只是换一级。
 *
 * 目前只有画廊「详情页」在用 —— 那一页纵向内容长（标题/描述/标签/创建按钮），
 * 按 `title`(40) 排会在 390px 高的屏上把轮播图挤成 0 高度（实测：图容器 0 高、
 * 连共享元素过场的落点都找不到），用户看到的就是「只剩几行字」。
 *
 * ⚠️ 媒体查询写在类名里（Tailwind 只能扫到**字面量**类名，拼出来的字符串它扫不到），
 * 所以这里是写死的串而不是函数 —— 与上面 `TYPO` 同一个理由。
 * ⚠️ 只允许在**确实纵向放不下**的页面上用，别拿去当通用小屏字号。
 */
export const TYPO_SHORT = {
  title: "[@media(max-height:560px)]:text-[26px]",
  subtitle: "[@media(max-height:560px)]:text-[15px]",
  bodyLg: "[@media(max-height:560px)]:text-[13px]",
} as const;

export type TypoLevel = keyof typeof TYPO;
