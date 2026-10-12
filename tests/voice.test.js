import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceController } from '../public/js/voice.js';

function setup(t, { supported = true } = {}) {
  let rec;
  class Recognition {
    constructor() { rec = this; this.starts = 0; }
    start() { this.starts++; }
    stop() { this.onend?.(); }
    abort() { this.aborted = true; }
  }
  const spoken = [], states = [], logs = [], errors = [], drafts = [];
  const synth = { cancel() {}, getVoices: () => [], speak: utterance => { spoken.push(utterance); utterance.onstart?.(); } };
  globalThis.window = { speechSynthesis: synth, SpeechRecognition: supported ? Recognition : undefined, isSecureContext: true, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } } };
  globalThis.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
  let profile = { id: 'nova', name: 'Nova', pitch: 1 };
  const originalFetch = globalThis.fetch;
  const voice = new VoiceController({ profile: () => profile, anger: () => 77, onState: s => states.push(s), log: (role, content) => logs.push({ role, content }), onError: s => errors.push(s), onDraft: s => drafts.push(s) });
  t.after(() => { voice.dispose(); globalThis.fetch = originalFetch; delete globalThis.window; delete globalThis.SpeechSynthesisUtterance; });
  return { voice, states, logs, errors, drafts, spoken, getRec: () => rec, switchProfile: p => { profile = p; voice.switchCharacter(); } };
}
test('speech recognition collects final results, prevents overlapping recording and routes text to AI (test devices)', async t => {
  const s = setup(t); let payload;
  globalThis.fetch = async (_url, options) => { payload = JSON.parse(options.body); return Response.json({ reply: 'Testantwort' }); };
  s.voice.toggleMic(); const rec = s.getRec(); assert.equal(rec.starts, 1); assert.equal(s.voice.state, 'listening');
  rec.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'Hallo Nova' }], { isFinal: true })] });
  s.voice.toggleMic();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rec.starts, 1); assert.equal(payload.messages[0].content, 'Hallo Nova'); assert.equal(payload.anger, 77);
  assert.deepEqual(s.states.slice(-3), ['thinking', 'idle', 'speaking']); assert.equal(s.spoken[0].text, 'Testantwort');
  s.voice.interrupt(); assert.equal(s.voice.state, 'idle');
});
test('missing browser support and denied microphone permissions produce actionable errors', t => {
  const s = setup(t, { supported: false }); s.voice.toggleMic(); assert.match(s.errors.at(-1), /Texteingabe/); assert.equal(s.voice.state, 'idle');
});
test('permission error never creates a fake conversation', t => {
  const s = setup(t); s.voice.toggleMic(); s.getRec().onerror({ error: 'not-allowed' }); s.getRec().onend();
  assert.match(s.errors.at(-1), /verweigert/); assert.deepEqual(s.logs, []); assert.equal(s.voice.state, 'idle');
});
test('interrupting thinking discards late replies, then permits another real request (test transport)', async t => {
  const s = setup(t); let resolveRequest;
  globalThis.fetch = () => new Promise(resolve => { resolveRequest = resolve; });
  const pending = s.voice.send('Frage'); s.voice.interrupt();
  resolveRequest(Response.json({ reply: 'Zu spät' })); await pending;
  assert.equal(s.logs.length, 1); assert.equal(s.voice.history().length, 0); assert.equal(s.voice.state, 'idle');
  globalThis.fetch = async () => Response.json({ reply: 'Testantwort' });
  await s.voice.send('Neue Frage'); assert.equal(s.voice.history().length, 2);
});
test('text-to-speech callbacks after interruption cannot revive speaking state (test device)', t => {
  const s = setup(t); s.voice.say('Test'); assert.equal(s.voice.state, 'speaking');
  const speech = s.spoken[0]; s.voice.interrupt(); speech.onstart(); speech.onend();
  assert.equal(s.voice.state, 'idle');
});
test('failed requests restore input and do not enter completed model context', async t => {
  const s = setup(t); globalThis.fetch = async () => Response.json({ error: 'Testfehler' }, { status: 502 });
  await s.voice.send('Meine Frage'); assert.equal(s.drafts.at(-1), 'Meine Frage'); assert.equal(s.voice.history().length, 0); assert.equal(s.errors.at(-1), 'Testfehler');
});
