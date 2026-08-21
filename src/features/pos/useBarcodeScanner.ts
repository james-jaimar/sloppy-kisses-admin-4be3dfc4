import { useEffect, useRef } from "react";

/**
 * Keyboard-wedge barcode scanner listener.
 *
 * Hardware scanners (1D and 2D in keyboard mode) type the code very fast and
 * finish with Enter. We capture those bursts anywhere on the page, even when
 * focus has drifted, and ignore normal human typing in inputs.
 */
export function useBarcodeScanner(onScan: (code: string) => void, opts?: { enabled?: boolean; minLength?: number }) {
  const enabled = opts?.enabled ?? true;
  const minLength = opts?.minLength ?? 4;
  const bufRef = useRef("");
  const lastRef = useRef(0);
  const cbRef = useRef(onScan);
  cbRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const now = Date.now();
      // A gap longer than 120ms means a new burst (or a human typing)
      if (now - lastRef.current > 120) bufRef.current = "";
      lastRef.current = now;

      if (e.key === "Enter") {
        const code = bufRef.current.trim();
        bufRef.current = "";
        if (code.length >= minLength) {
          e.preventDefault();
          cbRef.current(code);
        }
        return;
      }
      if (e.key.length === 1) bufRef.current += e.key;
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled, minLength]);
}

/** Beep on a hit, buzz on a miss — uses WebAudio so no asset is needed. */
export function playTone(kind: "hit" | "miss") {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = kind === "hit" ? "sine" : "square";
    osc.frequency.value = kind === "hit" ? 1040 : 220;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (kind === "hit" ? 0.12 : 0.3));
    osc.start();
    osc.stop(ctx.currentTime + (kind === "hit" ? 0.13 : 0.31));
    osc.onended = () => ctx.close().catch(() => undefined);
  } catch {
    /* audio is a nicety, never a blocker */
  }
}
