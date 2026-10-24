// @ts-nocheck
'use client';

/**
 * 下拉选择（动效版）：外观与原来的 shadcn Select 一致，
 * 弹层与选项高亮走与 DropdownMenu 相同的动效，
 * 保证「参数栏下拉」和「⋯ 菜单」在观感上完全一致。
 *
 * 关于「触发器上的文字」：
 * radix 原生是把选中项的文本从 Content portal 到触发器上；
 * 而 Content 关闭时它会把子节点渲染进一个游离的 DocumentFragment —— 本组件为了让
 * 弹层有进场/退场动画，关闭时**不渲染** Content，因此改由这里从 React 元素树上
 * 取「值 → 文案」映射直接渲染到 SelectValue 上：效果与 radix 一致，且首屏就正确
 * （不依赖「曾经打开过一次」）。
 */

import * as React from 'react';

import {
  Select as SelectPrimitive,
  SelectContent as SelectContentPrimitive,
  SelectGroup as SelectGroupPrimitive,
  SelectHighlight as SelectHighlightPrimitive,
  SelectHighlightItem as SelectHighlightItemPrimitive,
  SelectIcon as SelectIconPrimitive,
  SelectItem as SelectItemPrimitive,
  SelectItemIndicator as SelectItemIndicatorPrimitive,
  SelectItemText as SelectItemTextPrimitive,
  SelectLabel as SelectLabelPrimitive,
  SelectSeparator as SelectSeparatorPrimitive,
  SelectTrigger as SelectTriggerPrimitive,
  SelectValue as SelectValuePrimitive,
  SelectViewport as SelectViewportPrimitive,
  type SelectProps as SelectPrimitiveProps,
  type SelectContentProps as SelectContentPrimitiveProps,
  type SelectGroupProps as SelectGroupPrimitiveProps,
  type SelectItemProps as SelectItemPrimitiveProps,
  type SelectLabelProps as SelectLabelPrimitiveProps,
  type SelectSeparatorProps as SelectSeparatorPrimitiveProps,
  type SelectTriggerProps as SelectTriggerPrimitiveProps,
  type SelectValueProps as SelectValuePrimitiveProps,
} from '@/components/animate-ui/primitives/radix/select';
import { cn } from '@/lib/utils';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';

/* ---------------- 「值 → 文案」映射（给触发器显示用） ---------------- */

const SelectValueCtx = React.createContext<{
  value: string;
  labels: Map<string, string>;
} | null>(null);

/** 把标签里的字符串拼起来（支持 `第 {i + 1} 行：{name}` 这类混合内容） */
function flattenLabel(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenLabel).join('');
  if (React.isValidElement(node)) {
    return flattenLabel((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

/** 深度遍历 React 元素树，收集 <SelectItem value=…>文案</SelectItem> */
function collectLabels(children: React.ReactNode, out: Map<string, string>): void {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const childProps = child.props as { value?: unknown; children?: React.ReactNode };
    if (child.type === SelectItem) {
      if (childProps.value !== undefined && childProps.value !== null) {
        const key = String(childProps.value);
        if (!out.has(key)) out.set(key, flattenLabel(childProps.children));
      }
      return;
    }
    collectLabels(childProps.children, out);
  });
}

type SelectProps = SelectPrimitiveProps;

function Select({ children, value, defaultValue, onValueChange, ...props }: SelectProps) {
  const [innerValue, setInnerValue] = React.useState(() =>
    defaultValue === undefined || defaultValue === null ? '' : String(defaultValue),
  );
  const currentValue =
    value !== undefined && value !== null ? String(value) : innerValue;

  const labels = React.useMemo(() => {
    const map = new Map<string, string>();
    collectLabels(children, map);
    return map;
  }, [children]);

  const handleValueChange = React.useCallback(
    (next: string) => {
      setInnerValue(next);
      onValueChange?.(next);
    },
    [onValueChange],
  );

  return (
    <SelectValueCtx.Provider value={{ value: currentValue, labels }}>
      <SelectPrimitive
        value={value}
        defaultValue={defaultValue}
        onValueChange={handleValueChange}
        {...props}
      >
        {children}
      </SelectPrimitive>
    </SelectValueCtx.Provider>
  );
}

type SelectValueProps = SelectValuePrimitiveProps;

function SelectValue({ children, ...props }: SelectValueProps) {
  const ctx = React.useContext(SelectValueCtx);
  // 显式传了 children 就用它；否则用从元素树收集到的「值 → 文案」
  if (children !== undefined) {
    return <SelectValuePrimitive {...props}>{children}</SelectValuePrimitive>;
  }
  const label = ctx ? ctx.labels.get(ctx.value) : undefined;
  if (label !== undefined) {
    return <SelectValuePrimitive {...props}>{label}</SelectValuePrimitive>;
  }
  return <SelectValuePrimitive {...props} />;
}

type SelectTriggerProps = SelectTriggerPrimitiveProps;

function SelectTrigger({ className, children, ...props }: SelectTriggerProps) {
  return (
    <SelectTriggerPrimitive
      className={cn(
        'group/select flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-2.5 py-1 text-[13px] outline-none transition-colors',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50',
        'data-[placeholder]:text-muted-foreground/70 [&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <SelectIconPrimitive asChild>
        {/* 展开时箭头翻转（与手风琴、子菜单的箭头同一套观感） */}
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-50 transition-transform duration-200 group-data-[state=open]/select:rotate-180" />
      </SelectIconPrimitive>
    </SelectTriggerPrimitive>
  );
}

type SelectGroupProps = SelectGroupPrimitiveProps;

function SelectGroup({ className, ...props }: SelectGroupProps) {
  return <SelectGroupPrimitive className={cn('p-1', className)} {...props} />;
}

type SelectContentProps = SelectContentPrimitiveProps;

function SelectContent({
  className,
  children,
  sideOffset = 4,
  position = 'popper',
  ...props
}: SelectContentProps) {
  return (
    <SelectContentPrimitive
      position={position}
      sideOffset={sideOffset}
      className={cn(
        'bg-popover text-popover-foreground z-50 max-h-[min(18rem,var(--radix-select-content-available-height))] min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-hidden rounded-md border shadow-md outline-none',
        className,
      )}
      {...props}
    >
      <SelectViewportPrimitive
        className={cn(
          'p-1',
          position === 'popper' && 'w-full min-w-[var(--radix-select-trigger-width)]',
        )}
      >
        <SelectHighlightPrimitive className="bg-brand-soft absolute inset-0 z-0 rounded-sm">
          {children}
        </SelectHighlightPrimitive>
      </SelectViewportPrimitive>
    </SelectContentPrimitive>
  );
}

type SelectItemProps = SelectItemPrimitiveProps;

function SelectItem({ className, children, value, ...props }: SelectItemProps) {
  return (
    <SelectHighlightItemPrimitive value={value ? String(value) : undefined}>
      <SelectItemPrimitive
        value={value}
        className={cn(
          'focus:text-accent-foreground relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pr-2 pl-7 text-[13px] outline-hidden',
          // 注意必须写 data-[disabled=true]：HighlightItem 会给「可用项」也写上 data-disabled="false"，
          // 只判断属性存在的话，所有选项都会变成 pointer-events-none + 半透明（点不动、发灰）。
          'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
          className,
        )}
        {...props}
      >
        <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
          <SelectItemIndicatorPrimitive
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <CheckIcon className="size-3.5" />
          </SelectItemIndicatorPrimitive>
        </span>
        <SelectItemTextPrimitive>{children}</SelectItemTextPrimitive>
      </SelectItemPrimitive>
    </SelectHighlightItemPrimitive>
  );
}

type SelectLabelProps = SelectLabelPrimitiveProps;

function SelectLabel({ className, ...props }: SelectLabelProps) {
  return (
    <SelectLabelPrimitive
      className={cn('px-2 py-1.5 text-[11px] text-muted-foreground', className)}
      {...props}
    />
  );
}

type SelectSeparatorProps = SelectSeparatorPrimitiveProps;

function SelectSeparator({ className, ...props }: SelectSeparatorProps) {
  return (
    <SelectSeparatorPrimitive
      className={cn('bg-border pointer-events-none -mx-1 my-1 h-px', className)}
      {...props}
    />
  );
}

export {
  Select,
  SelectValue,
  SelectTrigger,
  SelectGroup,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  type SelectProps,
  type SelectValueProps,
  type SelectTriggerProps,
  type SelectGroupProps,
  type SelectContentProps,
  type SelectItemProps,
  type SelectLabelProps,
  type SelectSeparatorProps,
};
