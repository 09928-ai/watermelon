/* sfx.js — เสียง + เอฟเฟกต์ประกาย สำหรับเกม Fruit Slice */
(function () {
  'use strict';

  const MUSIC_VOL = 0.18;
  const SFX_VOL = 0.75;
  const MASTER_VOL = 0.9;
  const BPM = 132;
  const STEP_DUR = 60 / BPM / 2;

  let ctx = null, master, musicBus, sfxBus, noiseBuf;
  let musicOn = false, muted = false;
  let timer = null, nextTime = 0, step = 0;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOL;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_VOL;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = SFX_VOL;
    sfxBus.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function tone(freq, t, dur, type, vol, dest) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function sweep(f0, f1, t, dur, type, vol, dest) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(t, dur, ftype, f0, f1, vol, dest, q) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = ftype;
    f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t, Math.random() * 1.0);
    s.stop(t + dur + 0.05);
  }

  /* ---------- เสียงเอฟเฟกต์ ---------- */
  function slice() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const v = 0.9 + Math.random() * 0.25;
    noise(t, 0.14, 'bandpass', 4200 * v, 900 * v, 0.55, sfxBus, 1.2);
    noise(t + 0.03, 0.13, 'lowpass', 2600, 300, 0.65, sfxBus, 0.7);
    sweep(280 * v, 70, t + 0.02, 0.14, 'sine', 0.5, sfxBus);
  }

  function bomb() {
    if (!ctx) return;
    const t = ctx.currentTime;
    noise(t, 0.7, 'lowpass', 1400, 70, 1.0, sfxBus, 0.7);
    sweep(130, 32, t, 0.6, 'sine', 0.9, sfxBus);
  }

  function gameOver() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    [392, 330, 262, 196].forEach((f, i) =>
      tone(f, t + i * 0.22, 0.5, 'triangle', 0.35, sfxBus));
  }

  function applause(dur) {
    if (!ctx) return;
    dur = dur || 3.4;
    const t0 = ctx.currentTime + 0.02;
    const n = Math.floor(dur * 90);
    for (let i = 0; i < n; i++) {
      const t = t0 + Math.random() * dur;
      const fadeIn = Math.min(1, (t - t0) / 0.4);
      const fadeOut = Math.min(1, (t0 + dur - t) / 1.3);
      const env = Math.max(0.05, fadeIn * fadeOut);
      const f = 1200 + Math.random() * 2600;
      noise(t, 0.03 + Math.random() * 0.045, 'bandpass', f, f, 0.32 * env, sfxBus, 0.8);
    }
  }

  function sparkleSound() {
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.05;
    const notes = [1046.5, 1318.5, 1568, 2093, 2637, 3136];
    for (let i = 0; i < 16; i++) {
      const f = notes[Math.floor(Math.random() * notes.length)];
      const t = t0 + i * 0.075 + Math.random() * 0.03;
      tone(f, t, 0.4, 'sine', 0.16, sfxBus);
      tone(f * 2, t, 0.25, 'triangle', 0.05, sfxBus);
    }
  }

  /* ---------- เพลงประกอบ (C – G – Am – F) ---------- */
  const MELODY = [
    [76, null, 72, 76, 79, null, 76, 72],
    [74, null, 71, 74, 79, null, 74, 71],
    [72, null, 69, 72, 76, null, 72, 69],
    [72, null, 69, 72, 77, 76, 72, 69]
  ];
  const ROOTS = [48, 43, 45, 41];

  function scheduleStep(i, t) {
    const bar = Math.floor(i / 8) % 4;
    const pos = i % 8;
    const m = MELODY[bar][pos];
    if (m) tone(mtof(m), t, STEP_DUR * 1.6, 'square', 0.13, musicBus);
    if (pos % 2 === 0) {
      const root = ROOTS[bar] + (pos % 4 === 2 ? 7 : 0);
      tone(mtof(root), t, STEP_DUR * 1.8, 'triangle', 0.4, musicBus);
    }
    if (pos === 0 || pos === 4) sweep(150, 40, t, 0.12, 'sine', 0.55, musicBus);
    if (pos % 2 === 1) noise(t, 0.04, 'highpass', 7000, 7000, 0.14, musicBus, 0.7);
  }

  function scheduler() {
    while (nextTime < ctx.currentTime + 0.25) {
      scheduleStep(step, nextTime);
      nextTime += STEP_DUR;
      step++;
    }
  }

  function startMusic() {
    if (!ctx || musicOn) return;
    musicOn = true;
    step = 0;
    const now = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setValueAtTime(MUSIC_VOL, now);
    nextTime = now + 0.05;
    scheduler();
    timer = setInterval(scheduler, 100);
  }

  function stopMusic() {
    if (!ctx || !musicOn) return;
    musicOn = false;
    clearInterval(timer);
    const now = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setTargetAtTime(0, now, 0.05);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : MASTER_VOL;
    return muted;
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });

  /* ---------- เอฟเฟกต์ประกาย (canvas แยกซ้อนบนเกม) ---------- */
  const fx = { cv: null, c: null, parts: [], raf: 0, last: 0 };

  function fit() {
    const d = window.devicePixelRatio || 1;
    fx.cv.width = innerWidth * d;
    fx.cv.height = innerHeight * d;
    fx.c.setTransform(d, 0, 0, d, 0, 0);
  }

  function ensureCanvas() {
    if (fx.cv) return;
    const cv = document.createElement('canvas');
    cv.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
    document.body.appendChild(cv);
    fx.cv = cv;
    fx.c = cv.getContext('2d');
    window.addEventListener('resize', fit);
    fit();
  }

  function drawStar(c, x, y, r, rot) {
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + (i * Math.PI) / 4;
      const rr = i % 2 ? r * 0.35 : r;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - fx.last) / 1000);
    fx.last = now;
    const c = fx.c;
    c.clearRect(0, 0, innerWidth, innerHeight);
    c.globalCompositeOperation = 'lighter';

    fx.parts = fx.parts.filter((p) => {
      p.age += dt;
      if (p.age >= p.life) return false;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      const k = 1 - p.age / p.life;
      const twinkle = 0.6 + 0.4 * Math.sin(p.age * 25 + p.rot * 3);
      c.fillStyle = 'hsla(' + p.hue + ',100%,' + p.light + '%,' + (k * twinkle).toFixed(3) + ')';
      drawStar(c, p.x, p.y, p.size * (0.4 + 0.6 * k), p.rot);
      return true;
    });

    if (fx.parts.length) {
      fx.raf = requestAnimationFrame(loop);
    } else {
      fx.raf = 0;
      c.clearRect(0, 0, innerWidth, innerHeight);
    }
  }

  function kick() {
    if (!fx.raf) {
      fx.last = performance.now();
      fx.raf = requestAnimationFrame(loop);
    }
  }

  function burst(x, y, n) {
    ensureCanvas();
    n = n || 36;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 320;
      fx.parts.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        g: 260,
        age: 0, life: 0.7 + Math.random() * 0.9,
        size: 4 + Math.random() * 9,
        hue: Math.random() < 0.7 ? 38 + Math.random() * 20 : 0,
        light: Math.random() < 0.7 ? 60 : 100,
        rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 8
      });
    }
    kick();
  }

  function rain(n) {
    ensureCanvas();
    for (let i = 0; i < n; i++) {
      fx.parts.push({
        x: Math.random() * innerWidth, y: -20 - Math.random() * 120,
        vx: (Math.random() - 0.5) * 60, vy: 80 + Math.random() * 160,
        g: 60,
        age: 0, life: 2 + Math.random() * 1.8,
        size: 3 + Math.random() * 8,
        hue: 40 + Math.random() * 15, light: Math.random() < 0.5 ? 65 : 100,
        rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 6
      });
    }
    kick();
  }

  function banner(text) {
    if (!document.getElementById('sfx-style')) {
      const st = document.createElement('style');
      st.id = 'sfx-style';
      st.textContent =
        '.sfx-banner{position:fixed;top:28%;left:50%;z-index:10000;pointer-events:none;' +
        'font:800 clamp(32px,9vw,64px)/1.1 system-ui,sans-serif;color:#ffe066;text-align:center;' +
        'text-shadow:0 0 18px #ff9f1c,0 3px 0 #b45309,0 0 40px rgba(255,200,50,.8);' +
        'animation:sfxPop 3.2s ease-out forwards}' +
        '@keyframes sfxPop{0%{opacity:0;transform:translate(-50%,-50%) scale(.3)}' +
        '15%{opacity:1;transform:translate(-50%,-50%) scale(1.18)}' +
        '25%{transform:translate(-50%,-50%) scale(1)}' +
        '80%{opacity:1;transform:translate(-50%,-50%) scale(1)}' +
        '100%{opacity:0;transform:translate(-50%,-70%) scale(1)}}';
      document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.className = 'sfx-banner';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3300);
  }

  /* ---------- ฉลองทำลายสถิติ ---------- */
  function celebrate() {
    applause(3.4);
    sparkleSound();
    banner('🏆 สถิติใหม่!');
    for (let i = 0; i < 10; i++) {
      setTimeout(() => {
        burst(
          innerWidth * (0.15 + Math.random() * 0.7),
          innerHeight * (0.15 + Math.random() * 0.45),
          40
        );
      }, i * 240);
    }
    rain(90);
  }

  /* ---------- สถิติสูงสุด (localStorage) ---------- */
  const KEY = 'fruitSliceBest';
  const Record = {
    best: 0,
    startBest: 0,
    celebrated: false,
    load() {
      try { this.best = Number(localStorage.getItem(KEY)) || 0; } catch (e) { this.best = 0; }
    },
    reset() {
      this.load();
      this.startBest = this.best;
      this.celebrated = false;
    },
    update(score) {
      if (score > this.best) {
        this.best = score;
        try { localStorage.setItem(KEY, String(score)); } catch (e) {}
        if (this.startBest > 0 && !this.celebrated) {
          this.celebrated = true;
          celebrate();
        }
      }
    }
  };
  Record.load();

  window.SFX = {
    init, startMusic, stopMusic, toggleMute,
    slice, bomb, gameOver,
    applause, sparkleSound, burst, celebrate
  };
  window.Record = Record;
})();
