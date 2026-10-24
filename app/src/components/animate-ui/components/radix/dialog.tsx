// @ts-nocheck
import * as React from 'react';
import { XIcon } from 'lucide-react';

import {
  Dialog as DialogPrimitive,
  DialogContent as DialogContentPrimitive,
  DialogDescription as DialogDescriptionPrimitive,
  DialogFooter as DialogFooterPrimitive,
  DialogHeader as DialogHeaderPrimitive,
  DialogTitle as DialogTitlePrimitive,
  DialogTrigger as DialogTriggerPrimitive,
  DialogPortal as DialogPortalPrimitive,
  DialogOverlay as DialogOverlayPrimitive,
  DialogClose as DialogClosePrimitive,
  type DialogProps as DialogPrimitiveProps,
  type DialogContentProps as DialogContentPrimitiveProps,
  type DialogDescriptionProps as DialogDescriptionPrimitiveProps,
  type DialogFooterProps as DialogFooterPrimitiveProps,
  type DialogHeaderProps as DialogHeaderPrimitiveProps,
  type DialogTitleProps as DialogTitlePrimitiveProps,
  type DialogTriggerProps as DialogTriggerPrimitiveProps,
  type DialogOverlayProps as DialogOverlayPrimitiveProps,
  type DialogCloseProps as DialogClosePrimitiveProps,
} from '@/components/animate-ui/primitives/radix/dialog';
import { cn } from '@/lib/utils';
import { TYPO } from '@/core/typography';

type DialogProps = DialogPrimitiveProps;

function Dialog(props: DialogProps) {
  return <DialogPrimitive {...props} />;
}

type DialogTriggerProps = DialogTriggerPrimitiveProps;

function DialogTrigger(props: DialogTriggerProps) {
  return <DialogTriggerPrimitive {...props} />;
}

type DialogCloseProps = DialogClosePrimitiveProps;

function DialogClose(props: DialogCloseProps) {
  return <DialogClosePrimitive {...props} />;
}

type DialogOverlayProps = DialogOverlayPrimitiveProps;

function DialogOverlay({ className, ...props }: DialogOverlayProps) {
  return (
    // ⚠️ 掩膜**不覆盖自定义标题栏**（`--titlebar-h` 由 Titlebar 挂到 <html> 上，网页端为 0）：
    // 盖住标题栏会让「关闭 / 最大化 / 拖动窗口」在弹窗打开期间全部失效 —— 窗口级的操作不该被
    // 页面内的弹层压住。掩膜只盖内容区，标题栏保持原样。
    <DialogOverlayPrimitive
      className={cn('fixed inset-x-0 bottom-0 top-[var(--titlebar-h,0px)] z-50 bg-black/15', className)}
      {...props}
    />
  );
}

type DialogContentProps = DialogContentPrimitiveProps & {
  showCloseButton?: boolean;
};

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogContentProps) {
  return (
    <DialogPortalPrimitive>
      <DialogOverlay />
      <DialogContentPrimitive
        className={cn(
          'bg-surface fixed top-[50%] left-[50%] z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-[14px] border border-black/[0.08] p-6 shadow-[0_20px_50px_-30px_rgba(60,50,35,0.5)] sm:max-w-lg',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogClosePrimitive className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogClosePrimitive>
        )}
      </DialogContentPrimitive>
    </DialogPortalPrimitive>
  );
}

type DialogHeaderProps = DialogHeaderPrimitiveProps;

/**
 * 弹层标题区：整站统一**居中**（标题 + 说明文字）。
 * 历史上各弹层沿用 shadcn 默认的「桌面端左对齐」，观感不统一，这里改为居中；
 * 正文区（表单/表格/预览）不受影响，仍按各自需要排布。
 */
function DialogHeader({ className, ...props }: DialogHeaderProps) {
  return (
    <DialogHeaderPrimitive
      className={cn('flex flex-col items-center gap-2 text-center', className)}
      {...props}
    />
  );
}

type DialogFooterProps = DialogFooterPrimitiveProps;

/**
 * 弹层底部按钮区：整站统一**居中**，且多个按钮**等宽**（文本各自居中）。
 *
 * 等宽的实现：桌面端用 `w-fit + auto-cols-fr` 的网格 —— 所有列取最长按钮的宽度；
 * 窄屏竖排时用 `items-stretch` 让每个按钮占满一行，宽度同样一致。
 * （写死 min-width 会被更长的文案撑破，这样才稳。）
 */
function DialogFooter({ className, ...props }: DialogFooterProps) {
  return (
    <DialogFooterPrimitive
      className={cn(
        'flex flex-col-reverse items-stretch gap-2',
        'sm:mx-auto sm:grid sm:w-fit sm:auto-cols-fr sm:grid-flow-col sm:items-center',
        className,
      )}
      {...props}
    />
  );
}

type DialogTitleProps = DialogTitlePrimitiveProps;

function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    // 标题/说明的字号统一走 TYPO（见 core/typography.ts）：全应用对话框同一级
    <DialogTitlePrimitive
      className={cn('text-center leading-none font-semibold', TYPO.subtitle, className)}
      {...props}
    />
  );
}

type DialogDescriptionProps = DialogDescriptionPrimitiveProps;

function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  return (
    <DialogDescriptionPrimitive
      className={cn('text-center text-muted-foreground', TYPO.body, className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  type DialogProps,
  type DialogTriggerProps,
  type DialogCloseProps,
  type DialogContentProps,
  type DialogHeaderProps,
  type DialogFooterProps,
  type DialogTitleProps,
  type DialogDescriptionProps,
};
