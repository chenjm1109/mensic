// @ts-nocheck
'use client';

/**
 * Select 的动效基元（与 primitives/radix/dropdown-menu.tsx 同一套做法）：
 * 弹层 = AnimatePresence + opacity/scale 0.95→1，duration 0.2；
 * 选项高亮 = highlight 基元（layoutId 共享布局 → 切换时滑动，而非硬切）。
 * 这样「编辑器参数栏的下拉」与「项目页的 ⋯ 菜单」动效完全一致。
 */

import * as React from 'react';
import { Select as SelectPrimitive } from 'radix-ui';
import { AnimatePresence, motion, type HTMLMotionProps } from 'motion/react';

import {
  Highlight,
  HighlightItem,
  type HighlightItemProps,
  type HighlightProps,
} from '@/components/animate-ui/primitives/effects/highlight';
import { getStrictContext } from '@/lib/get-strict-context';
import { useControlledState } from '@/hooks/use-controlled-state';

type SelectContextType = {
  isOpen: boolean;
  setIsOpen: (o: boolean) => void;
  highlightedValue: string | null;
  setHighlightedValue: (value: string | null) => void;
};

const [SelectProvider, useSelect] =
  getStrictContext<SelectContextType>('SelectContext');

type SelectProps = React.ComponentProps<typeof SelectPrimitive.Root>;

function Select(props: SelectProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props?.open,
    defaultValue: props?.defaultOpen,
    onChange: props?.onOpenChange,
  });
  const [highlightedValue, setHighlightedValue] = React.useState<string | null>(
    null,
  );

  // 展开时先把「当前选中项」标为高亮（radix 打开后会把焦点移到这一项）。
  // 初次挂载那次 focus 发生在 React 事件委托就绪之前，光靠 onFocus 接不到。
  const initialValue = props.value ?? props.defaultValue;
  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      setIsOpen(open);
      setHighlightedValue(
        open && initialValue != null ? String(initialValue) : null,
      );
    },
    [setIsOpen, initialValue],
  );

  return (
    <SelectProvider
      value={{ isOpen, setIsOpen, highlightedValue, setHighlightedValue }}
    >
      <SelectPrimitive.Root
        data-slot="select"
        {...props}
        onOpenChange={handleOpenChange}
      />
    </SelectProvider>
  );
}

type SelectValueProps = React.ComponentProps<typeof SelectPrimitive.Value>;

function SelectValue(props: SelectValueProps) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

type SelectTriggerProps = React.ComponentProps<typeof SelectPrimitive.Trigger>;

function SelectTrigger(props: SelectTriggerProps) {
  return <SelectPrimitive.Trigger data-slot="select-trigger" {...props} />;
}

type SelectIconProps = React.ComponentProps<typeof SelectPrimitive.Icon>;

function SelectIcon(props: SelectIconProps) {
  return <SelectPrimitive.Icon data-slot="select-icon" {...props} />;
}

type SelectPortalProps = React.ComponentProps<typeof SelectPrimitive.Portal>;

function SelectPortal(props: SelectPortalProps) {
  return <SelectPrimitive.Portal data-slot="select-portal" {...props} />;
}

type SelectGroupProps = React.ComponentProps<typeof SelectPrimitive.Group>;

function SelectGroup(props: SelectGroupProps) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

type SelectHighlightProps = Omit<
  HighlightProps,
  'controlledItems' | 'enabled' | 'hover'
>;

function SelectHighlight({
  transition = { type: 'spring', stiffness: 350, damping: 35 },
  ...props
}: SelectHighlightProps) {
  const { highlightedValue } = useSelect();

  return (
    <Highlight
      data-slot="select-highlight"
      click={false}
      controlledItems
      transition={transition}
      value={highlightedValue}
      {...props}
    />
  );
}

type SelectContentProps = Omit<
  React.ComponentProps<typeof SelectPrimitive.Content>,
  'forceMount' | 'asChild'
> &
  Omit<React.ComponentProps<typeof SelectPrimitive.Portal>, 'forceMount'> &
  HTMLMotionProps<'div'>;

function SelectContent({
  position = 'popper',
  sideOffset,
  align,
  alignOffset,
  avoidCollisions,
  collisionBoundary,
  collisionPadding,
  arrowPadding,
  sticky,
  hideWhenDetached,
  onCloseAutoFocus,
  onPointerDownOutside,
  onEscapeKeyDown,
  transition = { duration: 0.2 },
  style,
  container,
  ...props
}: SelectContentProps) {
  const { isOpen, setHighlightedValue } = useSelect();
  const detachRef = React.useRef<(() => void) | null>(null);

  /**
   * 用 ref 回调（而不是 useEffect）挂原生 focusin 监听 ——
   * radix 在内容挂载的同一提交里就会 focus 到当前项，比任何 effect 都早。
   * 键盘上下键切换焦点时也靠它把高亮跟过去。
   */
  const contentRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      detachRef.current?.();
      detachRef.current = null;
      if (!node) return;
      const onFocusIn = (event: FocusEvent) => {
        const target = event.target as HTMLElement | null;
        const option = target?.closest?.('[role="option"]') as HTMLElement | null;
        const value = option?.dataset?.value;
        if (value) setHighlightedValue(value);
      };
      node.addEventListener('focusin', onFocusIn);
      detachRef.current = () => node.removeEventListener('focusin', onFocusIn);
    },
    [setHighlightedValue],
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <SelectPrimitive.Portal forceMount container={container}>
          <SelectPrimitive.Content
            asChild
            position={position}
            sideOffset={sideOffset}
            align={align}
            alignOffset={alignOffset}
            avoidCollisions={avoidCollisions}
            collisionBoundary={collisionBoundary}
            collisionPadding={collisionPadding}
            arrowPadding={arrowPadding}
            sticky={sticky}
            hideWhenDetached={hideWhenDetached}
            onCloseAutoFocus={onCloseAutoFocus}
            onPointerDownOutside={onPointerDownOutside}
            onEscapeKeyDown={onEscapeKeyDown}
          >
            <motion.div
              key="select-content"
              ref={contentRef}
              data-slot="select-content"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={transition}
              style={{ willChange: 'opacity, transform', ...style }}
              {...props}
            />
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      )}
    </AnimatePresence>
  );
}

type SelectViewportProps = React.ComponentProps<
  typeof SelectPrimitive.Viewport
>;

function SelectViewport(props: SelectViewportProps) {
  return <SelectPrimitive.Viewport data-slot="select-viewport" {...props} />;
}

type SelectItemProps = Omit<
  React.ComponentProps<typeof SelectPrimitive.Item>,
  'asChild'
> &
  HTMLMotionProps<'div'>;

function SelectItem({
  value,
  disabled,
  textValue,
  onFocus,
  ...props
}: SelectItemProps) {
  const { setHighlightedValue } = useSelect();

  // ⚠️ 高亮**只**由 focus 驱动，不要再接 onPointerMove：
  //    radix 的 SelectItem 在自己的 onPointerMove 里就会把焦点移到指针所在项，
  //    于是 FocusIn 已经把高亮跟过去了；我们再加一层 pointermove，
  //    等于**每次鼠标移动**（60+/s）都 setState 一次 → 整个下拉（几百项字体时尤其明显）每帧重渲染 + 跑一次高亮动画，卡到不能用。
  const highlight = React.useCallback(() => {
    if (value) setHighlightedValue(String(value));
  }, [setHighlightedValue, value]);

  return (
    <SelectPrimitive.Item
      value={value}
      disabled={disabled}
      textValue={textValue}
      asChild
    >
      <motion.div
        data-slot="select-item"
        data-disabled={disabled}
        onFocus={(e) => {
          highlight();
          onFocus?.(e);
        }}
        {...props}
      />
    </SelectPrimitive.Item>
  );
}

type SelectHighlightItemProps = HighlightItemProps;

function SelectHighlightItem(props: SelectHighlightItemProps) {
  return <HighlightItem data-slot="select-highlight-item" {...props} />;
}

type SelectItemTextProps = React.ComponentProps<
  typeof SelectPrimitive.ItemText
>;

function SelectItemText(props: SelectItemTextProps) {
  return <SelectPrimitive.ItemText data-slot="select-item-text" {...props} />;
}

type SelectItemIndicatorProps = Omit<
  React.ComponentProps<typeof SelectPrimitive.ItemIndicator>,
  'asChild'
> &
  HTMLMotionProps<'div'>;

function SelectItemIndicator(props: SelectItemIndicatorProps) {
  return (
    <SelectPrimitive.ItemIndicator
      data-slot="select-item-indicator"
      asChild
    >
      <motion.div {...props} />
    </SelectPrimitive.ItemIndicator>
  );
}

type SelectLabelProps = React.ComponentProps<typeof SelectPrimitive.Label>;

function SelectLabel(props: SelectLabelProps) {
  return <SelectPrimitive.Label data-slot="select-label" {...props} />;
}

type SelectSeparatorProps = React.ComponentProps<
  typeof SelectPrimitive.Separator
>;

function SelectSeparator(props: SelectSeparatorProps) {
  return <SelectPrimitive.Separator data-slot="select-separator" {...props} />;
}

export {
  Select,
  SelectValue,
  SelectTrigger,
  SelectIcon,
  SelectPortal,
  SelectGroup,
  SelectHighlight,
  SelectHighlightItem,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
  SelectLabel,
  SelectSeparator,
  useSelect,
  type SelectProps,
  type SelectValueProps,
  type SelectTriggerProps,
  type SelectIconProps,
  type SelectPortalProps,
  type SelectGroupProps,
  type SelectHighlightProps,
  type SelectHighlightItemProps,
  type SelectContentProps,
  type SelectViewportProps,
  type SelectItemProps,
  type SelectItemTextProps,
  type SelectItemIndicatorProps,
  type SelectLabelProps,
  type SelectSeparatorProps,
  type SelectContextType,
};
