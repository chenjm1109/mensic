import { Fragment, useMemo, type ReactNode } from "react";
import { TYPO } from "@/core/typography";
import { cn } from "@/lib/utils";

// 轻量 Python 语法高亮（无第三方依赖），配色贴合应用的中性风格。

const KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class",
  "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global",
  "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return",
  "try", "while", "with", "yield",
]);

const BUILTINS = new Set([
  "print", "len", "range", "str", "int", "float", "list", "dict", "set", "tuple", "zip",
  "enumerate", "map", "filter", "sum", "min", "max", "abs", "round", "sorted", "reversed",
  "any", "all", "isinstance", "type", "hasattr", "getattr", "setattr", "open", "super",
  "Exception", "ValueError", "TypeError", "NotImplementedError", "dict", "bool",
]);

const TOKEN =
  /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?''')|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(@[A-Za-z_]\w*)|(\b\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?\b)|(\b[A-Za-z_]\w*\b)/g;

const CLASS = {
  comment: "italic text-muted-foreground",
  string: "text-emerald-700",
  decorator: "text-amber-700",
  number: "text-orange-700",
  keyword: "font-medium text-violet-700",
  builtin: "text-sky-700",
  func: "text-blue-700",
};

function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of code.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(code.slice(last, idx));
    const [full, comment, tstring, string, decorator, number, word] = m;
    let cls = "";
    if (comment) cls = CLASS.comment;
    else if (tstring || string) cls = CLASS.string;
    else if (decorator) cls = CLASS.decorator;
    else if (number) cls = CLASS.number;
    else if (word) {
      if (KEYWORDS.has(word)) cls = CLASS.keyword;
      else if (BUILTINS.has(word)) cls = CLASS.builtin;
      else if (/^\s*\(/.test(code.slice(idx + word.length))) cls = CLASS.func;
    }
    out.push(
      cls ? (
        <span key={key++} className={cls}>
          {full}
        </span>
      ) : (
        <Fragment key={key++}>{full}</Fragment>
      ),
    );
    last = idx + full.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

/**
 * 超过这个长度就**不做**逐 token 高亮：几千个 `<span>` 的挂载 + 排版会让弹窗明显顿一下，
 * 而纯文本的可读性已经够用（复制/导出用的始终是原始字符串）。
 */
const MAX_HIGHLIGHT_CHARS = 40_000;

export function CodeBlock({ code }: { code: string }) {
  const nodes = useMemo(
    () => (code.length > MAX_HIGHLIGHT_CHARS ? code : highlight(code)),
    [code],
  );
  return (
    <pre className={cn(TYPO.label, "leading-relaxed text-foreground")}>
      <code className="whitespace-pre font-mono">{nodes}</code>
    </pre>
  );
}
