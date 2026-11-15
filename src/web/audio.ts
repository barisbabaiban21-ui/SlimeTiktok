/** Synthesized ASMR cues, voice playback and a background music loop (the operator's file, ducked under the voice). */
const MUSIC_URL = '/assets/music/muzik.mp3';
const MUSIC_LEVEL = 0.29, MUSIC_DUCKED = 0.09;
/** Dance tracks, each cut to start at its hook: disco (2:14 of the song) for the mirror ball, the conga (0:15), Osman Tuş (a 6 s loop). */
const TRACKS: Record<string, { url: string; loop: boolean }> = {
  disco: { url: '/assets/music/disco.mp3', loop: false }, kongo: { url: '/assets/music/kongo.mp3', loop: true }, osman: { url: '/assets/music/osman.mp3', loop: true }
};
const DISCO_LEVEL = 0.4;
export class AudioEngine {
  context: AudioContext | null = null;
  enabled = false;
  private noise: AudioBuffer | null = null;
  analyser: AnalyserNode | null = null;
  private voiceEl: HTMLAudioElement | null = null;
  private music: { el: HTMLAudioElement; gain: GainNode } | null = null; private duckTimer = 0;
  /** `?music=0` turns the music off. */
  musicOn = new URLSearchParams(location.search).get('music') !== '0';
  async enable(): Promise<void> {
    this.context ??= new AudioContext(); await this.context.resume(); this.enabled = true; this.halayTrackAttempted = false;
    if (!this.noise) {
      const c = this.context, b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
    }
    if (!this.analyser) { this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 512; this.analyser.connect(this.context.destination); }
    if (this.musicOn && !this.music) {
      const el = new Audio(MUSIC_URL); el.loop = true; el.preload = 'auto';
      const gain = this.context.createGain(); gain.gain.value = 0;
      this.context.createMediaElementSource(el).connect(gain); gain.connect(this.context.destination);
      this.music = { el, gain };
      // Fade in, then keep it under the voice: lower while he talks, back up a moment after.
      gain.gain.linearRampToValueAtTime(MUSIC_LEVEL, this.context.currentTime + 3);
      this.duckTimer = window.setInterval(() => this.duck(), 150);
    }
    if (this.music) void this.music.el.play().catch(() => undefined);
  }
  private tracks = new Map<string, { el: HTMLAudioElement; gain: GainNode }>(); private track: string | null = null;
  get discoOn(): boolean { return this.track !== null; }
  /** Plays a dance's own track from its start (its hook) every time, or stops it with a short fade (null). The background music steps aside meanwhile. */
  danceTrack(name: string | null): void {
    if (name === this.track || !this.enabled || !this.context) return;
    const c = this.context, t = c.currentTime;
    const prevName = this.track, prev = prevName ? this.tracks.get(prevName) : null;
    if (prev) { const g = prev.gain.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.8); setTimeout(() => { if (this.track !== prevName) prev.el.pause(); }, 900); }
    this.track = name && TRACKS[name] ? name : null;
    if (this.track) {
      let tr = this.tracks.get(this.track);
      if (!tr) {
        const el = new Audio(TRACKS[this.track]!.url); el.preload = 'auto'; el.loop = TRACKS[this.track]!.loop;
        const gain = c.createGain(); gain.gain.value = 0;
        c.createMediaElementSource(el).connect(gain); gain.connect(c.destination);
        tr = { el, gain }; this.tracks.set(this.track, tr);
      }
      tr.el.currentTime = 0; void tr.el.play().catch(() => undefined);
      const g = tr.gain.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(DISCO_LEVEL, t + 0.2);
    }
    this.level0 = -1; this.duck();
  }
  private level0 = -1; private boosted = false;
  /** Dance breaks: the music comes up. */
  boost(on: boolean): void { this.boosted = on; }
  private duck(): void {
    if (!this.music || !this.context || !this.enabled) return;
    const want = this.discoOn ? 0 : this.halayOn || this.voicePlaying ? MUSIC_DUCKED : this.boosted ? MUSIC_LEVEL * 1.6 : MUSIC_LEVEL;
    if (want === this.level0) return;
    const up = want > this.level0; this.level0 = want;
    const g = this.music.gain.gain, t = this.context.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(want, t + (up ? 1.2 : 0.3));
  }
  disable(): void { this.enabled = false; if (this.halayTimer !== null) window.clearInterval(this.halayTimer); this.halayTimer = null; this.halayOn = false; this.stopHalayTrack(); this.voiceEl?.pause(); this.music?.el.pause(); void this.context?.suspend(); }
  stopVoice(): void { this.voiceEl?.pause(); }
  /** Wet squelch: band-passed noise with a falling filter. */
  squish(strength = 1): void {
    if (!this.enabled || !this.context || !this.noise) return;
    const c = this.context, t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; src.playbackRate.value = 0.6 + Math.random() * 0.5;
    f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(900 + Math.random() * 500, t); f.frequency.exponentialRampToValueAtTime(180, t + 0.25);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * strength, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(t, Math.random() * 0.5, 0.35);
  }
  pop(): void {
    if (!this.enabled || !this.context) return;
    const c = this.context, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(420 + Math.random() * 300, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.08);
    g.gain.setValueAtTime(0.035, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.12);
  }
  pour(seconds: number): void {
    if (!this.enabled || !this.context || !this.noise) return;
    const c = this.context, t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; src.loop = true; f.type = 'lowpass'; f.frequency.value = 600;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.012, t + 0.3); g.gain.setValueAtTime(0.012, t + Math.max(0.3, seconds - 0.4)); g.gain.linearRampToValueAtTime(0, t + seconds);
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(t); src.stop(t + seconds + 0.05);
  }
  chime(): void {
    if (!this.enabled || !this.context) return;
    const c = this.context, t = c.currentTime;
    for (const [i, hz] of [523.25, 659.25, 783.99, 1046.5].entries()) {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = hz;
      g.gain.setValueAtTime(0, t + i * 0.08); g.gain.linearRampToValueAtTime(0.05, t + i * 0.08 + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.5);
      o.connect(g); g.connect(c.destination); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.55);
    }
  }
  /** Plays a cached TTS file through the analyser so the mouth can follow it. */
  playVoice(url: string, tape = false): boolean {
    if (!this.enabled || !this.context || !this.analyser) return false;
    this.voiceEl?.pause();
    const a = new Audio(url); a.crossOrigin = 'anonymous';
    const node = this.context.createMediaElementSource(a); node.connect(this.analyser);
    a.onended = () => node.disconnect();
    if (tape) { a.preservesPitch = false; a.playbackRate = AudioEngine.TAPE; }
    this.voiceEl = a; void a.play().catch(() => undefined);
    return true;
  }
  /** Rage lines play like a tape slowed by hand: 55 % speed, the pitch dropping with it. */
  static readonly TAPE = 0.55;
  get voicePlaying(): boolean { return !!this.voiceEl && !this.voiceEl.paused && !this.voiceEl.ended; }
  private halayTimer: number | null = null;
  private halayStep = 0;
  private halayOn = false;
  private halayPlayers: { el: HTMLAudioElement; gain: GainNode }[] = [];
  private halayCurrent = 0;
  private halayTransitioning = false;
  private halayTrackAttempted = false;
  /** Two licensed operator-supplied halay tracks crossfade so the dance floor never falls silent. */
  private startHalayTrack(): void {
    if (!this.enabled || !this.context || this.halayPlayers.length || this.halayTrackAttempted) return;
    this.halayTrackAttempted = true;
    const urls = ['/assets/music/halay-1.mp3', '/assets/music/halay-2.mp3'];
    const players = urls.map(url => {
      const el = new Audio(url); el.loop = false; el.preload = 'auto';
      const gain = this.context!.createGain(); gain.gain.value = 0;
      this.context!.createMediaElementSource(el).connect(gain); gain.connect(this.context!.destination);
      return { el, gain };
    });
    this.halayPlayers = players; this.halayCurrent = 0; this.halayTransitioning = false;
    const playNext = (from: number, emergency = false): void => {
      if (!this.halayOn || !this.context || this.halayPlayers !== players || this.halayTransitioning) return;
      const to = 1 - from, current = players[from], next = players[to], now = this.context.currentTime;
      this.halayTransitioning = true;
      next.el.currentTime = 0;
      next.gain.gain.cancelScheduledValues(now); next.gain.gain.setValueAtTime(0, now);
      void next.el.play().then(() => {
        if (!this.halayOn || this.halayPlayers !== players || !this.context) { next.el.pause(); return; }
        const t = this.context.currentTime, duration = emergency ? 0.15 : 2.2;
        current.gain.gain.cancelScheduledValues(t); current.gain.gain.setValueAtTime(current.gain.gain.value, t);
        next.gain.gain.cancelScheduledValues(t); next.gain.gain.setValueAtTime(0, t);
        current.gain.gain.linearRampToValueAtTime(0, t + duration);
        next.gain.gain.linearRampToValueAtTime(0.72, t + duration);
        window.setTimeout(() => {
          if (!this.halayOn || this.halayPlayers !== players) return;
          current.el.pause(); current.el.currentTime = 0;
          this.halayCurrent = to; this.halayTransitioning = false;
        }, duration * 1000 + 80);
      }).catch(() => {
        this.halayTransitioning = false;
        if (this.halayPlayers === players) { next.gain.disconnect(); }
      });
    };
    players.forEach((player, index) => {
      player.el.addEventListener('timeupdate', () => {
        if (index !== this.halayCurrent || this.halayTransitioning || !Number.isFinite(player.el.duration)) return;
        if (player.el.duration - player.el.currentTime <= 2.5) playNext(index);
      });
      player.el.addEventListener('ended', () => {
        if (index === this.halayCurrent && !this.halayTransitioning) playNext(index, true);
      });
      player.el.addEventListener('error', () => {
        if (this.halayPlayers === players && index === this.halayCurrent) {
          const next = players[1 - index];
          void next.el.play().then(() => { this.halayCurrent = 1 - index; }).catch(() => undefined);
        }
      });
    });
    players[0].gain.gain.setValueAtTime(0.72, this.context.currentTime);
    void players[0].el.play().catch(() => {
      if (this.halayPlayers === players) this.halayTrackAttempted = false;
    });
  }
  private stopHalayTrack(): void {
    const players = this.halayPlayers; this.halayPlayers = []; this.halayTransitioning = false;
    for (const player of players) {
      const t = this.context?.currentTime ?? 0, g = player.gain.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.2);
      window.setTimeout(() => { player.el.pause(); player.el.currentTime = 0; player.gain.disconnect(); }, 250);
    }
  }
  /** Original synthesized wedding pulse: davul-like bass hits and a bright zurna-like lead. */
  halay(on: boolean): void {
    if (!on) {
      this.halayOn = false;
      this.stopHalayTrack();
      if (this.halayTimer !== null) window.clearInterval(this.halayTimer);
      this.halayTimer = null;
      return;
    }
    this.halayOn = true;
    if (!this.enabled || !this.context) return;
    this.startHalayTrack();
    if (this.halayTimer !== null) return;
    const beat = () => {
      if (!this.enabled || !this.context || !this.halayOn) return;
      const c = this.context, t = c.currentTime, step = this.halayStep++ % 8;
      const kick = c.createOscillator(), kg = c.createGain();
      kick.type = 'sine'; kick.frequency.setValueAtTime(step % 4 === 0 ? 105 : 78, t);
      kick.frequency.exponentialRampToValueAtTime(38, t + 0.16);
      kg.gain.setValueAtTime(0.0001, t); kg.gain.linearRampToValueAtTime(step % 4 === 0 ? 0.22 : 0.12, t + 0.008);
      kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); kick.connect(kg); kg.connect(c.destination); kick.start(t); kick.stop(t + 0.21);
      if (step % 2 === 1 && this.noise) {
        const src = c.createBufferSource(), filter = c.createBiquadFilter(), clap = c.createGain();
        src.buffer = this.noise; filter.type = 'highpass'; filter.frequency.value = 1800;
        clap.gain.setValueAtTime(0.0001, t); clap.gain.linearRampToValueAtTime(0.045, t + 0.004); clap.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
        src.connect(filter); filter.connect(clap); clap.connect(c.destination); src.start(t, Math.random() * 0.8, 0.08);
      }
      if (step === 0 || step === 4) {
        const lead = c.createOscillator(), lg = c.createGain(), notes = step === 0 ? [587.33, 698.46, 783.99, 698.46] : [659.25, 783.99, 880, 783.99];
        lead.type = 'sawtooth'; lead.frequency.setValueAtTime(notes[0]!, t);
        lead.frequency.setValueAtTime(notes[1]!, t + 0.11); lead.frequency.setValueAtTime(notes[2]!, t + 0.22); lead.frequency.setValueAtTime(notes[3]!, t + 0.33);
        lg.gain.setValueAtTime(0.0001, t); lg.gain.linearRampToValueAtTime(0.018, t + 0.025); lg.gain.setValueAtTime(0.018, t + 0.28); lg.gain.exponentialRampToValueAtTime(0.0001, t + 0.43);
        const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 1700;
        lead.connect(tone); tone.connect(lg); lg.connect(c.destination); lead.start(t); lead.stop(t + 0.44);
      }
    };
    beat();
    this.halayTimer = window.setInterval(beat, 440);
  }
  private buf = new Uint8Array(512);
  level(): number {
    if (!this.analyser || !this.voicePlaying) return 0;
    this.analyser.getByteTimeDomainData(this.buf);
    let sum = 0; for (let i = 0; i < this.buf.length; i++) { const v = (this.buf[i]! - 128) / 128; sum += v * v; }
    return Math.min(1, Math.sqrt(sum / this.buf.length) * 5);
  }
}
