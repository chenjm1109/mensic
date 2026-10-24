import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Cell, CellGroup } from "@/components/ui/cell";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { TYPO } from "@/core/typography";
import { sfx } from "@/sound";
import type { CaseSchemaColumn, DataSet, ProjectSource } from "@/core/types";
import { detectHeaderRow, parseDataFile } from "./parse";
import { buildImported, guessMapping, roleNeeds, viewOf } from "./plan";
import type { RawSheet } from "./types";

/**
 * 数据导入向导（CSV / TSV / Excel）。
 *
 * 流程参考主流可视化工具（Datawrapper 的「首行是否列名 / 转置」、Power Query 的
 * 「首行为表头 / 转置 / 去空行」、Vega-Lite 的「通道 ↔ 字段」映射）：
 *   1. 选文件（Excel 多工作表可选）
 *   2. 认出表头行（可改）
 *   3. **按当前图表的字段需求逐项挑列**（自动预匹配，也可手动改）
 *   4. 预览 → 导入（只把用得上的列写进数据表）
 *
 * 「需要哪些字段」完全来自案例 schema，所以案例改了列定义这里会自动跟着变。
 *
 * `source` 有值时进入**重选模式**：不再让用户挑文件，直接把工程里存档的数据源
 * （导入时留下的原始表 + 上一次的导入选择）铺开，让用户重挑一次映射。
 */
export function ImportDialog({
  open,
  onOpenChange,
  schema,
  source = null,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前案例的数据列定义（驱动整个导入策略） */
  schema: CaseSchemaColumn[];
  /** 工程里存档的数据源：有值就拿它当初始内容（= 上次选好的那份数据），用户仍可重新选文件 */
  source?: ProjectSource | null;
  /** 连**数据源**一起回传，调用方把它存档到工程里 */
  onImport: (data: DataSet, mapping: Record<string, string>, source: ProjectSource) => void;
}) {
  const needs = useMemo(() => roleNeeds(schema), [schema]);
  const [sheets, setSheets] = useState<RawSheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [fileName, setFileName] = useState("");
  /**
   * 数据范围：**直接输行号**（行数多的时候下拉没法用）；留空 = 默认。
   * 起始行留空 → 第 1 行；结束行留空 → 最后一行。
   * ⚠️ 表头行**不让用户选**（那是实现细节）：起始行的**上一行**自动当列名用，
   *   起始行 = 1 就等于「没有表头、第一行也是数据」。
   */
  const [startText, setStartText] = useState("2");
  const [endText, setEndText] = useState("");
  const [transposed, setTransposed] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /**
   * 当前这份内容是从哪来的：`source` = 工程里存档的数据源（用户只改了映射，确认时数据源原样保留）；
   * `file` = 这次重新选的文件（确认时整份换掉）。
   * ⚠️ 不要用「sheets 与 source.sheets 是不是同一个对象」判断 —— 语义要显式。
   */
  const originRef = useRef<"source" | "file">("file");
  /**
   * 是否允许「自动猜」。
   * 打开时先用存档的选择预填，这时要关掉自动猜，否则会把用户上次的选择覆盖掉；
   * 用户自己改了数据范围 / 转置 / 工作表后重新打开自动猜。
   */
  const autoRef = useRef(true);

  const sheet = sheets[sheetIdx];
  /** 数据范围：留空取默认值（起始行 → 第 1 行；结束行 → 最后一行） */
  const startRow = Math.max(1, Number(startText.trim()) || 1);
  const endRow = /^\d+$/.test(endText.trim()) ? Math.max(1, Number(endText.trim())) : null;
  /** 起始行的上一行就是表头行（起始行 = 1 时无表头） */
  const headerRow = startRow - 2;
  const view = useMemo(
    () => (sheet ? viewOf(sheet, headerRow, transposed) : { columns: [], rows: [], types: {} }),
    [sheet, headerRow, transposed],
  );
  /** 按数据范围裁掉尾部多余的行（起始行已经由 headerRow 处理掉了，不用再切头） */
  const rangedView = useMemo(() => {
    if (endRow == null) return view;
    const keep = Math.max(0, endRow - startRow + 1);
    return keep >= view.rows.length ? view : { ...view, rows: view.rows.slice(0, keep) };
  }, [view, endRow, startRow]);

  // 文件 / 工作表 / 数据范围 / 转置 变化后重新自动匹配
  useEffect(() => {
    if (!sheet || !autoRef.current) return;
    setMapping(guessMapping(needs, view));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, sheetIdx, startRow, transposed]);

  // 换文件 / 换工作表时，重新猜一次起始行（各表结构通常不同）
  useEffect(() => {
    if (!sheet || !autoRef.current) return;
    setStartText(String(Math.max(0, detectHeaderRow(sheet.rows)) + 2));
    setEndText("");
  }, [sheet]);

  const reset = () => {
    autoRef.current = true;
    setSheets([]);
    setSheetIdx(0);
    setFileName("");
    setStartText("2");
    setEndText("");
    setTransposed(false);
    setMapping({});
    setError(null);
    setBusy(false);
  };

  // 打开时铺内容：有存档数据源就拿它预填（= 上次选好的那份数据）；没有就空着等选文件
  useEffect(() => {
    if (!open) return;
    if (source && source.sheets.length > 0) {
      autoRef.current = false;
      originRef.current = "source";
      setSheets(source.sheets);
      setSheetIdx(0);
      setFileName(source.fileName);
      setStartText(String(source.plan.headerRow + 2));
      setEndText(source.plan.endRow == null ? "" : String(source.plan.endRow));
      setTransposed(source.plan.transpose);
      setMapping(source.plan.mapping);
      setError(null);
      setBusy(false);
    } else {
      originRef.current = "file";
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source]);

  const pickFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const parsed = (await parseDataFile(file)).filter((s) => s.rows.length > 0);
      if (parsed.length === 0) {
        setError(t("这个文件里没有读到数据"));
        setBusy(false);
        return;
      }
      autoRef.current = true;
      originRef.current = "file";
      setSheets(parsed);
      setSheetIdx(0);
      setFileName(file.name);
      sfx("notify");
    } catch (e) {
      console.warn("[mensic] 解析文件失败：", e);
      setError(t("解析失败，请确认文件格式（支持 .csv / .tsv / .xlsx / .xls）"));
      sfx("error", 0.7);
    } finally {
      setBusy(false);
    }
  };

  const result = useMemo(
    // ⚠️ 导入对话框里**永远不保留未用到的列**：只把当前图表用到的列写进数据表。
    // （源文件整表仍然原样存档在 `source.sheets` 里，以后想用别的列走「重选数据」即可。）
    () =>
      sheet
        ? buildImported(rangedView, needs, { headerRow, transpose: transposed, mapping, keepUnused: false })
        : null,
    [sheet, rangedView, needs, headerRow, transposed, mapping],
  );

  const missing = needs.filter((n) => n.required && !mapping[n.role]);

  const confirm = () => {
    if (!result || !result.data.columns.length) return;
    // ⚠️ 两个 mapping 不要混：`result.mapping` 是**写进工程**的（角色 → 规范列名），
    // `mapping` 是用户这次在源文件里挑的列（角色 → 源列名），要存档下来供下次预填。
    const plan = { headerRow, endRow, transpose: transposed, mapping, keepUnused: false };
    onImport(
      result.data,
      result.mapping,
      // 只是改了映射 → 数据源本身原样保留；这次重新选了文件 → 整份换掉
      originRef.current === "source" && source
        ? { ...source, plan }
        : { fileName: fileName || t("数据"), sheets, plan, savedAt: Date.now() },
    );
    sfx("export");
    reset();
    onOpenChange(false);
  };

  /**
   * 左栏 = **原始文件原样**：表的行与列就是文件里的行与列，
   * ⚠️ 数据范围 / 转置这些配置**一律不影响它**（用户改配置时左栏不该动）。
   * 列名只能是「列 1 / 列 2 …」（文件本身没有列名这个概念）。
   * 用 useMemo：列数要对**整张表**求最大宽度，大文件下不要在每次渲染都扫一遍。
   */
  const rawRows = useMemo(() => (sheet ? sheet.rows.slice(0, 100) : []), [sheet]);
  const rawCols = useMemo(
    () => (sheet ? sheet.rows.reduce((m, r) => Math.max(m, r.length), 0) : 0),
    [sheet],
  );
  /** 右栏 = 中间配置之后**即将被应用**的数据（就是会写进数据表的那份） */
  const outRows = result?.data.rows.slice(0, 100) ?? [];
  const outCols = result?.data.columns ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      {/* ⚠️ 三栏都**严格限尺寸**，各自滚动：列再多、行再多、或者转置把形状整个换掉，
          也只会在这两栏内部出现滚动条，不会把别的内容挤走或撑变形。
          左 = 原始数据｜中 = 重新导入 + 配置选项｜右 = 即将应用的数据。 */}
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        className="flex h-[min(500px,90vh)] w-[min(1180px,94vw)] flex-col overflow-hidden sm:max-w-none"
      >
        {/* 窗口上不要可见的标题/说明；但必须留一个无障碍标题（视觉隐藏），否则 radix 会告警。
            右上角的 ✕ 也去掉了：底部已经有「取消」。 */}
        <DialogTitle className="sr-only">{t("导入数据")}</DialogTitle>

        {/* 顶部一行：三个区域的名称**各自居中在自己那一栏正上方**，
            栏与栏之间用一个细箭头表示流向。三栏宽度与下面完全一致（1fr / 320px / 1fr）。 */}
        <div className="grid shrink-0 grid-cols-[1fr_320px_1fr] items-center gap-3">
          <div className="relative text-center">
            <span className={cn(TYPO.label, "text-ink-2")}>{t("原始数据")}</span>
            <ArrowRight
              aria-hidden="true"
              className="absolute -right-1 top-1/2 size-3.5 -translate-y-1/2 text-ink-4"
            />
          </div>
          <div className="relative text-center">
            <span className={cn(TYPO.label, "font-medium text-ink")}>{t("编辑映射关系")}</span>
            <ArrowRight
              aria-hidden="true"
              className="absolute -right-1 top-1/2 size-3.5 -translate-y-1/2 text-ink-4"
            />
          </div>
          <div className="text-center">
            <span className={cn(TYPO.label, "text-ink-2")}>{t("数据预览")}</span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-3">
          {/* 左：**原始数据**（文件原样 —— 表头行/转置等配置不会改变这一栏）。
              严格限尺寸：无论多少列多少行，都只在这一栏内部滚动 */}
          <div className="min-h-0 min-w-0 flex-1">
            {sheet && rawCols > 0 ? (
              <div className="h-full overflow-auto rounded-xl border border-line">
                <table className={cn(TYPO.label, "w-full border-collapse")}>
                  <thead>
                    <tr className="text-left">
                      {Array.from({ length: rawCols }, (_, i) => (
                        // 原始文件没有列名这个概念，用「列 1…」占位；表头吸顶
                        // （`border-collapse` 下 sticky 会丢边框，所以用 inset 阴影当分隔线）
                        <th
                          key={i}
                          className="sticky top-0 z-10 whitespace-nowrap bg-[var(--brand-soft)] px-2.5 py-1.5 font-medium text-[var(--brand-deep)] shadow-[inset_0_-1px_0_var(--line)]"
                        >
                          {t("列 {v1}", { v1: i + 1 })}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawRows.map((row, ri) => (
                      <tr key={ri} className="border-t border-line-2">
                        {Array.from({ length: rawCols }, (_, ci) => (
                          <td key={ci} className="whitespace-nowrap px-2.5 py-1 tabular-nums text-ink-2">
                            {row[ci] === null || row[ci] === undefined ? "" : String(row[ci])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                className={cn(
                  TYPO.label,
                  "grid h-full place-items-center rounded-xl border border-dashed border-line px-4 text-center text-ink-3",
                )}
              >
                {t("选择数据文件后，这里显示文件里的原始数据")}
              </div>
            )}
          </div>

          {/* 中：来源文件 + 结构选项 + 字段映射（配置） */}
          <div className="flex min-h-0 w-[320px] shrink-0 flex-col gap-3 overflow-y-auto">
            {/* 1. 数据文件：标题 = 文件名，描述 = 行 × 列（原始文件本身的信息），
                右侧按钮负责选择 / 重新选择 */}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickFile(f);
                e.target.value = "";
              }}
            />
            <CellGroup>
              <Cell
                title={fileName || t("请选择数据文件")}
                desc={
                  sheet
                    ? // ⚠️ 这里永远是**原始文件**的行列数：数据范围 / 转置都不该改变它
                      t("{v1} 行 × {v2} 列", { v1: sheet.rows.length, v2: rawCols })
                    : undefined
                }
                control={
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                    {busy ? t("解析中…") : fileName ? t("重新导入") : t("选择文件")}
                  </Button>
                }
              />
            </CellGroup>

            {error && (
              <div className={cn(TYPO.label, "flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive")}>
                <AlertCircle className="size-3.5 shrink-0" /> {error}
              </div>
            )}

            {sheet && (
              <>
                {/* 2. 结构选项：表头行的选择框**填满剩余空间**，转置开关贴最右
                    （「保留未用到的列」已去掉：源文件整表本来就存着，数据表里只放用得上的列） */}
                <CellGroup>
                  {sheets.length > 1 && (
                    <Cell
                      title={t("工作表")}
                      controlFill
                      control={
                        <Select
                          value={String(sheetIdx)}
                          onValueChange={(v) => {
                            autoRef.current = true; // 换表 = 结构变了，重新自动认一遍
                            setSheetIdx(Number(v));
                          }}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {sheets.map((s, i) => (
                              <SelectItem key={`${s.name}-${i}`} value={String(i)}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      }
                    />
                  )}
                  {/* 先转置、再数据范围（顺序也按用户的思路来） */}
                  <Cell
                    title={t("转置")}
                    desc={t("把行和列对调")}
                    control={
                      <Switch
                        checked={transposed}
                        onCheckedChange={(v) => {
                          autoRef.current = true;
                          setTransposed(v);
                        }}
                      />
                    }
                  />
                  {/* 数据范围：直接**输入行号**（行数多的时候下拉根本没法用）。
                      留空 = 默认：起始行留空即第 1 行、结束行留空即最后一行。
                      ⚠️ 表头行不作为选项暴露 —— 起始行的**上一行**自动当列名，
                        起始行 = 第 1 行就等于「第一行也是数据、没有表头」。 */}
                  <Cell
                    title={t("数据范围")}
                    controlFill
                    control={
                      <div className="flex w-full items-center justify-end gap-1.5">
                        <Input
                          value={startText}
                          inputMode="numeric"
                          placeholder={t("第 {v1} 行", { v1: 1 })}
                          onChange={(e) => {
                            autoRef.current = true;
                            setStartText(e.target.value.replace(/[^\d]/g, ""));
                          }}
                          className="h-8 w-full min-w-0 text-center tabular-nums"
                        />
                        <span className={cn(TYPO.caption, "shrink-0 text-ink-3")}>~</span>
                        <Input
                          value={endText}
                          inputMode="numeric"
                          placeholder={t("最后一行")}
                          onChange={(e) => setEndText(e.target.value.replace(/[^\d]/g, ""))}
                          className="h-8 w-full min-w-0 text-center tabular-nums"
                        />
                      </div>
                    }
                  />
                </CellGroup>

                {/* 3. 字段匹配（由案例 schema 驱动）：不给「建议列」、不挂「自动」这类状态标签 */}
                <CellGroup boxClassName="max-h-[26vh] min-h-0 overflow-y-auto">
                  {needs.map((n) => {
                    const bad = n.required && !mapping[n.role];
                    // 定量角色选了文本列 → 图表很可能画不出来，提前提示
                    const typeWarn =
                      /quant|num|number/i.test(n.type) && !!mapping[n.role] && view.types[mapping[n.role]] === "text";
                    return (
                      // ⚠️ 这两行**故意是「控件在左、名字在右」**：
                      //   左边下拉选的是**原始数据**的第几列（数据来源），
                      //   右边这个名字是本图要写进数据表的列名（去向 = 右侧「数据预览」栏），
                      //   左右两边正好各自对着一栏，读起来就是「第 2 列 → X 轴」。
                      <Cell key={n.role}>
                        <div className="flex w-full items-center gap-3">
                          <div className="w-1/2 shrink-0">
                            <Select
                              value={mapping[n.role] ?? "__none__"}
                              onValueChange={(v) => setMapping((m) => ({ ...m, [n.role]: v === "__none__" ? "" : v }))}
                            >
                              <SelectTrigger className={cn("h-8 w-full", bad && "border-destructive/60")}>
                                <SelectValue placeholder={t("选择列")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">{t("（不使用）")}</SelectItem>
                                {/* 选项 = **原始数据的列序**（没有表头概念，不再拿文件第一行当列名） */}
                                {view.columns.map((col, i) => (
                                  <SelectItem key={col} value={col}>
                                    {t("列 {v1}", { v1: i + 1 })}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                            {bad ? (
                              <span className={cn(TYPO.caption, "shrink-0 text-destructive")}>{t("必填")}</span>
                            ) : typeWarn ? (
                              <span
                                className={cn(TYPO.caption, "shrink-0 text-[#b7791f] dark:text-[#e0b25f]")}
                                title={t("该列大多是文本，图表通常需要数值")}
                              >
                                {t("⚠ 文本")}
                              </span>
                            ) : null}
                            <span className={cn(TYPO.label, "shrink-0 font-medium text-ink")}>{n.label}</span>
                          </span>
                        </div>
                      </Cell>
                    );
                  })}
                </CellGroup>
                {missing.length > 0 && (
                  <div className={cn(TYPO.caption, "shrink-0 text-destructive")}>
                    {t("还有 {v1} 项必填字段没选：{v2}", { v1: missing.length, v2: missing.map((m) => m.label).join("、") })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 右：**即将应用的数据**（中间配置之后会被写进数据表的那份）。
              同样严格限尺寸，自己滚动 */}
          <div className="min-h-0 min-w-0 flex-1">
            {outCols.length > 0 ? (
              <div className="h-full overflow-auto rounded-xl border border-line">
                <table className={cn(TYPO.label, "w-full border-collapse")}>
                  <thead>
                    <tr className="text-left">
                      {outCols.map((c) => (
                        <th
                          key={c}
                          className="sticky top-0 z-10 whitespace-nowrap bg-[var(--brand-soft)] px-2.5 py-1.5 font-medium text-[var(--brand-deep)] shadow-[inset_0_-1px_0_var(--line)]"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {outRows.map((row, ri) => (
                      <tr key={ri} className="border-t border-line-2">
                        {outCols.map((_, ci) => (
                          <td key={ci} className="whitespace-nowrap px-2.5 py-1 tabular-nums text-ink-2">
                            {row[ci] === null || row[ci] === undefined ? "" : String(row[ci])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                className={cn(
                  TYPO.label,
                  "grid h-full place-items-center rounded-xl border border-dashed border-line px-4 text-center text-ink-3",
                )}
              >
                {t("配置好字段后，这里显示将写入数据表的数据")}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" data-sfx="none" onClick={() => onOpenChange(false)}>
            {t("取消")}
          </Button>
          <Button
            onClick={confirm}
            disabled={!result || !result.data.columns.length || !result.data.rows.length || missing.length > 0}
          >
            {t("应用")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
