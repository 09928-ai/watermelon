/* game.js — Fruit Slice (มีเสียงปาด + เพลงประกอบ + ฉลองทำลายสถิติ)
   ต้องโหลด js/sfx.js ก่อนไฟล์นี้ */
(() => {
  'use strict';

  // ถ้า sfx.js โหลดไม่สำเร็จ เกมยังเล่นได้ (แค่ไม่มีเสียง)
  const noop = () => {};
  const SFX = window.SFX || {
    init: noop, startMusic: noop, stopMusic: noop,
    slice: noop, bomb: noop, gameOver: noop, burst: noop
  };
  const Record = window.Record || { reset: noop, update: noop, best: 0 };

  /* ---------- อ้างอิง element ---------- */
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score-value');
  const lifeEls = document.querySelectorAll('#lives .life');
  const startScreen = document.getElementById('start-screen');
  const gameoverScreen = document.getElementById('gameover-screen');
  const finalScoreEl = document.getElementById('final-score');
  const startBtn = document.getElementById('start-btn');
  const restartBtn = document.getElementById('restart-btn');

  /* ---------- ค่าคงที่ ---------- */
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  const FRUITS = [
    { e: '🍉', c: '#ff3b5c' }, { e: '🍎', c: '#e11d2e' }, { e: '🍊', c: '#ff9f1c' },
    { e: '🍋', c: '#ffe14d' }, { e: '🍇', c: '#8b3fd9' }, { e: '🍓', c: '#ff2d55' },
    { e: '🍍', c: '#ffd23f' }, { e: '🥝', c: '#7ac943' }, { e: '🍑', c: '#ff9a8b' }
  ];
  const BOMB = { e: '💣', c: '#555555' };
  const MAX_LIVES = 3;

  /* ---------- สถานะเกม ---------- */
  let W = 0, H = 0, dpr = 1, G = 1000, R = 34;
  let state = 'idle'; // idle | playing | ending
  let score = 0, lives = MAX_LIVES;
  let objs = [], pieces = [], parts = [], texts = [], trail = [];
  let spawnTimer = 0, endTimer = 0, flash = 0;
  let pointerDown = false, lastP = null, swipeHits = 0;
  let lastT = 0;

  /* ---------- ขนาด canvas ---------- */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    let w = rect.width, h = rect.height;
    if (w < 50 || h < 50) { // กรณี CSS ไม่ได้กำหนดขนาด canvas
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = w;
    H = h;
    G = H * 1.6;                                   // แรงโน้มถ่วง
    R = Math.max(28, Math.min(W, H) * 0.085);      // รัศมีผลไม้
  }
  window.addEventListener('resize', resize);
  canvas.style.touchAction = 'none';
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------- HUD ---------- */
  function updateHud() {
    scoreEl.textContent = score;
    lifeEls.forEach((el, i) => {
      const on = i < lives;
      el.style.opacity = on ? '1' : '0.25';
      el.style.filter = on ? 'none' : 'grayscale(1)';
    });
  }

  /* ---------- สร้างผลไม้/ระเบิด ---------- */
  function spawnOne() {
    const isBomb = score >= 5 && Math.random() < Math.min(0.2, 0.08 + score * 0.002);
    const t = isBomb ? BOMB : FRUITS[(Math.random() * FRUITS.length) | 0];
    const r = R * (isBomb ? 0.95 : 0.9 + Math.random() * 0.25);
    const x = W * (0.15 + Math.random() * 0.7);
    const apexH = H * (0.55 + Math.random() * 0.3);
    const vy = -Math.sqrt(2 * G * apexH);
    const tApex = -vy / G;
    const tx = W * (0.25 + Math.random() * 0.5);
    const vx = ((tx - x) / tApex) * 0.8;
    objs.push({
      x, y: H + r, vx, vy, r,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 6,
      bomb: isBomb, t
    });
  }

  function spawnWave() {
    let n = 1;
    if (Math.random() < Math.min(0.65, 0.2 + score * 0.012)) n++;
    if (score > 20 && Math.random() < 0.35) n++;
    for (let i = 0; i < n; i++) spawnOne();
    spawnTimer = Math.max(0.6, 1.3 - score * 0.012);
  }

  /* ---------- ฟัน ---------- */
  function segDist(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - a.x) * dx + (py - a.y) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
  }

  function burstParticles(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const sp = (0.3 + Math.random()) * speed;
      parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80,
        g: G * 0.5, r: 3 + Math.random() * 5, c: color,
        age: 0, life: 0.5 + Math.random() * 0.45
      });
    }
  }

  function sliceObj(o, a, b) {
    const idx = objs.indexOf(o);
    if (idx >= 0) objs.splice(idx, 1);

    if (o.bomb) {
      SFX.bomb();
      flash = 1;
      burstParticles(o.x, o.y, '#ff9f1c', 26, 420);
      burstParticles(o.x, o.y, '#444444', 18, 300);
      endGame(true);
      return;
    }

    score++;
    swipeHits++;
    SFX.slice();

    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const cutA = ang - o.rot;
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    [-1, 1].forEach((s) => {
      pieces.push({
        x: o.x, y: o.y,
        vx: o.vx + s * nx * 140, vy: o.vy + s * ny * 140 - 40,
        rot: o.rot, vr: o.vr + s * 2,
        r: o.r, e: o.t.e, cutA, side: s, age: 0
      });
    });
    burstParticles(o.x, o.y, o.t.c, 14, 260);

    updateHud();
    Record.update(score); // ทำลายสถิติ -> ปรบมือ + ประกาย
  }

  function handleSwipe(a, b) {
    if (state !== 'playing') return;
    if ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 < 4) return;
    for (const o of objs.slice()) {
      if (state !== 'playing') break;
      if (segDist(o.x, o.y, a, b) <= o.r * 1.05) sliceObj(o, a, b);
    }
  }

  /* ---------- Pointer (เมาส์ + นิ้ว) ---------- */
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: e.clientX - r.left, y: e.clientY - r.top,
      cx: e.clientX, cy: e.clientY, t: performance.now()
    };
  }

  canvas.addEventListener('pointerdown', (e) => {
    pointerDown = true;
    lastP = pos(e);
    swipeHits = 0;
    trail = [lastP];
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointerDown) return;
    const p = pos(e);
    handleSwipe(lastP, p);
    trail.push(p);
    lastP = p;
  });

  function endSwipe() {
    if (!pointerDown) return;
    pointerDown = false;
    // ฟันต่อเนื่อง 3 ชิ้นขึ้นไปในการลากครั้งเดียว = โบนัสคอมโบ
    if (swipeHits >= 3 && state === 'playing' && lastP) {
      const bonus = swipeHits;
      score += bonus;
      texts.push({ x: lastP.x, y: lastP.y, text: 'COMBO x' + swipeHits + '  +' + bonus, age: 0 });
      if (SFX.burst) SFX.burst(lastP.cx, lastP.cy, 24);
      updateHud();
      Record.update(score);
    }
    swipeHits = 0;
  }
  canvas.addEventListener('pointerup', endSwipe);
  canvas.addEventListener('pointercancel', endSwipe);

  /* ---------- เริ่ม / จบเกม ---------- */
  function startGame() {
    resize();
    score = 0;
    lives = MAX_LIVES;
    objs = []; pieces = []; parts = []; texts = []; trail = [];
    flash = 0;
    spawnTimer = 0.4;
    startScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');
    updateHud();

    SFX.init();        // ต้องเรียกตอนผู้เล่นกดปุ่ม
    SFX.startMusic();  // เพลงประกอบ
    Record.reset();

    state = 'playing';
  }

  function endGame(byBomb) {
    if (state !== 'playing') return;
    state = 'ending';
    endTimer = byBomb ? 0.9 : 0.35;
    SFX.stopMusic();
  }

  function finishGame() {
    state = 'idle';
    finalScoreEl.textContent = score;
    gameoverScreen.classList.remove('hidden');
    SFX.gameOver();
  }

  function missFruit() {
    lives--;
    updateHud();
    if (lives <= 0) endGame(false);
  }

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);

  /* ---------- อัปเดตฟิสิกส์ ---------- */
  function update(dt) {
    if (state === 'playing') {
      spawnTimer -= dt;
      if (spawnTimer <= 0) spawnWave();
    }

    objs = objs.filter((o) => {
      o.vy += G * dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.rot += o.vr * dt;
      if (o.y - o.r > H && o.vy > 0) {
        if (!o.bomb && state === 'playing') missFruit();
        return false;
      }
      return true;
    });

    pieces = pieces.filter((p) => {
      p.age += dt;
      p.vy += G * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      return p.y - p.r < H + p.r * 2 && p.age < 3;
    });

    parts = parts.filter((p) => {
      p.age += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      return p.age < p.life;
    });

    texts = texts.filter((t) => {
      t.age += dt;
      t.y -= 40 * dt;
      return t.age < 0.9;
    });

    if (flash > 0) flash = Math.max(0, flash - dt * 2);

    if (state === 'ending') {
      endTimer -= dt;
      if (endTimer <= 0) finishGame();
    }
  }

  /* ---------- วาด ---------- */
  function drawEmoji(em, x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.font = Math.round(r * 1.9) + 'px ' + EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(em, 0, 0);
    ctx.restore();
  }

  function drawPiece(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot + p.cutA);
    ctx.beginPath();
    ctx.rect(-p.r * 2, p.side < 0 ? -p.r * 2 : 0, p.r * 4, p.r * 2);
    ctx.clip();
    ctx.rotate(-p.cutA);
    ctx.font = Math.round(p.r * 1.9) + 'px ' + EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.e, 0, 0);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // ละอองน้ำผลไม้
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const o of objs) drawEmoji(o.t.e, o.x, o.y, o.r, o.rot);
    for (const p of pieces) drawPiece(p);

    // รอยฟัน
    const now = performance.now();
    trail = trail.filter((p) => now - p.t < 180);
    if (trail.length > 1) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i];
        const k = 1 - (now - b.t) / 180;
        ctx.strokeStyle = 'rgba(255,255,255,' + k.toFixed(2) + ')';
        ctx.lineWidth = 2 + 8 * k;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // ข้อความคอมโบ
    for (const t of texts) {
      ctx.globalAlpha = Math.max(0, 1 - t.age / 0.9);
      ctx.font = '800 ' + Math.round(R * 0.6) + 'px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#7c2d12';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = '#ffe066';
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    // แฟลชตอนระเบิด
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.8).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---------- ลูปหลัก ---------- */
  function frame(t) {
    if (!lastT) lastT = t;
    const dt = Math.min(0.033, (t - lastT) / 1000);
    lastT = t;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  resize();
  updateHud();
  requestAnimationFrame(frame);
})();
