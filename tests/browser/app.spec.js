import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Keep test output deterministic: fonts are optional and speech synthesis is not an automated device check.
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto('/'); await expect(page.locator('#character-name')).toHaveText('Cyber');
  await page.evaluate(() => { if (!isMuted) toggleMute(); });
});

test('existing tasks, coins, XP, ingredient list and stored data still work', async ({ page }) => {
  await page.locator('#face-input').fill('Zähne putzen'); await page.locator('#face-input').press('Enter');
  await expect(page.locator('#face-list .item-text')).toHaveText('Zähne putzen');
  await page.locator('#face-list .chk-container').click();
  await expect(page.locator('#disp-coins-task')).not.toHaveText('0');
  await page.locator('#hair-input').fill('Aloe'); await page.locator('#hair-input').press('Enter');
  const before = await page.evaluate(() => ({ xp: player.xp, coins: player.coinsTask }));
  await page.reload();
  await expect(page.locator('#face-list input')).toBeChecked();
  await expect(page.locator('#hair-list .item-text')).toHaveText('Aloe');
  expect(await page.evaluate(() => ({ xp: player.xp, coins: player.coinsTask }))).toEqual(before);
});

test('task text is rendered safely as text', async ({ page }) => {
  const text = '<img src=x onerror="window.injected=true">';
  await page.locator('#face-input').fill(text); await page.locator('#face-input').press('Enter');
  await expect(page.locator('#face-list .item-text')).toHaveText(text);
  expect(await page.evaluate(() => Boolean(window.injected))).toBe(false);
});

test('five new designs activate and each has two matching hands', async ({ page }) => {
  for (const [id, name, shape] of [['nova','Nova','nova'],['milo','Milo','milo'],['ghost-clean','Ghost','ghost'],['pixel','Pixel','pixel'],['onyx','Onyx','onyx']]) {
    await page.locator('#choose-character').click(); await page.locator(`.character-card[data-id="${id}"]`).click();
    await expect(page.locator('#character-name')).toHaveText(name);
    await expect(page.locator('#bot-face')).toHaveAttribute('data-design', shape);
    await expect(page.locator('#bot-face .character-hand')).toHaveCount(2);
  }
  await page.reload(); await expect(page.locator('#character-name')).toHaveText('Onyx');
});

test('hands follow the pointer; drag increases anger and release settles; reset preserves progress', async ({ page }) => {
  await page.evaluate(() => { player.coinsTask = 20; player.xp = 37; saveData(); updateHUD(); });
  const box = await page.locator('#bot-face').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 100, y - 25, { steps: 12 });
  await expect(page.locator('#bot-face')).toHaveClass(/is-dragging/);
  await expect.poll(() => page.evaluate(() => EntityApp.interaction.body.x)).toBeGreaterThan(20);
  await expect.poll(() => page.evaluate(() => EntityApp.interaction.getAnger())).toBeGreaterThan(4);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => Math.abs(EntityApp.interaction.body.x))).toBeLessThan(1);
  const transform = await page.locator('#bot-face .character-hand.left').evaluate(e => e.style.transform);
  expect(transform).not.toContain('translate(0px, 0px)');
  await page.locator('#reset-level').click();
  expect(await page.evaluate(() => EntityApp.interaction.getAnger())).toBe(0);
  expect(await page.evaluate(() => ({ coins: player.coinsTask, xp: player.xp }))).toEqual({ coins: 20, xp: 37 });
});

test('Plinko settles from physical landing and reset cancels and refunds exactly once', async ({ page }) => {
  await page.evaluate(() => { player.coinsTask = 20; saveData(); updateHUD(); openGamePlinko(); });
  await page.locator('#btn-play').click();
  await page.locator('#scene-reset').click();
  expect(await page.evaluate(() => ({ coins: player.coinsTask, busy: gameBusy, count: EntityApp.world.bodies.length, raf: EntityApp.plinkoRAF }))).toEqual({ coins: 20, busy: false, count: 0, raf: null });
  await page.locator('#scene-reset').click(); expect(await page.evaluate(() => player.coinsTask)).toBe(20);
  await page.locator('#btn-play').click();
  await expect(page.locator('#game-msg')).toContainText('Feld', { timeout: 30000 });
  expect(await page.evaluate(() => ({ coins: player.coinsTask, busy: gameBusy }))).toEqual({ coins: 19, busy: false });
});

test('closing Plinko does not settle a stale round after reopening another game', async ({ page }) => {
  await page.evaluate(() => { player.coinsTask = 10; saveData(); openGamePlinko(); startPlinko(); closeActivity(); openGameSlots(); });
  await expect(page.locator('#act-title')).toHaveText('Automaten');
  expect(await page.evaluate(() => player.coinsTask)).toBe(10);
  expect(await page.evaluate(() => EntityApp.plinkoRound)).toBeNull();
});

test('touch pointer capture supports dragging and cancellation on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const box = await page.locator('#bot-face').boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 35, y: point.y - 25 }] });
  await expect(page.locator('#bot-face')).toHaveClass(/is-dragging/);
  await expect.poll(() => page.evaluate(() => EntityApp.interaction.getAnger())).toBeGreaterThan(1);
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('#bot-face')).not.toHaveClass(/is-held/);
  expect(await page.evaluate(() => EntityApp.interaction.body.held)).toBe(false);
});

test('legacy casino games, unlocked skins and shop remain accessible; timers settle only once', async ({ page }) => {
  await page.evaluate(() => { player.coinsTask = 50; player.coinsWin = 20; unlockAllSkins(); toggleMute(); });
  for (const [open, title] of [['openGameScratch', 'Rubbellos'], ['openGamePack', 'Packdraw'], ['openGameBlackjack', 'Blackjack'], ['openGameSlots', 'Automaten'], ['openGameWheel', 'Glücksrad']]) {
    await page.evaluate(name => window[name](), open);
    await expect(page.locator('#act-title')).toHaveText(title);
    if (open === 'openGameScratch') { await page.locator('#btn-play').click(); await page.evaluate(() => runAbort()); }
    if (open === 'openGamePack') { await page.locator('#btn-play').click(); await page.locator('#pk-2').click(); }
    if (open === 'openGameBlackjack') { await page.locator('#bj-deal').click(); await page.evaluate(() => { if (bj.state === 'play') bjStand(); }); }
    if (open === 'openGameSlots' || open === 'openGameWheel') { await page.locator('#btn-play').click(); await page.evaluate(() => runAbort()); }
    expect(await page.evaluate(() => gameBusy)).toBe(false);
  }
  const chips = await page.evaluate(() => player.coinsWin);
  await page.evaluate(() => { closeActivity(); EntityApp.selectCharacter('robot'); openShop(); });
  await expect(page.locator('#act-title')).toHaveText('Schwarzmarkt');
  await expect(page.locator('.sub-item')).toHaveCount(20);
  await page.waitForTimeout(4400); expect(await page.evaluate(() => player.coinsWin)).toBe(chips);
  expect(await page.evaluate(() => player.currentSkin)).toBe('robot');
});

test('custom sprite upload, live controls, save and reload persist', async ({ page }) => {
  await page.locator('#edit-character').click(); await page.locator('#custom-name').fill('Luma');
  await page.locator('#custom-color').fill('#aaccee');
  await page.locator('#character-upload').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') });
  await expect(page.locator('#editor-preview .character-image')).toBeVisible();
  await page.locator('#custom-imageScale').fill('0.8'); await page.locator('#custom-imageX').fill('10');
  await expect(page.locator('#preview-name')).toHaveText('Luma');
  await page.locator('#save-character').click(); await expect(page.locator('#character-name')).toHaveText('Luma');
  await page.reload(); await expect(page.locator('#character-name')).toHaveText('Luma');
  const saved = await page.evaluate(() => EntityApp.custom);
  expect(saved.image).toMatch(/^data:image\/(webp|png);base64,/); expect(saved.imageScale).toBe(.8); expect(saved.imageX).toBe(10);
  await expect(page.locator('#bot-face .character-image')).toBeVisible();
});

test('editor rejects unsupported and oversized files without replacing the current sprite', async ({ page }) => {
  await page.locator('#edit-character').click();
  await page.locator('#character-upload').setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.locator('#editor-error')).toContainText('PNG');
  await page.locator('#character-upload').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(3 * 1024 * 1024 + 1) });
  await expect(page.locator('#editor-error')).toContainText('3 MB');
});

test('AI missing-key path displays error and restores typed input', async ({ page }) => {
  await page.locator('#chat-input').fill('Hallo'); await page.locator('.send-button').click();
  await expect(page.locator('#voice-error')).toContainText('AI_API_KEY');
  await expect(page.locator('#chat-input')).toHaveValue('Hallo');
  await expect(page.locator('#chat-log .user')).toHaveCount(1);
  await expect(page.locator('#chat-log .assistant')).toHaveCount(0);
});

test('chat transport includes context and separates character conversations (intercepted test backend)', async ({ page }) => {
  const payloads = [];
  await page.route('**/api/chat', async route => {
    payloads.push(route.request().postDataJSON());
    await route.fulfill({ json: { reply: `Transport-Test ${payloads.length}` } });
  });
  for (const text of ['Ich heiße Alex.', 'Wie heiße ich?']) {
    await page.locator('#chat-input').fill(text); await page.locator('.send-button').click();
    await expect(page.locator('#chat-log .assistant')).toHaveCount(payloads.length);
  }
  expect(payloads[1].messages).toEqual([{ role: 'user', content: 'Ich heiße Alex.' }, { role: 'assistant', content: 'Transport-Test 1' }, { role: 'user', content: 'Wie heiße ich?' }]);
  await page.evaluate(() => EntityApp.selectCharacter('milo'));
  await expect(page.locator('#chat-log .chat-message')).toHaveCount(0);
  await page.locator('#chat-input').fill('Hallo Milo'); await page.locator('.send-button').click();
  await expect(page.locator('#chat-log .assistant')).toHaveCount(1);
  expect(payloads[2].character).toBe('milo'); expect(payloads[2].messages).toHaveLength(1);
  await page.evaluate(() => EntityApp.selectCharacter('cyber'));
  await expect(page.locator('#chat-log .chat-message')).toHaveCount(4);
});

test('interruption discards late AI replies and resets animation state (intercepted test backend)', async ({ page }) => {
  let release; let seen;
  const seenRequest = new Promise(resolve => { seen = resolve; });
  await page.route('**/api/chat', async route => {
    seen(); await new Promise(resolve => { release = resolve; });
    await route.fulfill({ json: { reply: 'Late transport test' } }).catch(() => {});
  });
  await page.locator('#chat-input').fill('Hallo'); await page.locator('.send-button').click(); await seenRequest;
  await expect(page.locator('#voice-status')).toContainText('denke');
  await page.locator('#stop-voice').click(); release();
  await expect(page.locator('#voice-status')).toContainText('Bereit');
  await expect(page.locator('#chat-log .assistant')).toHaveCount(0);
});

for (const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['compact-desktop', { width: 1280, height: 720 }], ['tablet', { width: 768, height: 1024 }], ['mobile', { width: 390, height: 844 }]]) {
  test(`responsive layout at ${label} has no horizontal overflow or runtime exceptions`, async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize(viewport); await page.reload();
    await expect(page.locator('#voice-panel')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#choose-character').click(); await expect(page.locator('#character-dialog')).toBeVisible();
    await page.screenshot({ path: `test-results/${label}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}
