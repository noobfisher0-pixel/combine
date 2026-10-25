/**
 * 効果音（docs/game-design.md §11 G4）。音のファイルは使わず、WebAudio で合成する。
 *
 * 鳴り続ける音：
 * - エンジン：のこぎり波 2 本（少しずらす）を低域通過。回転は速さと脱穀部の負荷で上がる
 * - 脱穀部：帯域通過のノイズ。負荷で大きくなる
 * - 刈刃：高域のノイズを 10 Hz で揺らす（ナイフの往復）。刈っている間だけ
 * - 排出：三角波のうなり＋穀粒の流れるノイズ。排出中だけ
 * 知らせの音：タンクの警告、満杯、衝突、カートの到着・荷下ろし、残り 10 秒の時報、時間切れ、切り替え。
 * ブラウザの決まりで、最初のクリックやキーのあとに start() を呼んで鳴らし始める。
 */
export type Cue = 'tank70' | 'tank90' | 'full' | 'collision' | 'arrived' | 'dumped' | 'tick' | 'timeUp' | 'toggle' | 'warn';

export interface AudioState {
  running: boolean;
  speed: number; // km/h
  load: number; // 負荷率
  cutting: boolean;
  unloading: boolean;
}

export class GameAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private engine!: { a: OscillatorNode; b: OscillatorNode; gain: GainNode; filter: BiquadFilterNode };
  private thresh!: { gain: GainNode };
  private cutter!: { gain: GainNode };
  private auger!: { osc: OscillatorNode; gain: GainNode };
  private muted = false;
  volume = 0.6;

  /** 最初のユーザー操作のあとで呼ぶ。2 回目以降は再開だけ */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = (globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);

    // 2 秒のホワイトノイズ（ループ）
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    const noise = () => {
      const n = ctx.createBufferSource();
      n.buffer = buf;
      n.loop = true;
      n.start();
      return n;
    };

    // エンジン
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const eg = ctx.createGain();
    eg.gain.value = 0;
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = b.type = 'sawtooth';
    a.frequency.value = 42;
    b.frequency.value = 42.7;
    a.connect(filter);
    b.connect(filter);
    filter.connect(eg).connect(this.master);
    a.start();
    b.start();
    this.engine = { a, b, gain: eg, filter };

    // 脱穀部（帯域通過のノイズ）
    const tf = ctx.createBiquadFilter();
    tf.type = 'bandpass';
    tf.frequency.value = 700;
    tf.Q.value = 0.7;
    const tg = ctx.createGain();
    tg.gain.value = 0;
    noise().connect(tf).connect(tg).connect(this.master);
    this.thresh = { gain: tg };

    // 刈刃（高域のノイズを 10 Hz で揺らす）
    const cf = ctx.createBiquadFilter();
    cf.type = 'highpass';
    cf.frequency.value = 2600;
    const cg = ctx.createGain();
    cg.gain.value = 0;
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 10;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth).connect(am.gain);
    lfo.start();
    noise().connect(cf).connect(am).connect(cg).connect(this.master);
    this.cutter = { gain: cg };

    // 排出（うなり＋穀粒の流れ）
    const ao = ctx.createOscillator();
    ao.type = 'triangle';
    ao.frequency.value = 150;
    const ag = ctx.createGain();
    ag.gain.value = 0;
    const hf = ctx.createBiquadFilter();
    hf.type = 'bandpass';
    hf.frequency.value = 3200;
    hf.Q.value = 1.2;
    const hiss = ctx.createGain();
    hiss.gain.value = 0.6;
    ao.connect(ag);
    noise().connect(hf).connect(hiss).connect(ag);
    ag.connect(this.master);
    ao.start();
    this.auger = { osc: ao, gain: ag };
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }
  get isMuted() {
    return this.muted;
  }

  suspend() {
    void this.ctx?.suspend();
  }

  /** 毎フレーム：鳴り続ける音の大きさと高さを状態に合わせる */
  update(s: AudioState) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const k = 0.15; // 追いつく時定数 [s]
    const on = s.running ? 1 : 0;
    const f = 40 + (Math.abs(s.speed) / 12) * 10 + Math.min(1.3, s.load) * 16;
    this.engine.a.frequency.setTargetAtTime(f, t, k);
    this.engine.b.frequency.setTargetAtTime(f * 1.017, t, k);
    this.engine.filter.frequency.setTargetAtTime(260 + Math.min(1.3, s.load) * 260, t, k);
    this.engine.gain.gain.setTargetAtTime(0.16 * on, t, k);
    this.thresh.gain.gain.setTargetAtTime((0.025 + 0.07 * Math.min(1.3, s.load)) * on, t, k);
    this.cutter.gain.gain.setTargetAtTime(s.cutting && s.running ? 0.05 : 0, t, k);
    this.auger.gain.gain.setTargetAtTime(s.unloading && s.running ? 0.05 : 0, t, k);
  }

  /** 知らせの音 */
  cue(c: Cue) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const tone = (freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.18, to?: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t + start);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + start + dur);
      g.gain.setValueAtTime(0, t + start);
      g.gain.linearRampToValueAtTime(vol, t + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      o.connect(g).connect(this.master);
      o.start(t + start);
      o.stop(t + start + dur + 0.05);
    };
    switch (c) {
      case 'tank70':
        tone(880, 0, 0.18);
        break;
      case 'tank90':
        tone(880, 0, 0.15);
        tone(880, 0.22, 0.15);
        break;
      case 'full':
        tone(440, 0, 0.25, 'square', 0.12);
        tone(440, 0.3, 0.25, 'square', 0.12);
        tone(330, 0.6, 0.4, 'square', 0.12);
        break;
      case 'warn':
        tone(520, 0, 0.2, 'triangle', 0.15);
        break;
      case 'collision':
        tone(160, 0, 0.35, 'sine', 0.35, 50);
        break;
      case 'arrived':
        tone(660, 0, 0.15, 'triangle');
        tone(990, 0.12, 0.25, 'triangle');
        break;
      case 'dumped':
        tone(523, 0, 0.12, 'triangle');
        tone(659, 0.1, 0.12, 'triangle');
        tone(784, 0.2, 0.3, 'triangle');
        break;
      case 'tick':
        tone(1200, 0, 0.05, 'square', 0.06);
        break;
      case 'timeUp':
        tone(392, 0, 0.6, 'sawtooth', 0.12);
        tone(523, 0, 0.6, 'sawtooth', 0.08);
        break;
      case 'toggle':
        tone(700, 0, 0.06, 'triangle', 0.08);
        break;
    }
  }
}
