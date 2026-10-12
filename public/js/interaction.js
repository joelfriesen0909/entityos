import { SpringBody, clamp, updateAnger } from './physics.js';

export class CharacterInteraction {
  constructor(node, stage, onAnger) {
    this.node = node; this.stage = stage; this.onAnger = onAnger;
    this.body = new SpringBody(); this.anger = new Map(); this.id = 'cyber';
    this.pointer = { x: 0, y: 0 }; this.hands = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    this.pointerId = null;
    const wrap = node.querySelector('.face-idle-wrap');
    for (const side of ['left', 'right']) {
      const arm = document.createElement('div'); arm.className = `character-arm ${side}`; arm.setAttribute('aria-hidden', 'true');
      const hand = document.createElement('div'); hand.className = `character-hand ${side}`; hand.title = 'Hand greifen und ziehen';
      wrap.append(arm, hand);
    }
    node.style.touchAction = 'none';
    node.addEventListener('pointerdown', e => this.grab(e));
    node.addEventListener('pointermove', e => this.move(e));
    node.addEventListener('pointerup', e => this.release(e));
    node.addEventListener('pointercancel', e => this.release(e, true));
    node.addEventListener('lostpointercapture', e => this.release(e, true));
    node.addEventListener('click', e => {
      if (this.suppressClick) { e.stopImmediatePropagation(); this.suppressClick = false; }
    }, true);
    document.addEventListener('pointermove', e => {
      const r = stage.getBoundingClientRect();
      this.pointer = { x: clamp((e.clientX - (r.left + r.width / 2)) / 200, -1, 1), y: clamp((e.clientY - (r.top + r.height / 2)) / 200, -1, 1) };
    }, { passive: true });
    window.addEventListener('blur', () => this.release(null, true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.release(null, true); });
  }
  grab(e) {
    if (this.pointerId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    this.pointerId = e.pointerId; this.node.setPointerCapture(e.pointerId);
    this.body.grab(e.clientX - this.body.x, e.clientY - this.body.y);
    // The target is relative to the original pointer, including the current body offset.
    this.grabOffset = { x: this.body.x, y: this.body.y };
    this.body.start = { x: e.clientX, y: e.clientY };
    this.body.last = { x: e.clientX, y: e.clientY };
    this.node.classList.add('is-held');
    this.suppressClick = false;
  }
  move(e) {
    if (e.pointerId !== this.pointerId) return;
    const scale = parseFloat(getComputedStyle(this.node).scale) || 1;
    const bounds = { x: Math.max(0, (this.stage.clientWidth - 300 * scale) / 2), y: Math.max(0, (this.stage.clientHeight - 230 * scale) / 2) };
    this.body.move(e.clientX, e.clientY, bounds);
    if (this.body.dragging) {
      this.body.target.x = clamp(this.body.target.x + this.grabOffset.x, -bounds.x, bounds.x);
      this.body.target.y = clamp(this.body.target.y + this.grabOffset.y, -bounds.y, bounds.y);
      this.node.classList.add('is-dragging');
    }
  }
  release(e, cancelled = false) {
    if (this.pointerId === null || (e && e.pointerId !== this.pointerId)) return;
    const id = this.pointerId; this.pointerId = null;
    const dragged = this.body.release();
    this.suppressClick = dragged || cancelled;
    this.node.classList.remove('is-held', 'is-dragging');
    if (this.node.hasPointerCapture(id)) this.node.releasePointerCapture(id);
  }
  setCharacter(id) { this.release(null, true); this.body.reset(); this.id = id; }
  getAnger() { return this.anger.get(this.id) || 0; }
  reset() { this.release(null, true); this.body.reset(); this.anger.clear(); this.pointer = { x: 0, y: 0 }; }
  update(dt, now) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120))), sub = dt / steps;
    for (let i = 0; i < steps; i++) this.body.step(sub);
    for (const [id, value] of this.anger) if (id !== this.id) this.anger.set(id, Math.max(0, value - dt * 4));
    const anger = updateAnger(this.getAnger(), this.body, dt);
    this.anger.set(this.id, anger);
    this.node.style.setProperty('--anger', anger / 100);
    this.node.dataset.anger = anger > 70 ? 'furious' : anger > 35 ? 'irritated' : 'calm';
    this.node.style.translate = `${this.body.x}px ${this.body.y}px`;
    this.node.style.rotate = `${clamp(this.body.vx / 35, -10, 10)}deg`;
    this.node.style.transform = `rotateY(${this.pointer.x * 9}deg) rotateX(${-this.pointer.y * 6}deg)`;
    const mood = this.node.dataset.voice;
    const speaking = mood === 'speaking' ? Math.sin(now * 0.012) * 5 : 0;
    const listening = mood === 'listening' ? -10 : mood === 'thinking' ? -5 : 0;
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1, h = this.hands[i];
      // Independent targets stay outside the silhouette, with different response times.
      const tx = sign * clamp(4 + this.pointer.x * sign * 8 + anger / 12, 0, 22);
      const ty = this.pointer.y * (i ? 12 : 16) + speaking * sign + listening - anger / 15;
      const ease = 1 - Math.exp(-(i ? 5 : 7) * dt);
      h.x += (tx - h.x) * ease; h.y += (ty - h.y) * ease;
      const side = i === 0 ? 'left' : 'right';
      this.node.querySelector(`.character-hand.${side}`).style.transform = `translate(${h.x}px, ${h.y}px) rotate(${clamp(h.y * sign / 2, -14, 14)}deg)`;
      this.node.querySelector(`.character-arm.${side}`).style.transform = `scaleX(${1 + Math.abs(h.x) / 36}) rotate(${h.y * sign / 4}deg)`;
    }
    this.node.querySelectorAll('.pupil').forEach(p => { p.style.transform = `translate(${this.pointer.x * 6}px, ${this.pointer.y * 5}px)`; });
    this.onAnger(anger);
  }
}
