// Coordinates are pixels, velocities pixels/second. Small fixed steps prevent tunnelling.
export const STEP = 1 / 240;
export const BOARD = { width: 400, height: 350, left: 20, right: 380, finish: 308 };
export const PINS = Array.from({ length: 8 }, (_, row) =>
  Array.from({ length: row + 1 }, (_, col) => ({ x: 200 + (2 * col - row) * 20, y: 36 + row * 34, r: 4.5 }))
).flat();
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function resolvePin(b, pin) {
  const dx = b.x - pin.x, dy = b.y - pin.y;
  const distance = Math.hypot(dx, dy), radius = b.r + pin.r;
  if (distance >= radius) return false;
  // A deterministic contact normal is used only for exactly coincident centres.
  const nx = distance > 1e-8 ? dx / distance : 0;
  const ny = distance > 1e-8 ? dy / distance : -1;
  b.x = pin.x + nx * (radius + 0.001);
  b.y = pin.y + ny * (radius + 0.001);
  const normalVelocity = b.vx * nx + b.vy * ny;
  if (normalVelocity < 0) {
    b.vx -= 1.55 * normalVelocity * nx;
    b.vy -= 1.55 * normalVelocity * ny;
    const tangent = b.vx * -ny + b.vy * nx;
    b.vx -= tangent * -ny * 0.025;
    b.vy -= tangent * nx * 0.025;
  }
  return true;
}

export function resolvePair(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy), r = a.r + b.r;
  if (d >= r) return;
  const nx = d > 1e-8 ? dx / d : 1, ny = d > 1e-8 ? dy / d : 0;
  const overlap = (r - d + 0.001) / 2;
  a.x -= nx * overlap; a.y -= ny * overlap;
  b.x += nx * overlap; b.y += ny * overlap;
  const speed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (speed < 0) {
    const impulse = -speed * 0.78;
    a.vx -= impulse * nx; a.vy -= impulse * ny;
    b.vx += impulse * nx; b.vy += impulse * ny;
  }
}

export class PlinkoWorld {
  constructor() { this.reset(); }
  reset() { this.bodies = []; this.accumulator = 0; this.time = 0; }
  drop({ x = 200, vx = 10, r = 9, id = 'ball' } = {}) {
    if (this.bodies.length >= 12) throw new Error('Maximal 12 aktive Körper');
    // A tiny release velocity avoids an ideal, perfectly balanced zero-motion contact atop a pin.
    const releaseVelocity = Math.abs(vx) < 0.5 ? (vx < 0 ? -0.5 : 0.5) : vx;
    const b = { id, x: clamp(x, 32, 368), y: 12, vx: clamp(releaseVelocity, -100, 100), vy: 0, r: clamp(r, 5, 10), bin: null };
    this.bodies.push(b); return b;
  }
  advance(seconds) {
    this.accumulator += clamp(seconds, 0, 0.1);
    while (this.accumulator >= STEP) { this.step(STEP); this.accumulator -= STEP; }
  }
  step(dt = STEP) {
    this.time += dt;
    const active = this.bodies.filter(b => b.bin === null);
    for (const b of active) {
      b.vy += 510 * dt;
      const drag = Math.exp(-0.09 * dt);
      b.vx *= drag; b.vy *= drag;
      b.vx = clamp(b.vx, -360, 360); b.vy = clamp(b.vy, -360, 360);
      b.x += b.vx * dt; b.y += b.vy * dt;
      // Only nearby rows need narrow-phase contact checks.
      for (const p of PINS) if (Math.abs(p.y - b.y) < b.r + p.r + 2) resolvePin(b, p);
      // Physical dividers guide the body into the payout bin.
      if (b.y > 287) for (let x = 60; x <= 340; x += 40) {
        const dx = b.x - x;
        if (Math.abs(dx) < b.r + 1) {
          const side = dx >= 0 ? 1 : -1;
          b.x = x + side * (b.r + 1);
          if (b.vx * side < 0) b.vx *= -0.4;
        }
      }
    }
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) resolvePair(active[i], active[j]);
    for (const b of active) {
      if (b.x < BOARD.left + b.r) { b.x = BOARD.left + b.r; b.vx = Math.abs(b.vx) * 0.6; }
      if (b.x > BOARD.right - b.r) { b.x = BOARD.right - b.r; b.vx = -Math.abs(b.vx) * 0.6; }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.5; }
      if (b.y >= BOARD.finish) {
        b.y = BOARD.finish; b.bin = clamp(Math.floor((b.x - 20) / 40), 0, 8); b.vx = b.vy = 0;
      }
    }
  }
}

export class SpringBody {
  constructor() { this.reset(); }
  reset() { this.x = this.y = this.vx = this.vy = 0; this.held = false; this.dragging = false; this.distance = 0; this.duration = 0; this.force = 0; }
  grab(x, y) { this.held = true; this.dragging = false; this.start = { x, y }; this.target = { x: this.x, y: this.y }; this.last = { x, y }; this.distance = this.duration = 0; }
  move(x, y, bounds = { x: 100, y: 75 }) {
    if (!this.held) return;
    if (Math.hypot(x - this.start.x, y - this.start.y) > 5) this.dragging = true;
    if (this.dragging) {
      this.distance += Math.min(100, Math.hypot(x - this.last.x, y - this.last.y));
      this.target = { x: clamp(x - this.start.x, -bounds.x, bounds.x), y: clamp(y - this.start.y, -bounds.y, bounds.y) };
    }
    this.last = { x, y };
  }
  release() { const moved = this.dragging; this.held = this.dragging = false; this.force = 0; return moved; }
  step(dt) {
    dt = clamp(dt, 0, 1 / 60);
    const target = this.held && this.dragging ? this.target : { x: 0, y: 0 };
    const dx = target.x - this.x, dy = target.y - this.y;
    this.force = clamp(Math.hypot(dx, dy) * 30, 0, 3500);
    const fx = clamp(dx * 90, -8000, 8000), fy = clamp(dy * 90, -8000, 8000);
    this.vx = clamp((this.vx + fx * dt) * Math.exp(-13 * dt), -550, 550);
    this.vy = clamp((this.vy + fy * dt) * Math.exp(-13 * dt), -550, 550);
    this.x = clamp(this.x + this.vx * dt, -140, 140);
    this.y = clamp(this.y + this.vy * dt, -100, 100);
    if (this.held && this.dragging) this.duration += dt;
  }
}

export function updateAnger(value, { dragging, force = 0, distance = 0, duration = 0 }, dt) {
  const rate = dragging ? 3 + clamp(force / 180, 0, 18) + clamp(distance / 50, 0, 10) + clamp(duration, 0, 7) : -4;
  return clamp(value + rate * dt, 0, 100);
}
