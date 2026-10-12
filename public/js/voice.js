export class VoiceController {
  constructor({ profile, anger, onState, log, onError, onDraft }) {
    Object.assign(this, { profile, anger, onState, log, onError, onDraft });
    this.histories = new Map(); this.state = 'idle'; this.generation = 0; this.recognition = null;
    this.synth = window.speechSynthesis; this.muted = false; this.volume = 1;
    this.Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.onState('idle');
  }
  setState(state) { this.state = state; this.onState(state); }
  history() { return this.histories.get(this.profile().id) || []; }
  interrupt() {
    this.generation++;
    clearTimeout(this.speechTimer);
    this.controller?.abort(); this.controller = null;
    if (this.recognition) {
      const recognition = this.recognition; this.recognition = null;
      recognition.onresult = recognition.onend = recognition.onerror = null;
      recognition.abort();
    }
    this.synth?.cancel(); this.setState('idle');
  }
  switchCharacter() { this.interrupt(); }
  toggleMic() {
    if (this.state === 'listening') { this.recognition?.stop(); return; }
    this.interrupt(); this.onError('');
    if (!this.Recognition) { this.onError('Dieser Browser unterstützt keine Spracheingabe. Bitte Texteingabe oder Chrome/Edge verwenden.'); return; }
    if (!window.isSecureContext) { this.onError('Das Mikrofon benötigt HTTPS oder einen lokalen Server.'); return; }
    const recognition = new this.Recognition(), generation = this.generation;
    recognition.lang = 'de-DE'; recognition.interimResults = true; recognition.continuous = false;
    this.recognition = recognition; let finalText = '', interim = '';
    recognition.onresult = event => {
      if (generation !== this.generation) return;
      interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript + ' ';
        else interim += event.results[i][0].transcript;
      }
      this.onDraft((finalText + interim).trim());
    };
    recognition.onerror = event => {
      if (generation !== this.generation) return;
      const messages = { 'not-allowed': 'Mikrofonzugriff verweigert. Bitte die Browser-Berechtigung prüfen.', 'service-not-allowed': 'Der Spracherkennungsdienst ist nicht verfügbar.', 'audio-capture': 'Kein verfügbares Mikrofon gefunden.', network: 'Spracherkennung ohne Verbindung. Bitte Texteingabe verwenden.', 'no-speech': 'Keine Sprache erkannt. Bitte erneut versuchen.' };
      this.onError(messages[event.error] || 'Die Spracheingabe wurde beendet.');
      finalText = ''; this.setState('idle');
    };
    recognition.onend = () => {
      if (generation !== this.generation) return;
      this.recognition = null; this.setState('idle');
      if (finalText.trim()) { this.onDraft(''); this.send(finalText.trim()); }
    };
    try { recognition.start(); this.setState('listening'); }
    catch { this.recognition = null; this.setState('idle'); this.onError('Das Mikrofon konnte nicht gestartet werden.'); }
  }
  async send(text) {
    text = String(text).trim(); if (!text) return;
    if (text.length > 2000) { this.onError('Bitte höchstens 2000 Zeichen pro Nachricht eingeben.'); return; }
    this.interrupt(); this.onError('');
    const generation = this.generation, profile = this.profile();
    const history = this.histories.get(profile.id) || [];
    // Keep only completed turns in model context. Failed messages remain visible and retryable.
    const messages = [...history, { role: 'user', content: text }].slice(-23);
    this.log('user', text); this.setState('thinking');
    const controller = new AbortController(); this.controller = controller;
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character: profile.id, name: profile.name, anger: this.anger(), messages }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Die KI-Anfrage ist fehlgeschlagen.');
      if (generation !== this.generation) return;
      if (typeof body.reply !== 'string' || !body.reply.trim()) throw new Error('Leere KI-Antwort erhalten.');
      this.histories.set(profile.id, [...messages, { role: 'assistant', content: body.reply }].slice(-22));
      this.log('assistant', body.reply); this.setState('idle'); this.say(body.reply);
    } catch (error) {
      if (generation !== this.generation) return;
      this.setState('idle');
      this.onError(error.name === 'AbortError' ? 'Die Anfrage hat zu lange gedauert. Bitte erneut versuchen.' : error.message);
      this.onDraft(text);
    } finally { clearTimeout(timer); if (this.controller === controller) this.controller = null; }
  }
  say(text) {
    if (this.muted || !this.synth || !window.SpeechSynthesisUtterance) return;
    const utterance = new SpeechSynthesisUtterance(text), generation = ++this.generation;
    utterance.lang = 'de-DE'; utterance.pitch = this.profile().pitch || 1; utterance.rate = 0.98; utterance.volume = this.volume;
    const voices = this.synth.getVoices();
    utterance.voice = voices.find(v => v.lang === 'de-DE') || voices.find(v => v.lang.startsWith('de')) || null;
    utterance.onstart = () => { if (generation === this.generation) this.setState('speaking'); };
    const finish = () => { clearTimeout(this.speechTimer); if (generation === this.generation) this.setState('idle'); };
    utterance.onend = finish;
    utterance.onerror = event => { finish(); if (generation === this.generation && !['interrupted', 'canceled'].includes(event.error)) this.onError('Sprachausgabe nicht verfügbar. Die Antwort steht im Chat.'); };
    this.synth.cancel(); this.synth.speak(utterance);
    clearTimeout(this.speechTimer);
    this.speechTimer = setTimeout(() => { if (generation === this.generation) { this.synth.cancel(); this.setState('idle'); } }, 90000);
  }
  dispose() { this.interrupt(); clearTimeout(this.speechTimer); }
}
