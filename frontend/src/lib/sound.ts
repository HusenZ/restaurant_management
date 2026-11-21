"use client";

let ctx: AudioContext | null = null;

/** Short synthesized chime (no audio files). kind: new order / attention / success */
export function chime(kind: "order" | "attention" | "success" = "order") {
  try {
    if (localStorage.getItem("dineos:muted") === "1") return;
    ctx ??= new AudioContext();
    const notes = kind === "attention" ? [880, 660, 880] : kind === "success" ? [523, 659, 784] : [659, 880];
    notes.forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx!.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch {
    /* audio blocked until user gesture */
  }
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem("dineos:muted") === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem("dineos:muted", muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}
