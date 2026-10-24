/**
 * 声效「音色库」——干净柔和的音粒，全部由 Web Audio 程序化合成，无音频资源。
 *
 * 设计取向贴近 iOS 系统音：
 * - 只用正弦（+少量二次谐波），**不使用噪声**，因此不会有「沙沙」的摩擦感；
 * - 4ms 软起振 + 指数衰减，音粒短促、干净；
 * - 音程取纯五度 / 大三度 / 大三和弦琶音，听感温和；
 * - 音量克制，长音只加一点点混响尾巴。
 */

export type SoundName =
  | "hover"
  | "tap"
  | "toggleOn"
  | "toggleOff"
  | "navigate"
  | "open"
  | "close"
  | "success"
  | "error"
  | "notify"
  | "renderDone"
  | "export"
  | "select"
  | "edit"
  | "delete"
  | "drop";

export const SOUND_NAMES: SoundName[] = [
  "hover",
  "tap",
  "toggleOn",
  "toggleOff",
  "navigate",
  "open",
  "close",
  "success",
  "error",
  "notify",
  "renderDone",
  "export",
  "select",
  "edit",
  "delete",
  "drop",
];

export interface Bus {
  dry: AudioNode;
  wet: AudioNode;
}

export interface Voice {
  ctx: AudioContext;
  bus: Bus;
  v: number;
}

/* ---------------- 音高（等程律，取 C 大调里听感温和的几个音） ---------------- */
const P = {
  Bb3: 233.08,
  Eb4: 311.13,
  E4: 329.63,
  G4: 392.0,
  A4: 440.0,
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  A5: 880.0,
  B5: 987.77,
  C6: 1046.5,
  E6: 1318.5,
  G6: 1567.98,
  A6: 1760.0,
} as const;

/* ---------------- 基础音色 ---------------- */

/**
 * 一个柔和的音粒：正弦基音（可叠一点二次谐波），4ms 起振后指数衰减。
 * `bend` 给一点轻微滑音（<1 为下滑），`wet` 送一点混响。
 */
function tone(
  { ctx, bus, v }: Voice,
  o: { freq: number; dur: number; gain: number; when?: number; wet?: number; harm?: number; bend?: number },
): void {
  const t = ctx.currentTime + (o.when ?? 0);
  const g = ctx.createGain();
  const peak = Math.max(0.0002, o.gain * v);
  g.gain.setValueAtTime(0.00001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.00001, t + o.dur);
  g.connect(bus.dry);
  if (o.wet) {
    const w = ctx.createGain();
    w.gain.value = o.wet;
    g.connect(w);
    w.connect(bus.wet);
  }

  const partial = (ratio: number, amp: number) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(o.freq * ratio, t);
    if (o.bend) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freq * ratio * o.bend), t + o.dur * 0.85);
    }
    const pg = ctx.createGain();
    pg.gain.value = amp;
    osc.connect(pg);
    pg.connect(g);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  };

  partial(1, 1);
  if (o.harm) partial(2, o.harm);
}

/* ---------------- 事件 → 音色 ---------------- */

export const patches: Record<SoundName, (voice: Voice) => void> = {
  // 悬停：几乎听不见的一声轻响
  hover: (x) => tone(x, { freq: P.A6, dur: 0.03, gain: 0.012 }),

  // 点击：一声干脆的软音
  tap: (x) => tone(x, { freq: P.A5, dur: 0.07, gain: 0.05, harm: 0.1 }),

  // 开关：两级上行 / 下行
  toggleOn: (x) => {
    tone(x, { freq: P.C6, dur: 0.08, gain: 0.05 });
    tone(x, { freq: P.G6, dur: 0.12, gain: 0.045, when: 0.055, wet: 0.15 });
  },
  toggleOff: (x) => {
    tone(x, { freq: P.G6, dur: 0.08, gain: 0.045 });
    tone(x, { freq: P.C6, dur: 0.12, gain: 0.045, when: 0.055, wet: 0.15 });
  },

  // 页面切换：一声柔和的过场音
  navigate: (x) => tone(x, { freq: P.G5, dur: 0.22, gain: 0.042, harm: 0.08, wet: 0.3 }),

  // 展开 / 收起：上行 / 下行两音
  open: (x) => {
    tone(x, { freq: P.E5, dur: 0.1, gain: 0.045 });
    tone(x, { freq: P.B5, dur: 0.16, gain: 0.04, when: 0.06, wet: 0.25 });
  },
  close: (x) => {
    tone(x, { freq: P.B5, dur: 0.1, gain: 0.04 });
    tone(x, { freq: P.E5, dur: 0.16, gain: 0.042, when: 0.06, wet: 0.22 });
  },

  // 成功：C 大三和弦琶音
  success: (x) => {
    tone(x, { freq: P.C5, dur: 0.12, gain: 0.048 });
    tone(x, { freq: P.E5, dur: 0.12, gain: 0.046, when: 0.07 });
    tone(x, { freq: P.G5, dur: 0.24, gain: 0.05, when: 0.14, wet: 0.35 });
  },

  // 错误：柔和的下行小音程（不用噪声，不刺耳）
  error: (x) => {
    tone(x, { freq: P.Eb4, dur: 0.16, gain: 0.05, bend: 0.94, harm: 0.08 });
    tone(x, { freq: P.Bb3, dur: 0.22, gain: 0.045, when: 0.09, bend: 0.94, wet: 0.2 });
  },

  // 通知：一声干净的小铃
  notify: (x) => tone(x, { freq: P.E6, dur: 0.5, gain: 0.042, harm: 0.14, wet: 0.4 }),

  // 渲染完成：轻快上行
  renderDone: (x) => {
    tone(x, { freq: P.E5, dur: 0.12, gain: 0.042 });
    tone(x, { freq: P.A5, dur: 0.2, gain: 0.042, when: 0.08, wet: 0.3 });
  },

  // 导出：两音上行
  export: (x) => {
    tone(x, { freq: P.G5, dur: 0.12, gain: 0.046 });
    tone(x, { freq: P.C6, dur: 0.22, gain: 0.046, when: 0.07, wet: 0.3 });
  },

  // 选中 / 微交互：极短轻响
  select: (x) => tone(x, { freq: P.A6, dur: 0.035, gain: 0.022 }),
  edit: (x) => tone(x, { freq: P.E6, dur: 0.045, gain: 0.028 }),

  // 删除：下行两音
  delete: (x) => {
    tone(x, { freq: P.A4, dur: 0.12, gain: 0.045 });
    tone(x, { freq: P.E4, dur: 0.18, gain: 0.04, when: 0.06, bend: 0.95, wet: 0.18 });
  },

  // 落入 / 导入：低沉柔和的落地音
  drop: (x) => {
    tone(x, { freq: 165, dur: 0.2, gain: 0.06, bend: 0.72 });
    tone(x, { freq: P.E5, dur: 0.12, gain: 0.028, when: 0.01, wet: 0.2 });
  },
};
