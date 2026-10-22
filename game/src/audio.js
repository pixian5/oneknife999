import { TEST_MODE } from "./config.js";

// 《一刀999》WebAudio 合成音效引擎：零素材文件，全部用振荡器/噪声合成。
// 静音状态持久化在 localStorage；E2E 模式完全静默，避免无头环境与确定性干扰。

const MUTE_KEY = "oneknife999-muted";
let audioContext = null;
let muted = typeof localStorage !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  if (typeof localStorage !== "undefined") localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  return muted;
}

// 浏览器自动播放策略：首次用户手势后解锁 AudioContext。
export function unlockAudio() {
  if (TEST_MODE || muted || typeof AudioContext === "undefined") return;
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === "suspended") audioContext.resume();
}

function tone({ frequency, endFrequency, duration = 0.12, type = "sine", gain = 0.12, delay = 0 }) {
  if (TEST_MODE || muted || typeof AudioContext === "undefined") return;
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === "suspended") return;
  const start = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const amplifier = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), start + duration);
  amplifier.gain.setValueAtTime(gain, start);
  amplifier.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(amplifier).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

// 事件音效表：短促、可区分；音量统一压在 0.16 以下避免刺耳。
export const sfx = {
  hit() {
    tone({ frequency: 220, endFrequency: 140, duration: 0.07, type: "square", gain: 0.05 });
  },
  kill() {
    tone({ frequency: 330, endFrequency: 90, duration: 0.16, type: "sawtooth", gain: 0.07 });
  },
  bossKill() {
    tone({ frequency: 160, endFrequency: 55, duration: 0.4, type: "sawtooth", gain: 0.1 });
    tone({ frequency: 520, endFrequency: 130, duration: 0.5, type: "triangle", gain: 0.08, delay: 0.08 });
  },
  pickup() {
    tone({ frequency: 620, endFrequency: 880, duration: 0.08, type: "triangle", gain: 0.07 });
  },
  potion() {
    tone({ frequency: 440, endFrequency: 660, duration: 0.14, type: "sine", gain: 0.08 });
  },
  levelup() {
    [392, 494, 587, 784].forEach((frequency, index) =>
      tone({ frequency, duration: 0.12, type: "triangle", gain: 0.08, delay: index * 0.09 })
    );
  },
  phase() {
    tone({ frequency: 130, endFrequency: 200, duration: 0.28, type: "square", gain: 0.09 });
  },
  death() {
    tone({ frequency: 300, endFrequency: 60, duration: 0.5, type: "sawtooth", gain: 0.09 });
  },
  travel() {
    tone({ frequency: 260, endFrequency: 520, duration: 0.2, type: "sine", gain: 0.08 });
  },
  enhanceSuccess() {
    tone({ frequency: 700, endFrequency: 1100, duration: 0.16, type: "triangle", gain: 0.09 });
  },
  enhanceFail() {
    tone({ frequency: 240, endFrequency: 110, duration: 0.22, type: "square", gain: 0.08 });
  },
  skillUp() {
    tone({ frequency: 520, endFrequency: 780, duration: 0.14, type: "sine", gain: 0.08 });
  },
  redName() {
    tone({ frequency: 90, endFrequency: 60, duration: 0.6, type: "sawtooth", gain: 0.1 });
  }
};
