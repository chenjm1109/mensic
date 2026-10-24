// @ts-nocheck
'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { AnimatePresence, motion, type HTMLMotionProps } from 'motion/react';

import { useControlledState } from '@/hooks/use-controlled-state';
import { getStrictContext } from '@/lib/get-strict-context';

type DialogContextType = {
  isOpen: boolean;
  setIsOpen: DialogProps['onOpenChange'];
};

const [DialogProvider, useDialog] =
  getStrictContext<DialogContextType>('DialogContext');

type DialogProps = React.ComponentProps<typeof DialogPrimitive.Root>;

function Dialog(props: DialogProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props?.open,
    defaultValue: props?.defaultOpen,
    onChange: props?.onOpenChange,
  });

  return (
    <DialogProvider value={{ isOpen, setIsOpen }}>
      <DialogPrimitive.Root
        data-slot="dialog"
        {...props}
        onOpenChange={setIsOpen}
      />
    </DialogProvider>
  );
}

type DialogTriggerProps = React.ComponentProps<typeof DialogPrimitive.Trigger>;

function DialogTrigger(props: DialogTriggerProps) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

type DialogPortalProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Portal>,
  'forceMount'
>;

function DialogPortal(props: DialogPortalProps) {
  const { isOpen } = useDialog();

  return (
    <AnimatePresence>
      {isOpen && (
        <DialogPrimitive.Portal
          data-slot="dialog-portal"
          forceMount
          {...props}
        />
      )}
    </AnimatePresence>
  );
}

type DialogOverlayProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Overlay>,
  'forceMount' | 'asChild'
> &
  HTMLMotionProps<'div'>;

function DialogOverlay({
  transition = { duration: 0.2, ease: 'easeInOut' },
  ...props
}: DialogOverlayProps) {
  return (
    <DialogPrimitive.Overlay data-slot="dialog-overlay" asChild forceMount>
      {/*
        ⚠️ 这里**不能**再动画 `filter: blur()`：遮罩是一层纯色（bg-black/15），模糊一层均匀
        半透明矩形在视觉上等于没模糊，但浏览器每帧都要把**整个视口**（高分屏上是上千万像素）
        重新光栅化 + 高斯模糊一遍 —— 这是「弹窗一弹出就卡」的主因（安卓 WebView 更明显）。
        只留 opacity，视觉一致，动画完全走合成器。
      */}
      <motion.div
        key="dialog-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transition}
        {...props}
      />
    </DialogPrimitive.Overlay>
  );
}

type DialogFlipDirection = 'top' | 'bottom' | 'left' | 'right';

type DialogContentProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Content>,
  'forceMount' | 'asChild'
> &
  HTMLMotionProps<'div'> & {
    from?: DialogFlipDirection;
  };

function DialogContent({
  from = 'top',
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  transition = { type: 'spring', stiffness: 150, damping: 25 },
  ...props
}: DialogContentProps) {
  const initialRotation =
    from === 'bottom' || from === 'left' ? '20deg' : '-20deg';
  const isVertical = from === 'top' || from === 'bottom';
  const rotateAxis = isVertical ? 'rotateX' : 'rotateY';

  return (
    <DialogPrimitive.Content
      asChild
      forceMount
      onOpenAutoFocus={onOpenAutoFocus}
      onCloseAutoFocus={onCloseAutoFocus}
      onEscapeKeyDown={onEscapeKeyDown}
      onPointerDownOutside={onPointerDownOutside}
      onInteractOutside={onInteractOutside}
    >
      {/*
        ⚠️ 同理**不要**在内容层动画 `filter: blur()`：内容里常常是大图 / 大段代码，
        带 filter 的合成层每帧都要整块重新光栅化（面积越大越慢：导出弹窗 880–900px，
        是普通弹窗的 4–6 倍）。保留 3D 翻转 + 缩放 + spring，只去掉模糊那一层光栅化。
      */}
      <motion.div
        key="dialog-content"
        data-slot="dialog-content"
        initial={{
          opacity: 0,
          transform: `perspective(500px) ${rotateAxis}(${initialRotation}) scale(0.8)`,
        }}
        animate={{
          opacity: 1,
          transform: `perspective(500px) ${rotateAxis}(0deg) scale(1)`,
        }}
        exit={{
          opacity: 0,
          transform: `perspective(500px) ${rotateAxis}(${initialRotation}) scale(0.8)`,
        }}
        transition={transition}
        {...props}
      />
    </DialogPrimitive.Content>
  );
}

type DialogCloseProps = React.ComponentProps<typeof DialogPrimitive.Close>;

function DialogClose(props: DialogCloseProps) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

type DialogHeaderProps = React.ComponentProps<'div'>;

function DialogHeader(props: DialogHeaderProps) {
  return <div data-slot="dialog-header" {...props} />;
}

type DialogFooterProps = React.ComponentProps<'div'>;

function DialogFooter(props: DialogFooterProps) {
  return <div data-slot="dialog-footer" {...props} />;
}

type DialogTitleProps = React.ComponentProps<typeof DialogPrimitive.Title>;

function DialogTitle(props: DialogTitleProps) {
  return <DialogPrimitive.Title data-slot="dialog-title" {...props} />;
}

type DialogDescriptionProps = React.ComponentProps<
  typeof DialogPrimitive.Description
>;

function DialogDescription(props: DialogDescriptionProps) {
  return (
    <DialogPrimitive.Description data-slot="dialog-description" {...props} />
  );
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  useDialog,
  type DialogProps,
  type DialogTriggerProps,
  type DialogPortalProps,
  type DialogCloseProps,
  type DialogOverlayProps,
  type DialogContentProps,
  type DialogHeaderProps,
  type DialogFooterProps,
  type DialogTitleProps,
  type DialogDescriptionProps,
  type DialogContextType,
  type DialogFlipDirection,
};
