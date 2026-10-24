/**
 * 声效引擎：懒加载音频图 + 总线 + 调度。
 *
 * 图结构：
 *   voice ──▶ dry ─┐
 *   voice ──▶ wet_send ─▶ convolver ─▶ lowpass ─▶ wet ─┐
 *                                                     ├─▶ compressor ─▶ master ─▶ destination
 *
 * - master 增益同时承担「静音 / 音量」。
 * - 混响使用程序化生成的噪声脉冲响应（IR），无需任何音频资源。
 */

import { patches, type Bus, type SoundName } from "./patches";

interface Config {
  enabled: boolean;
  volume: number; // 0..1
}

let ctx: AudioContext | null = null;
let bus: Bus | null = null;
let master: GainNode | null = null;
let cfg: Config = { enabled: true, volume: 0.6 };

/** 生成一段指数衰减的噪声作为混响脉冲响应 */
function impulseRespons(ctx: AudioContext, duration = 1.5, decay = 2.8): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * duration);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

/** 创建（或复用）音频上下文；不播放任何声音，也**不建音频图**（混响 IR 很贵，见 buildBus） */
export function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/**
 * 建总线（含程序化混响 IR）。
 *
 * ⚠️ 只在**第一次真的要发声**时调用：IR 是 1.5s 立体声噪声（十几万次 random + pow），
 * 放在启动/挂载时会在主线程上卡一下。设了静音的用户则永远不付这份成本。
 */
function buildBus(c: AudioContext): Bus {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 22;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;

  master = c.createGain();
  master.gain.value = cfg.enabled ? cfg.volume : 0;

  const dry = c.createGain();
  dry.gain.value = 0.92;

  const conv = c.createConvolver();
  conv.buffer = impulseRespons(c);
  const wetLp = c.createBiquadFilter();
  wetLp.type = "lowpass";
  wetLp.frequency.value = 6200;
  const wet = c.createGain();
  wet.gain.value = 0.38;

  dry.connect(comp);
  conv.connect(wetLp);
  wetLp.connect(wet);
  wet.connect(comp);
  comp.connect(master);
  master.connect(c.destination);

  bus = { dry, wet: conv };
  return bus;
}

/** 首次用户手势时调用：恢复被浏览器挂起的音频上下文 */
export function unlock(): void {
  const c = ensureCtx();
  if (c && c.state === "suspended") void c.resume();
}

/** 同步开关与音量（来自设置） */
export function setSoundConfig(next: Partial<Config>): void {
  cfg = { ...cfg, ...next };
  if (master && ctx) {
    const target = cfg.enabled ? cfg.volume : 0;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(target, ctx.currentTime, 0.02);
  }
}

export function getSoundConfig(): Config {
  return { ...cfg };
}

export function isSoundReady(): boolean {
  return ctx !== null;
}

/** 播放一个命名音效 */
export function sfx(name: SoundName, velocity = 1): void {
  if (!cfg.enabled) return;
  const c = ensureCtx();
  if (!c) return;
  const b = bus ?? buildBus(c);
  if (c.state === "suspended") void c.resume();
  const patch = patches[name];
  if (!patch) return;
  try {
    patch({ ctx: c, bus: b, v: Math.max(0, Math.min(1, velocity)) });
  } catch {
    /* 音频异常不应影响交互 */
  }
}
