// ---------- Setup ----------
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score-value');
const livesEls = document.querySelectorAll('#lives .life');
const startScreen = document.getElementById('start-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const finalScoreEl = document.getElementById('final-score');

function resize() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}
window.addEventListener('resize', resize);

const FRUIT_TYPES = [
  { emoji: '🍉', r: 45 },
  { emoji: '🍊', r: 34 },
  { emoji: '🍋', r: 30 },
  { emoji: '🍎', r: 34 },
  { emoji: '🥝', r: 30 },
  { emoji: '🍍', r: 40 },
];
const BOMB = { emoji: '💣', r: 36 };
const GRAVITY = 0.32;

let objects = [];      // flying fruits / bombs
let particles = [];    // slice splatter particles
let trail = [];        // pointer trail points
let score = 0;
let lives = 3;
let running = false;
let spawnTimer = 0;
let spawnInterval = 70;
let lastTime = 0;

function reset() {
  objects = [];
  particles = [];
  trail = [];
  score = 0;
  lives = 3;
  spawnTimer = 0;
  spawnInterval = 70;
  scoreEl.textContent = '0';
  livesEls.forEach(l => l.classList.remove('lost'));
}

// ---------- Spawning ----------
function spawnObject() {
  const isBomb = Math.random() < 0.12;
  const type = isBomb ? BOMB : FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
  const x = 60 + Math.random() * (canvas.width - 120);
  const vx = (Math.random() - 0.5) * 6;
  const vy = -(14 + Math.random() * 4) - (canvas.height < 500 ? 2 : 0);
  objects.push({
    type, x, y: canvas.height + 50, vx, vy,
    r: type.r, rot: 0, vr: (Math.random() - 0.5) * 0.15,
    sliced: false, isBomb, id: Math.random(),
  });
}

// ---------- Input / slicing ----------
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX - rect.left, y: t.clientY - rect.top };
}

let pointerDown = false;
function onDown(e) { pointerDown = true; trail = [getPos(e)]; }
function onMove(e) {
  if (!pointerDown || !running) return;
  const p = getPos(e);
  trail.push(p);
  if (trail.length > 14) trail.shift();
  checkSlices(p, trail[trail.length - 2]);
}
function onUp() { pointerDown = false; trail = []; }

canvas.addEventListener('mousedown', onDown);
canvas.addEventListener('mousemove', onMove);
window.addEventListener('mouseup', onUp);
canvas.addEventListener('touchstart', e => { onDown(e); e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchmove', e => { onMove(e); e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchend', onUp);

function checkSlices(p1, p0) {
  if (!p0) return;
  for (const obj of objects) {
    if (obj.sliced) continue;
    const d = distToSegment(obj.x, obj.y, p0.x, p0.y, p1.x, p1.y);
    if (d < obj.r) sliceObject(obj);
  }
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function sliceObject(obj) {
  obj.sliced = true;
  if (obj.isBomb) {
    loseLife(true);
    spawnParticles(obj.x, obj.y, '#333', 18);
  } else {
    score += 10;
    scoreEl.textContent = score;
    spawnParticles(obj.x, obj.y, '#c1272d', 14);
    // two halves fly apart
    for (const dir of [-1, 1]) {
      objects.push({
        type: obj.type, x: obj.x, y: obj.y, vx: obj.vx + dir * 3, vy: obj.vy - 2,
        r: obj.r * 0.8, rot: obj.rot, vr: dir * 0.25, sliced: true, half: dir,
        isBomb: false, fading: 1, id: Math.random(),
      });
    }
  }
}

function spawnParticles(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    particles.push({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: 30 + Math.random() * 15, color, size: 2 + Math.random() * 3,
    });
  }
}

function loseLife(fromBomb) {
  lives--;
  const idx = 3 - lives - 1;
  if (idx >= 0 && idx < livesEls.length) livesEls[idx].classList.add('lost');
  if (lives <= 0) endGame();
}

// ---------- Game loop ----------
function update(dt) {
  spawnTimer++;
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    spawnObject();
    if (spawnInterval > 32) spawnInterval -= 0.6;
  }

  for (const obj of objects) {
    obj.vy += GRAVITY;
    obj.x += obj.vx;
    obj.y += obj.vy;
    obj.rot += obj.vr;
    if (obj.fading !== undefined) obj.fading -= 0.02;
  }

  // remove offscreen / lost fruit
  objects = objects.filter(obj => {
    if (obj.y - obj.r > canvas.height + 80) {
      if (!obj.sliced && !obj.isBomb) loseLife(false);
      return false;
    }
    if (obj.fading !== undefined && obj.fading <= 0) return false;
    return true;
  });

  for (const p of particles) {
    p.vy += GRAVITY * 0.5;
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
  }
  particles = particles.filter(p => p.life > 0);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // trail
  if (trail.length > 1) {
    ctx.beginPath();
    ctx.moveTo(trail[0].x, trail[0].y);
    for (const p of trail) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = 'rgba(224,164,88,0.9)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#fff8e0';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // particles
  for (const p of particles) {
    ctx.globalAlpha = Math.max(p.life / 40, 0);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // objects
  for (const obj of objects) {
    ctx.save();
    ctx.translate(obj.x, obj.y);
    ctx.rotate(obj.rot);
    if (obj.fading !== undefined) ctx.globalAlpha = Math.max(obj.fading, 0);
    if (obj.half) ctx.translate(obj.half * obj.r * 0.15, 0);
    ctx.font = `${obj.r * 2}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(obj.type.emoji, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

function loop(t) {
  if (!running) return;
  update();
  draw();
  requestAnimationFrame(loop);
}

function startGame() {
  resize();
  reset();
  running = true;
  startScreen.classList.add('hidden');
  gameoverScreen.classList.add('hidden');
  requestAnimationFrame(loop);
}

function endGame() {
  running = false;
  finalScoreEl.textContent = score;
  setTimeout(() => gameoverScreen.classList.remove('hidden'), 400);
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

resize();
