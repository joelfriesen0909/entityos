import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlinkoWorld, resolvePin, resolvePair, SpringBody, updateAnger, STEP, PINS } from '../public/js/physics.js';

test('pin contact separates overlap and reflects only incoming velocity', () => {
  const b = { x: 0, y: -10, vx: 0, vy: 150, r: 7 };
  const pin = { x: 0, y: 0, r: 5 };
  assert.equal(resolvePin(b, pin), true);
  assert.ok(b.y < -12); assert.ok(b.vy < 0);
  const speed = b.vy; resolvePin(b, pin); assert.equal(b.vy, speed);
});
test('body collisions separate and conserve momentum with restitution', () => {
  const a = { x: 0, y: 0, vx: 100, vy: 0, r: 9 }, b = { x: 15, y: 0, vx: -100, vy: 0, r: 9 };
  resolvePair(a, b); assert.ok(b.x - a.x >= 18); assert.ok(a.vx < 0); assert.ok(b.vx > 0);
  assert.equal(a.vx + b.vx, 0);
});
test('200 varied drops remain bounded, do not penetrate pins and reach a valid bin', () => {
  const bins = new Set();
  for (let n = 0; n < 200; n++) {
    const world = new PlinkoWorld();
    const body = world.drop({ x: 180 + n % 41, vx: (n % 37 - 18) * 1.3 });
    for (let step = 0; step < 240 * 30 && body.bin === null; step++) {
      world.step();
      assert.ok(Number.isFinite(body.x + body.y + body.vx + body.vy));
      assert.ok(body.x >= 20 + body.r && body.x <= 380 - body.r);
      for (const pin of PINS) assert.ok(Math.hypot(body.x - pin.x, body.y - pin.y) >= body.r + pin.r - 0.01);
    }
    assert.notEqual(body.bin, null, `drop ${n} stuck at ${body.x},${body.y}`);
    assert.ok(body.bin >= 0 && body.bin < 9); bins.add(body.bin);
  }
  assert.ok(bins.size >= 4, `only ${bins.size} bins reached`);
});
test('fixed steps are independent of rendering frame rate and stalls are capped', () => {
  const a = new PlinkoWorld(), b = new PlinkoWorld();
  const aa = a.drop({ x: 205, vx: 10 }), bb = b.drop({ x: 205, vx: 10 });
  for (let i = 0; i < 60; i++) a.advance(1 / 60);
  for (let i = 0; i < 120; i++) b.advance(1 / 120);
  assert.ok(Math.abs(aa.x - bb.x) < 1e-8); assert.ok(Math.abs(aa.y - bb.y) < 1e-8);
  const before = a.time; a.advance(60); assert.ok(a.time - before < .11);
});
test('a central release cannot remain perfectly balanced atop the first pin', () => {
  const world = new PlinkoWorld(), b = world.drop({ x: 200, vx: 0 });
  for (let i = 0; i < 240 * 30 && b.bin === null; i++) world.step();
  assert.notEqual(b.bin, null);
});
test('multiple bodies remain finite, reset removes all simulation state', () => {
  const world = new PlinkoWorld();
  for (let i = 0; i < 8; i++) world.drop({ x: 170 + i * 8, vx: i - 4 });
  for (let i = 0; i < 240 * 12; i++) world.step();
  for (const b of world.bodies) assert.ok(Number.isFinite(b.x + b.y + b.vx + b.vy));
  world.reset(); assert.deepEqual(world.bodies, []); assert.equal(world.time, 0); assert.equal(world.accumulator, 0);
});
test('grab threshold, bounded spring forces and release return the body to rest', () => {
  const b = new SpringBody(); b.grab(0, 0); b.move(2, 2); assert.equal(b.dragging, false);
  b.move(10000, -10000); assert.equal(b.dragging, true); assert.equal(b.target.x, 100);
  for (let i = 0; i < 240; i++) b.step(STEP);
  assert.ok(b.x <= 140 && b.y >= -100); assert.ok(b.force <= 3500); assert.ok(b.duration > .9);
  assert.equal(b.release(), true);
  for (let i = 0; i < 240 * 5; i++) b.step(STEP);
  assert.ok(Math.abs(b.x) < .01 && Math.abs(b.y) < .01);
  b.reset(); assert.equal(b.duration, 0); assert.equal(b.held, false);
});
test('anger increases with force, distance and duration, decays smoothly and stays bounded', () => {
  const mild = updateAnger(10, { dragging: true, force: 0 }, 1);
  const strong = updateAnger(10, { dragging: true, force: 2500, distance: 800, duration: 10 }, 1);
  assert.ok(strong > mild); assert.equal(updateAnger(99, { dragging: true, force: 3500 }, 1), 100);
  assert.equal(updateAnger(20, { dragging: false }, 1), 16); assert.equal(updateAnger(1, { dragging: false }, 1), 0);
});
