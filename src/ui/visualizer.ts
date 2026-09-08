// ============================================================
// visualizer.ts — Audio Spectrum / Volume Visualizer (VU Level Meter)
//
// Modul Web Audio API untuk komponen Player:
//  - Elemen <audio> utama dihubungkan ke `AnalyserNode`
//    (MediaElementSource → Analyser → destination) sehingga data
//    frekuensi/amplitudo terbaca real-time tanpa mematikan suara.
//  - Amplitudo digambar sebagai batang balok vertikal tegas (square) + peak cap
//    bergravitasi, dengan penyebaran frekuensi simetris dari TENGAH ke kanan-kiri.
//  - Loop render HANYA berjalan saat audio diputar. Saat pause, stop,
//    atau berpindah track, loop dihentikan dengan cancelAnimationFrame()
//    agar tidak membuang baterai & memori di perangkat mobile.
//  - Buffer canvas mengikuti devicePixelRatio (dibatasi maks ×2) dan
//    jumlah batang menyesuaikan lebar layar (responsif desktop & mobile).
// ============================================================

/** Opsi konfigurasi AudioVisualizer. */
export interface AudioVisualizerOptions {
  /** Batas jumlah batang pada layar lebar (default: 48). */
  maxBars?: number;
  /** Batas devicePixelRatio agar tetap hemat GPU di layar padat (default: 2). */
  maxPixelRatio?: number;
}

/** Triplet warna RGB agar bisa dicampur (lerp) secara dinamis per frame. */
type Rgb = readonly [number, number, number];

interface GradientStop {
  offset: number;
  color: Rgb;
  alpha: number;
}

/**
 * Palet gradasi batang — serasi dengan tema Tailwind aplikasi: aksen
 * emerald/teal yang melebur ke cyan di puncak batang.
 */
const GRADIENT_STOPS: GradientStop[] = [
  { offset: 0, color: [16, 185, 129], alpha: 0.78 }, // emerald-500 (#10b981)
  { offset: 0.45, color: [20, 184, 166], alpha: 0.86 }, // teal-500 (#14b8a6)
  { offset: 0.78, color: [45, 212, 191], alpha: 0.93 }, // teal-400 (#2dd4bf)
  { offset: 1, color: [34, 211, 238], alpha: 1 } // cyan-400 (#22d3ee)
];

/** Varian "panas" saat bass menggebrak: bergeser ke mint & aqua lebih terang. */
const GRADIENT_STOPS_HOT: GradientStop[] = [
  { offset: 0, color: [52, 211, 153], alpha: 0.9 }, // emerald-400 (#34d399)
  { offset: 0.45, color: [45, 212, 191], alpha: 0.94 }, // teal-400 (#2dd4bf)
  { offset: 0.78, color: [94, 234, 212], alpha: 1 }, // teal-300 (#5eead4)
  { offset: 1, color: [103, 232, 249], alpha: 1 } // cyan-300 (#67e8f9)
];

// ---- Skala frekuensi & dinamika level ---------------------------------------
/** Rentang frekuensi yang dipetakan secara logaritmik dari tengah ke tepi. */
const BAND_MIN_HZ = 40;
const BAND_MAX_HZ = 14_000;
/** Zona bass = 30% pertama spektrum (dari tengah ke arah luar). */
const BASS_ZONE_RATIO = 0.3;
/** Penguat bass disesuaikan agar dinamis & tidak gampang tinggi penuh. */
const BASS_BOOST_MAX = 1.35;
const BASS_BOOST_MIN = 1.1;
/** Kompensasi energi treble. */
const TREBLE_TILT = 0.5;
/** Kurva persepsi amplitudo & Headroom diturunkan agar batang tidak melimpah. */
const LEVEL_GAMMA = 1.1;
const LEVEL_HEADROOM = 0.55;

// ---- Smoothness & peak -------------------------------------------------------
/** Attack & release lebih responsif agar gerakan batang luwes. */
const ATTACK_RATE = 0.65;
const RELEASE_RATE = 0.22;
/** Peak cap: melayang sebentar (hold), lalu jatuh dipercepat gravitasi. */
const PEAK_HOLD_MS = 220;
const PEAK_GRAVITY = 3.2;
const PEAK_MAX_FALL = 1.6;

export class AudioVisualizer {
  private readonly _audio: HTMLAudioElement;
  private readonly _canvas: HTMLCanvasElement;
  private readonly _maxBars: number;
  private readonly _maxPixelRatio: number;
  private readonly _g: CanvasRenderingContext2D | null;
  private readonly _resizeObserver: ResizeObserver | null;

  /** Graph Web Audio — dibuat lazy pada event `play` pertama. */
  private _audioCtx: AudioContext | null = null;
  private _analyser: AnalyserNode | null = null;
  private _sourceNode: MediaElementAudioSourceNode | null = null;
  private _freqData: Uint8Array<ArrayBuffer> | null = null;
  private _graphFailed = false;
  private _sourceCreated = false;
  private _resumePending = false;

  /** Loop render (requestAnimationFrame). */
  private _running = false;
  private _rafId: number | null = null;

  /** Cache bentuk batang. */
  private _barCount = 0;
  private _levels: number[] = [];
  private _peaks: number[] = [];
  private _peakVel: number[] = [];
  private _peakHold: number[] = [];
  private _gradient: CanvasGradient | null = null;
  private _bassEnergy = 0;
  private _lastTs = 0;

  constructor(
    audio: HTMLAudioElement,
    canvas: HTMLCanvasElement,
    options: AudioVisualizerOptions = {}
  ) {
    this._audio = audio;
    this._canvas = canvas;
    this._maxBars = options.maxBars ?? 48;
    this._maxPixelRatio = options.maxPixelRatio ?? 2;
    this._g = canvas.getContext('2d');

    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => {
        if (!this._running) this._drawIdle();
      });
      this._resizeObserver.observe(canvas);
    } else {
      this._resizeObserver = null;
    }

    audio.addEventListener('play', this._onPlay);
    audio.addEventListener('pause', this._onPause);
    audio.addEventListener('ended', this._onPause);
    audio.addEventListener('emptied', this._onEmptied);
    document.addEventListener('visibilitychange', this._onVisibility);

    this._drawIdle();
  }

  start(): void {
    if (this._running || !this._g) return;
    this._running = true;
    this._lastTs = 0;
    this._rafId = requestAnimationFrame(this._tick);
  }

  stop(): void {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._drawIdle();
  }

  reset(): void {
    this._clearBars();
    this.stop();
    if (!this._audio.paused) this.start();
  }

  dispose(): void {
    this.stop();
    this._audio.removeEventListener('play', this._onPlay);
    this._audio.removeEventListener('pause', this._onPause);
    this._audio.removeEventListener('ended', this._onPause);
    this._audio.removeEventListener('emptied', this._onEmptied);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this._resizeObserver?.disconnect();

    try {
      this._sourceNode?.disconnect();
      this._analyser?.disconnect();
    } catch {
      // diabaikan
    }

    const ctx = this._audioCtx;
    this._audioCtx = null;
    this._analyser = null;
    this._sourceNode = null;
    this._freqData = null;
    if (ctx) void ctx.close().catch(() => {});
  }

  private readonly _onPlay = (): void => {
    void this._resumeAudioContext();
    this.start();
  };

  private readonly _onPause = (): void => {
    this.stop();
  };

  private readonly _onEmptied = (): void => {
    this._clearBars();
    this.stop();
  };

  private readonly _onVisibility = (): void => {
    if (document.visibilityState === 'visible' && !this._audio.paused) {
      void this._resumeAudioContext();
    }
  };

  private readonly _tick = (): void => {
    if (!this._running) return;
    if (this._audioCtx?.state === 'suspended') void this._resumeAudioContext();
    this._renderFrame();
    this._rafId = requestAnimationFrame(this._tick);
  };

  private async _resumeAudioContext(): Promise<void> {
    this._ensureAudioGraph();
    const ctx = this._audioCtx;
    if (ctx && ctx.state === 'suspended' && !this._resumePending) {
      this._resumePending = true;
      try {
        await ctx.resume();
      } catch {
        // Autoplay policy fallback
      } finally {
        this._resumePending = false;
      }
    }
  }

  private _ensureAudioGraph(): void {
    if (this._sourceCreated || this._graphFailed || this._analyser) return;
    try {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('Web Audio API tidak didukung');

      const ctx = new Ctor();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.75; // Smoothing diturunkan agar pergerakan lebih lincah

      const source = ctx.createMediaElementSource(this._audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);

      this._audioCtx = ctx;
      this._analyser = analyser;
      this._sourceNode = source;
      this._sourceCreated = true;
      this._freqData = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      this._graphFailed = true;
      this._audioCtx = null;
      this._analyser = null;
      this._sourceNode = null;
      this._freqData = null;
    }
  }

  private _syncCanvasSize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this._maxPixelRatio);
    const cssW = this._canvas.clientWidth;
    const cssH = this._canvas.clientHeight;
    if (cssW <= 0 || cssH <= 0) return;

    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    if (this._canvas.width !== pxW || this._canvas.height !== pxH) {
      this._canvas.width = pxW;
      this._canvas.height = pxH;
      this._gradient = null;
    }
  }

  private _resolveBarCount(): number {
    const cssW = this._canvas.clientWidth || this._canvas.width;
    const byWidth = Math.floor(cssW / 8);
    let count = Math.max(16, Math.min(this._maxBars, byWidth));
    // Pastikan jumlah batang genap agar pembagian kiri & kanan simetris
    if (count % 2 !== 0) count++;
    return count;
  }

  private _syncLevelArrays(count: number): void {
    if (this._barCount === count) return;
    this._barCount = count;
    this._levels = new Array<number>(count).fill(0);
    this._peaks = new Array<number>(count).fill(0);
    this._peakVel = new Array<number>(count).fill(0);
    this._peakHold = new Array<number>(count).fill(0);
  }

  private _clearBars(): void {
    this._levels.fill(0);
    this._peaks.fill(0);
    this._peakVel.fill(0);
    this._peakHold.fill(0);
    this._bassEnergy = 0;
  }

  private static _lerpColor(a: Rgb, b: Rgb, t: number): string {
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const gr = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `${r}, ${gr}, ${bl}`;
  }

  private static _bassWeight(t: number): number {
    if (t <= 0) return BASS_BOOST_MAX;
    if (t <= BASS_ZONE_RATIO) {
      return BASS_BOOST_MAX + (BASS_BOOST_MIN - BASS_BOOST_MAX) * (t / BASS_ZONE_RATIO);
    }
    return 1;
  }

  private static _rateFactor(basePerFrame: number, dtMs: number): number {
    return 1 - Math.pow(1 - basePerFrame, dtMs / (1000 / 60));
  }

  private _buildGradient(
    g: CanvasRenderingContext2D,
    height: number,
    heat: number
  ): CanvasGradient {
    const grad = g.createLinearGradient(0, height, 0, 0);
    for (let i = 0; i < GRADIENT_STOPS.length; i++) {
      const calm = GRADIENT_STOPS[i];
      const hot = GRADIENT_STOPS_HOT[i];
      const alpha = calm.alpha + (hot.alpha - calm.alpha) * heat;
      grad.addColorStop(
        calm.offset,
        `rgba(${AudioVisualizer._lerpColor(calm.color, hot.color, heat)}, ${alpha.toFixed(3)})`
      );
    }
    return grad;
  }

  private _ensureGradient(g: CanvasRenderingContext2D, height: number): CanvasGradient {
    if (!this._gradient) this._gradient = this._buildGradient(g, height, 0);
    return this._gradient;
  }

  private _squareSegment(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    g.rect(x, y, w, h);
  }

  private _renderFrame(): void {
    this._syncCanvasSize();
    const g = this._g;
    const w = this._canvas.width;
    const h = this._canvas.height;
    if (!g || w <= 0 || h <= 0) return;

    const now = performance.now();
    const dt = Math.min(100, this._lastTs > 0 ? now - this._lastTs : 1000 / 60);
    this._lastTs = now;
    const attackF = AudioVisualizer._rateFactor(ATTACK_RATE, dt);
    const releaseF = AudioVisualizer._rateFactor(RELEASE_RATE, dt);

    const count = this._resolveBarCount();
    this._syncLevelArrays(count);
    g.clearRect(0, 0, w, h);

    const analyser = this._analyser;
    const data = this._freqData;

    if (analyser && data) analyser.getByteFrequencyData(data);

    const usableBins = data ? data.length : 0;
    const binHz = analyser ? analyser.context.sampleRate / analyser.fftSize : 0;
    const minBin = binHz > 0 ? Math.max(1, Math.floor(BAND_MIN_HZ / binHz)) : 0;
    const maxBin =
      binHz > 0 ? Math.min(usableBins - 1, Math.ceil(BAND_MAX_HZ / binHz)) : 0;
    const logSpan = maxBin > minBin ? Math.log(maxBin / minBin) : 0;
    const binAt = (t: number): number =>
      logSpan > 0 ? minBin * Math.exp(logSpan * t) : 0;

    const dpr = Math.min(window.devicePixelRatio || 1, this._maxPixelRatio);
    const gap = Math.max(1, Math.round(2 * dpr));
    const barW = Math.max(1, (w - gap * (count - 1)) / count);
    const minH = Math.max(2, Math.round(h * 0.05));
    const capH = Math.max(2, Math.round(h * 0.04));

    const halfCount = count / 2;
    let bassSum = 0;
    let bassBars = 0;

    // ---- Pass 1: Hitung level dengan pola menyebar dari TENGAH ke PINGGIR ----
    for (let i = 0; i < count; i++) {
      let target = 0;
      
      // Hitung jarak dari pusat (0 = tengah, 1 = paling pinggir)
      const distFromCenter = Math.abs(i - halfCount + 0.5) / halfCount;
      const zoneT = distFromCenter;

      if (data && logSpan > 0) {
        const startBin = Math.min(maxBin - 1, Math.floor(binAt(zoneT)));
        const endBin = Math.max(
          startBin + 1,
          Math.min(maxBin, Math.floor(binAt((zoneT + 1 / halfCount))))
        );
        let sum = 0;
        for (let j = startBin; j < endBin; j++) sum += data[j];
        const avg = sum / (endBin - startBin) / 255;
        
        const weight = AudioVisualizer._bassWeight(zoneT);
        const trebleTilt = 1 + zoneT * TREBLE_TILT;

        // Formula penyesuaian amplitudo agar tidak gampang melebihi batas (penuh)
        target = Math.min(
          1,
          Math.pow(
            Math.min(1, avg * weight * trebleTilt * LEVEL_HEADROOM),
            LEVEL_GAMMA
          )
        );

        if (zoneT <= BASS_ZONE_RATIO) {
          bassSum += target;
          bassBars++;
        }
      }

      const prev = this._levels[i] || 0;
      const factor = target > prev ? attackF : releaseF;
      this._levels[i] = prev + (target - prev) * factor;
    }

    const rawBass = bassBars > 0 ? bassSum / bassBars : 0;
    const bass = this._bassEnergy;
    this._bassEnergy =
      rawBass > bass
        ? bass + (rawBass - bass) * Math.min(1, attackF * 1.4)
        : bass + (rawBass - bass) * releaseF * 0.75;
    const heat = Math.min(1, this._bassEnergy);

    // ---- Pass 2: Render batang ----
    g.fillStyle = this._buildGradient(g, h, heat);
    g.shadowColor = `rgba(34, 211, 238, ${(0.15 + 0.4 * heat).toFixed(3)})`;
    g.shadowBlur = (2 + 10 * heat) * dpr;

    g.beginPath();
    for (let i = 0; i < count; i++) {
      const level = this._levels[i];
      const x = i * (barW + gap);
      const barH = minH + (h - minH) * level;

      g.globalAlpha = 0.5 + 0.5 * level;
      this._squareSegment(g, x, h - barH, barW, barH);
    }
    g.fill();

    // Peak cap dengan gravitasi
    g.beginPath();
    for (let i = 0; i < count; i++) {
      const level = this._levels[i];
      const prevPeak = this._peaks[i] || 0;
      if (level >= prevPeak) {
        this._peaks[i] = level;
        this._peakVel[i] = 0;
        this._peakHold[i] = PEAK_HOLD_MS;
      } else if ((this._peakHold[i] || 0) > 0) {
        this._peakHold[i] = (this._peakHold[i] || 0) - dt;
      } else {
        const v = Math.min(
          PEAK_MAX_FALL,
          (this._peakVel[i] || 0) + PEAK_GRAVITY * (dt / 1000)
        );
        this._peakVel[i] = v;
        this._peaks[i] = Math.max(level, prevPeak - v * (dt / 1000));
      }

      const peakH = minH + (h - minH) * (this._peaks[i] || 0);
      const capY = Math.max(0, h - peakH - gap - capH);
      this._squareSegment(g, i * (barW + gap), capY, barW, capH);
    }
    g.globalAlpha = 0.4 + 0.3 * heat;
    g.fill();

    g.shadowBlur = 0;
    g.shadowColor = 'transparent';
    g.globalAlpha = 1;
  }

  private _drawIdle(): void {
    this._syncCanvasSize();
    const g = this._g;
    const w = this._canvas.width;
    const h = this._canvas.height;
    if (!g || w <= 0 || h <= 0) return;

    const count = this._resolveBarCount();
    this._syncLevelArrays(count);
    g.clearRect(0, 0, w, h);

    const dpr = Math.min(window.devicePixelRatio || 1, this._maxPixelRatio);
    const gap = Math.max(1, Math.round(2 * dpr));
    const barW = Math.max(1, (w - gap * (count - 1)) / count);
    const idleH = Math.max(2, Math.round(h * 0.05));

    g.fillStyle = this._ensureGradient(g, h);
    g.globalAlpha = 0.25;
    g.beginPath();
    for (let i = 0; i < count; i++) {
      this._squareSegment(g, i * (barW + gap), h - idleH, barW, idleH);
    }
    g.fill();
    g.globalAlpha = 1;
  }
}