import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, DEFAULT_CUSTOM, readCustom, saveCustom, validateCustom, CUSTOM_KEY, profileFor } from '../public/js/characters.js';
test('five distinct added characters have designs and personalities', () => {
  assert.equal(CHARACTERS.length, 6);
  assert.equal(new Set(CHARACTERS.slice(1).map(c => c.shape)).size, 5);
  assert.equal(new Set(CHARACTERS.map(c => c.personality)).size, 6);
  assert.equal(profileFor('ghost').name, 'Phantom'); assert.equal(profileFor('ghost-clean').name, 'Ghost');
});
test('custom configuration and image roundtrip without changing legacy data', () => {
  const map = new Map([['glowFlowDataV9', 'existing']]);
  const storage = { getItem: k => map.get(k) || null, setItem: (k, v) => map.set(k, v) };
  const config = { ...DEFAULT_CUSTOM, name: 'Test', image: 'data:image/png;base64,YWJj', imageX: 10, imageScale: .8 };
  saveCustom(storage, config); assert.deepEqual(readCustom(storage), config);
  assert.equal(map.get('glowFlowDataV9'), 'existing'); assert.ok(map.has(CUSTOM_KEY));
});
test('reject unsafe image formats and clamp malformed designs', () => {
  assert.throws(() => validateCustom({ image: 'data:image/svg+xml;base64,abc' }));
  assert.throws(() => validateCustom({ image: 'https://example.com/image.png' }));
  const valid = validateCustom({ name: 'a'.repeat(100), size: 50, color: 'red; display:none', shape: 'evil', imageX: -100 });
  assert.equal(valid.name.length, 40); assert.equal(valid.size, 1.1); assert.equal(valid.color, DEFAULT_CUSTOM.color); assert.equal(valid.shape, 'nova'); assert.equal(valid.imageX, -25);
});
test('storage quota errors propagate without claiming a save succeeded', () => {
  assert.throws(() => saveCustom({ setItem() { throw new Error('quota'); } }, DEFAULT_CUSTOM), /quota/);
});
