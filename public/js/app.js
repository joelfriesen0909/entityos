import { CHARACTERS, DEFAULT_CUSTOM, profileFor, readCustom, saveCustom, prepareImage, avatarMarkup, paintProfile } from './characters.js';
import { CharacterInteraction } from './interaction.js';
import { PlinkoWorld, clamp } from './physics.js';
import { VoiceController } from './voice.js';

const $ = id => document.getElementById(id);
const states = { idle: 'Bereit zum Gespräch', listening: 'Ich höre zu …', thinking: 'Ich denke nach …', speaking: 'Ich spreche …' };
const app = {
  ready: false, current: null, custom: null, draft: null,
  world: new PlinkoWorld(), plinkoRAF: null, plinkoRound: null, sprite: null,
  init() {
    if (this.ready) return;
    this.ready = true;
    try { this.custom = readCustom(localStorage); }
    catch { this.notice('Gespeicherter Custom-Charakter konnte nicht gelesen werden. Die bestehenden Daten wurden beibehalten.'); }
    const select = $('skin-selector');
    for (const profile of CHARACTERS.slice(1)) select.add(new Option(profile.name, profile.id));
    select.add(new Option('Eigener Charakter', 'custom'));
    this.interaction = new CharacterInteraction($('bot-face'), $('face-wrap'), value => {
      $('anger-meter').value = value;
      $('anger-label').textContent = value > 70 ? 'Wütend' : value > 35 ? 'Gereizt' : 'Entspannt';
      $('anger-value').textContent = `${Math.round(value)} %`;
    });
    this.voice = new VoiceController({
      profile: () => this.current, anger: () => this.interaction.getAnger(),
      onState: state => {
        $('voice-status').textContent = states[state];
        $('bot-face').dataset.voice = state;
        $('voice-panel').dataset.state = state;
        $('mic-btn').textContent = state === 'listening' ? '■ Aufnahme beenden' : '● Mikrofon';
        $('mic-btn').setAttribute('aria-pressed', String(state === 'listening'));
        $('stop-voice').disabled = state === 'idle';
        document.body.classList.toggle('is-talking', state === 'speaking');
      },
      log: (role, text) => this.addMessage(role, text),
      onError: message => { $('voice-error').textContent = message; },
      onDraft: text => { $('chat-input').value = text; },
    });
    $('mic-btn').onclick = () => this.voice.toggleMic();
    $('vol-slider').addEventListener('input', () => { this.voice.volume = Number($('vol-slider').value); });
    $('stop-voice').onclick = () => this.voice.interrupt();
    $('voice-form').onsubmit = event => {
      event.preventDefault(); const text = $('chat-input').value.trim();
      if (text) { $('chat-input').value = ''; this.voice.send(text); }
    };
    $('choose-character').onclick = () => { this.renderChoices(); $('character-dialog').showModal(); };
    $('edit-character').onclick = () => this.openEditor();
    $('reset-level').onclick = () => this.resetLevel();
    document.querySelectorAll('[data-close-dialog]').forEach(button => { button.onclick = () => button.closest('dialog').close(); });
    for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
    const editor = $('character-form');
    editor.addEventListener('input', e => { if (e.target.id !== 'character-upload') this.refreshDraft(); });
    editor.addEventListener('submit', e => { e.preventDefault(); this.saveEditor(); });
    $('character-upload').onchange = async event => {
      const file = event.target.files[0]; if (!file) return;
      const generation = ++this.uploadGeneration;
      $('editor-error').textContent = ''; $('save-character').disabled = true;
      try {
        const image = await prepareImage(file);
        if (generation === this.uploadGeneration) { this.draft.image = image; this.previewDraft(); }
      } catch (error) { if (generation === this.uploadGeneration) $('editor-error').textContent = error.message; }
      finally { if (generation === this.uploadGeneration) $('save-character').disabled = false; event.target.value = ''; }
    };
    $('remove-image').onclick = () => { ++this.uploadGeneration; this.draft.image = ''; $('save-character').disabled = false; this.previewDraft(); };
    this.selectCharacter(player.currentSkin, false);
    let previous = performance.now();
    const frame = now => {
      this.interaction.update(Math.min((now - previous) / 1000, 0.05), now);
      previous = now; this.interactionRAF = requestAnimationFrame(frame);
    };
    this.interactionRAF = requestAnimationFrame(frame);
    window.addEventListener('pagehide', () => { this.voice.dispose(); this.cancelPlinko(); cancelAnimationFrame(this.interactionRAF); });
    window.addEventListener('pageshow', event => { if (event.persisted) { previous = performance.now(); this.interactionRAF = requestAnimationFrame(frame); } });
    fetch('/api/health').then(r => r.json()).then(result => {
      $('ai-config-status').textContent = result.aiConfigured ? 'KI konfiguriert · Browser-Sprache' : 'KI-Schlüssel fehlt · Texteingabe bereit';
      if (!result.aiConfigured) $('voice-error').textContent = 'Für echte KI-Antworten: AI_API_KEY auf dem Server konfigurieren. Es werden keine Antworten simuliert.';
    }).catch(() => { $('ai-config-status').textContent = 'Server nicht erreichbar'; });
    if (!this.voice.Recognition) $('mic-btn').title = 'Keine Browser-Spracherkennung verfügbar; Texteingabe verwenden.';
  },
  notice(text) { $('app-notice').textContent = text; },
  selectCharacter(id, announce = true) {
    if (id === 'custom' && !this.custom && !this.current) { this.notice('Custom-Charakter in diesem Browser nicht vorhanden. Cyber wurde aktiviert.'); id = 'cyber'; }
    if (id === 'custom' && !this.custom) { this.openEditor(); $('skin-selector').value = this.current?.id || 'cyber'; return; }
    const isNew = CHARACTERS.some(c => c.id === id);
    if (!isNew && id !== 'custom' && !player.unlockedSkins.includes(id)) return;
    this.voice?.switchCharacter();
    clearTimeout(this.bubbleTimer); $('speech-bubble').classList.remove('show');
    this.current = profileFor(id, this.custom);
    this.interaction.setCharacter(this.current.id);
    player.currentSkin = this.current.id;
    document.body.className = document.body.className.replace(/theme-[\w-]+/g, '').trim();
    document.body.classList.add(`theme-${isNew || id === 'custom' ? 'cyber' : id}`);
    $('bot-face').dataset.character = id;
    paintProfile($('bot-face'), this.current);
    if (!isNew && id !== 'custom' || id === 'cyber') $('bot-face').removeAttribute('data-design');
    $('character-name').textContent = this.current.name;
    $('character-subtitle').textContent = id === 'custom' ? 'Dein eigener Begleiter' : { nova: 'Neugierig. Präzise. Zukunftsnah.', milo: 'Warmherzig. Verspielt. Aufmerksam.', 'ghost-clean': 'Leise. Verträumt. Gelassen.', pixel: 'Kreativ. Analytisch. Klar.', onyx: 'Souverän. Direkt. Loyal.' }[id] || 'Dein digitaler Begleiter';
    $('skin-selector').value = id;
    $('chat-log').replaceChildren();
    for (const message of this.voice.history()) this.addMessage(message.role, message.content, false);
    this.sprite = null;
    if (this.current.image) { this.sprite = new Image(); this.sprite.src = this.current.image; }
    saveData();
    if (announce) this.notice(`${this.current.name} ist aktiv.`);
  },
  addMessage(role, text, bubble = true) {
    const node = document.createElement('div'); node.className = `chat-message ${role}`;
    const label = document.createElement('strong'); label.textContent = role === 'user' ? 'Du' : this.current.name;
    const content = document.createElement('p'); content.textContent = text;
    node.append(label, content); $('chat-log').append(node);
    while ($('chat-log').children.length > 24) $('chat-log').firstChild.remove();
    $('chat-log').scrollTop = $('chat-log').scrollHeight;
    if (role === 'assistant' && bubble) {
      clearTimeout(this.bubbleTimer);
      $('speech-bubble').textContent = text; $('speech-bubble').classList.add('show');
      this.bubbleTimer = setTimeout(() => $('speech-bubble').classList.remove('show'), 8000);
    }
  },
  renderChoices() {
    const grid = $('character-grid'); grid.replaceChildren();
    const profiles = [...CHARACTERS, ...player.unlockedSkins.filter(id => id !== 'cyber').map(id => profileFor(id)), ...(this.custom ? [profileFor('custom', this.custom)] : [])];
    for (const profile of profiles) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'character-card';
      button.setAttribute('aria-pressed', String(profile.id === this.current.id)); button.dataset.id = profile.id;
      if (profile.image) {
        const img = document.createElement('img'); img.src = profile.image; img.alt = ''; button.append(img);
      } else button.innerHTML = avatarMarkup(profile);
      const name = document.createElement('strong'); name.textContent = profile.name;
      const detail = document.createElement('span'); detail.textContent = profile.id === this.current.id ? 'Aktiv' : 'Auswählen';
      button.append(name, detail); button.onclick = () => { this.selectCharacter(profile.id); $('character-dialog').close(); };
      grid.append(button);
    }
  },
  openEditor() {
    ++this.uploadGeneration;
    this.draft = { ...(this.custom || DEFAULT_CUSTOM) };
    $('editor-error').textContent = ''; $('save-character').disabled = false;
    for (const [key, value] of Object.entries(this.draft)) { const field = $(`custom-${key}`); if (field) field.value = value; }
    this.previewDraft();
    if (!$('editor-dialog').open) $('editor-dialog').showModal();
  },
  refreshDraft() {
    for (const key of ['name', 'color', 'accent', 'shape', 'size', 'imageScale', 'imageX', 'imageY']) {
      const value = $(`custom-${key}`).value;
      this.draft[key] = ['name', 'color', 'accent', 'shape'].includes(key) ? value : Number(value);
    }
    this.previewDraft();
  },
  previewDraft() {
    paintProfile($('editor-preview'), this.draft);
    $('preview-name').textContent = this.draft.name || 'Mein Charakter';
    $('remove-image').disabled = !this.draft.image;
    $('image-controls').hidden = !this.draft.image;
  },
  saveEditor() {
    try {
      const custom = saveCustom(localStorage, this.draft);
      this.custom = custom; this.selectCharacter('custom'); $('editor-dialog').close();
      this.notice('Dein Charakter wurde lokal gespeichert.');
    } catch (error) {
      $('editor-error').textContent = error.name === 'QuotaExceededError' ? 'Der lokale Speicher ist voll. Bitte ein kleineres Bild verwenden oder das Bild entfernen.' : 'Speichern fehlgeschlagen: ' + error.message;
    }
  },
  resetLevel() {
    // Player level is progression, not a separate scene. Restart the current game using its own entry point.
    if (gameBusy && currentGame !== 'plinko' && !confirm('Die laufende Spielrunde wird beendet; ihr Einsatz kann verloren gehen. Runde zurücksetzen?')) return;
    const game = currentGame;
    runAbort(); this.cancelPlinko(); this.interaction.reset(); this.voice.interrupt();
    clearTimeout(this.bubbleTimer); $('speech-bubble').classList.remove('show');
    $('bot-face').classList.remove('emotion-happy', 'emotion-sad', 'emotion-shocked');
    packState = 'idle'; gameBusy = false;
    const opens = { plinko: openGamePlinko, scratch: openGameScratch, pack: openGamePack, slots: openGameSlots, wheel: openGameWheel, bj: openGameBlackjack };
    if (game && opens[game]) opens[game]();
    this.notice('Aktuelles Spiel zurückgesetzt. XP, Aufgaben und Charaktere bleiben gespeichert.');
  },
  startPlinko() {
    if (gameBusy) return;
    const stake = payStake(); if (!stake) return;
    this.world.reset();
    // Variation exists only in the release conditions; all later motion comes from contact physics.
    const random = new Uint32Array(2); crypto.getRandomValues(random);
    const x = 200 + (random[0] / 4294967295 - 0.5) * 22;
    const vx = (random[1] / 4294967295 - 0.5) * 45;
    this.world.drop({ x, vx });
    this.plinkoRound = { stake, settled: false };
    gameAbort = () => this.cancelPlinko();
    $('btn-play').disabled = true; showMsg('Physikalischer Durchlauf …', '');
    let previous = performance.now();
    const frame = now => {
      if (!this.plinkoRound || currentGame !== 'plinko') return;
      this.world.advance((now - previous) / 1000); previous = now;
      const body = this.world.bodies[0]; drawPlinko(body, body.bin);
      if (body.bin !== null) {
        const round = this.plinkoRound; round.settled = true; this.plinkoRound = null; gameAbort = null; this.plinkoRAF = null;
        const multiplier = PL_MULT[body.bin], chips = settle(round.stake, multiplier);
        drawPlinko(body, body.bin); resultMsg(chips, `Feld x${multiplier}.`);
        if ($('btn-play')) { $('btn-play').disabled = false; $('btn-play').textContent = 'Nochmal fallen lassen'; }
      } else if (this.world.time > 30) {
        this.cancelPlinko(); showMsg('Durchlauf abgebrochen. Einsatz zurückgegeben.', '');
      } else this.plinkoRAF = requestAnimationFrame(frame);
    };
    this.plinkoRAF = requestAnimationFrame(frame);
  },
  cancelPlinko() {
    if (this.plinkoRAF !== null) cancelAnimationFrame(this.plinkoRAF);
    this.plinkoRAF = null;
    const round = this.plinkoRound; this.plinkoRound = null;
    if (round && !round.settled) { gameBusy = false; addCoins('task', round.stake); }
    this.world.reset();
    if (currentGame === 'plinko') {
      gameBusy = false;
      if ($('btn-play')) $('btn-play').disabled = false;
      drawPlinko(null, null);
    }
  },
  drawPlinkoBody(ctx, body) {
    const profile = this.current;
    ctx.save(); ctx.translate(body.x, body.y);
    ctx.rotate(clamp(body.vx / 500, -0.4, 0.4));
    ctx.fillStyle = profile.color;
    ctx.beginPath(); ctx.arc(0, 0, body.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = profile.accent; ctx.lineWidth = 1; ctx.stroke();
    if (this.sprite?.complete && this.sprite.naturalWidth) {
      const scale = Math.min(body.r * 1.65 / this.sprite.naturalWidth, body.r * 1.65 / this.sprite.naturalHeight);
      ctx.drawImage(this.sprite, -this.sprite.naturalWidth * scale / 2, -this.sprite.naturalHeight * scale / 2, this.sprite.naturalWidth * scale, this.sprite.naturalHeight * scale);
    } else {
      ctx.fillStyle = profile.shape === 'onyx' ? '#eee' : '#202b36';
      for (const x of [-3, 3]) { ctx.beginPath(); ctx.ellipse(x, -1, 1.3, 2, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.beginPath(); ctx.arc(0, 2, 3, 0.1, Math.PI - 0.1); ctx.strokeStyle = ctx.fillStyle; ctx.stroke();
    }
    // Hands fit inside the collision circle.
    ctx.fillStyle = profile.color;
    for (const x of [-7, 7]) { ctx.beginPath(); ctx.ellipse(x, 3, 1.5, 2.5, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  },
};
app.uploadGeneration = 0;
window.EntityApp = app;
