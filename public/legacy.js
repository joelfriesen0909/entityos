
        /* --- STATE & DATA --- */
        let faceItems = [];
        let hairItems = [];

        let player = {
            level: 1,
            xp: 0,
            xpNeeded: 100,
            coinsTask: 0,
            coinsWin: 0,
            unlockedSkins: ['cyber'],
            currentSkin: 'cyber',
            activeSubstance: null
        };

        let isMuted = false;

        // UI Globals
        let deletedItemCache = null;
        let undoTimeout = null;
        const synth = window.speechSynthesis;
        let lastSpeakTime = 0;

        // Keilschrift-Symbole (ersetzen alle Emojis)
        const CUNE = ['◈', '◇', '▱', '♠', '▥', '◉', '✦', '⌘'];

        /* --- AUDIO & SFX (Web Audio API) --- */
        let audioCtx = null;

        function initAudio() {
            if(!audioCtx) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if(AudioContext) audioCtx = new AudioContext();
            }
            if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        }

        function playSFX(type) {
            if(isMuted) return;
            initAudio();
            if(!audioCtx) return;

            const t = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const vol = parseFloat(document.getElementById('vol-slider').value) * 0.3;

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            if(type === 'levelUp') {
                osc.type = 'square';
                osc.frequency.setValueAtTime(261.63, t);
                osc.frequency.setValueAtTime(329.63, t + 0.15);
                osc.frequency.setValueAtTime(392.00, t + 0.3);
                osc.frequency.setValueAtTime(523.25, t + 0.45);
                gain.gain.setValueAtTime(vol, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
                osc.start(t); osc.stop(t + 0.8);
            }
            else if (type === 'coin') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, t);
                osc.frequency.exponentialRampToValueAtTime(1760, t + 0.1);
                gain.gain.setValueAtTime(vol*0.5, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
                osc.start(t); osc.stop(t + 0.2);
            }
            else if (type === 'win') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(440, t);
                osc.frequency.linearRampToValueAtTime(880, t + 0.3);
                gain.gain.setValueAtTime(vol, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
                osc.start(t); osc.stop(t + 0.5);
            }
            else if (type === 'lose') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, t);
                osc.frequency.linearRampToValueAtTime(100, t + 0.4);
                gain.gain.setValueAtTime(vol, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
                osc.start(t); osc.stop(t + 0.5);
            }
            else if (type === 'drink') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(300, t);
                osc.frequency.linearRampToValueAtTime(600, t + 0.2);
                osc.frequency.linearRampToValueAtTime(200, t + 0.4);
                gain.gain.setValueAtTime(vol, t);
                gain.gain.linearRampToValueAtTime(0.01, t + 0.5);
                osc.start(t); osc.stop(t + 0.5);
            }
            else if (type === 'substance') {
                osc.type = 'square';
                osc.frequency.setValueAtTime(100, t);
                osc.frequency.exponentialRampToValueAtTime(800, t + 0.4);

                const lfo = audioCtx.createOscillator();
                lfo.type = 'sine'; lfo.frequency.value = 10;
                const lfoGain = audioCtx.createGain(); lfoGain.gain.value = 100;
                lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
                lfo.start(t); lfo.stop(t + 0.8);

                gain.gain.setValueAtTime(vol, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
                osc.start(t); osc.stop(t + 0.8);
            }
        }

        /* --- INIT & LOCAL STORAGE --- */
        window.onload = () => {
            loadData();
            updateSkinSelector();
            changeSkin(player.currentSkin);
            if(player.activeSubstance) applySubstance(player.activeSubstance, false);
            renderLists();
            updateHUD();
            startAliveAnimations();

            document.querySelector('.face-container').addEventListener('click', faceClicked);
            window.EntityApp?.init();
            document.body.addEventListener('click', initAudio, {once:true});
        };

        let dataReadFailed = false;
        function loadData() {
            try {
                const saved = localStorage.getItem('glowFlowDataV9');
                if (!saved) return;
                const data = JSON.parse(saved);
                if (!data || typeof data !== 'object') throw new Error('invalid data');
                faceItems = Array.isArray(data.faceItems) ? data.faceItems : [];
                hairItems = Array.isArray(data.hairItems) ? data.hairItems : [];
                if (data.player && typeof data.player === 'object') player = { ...player, ...data.player };
                for (const key of ['level', 'xp', 'xpNeeded', 'coinsTask', 'coinsWin']) {
                    if (!Number.isFinite(player[key]) || player[key] < 0) player[key] = key === 'level' ? 1 : key === 'xpNeeded' ? 100 : 0;
                }
                if (!Array.isArray(player.unlockedSkins)) player.unlockedSkins = ['cyber'];
                if (!player.unlockedSkins.includes('cyber')) player.unlockedSkins.unshift('cyber');
                if (typeof player.currentSkin !== 'string') player.currentSkin = 'cyber';
                faceItems = faceItems.filter(i => typeof i === 'string' || i && typeof i.text === 'string');
                hairItems = hairItems.filter(i => typeof i === 'string' || i && typeof i.text === 'string');
            } catch {
                dataReadFailed = true;
                window.EntityApp?.notice('Gespeicherte Routinen konnten nicht gelesen werden. Die alten Daten werden nicht überschrieben.');
            }
        }

        function saveData() {
            if (dataReadFailed) return;
            try { localStorage.setItem('glowFlowDataV9', JSON.stringify({ faceItems, hairItems, player })); }
            catch { window.EntityApp?.notice('Lokales Speichern fehlgeschlagen. Bitte Browser-Speicher und Berechtigungen prüfen.'); }
        }

        /* --- RPG SYSTEM (XP & Coins) --- */
        function updateHUD() {
            document.getElementById('disp-lvl').innerText = player.level;
            document.getElementById('disp-coins-task').innerText = player.coinsTask;
            document.getElementById('disp-coins-win').innerText = player.coinsWin;

            const pct = Math.min(100, (player.xp / player.xpNeeded) * 100);
            document.getElementById('disp-xp-bar').style.width = `${pct}%`;
            document.getElementById('disp-xp-txt').innerText = `${player.xp} / ${player.xpNeeded} XP`;
        }

        function addXP(amount) {
            player.xp += amount;
            if (player.xp >= player.xpNeeded) levelUp();
            updateHUD();
            saveData();
        }

        function addCoins(type, amount) {
            if(type === 'task') {
                player.coinsTask += amount;
                if(amount > 0) playSFX('coin');
                document.getElementById('disp-coins-task').classList.add('coin-pop');
                setTimeout(() => document.getElementById('disp-coins-task').classList.remove('coin-pop'), 500);
            }
            if(type === 'win') {
                player.coinsWin += amount;
                if(amount > 0) playSFX('coin');
                document.getElementById('disp-coins-win').classList.add('coin-pop');
                setTimeout(() => document.getElementById('disp-coins-win').classList.remove('coin-pop'), 500);
            }
            updateHUD();
            saveData();
        }

        function levelUp() {
            player.xp -= player.xpNeeded;
            player.level++;
            player.xpNeeded = Math.floor(player.xpNeeded * 1.5);

            const rewardCoins = player.level * 2;
            addCoins('task', rewardCoins);

            let unlockText = `+ ${rewardCoins} Aufgabenmünzen!`;

            const skins = ['cyber', 'clown', 'robot', 'vampire', 'nature', 'alien', 'ghost', 'pirate', 'ninja', 'wizard'];
            if(player.level <= 10) {
                const newSkin = skins[player.level - 1];
                if(!player.unlockedSkins.includes(newSkin)) {
                    player.unlockedSkins.push(newSkin);
                    unlockText += `<br>Neuer Skin freigeschaltet: ${document.querySelector(`option[value="${newSkin}"]`).text.replace(/ \(Lvl \d+\)/, '')}`;
                }
            }

            const overlay = document.getElementById('lvl-up-overlay');
            document.getElementById('lvl-up-title').innerText = `LEVEL ${player.level}!`;
            document.getElementById('lvl-up-desc').innerHTML = unlockText;
            overlay.classList.add('show');

            playSFX('levelUp');
            speak(`Level Up! Ich bin jetzt Level ${player.level}!`, true);

            updateSkinSelector();
            updateHUD();
            saveData();

            if(player.xp >= player.xpNeeded) setTimeout(levelUp, 2500);
        }

        function closeLevelUp() { document.getElementById('lvl-up-overlay').classList.remove('show'); }

        /* --- LIST RENDERING & DRAG'N'DROP --- */
        function renderLists() {
            renderList('face', faceItems);
            renderList('hair', hairItems);
            updateProgress('face');
            updateProgress('hair');
            saveData();
        }

        function renderList(type, arr) {
            const listEl = document.getElementById(`${type}-list`);
            listEl.innerHTML = '';

            arr.forEach((itemObj, index) => {
                if(typeof itemObj === 'string') { itemObj = { text: itemObj, checked: false }; arr[index] = itemObj; }

                const li = document.createElement('li');
                li.className = `item ${itemObj.checked ? 'checked' : ''}`;
                li.draggable = true; li.dataset.index = index; li.dataset.type = type;

                li.innerHTML = `
                    <span class="drag-handle" title="Ziehen zum Sortieren"><svg viewBox="0 0 24 24"><path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z"/></svg></span>
                    <label class="chk-container">
                        <input type="checkbox" ${itemObj.checked ? 'checked' : ''} onchange="toggleCheck('${type}', ${index}, this.checked)">
                        <span class="checkmark"></span>
                    </label>
                    <span class="item-text" ondblclick="editItem(this, '${type}', ${index})" title="Doppelklick zum Bearbeiten"></span>
                    <button class="btn-delete" onclick="deleteItem('${type}', ${index})" title="Löschen">×</button>
                `;

                li.querySelector('.item-text').textContent = itemObj.text;
                li.addEventListener('dragstart', handleDragStart);
                li.addEventListener('dragover', handleDragOver);
                li.addEventListener('drop', handleDrop);
                li.addEventListener('dragend', handleDragEnd);
                listEl.appendChild(li);
            });
        }

        function editItem(spanEl, type, index) {
            spanEl.contentEditable = true; spanEl.focus();
            let range = document.createRange(); let sel = window.getSelection();
            range.selectNodeContents(spanEl); range.collapse(false); sel.removeAllRanges(); sel.addRange(range);

            spanEl.onblur = function() {
                this.contentEditable = false; const newText = this.innerText.trim();
                if(newText) { type === 'face' ? faceItems[index].text = newText : hairItems[index].text = newText; saveData(); }
                else renderLists();
            };
            spanEl.onkeypress = function(e) { if(e.key === 'Enter') { e.preventDefault(); this.blur(); } };
        }

        let draggedItem = null;
        function handleDragStart(e) { draggedItem = this; setTimeout(() => this.classList.add('dragging'), 0); }
        function handleDragOver(e) { e.preventDefault(); if (draggedItem && this !== draggedItem && this.dataset.type === draggedItem.dataset.type) { const rect = this.getBoundingClientRect(); const next = (e.clientY - rect.top)/(rect.bottom - rect.top) > 0.5; this.parentNode.insertBefore(draggedItem, next && this.nextSibling || this); } }
        function handleDrop(e) { e.preventDefault(); }
        function handleDragEnd() {
            this.classList.remove('dragging');
            const type = this.dataset.type; const listEl = document.getElementById(`${type}-list`); const newArr = [];
            listEl.querySelectorAll('.item').forEach(li => { const oldIndex = li.dataset.index; newArr.push(type === 'face' ? faceItems[oldIndex] : hairItems[oldIndex]); });
            if(type === 'face') faceItems = newArr; else hairItems = newArr;
            draggedItem = null; renderLists();
        }

        function addItem(type) {
            const input = document.getElementById(`${type}-input`); const val = input.value.trim();
            if (val) {
                const arr = type === 'face' ? faceItems : hairItems;
                arr.push({text: val, checked: false});
                input.value = ''; renderLists();
                speak(`Angelegt: ${val}`);
                addXP(5);
            }
        }

        function deleteItem(type, index) {
            const arr = type === 'face' ? faceItems : hairItems;
            const deleted = arr.splice(index, 1)[0];
            deletedItemCache = { type, index, item: deleted };
            renderLists();

            const toast = document.getElementById('undo-toast');
            document.getElementById('undo-text').textContent = `"${deleted.text}" gelöscht.`;
            toast.classList.add('show');
            document.getElementById('undo-btn').onclick = undoDelete;
            clearTimeout(undoTimeout);
            undoTimeout = setTimeout(() => toast.classList.remove('show'), 4000);
        }

        function undoDelete() {
            if(deletedItemCache) {
                const arr = deletedItemCache.type === 'face' ? faceItems : hairItems;
                arr.splice(deletedItemCache.index, 0, deletedItemCache.item);
                deletedItemCache = null;
                document.getElementById('undo-toast').classList.remove('show');
                renderLists();
            }
        }

        function toggleCheck(type, index, isChecked) {
            const arr = type === 'face' ? faceItems : hairItems;
            arr[index].checked = isChecked;
            renderLists();

            if(isChecked) {
                addXP(10);
                addCoins('task', 1);
                triggerEmotion('emotion-happy', 1500);
            }
        }

        function updateProgress(type) {
            const arr = type === 'face' ? faceItems : hairItems;
            const total = arr.length; const checked = arr.filter(i => i.checked).length;
            const pct = total === 0 ? 0 : (checked / total) * 100;
            document.getElementById(`prog-${type}`).style.width = `${pct}%`;
        }

        function resetRoutine() {
            if(faceItems.length === 0 && hairItems.length === 0) return;
            faceItems.forEach(i => i.checked = false); hairItems.forEach(i => i.checked = false);
            renderLists(); speak("Routine zurückgesetzt. Ein neuer Tag!"); toggleMenu();
        }

        function toggleAccordion(type) { document.getElementById(`wrap-${type}`).parentElement.classList.toggle('collapsed'); }

        /* --- UNLOCK LOGIC --- */
        function unlockAllSkins() {
            player.unlockedSkins = ['cyber', 'clown', 'robot', 'vampire', 'nature', 'alien', 'ghost', 'pirate', 'ninja', 'wizard'];
            updateSkinSelector(); saveData(); speak("Alle Skins freigeschaltet.", true); playSFX('levelUp');
        }

        function updateSkinSelector() {
            const sel = document.getElementById('skin-selector');
            Array.from(sel.options).forEach(opt => {
                if(player.unlockedSkins.includes(opt.value)) { opt.disabled = false; opt.text = opt.text.replace(/ \(Lvl \d+\)/, ''); }
            });
            sel.value = player.currentSkin;
        }

        /* --- ALIVE ANIMATIONS & INTERACTIONS --- */
        const faceContainer = document.querySelector('.face-container');
        let blinkTimer, lookTimer, emotionTimer;

        function startAliveAnimations() {
            clearInterval(blinkTimer); clearInterval(lookTimer); clearInterval(emotionTimer);
            blinkTimer = setInterval(() => {
                if(player.activeSubstance === 'robot') return;
                const lids = document.querySelectorAll('.eyelid');
                lids.forEach(l => l.style.height = '100%');
                setTimeout(() => lids.forEach(l => l.style.height = '0%'), 150);
            }, 3000 + Math.random() * 4000);

            emotionTimer = setInterval(() => {
                if ((window.EntityApp?.voice?.state || 'idle') !== 'idle' || (window.EntityApp?.interaction?.getAnger() || 0) > 35) return;
                if(Math.random() > 0.7) {
                    const e = ['emotion-happy', 'emotion-sad', 'emotion-shocked'][Math.random()*3|0];
                    triggerEmotion(e, 2000);
                }
            }, 15000);
        }

        function triggerEmotion(className, duration) {
            ['emotion-happy', 'emotion-sad', 'emotion-shocked'].forEach(e => faceContainer.classList.remove(e));
            faceContainer.classList.add(className);
            setTimeout(() => faceContainer.classList.remove(className), duration);
        }

        function faceClicked() {
            if (window.EntityApp?.interaction?.suppressClick) return;
            triggerEmotion('emotion-happy', 1000);
            const texts = ['Hey!', 'Schön, dass du da bist.', 'Sanft, bitte.', 'Ich bin hier.'];
            speak(texts[Math.random() * texts.length | 0]);
        }

        /* --- AUDIO & TTS --- */
        function testVolume() { playSFX('coin'); speak("Audio Test", true); }
        function toggleMute() {
            isMuted = !isMuted;
            document.getElementById('mute-btn').classList.toggle('muted', isMuted);
            const voice = window.EntityApp?.voice;
            if (voice) {
                voice.muted = isMuted;
                if (isMuted && voice.state === 'speaking') voice.interrupt();
            }
            if (isMuted) synth?.cancel();
            else playSFX('coin');
        }

        function speak(text, force = false) {
            const voice = window.EntityApp?.voice;
            if (voice && voice.state !== 'idle') return;
            if (!force && Date.now() - lastSpeakTime < 4000) return;
            lastSpeakTime = Date.now();
            const bubble = document.getElementById('speech-bubble');
            bubble.textContent = text; bubble.classList.add('show');
            if (window.EntityApp) {
                clearTimeout(window.EntityApp.bubbleTimer);
                window.EntityApp.bubbleTimer = setTimeout(() => bubble.classList.remove('show'), 5000);
            }
            if (isMuted || !voice) return;
            voice.volume = parseFloat(document.getElementById('vol-slider').value);
            voice.say(text);
        }

        /* --- MENUS & OVERLAYS --- */
        function toggleMenu() { document.getElementById('side-menu').classList.toggle('open'); }
        function changeSkin(skinName) {
            if (window.EntityApp?.ready) { window.EntityApp.selectCharacter(skinName); return; }
            document.body.className = document.body.className.replace(/theme-\w+/g, '');
            document.body.classList.add(`theme-${skinName}`);
            player.currentSkin = skinName; saveData();
            if(player.activeSubstance) applySubstance(player.activeSubstance, false);
        }

        let currentGame = null;   // welches Spiel gerade offen ist
        let gameBusy = false;     // Einsatz gesperrt während einer Runde
        let gameAbort = null;     // Aufräumfunktion bei vorzeitigem Verlassen
        let bet = 1;              // gewählter Einsatz in Aufgabenmünzen

        function openActivity(title, desc, htmlContent) {
            document.getElementById('act-title').textContent = title;
            document.getElementById('act-desc').textContent = desc;
            document.getElementById('act-content').innerHTML = htmlContent;
            document.getElementById('activity-overlay').classList.add('active');
            let reset = document.getElementById('scene-reset');
            if (!reset) {
                reset = document.createElement('button'); reset.id = 'scene-reset'; reset.className = 'quiet-button'; reset.textContent = '↻ Reset';
                reset.style.cssText = 'position:absolute;top:30px;left:20px';
                reset.onclick = () => window.EntityApp.resetLevel();
                document.getElementById('activity-overlay').append(reset);
            }
            reset.hidden = !currentGame;
        }

        function runAbort() {
            if(gameAbort) { const f = gameAbort; gameAbort = null; f(); }
        }

        function closeActivity() {
            runAbort();
            currentGame = null;
            document.getElementById('activity-overlay').classList.remove('active');
        }

        /* --- EINSATZ & AUSZAHLUNG --- */
        function betBoxHTML() {
            return `
                <div class="bet-box">
                    <span class="bet-label">Einsatz (Aufgabenmünzen)</span>
                    <div class="bet-row">
                        <button class="bet-step" onclick="stepBet(-1)">−</button>
                        <div class="bet-val" id="bet-val">${bet}</div>
                        <button class="bet-step" onclick="stepBet(1)">+</button>
                    </div>
                    <div class="bet-quick">
                        <button onclick="setBet(1)">1</button>
                        <button onclick="setBet(5)">5</button>
                        <button onclick="setBet(10)">10</button>
                        <button onclick="setBet('max')">Max</button>
                    </div>
                    <span class="bet-info" id="bet-info"></span>
                </div>`;
        }

        function clampBet() {
            bet = Math.max(1, Math.min(bet, Math.max(1, player.coinsTask)));
        }

        function setBet(v) {
            if(gameBusy) return;
            bet = (v === 'max') ? Math.max(1, player.coinsTask) : v;
            updateBetUI();
        }

        function stepBet(d) { setBet(bet + d); }

        function updateBetUI() {
            clampBet();
            const v = document.getElementById('bet-val');
            if(v) v.innerText = bet;
            const info = document.getElementById('bet-info');
            if(info) info.innerText = `Verfügbar: ${player.coinsTask} Aufgabenmünzen`;
            if(currentGame === 'plinko') drawPlinko(null, null);
            if(currentGame === 'wheel') buildWheel();
        }

        function payStake() {
            clampBet();
            if(player.coinsTask < bet) {
                showMsg('Nicht genug Aufgabenmünzen!', 'lose');
                speak('Nicht genug Aufgabenmünzen!', true);
                triggerEmotion('emotion-sad', 2000);
                return 0;
            }
            const stake = bet;
            addCoins('task', -stake);
            gameBusy = true;
            updateBetUI();
            return stake;
        }

        function settle(stake, mult) {
            const chips = Math.round(stake * mult);
            if(chips > 0) addCoins('win', chips);
            gameBusy = false;
            updateBetUI();
            return chips;
        }

        function showMsg(text, type) {
            const m = document.getElementById('game-msg');
            if(!m) return;
            m.innerText = text;
            m.className = 'game-msg ' + (type || '');
        }

        function resultMsg(chips, text = '') {
            if(chips > 0) {
                showMsg(`${text} Gewonnen: +${chips} Chips`.trim(), 'win');
                playSFX('win'); triggerEmotion('emotion-happy', 3000);
            } else {
                showMsg(`${text} Keine Chips.`.trim(), 'lose');
                playSFX('lose'); triggerEmotion('emotion-sad', 2000);
            }
        }

        function pickWeighted(table) {
            const sum = table.reduce((a, t) => a + t.w, 0);
            let r = Math.random() * sum;
            for(const t of table) { r -= t.w; if(r < 0) return t; }
            return table[table.length - 1];
        }

        function shuffle(arr) {
            for(let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        }

        /* --- CASINO MENU --- */
        function openGamblingMenu() {
            runAbort();
            currentGame = null;
            gameBusy = false;
            const content = `
                <div class="gambling-menu">
                    <div class="game-card" onclick="openGameScratch()">
                        <div class="game-icon">${CUNE[0]}</div>
                        <div class="game-name">Rubbellos</div>
                        <div class="game-sub">Freirubbeln</div>
                    </div>
                    <div class="game-card" onclick="openGamePlinko()">
                        <div class="game-icon">${CUNE[1]}</div>
                        <div class="game-name">Plinko</div>
                        <div class="game-sub">Ball fallen lassen</div>
                    </div>
                    <div class="game-card" onclick="openGamePack()">
                        <div class="game-icon">${CUNE[2]}</div>
                        <div class="game-name">Packdraw</div>
                        <div class="game-sub">Karte ziehen</div>
                    </div>
                    <div class="game-card" onclick="openGameBlackjack()">
                        <div class="game-icon">${CUNE[3]}</div>
                        <div class="game-name">Blackjack</div>
                        <div class="game-sub">Gegen den Dealer</div>
                    </div>
                    <div class="game-card" onclick="openGameSlots()">
                        <div class="game-icon">${CUNE[4]}</div>
                        <div class="game-name">Automaten</div>
                        <div class="game-sub">Drei Walzen</div>
                    </div>
                    <div class="game-card" onclick="openGameWheel()">
                        <div class="game-icon">${CUNE[5]}</div>
                        <div class="game-name">Glücksrad</div>
                        <div class="game-sub">Gewinn sehen</div>
                    </div>
                </div>`;
            openActivity("Casino District", "Setze Aufgabenmünzen ein. Die Gewinne in Chips hängen von deinem Einsatz, dem Multiplikator und dem Zufall ab.", content);
        }

        /* --- 1. RUBBELLOS (echtes Freirubbeln) --- */
        const SCRATCH_TABLE = [
            { m: 0,  w: 62.5, l: 'Niete' },
            { m: 1,  w: 20,   l: 'x1' },
            { m: 2,  w: 10,   l: 'x2' },
            { m: 5,  w: 5,    l: 'x5' },
            { m: 10, w: 2,    l: 'x10' },
            { m: 50, w: 0.5,  l: 'x50' }
        ];

        function openGameScratch() {
            runAbort(); gameBusy = false;
            currentGame = 'scratch';
            openActivity('Rubbellos', 'Kratze das Feld mit Maus oder Finger frei. Ab etwa der Hälfte wird das Ergebnis aufgedeckt.',
                `<div class="game-stage">
                    ${betBoxHTML()}
                    <div class="scratch-wrap">
                        <div class="scratch-under"><div class="scratch-result" id="scr-result">?</div></div>
                        <canvas id="scr-canvas" width="420" height="200"></canvas>
                    </div>
                    <div class="game-msg" id="game-msg"></div>
                    <button class="play-btn" id="btn-play" onclick="startScratch()">Los kaufen</button>
                    <button class="play-btn ghost" onclick="openGamblingMenu()">Zurück</button>
                </div>`);
            updateBetUI();
            prepScratchCover();
        }

        function prepScratchCover() {
            const c = document.getElementById('scr-canvas');
            if(!c) return;
            const x = c.getContext('2d');
            x.globalCompositeOperation = 'source-over';
            x.clearRect(0, 0, c.width, c.height);
            const g = x.createLinearGradient(0, 0, c.width, c.height);
            g.addColorStop(0, '#eef2f6');
            g.addColorStop(0.35, '#9ca6b0');
            g.addColorStop(0.55, '#f8fafc');
            g.addColorStop(0.8, '#8c96a1');
            g.addColorStop(1, '#d9dfe6');
            x.fillStyle = g;
            x.fillRect(0, 0, c.width, c.height);
            x.strokeStyle = 'rgba(255,255,255,0.22)';
            x.lineWidth = 2;
            for(let i = -c.height; i < c.width; i += 14) {
                x.beginPath(); x.moveTo(i, 0); x.lineTo(i + c.height, c.height); x.stroke();
            }
            x.fillStyle = 'rgba(20,25,30,0.8)';
            x.font = '700 30px Rajdhani, sans-serif';
            x.textAlign = 'center';
            x.textBaseline = 'middle';
            x.fillText('RUBBELN', c.width / 2, c.height / 2);
        }

        function scratchedPercent(ctx, c) {
            const d = ctx.getImageData(0, 0, c.width, c.height).data;
            let clear = 0, total = 0;
            for(let i = 3; i < d.length; i += 16) { total++; if(d[i] < 100) clear++; }
            return clear / total;
        }

        function startScratch() {
            if(gameBusy) return;
            const stake = payStake();
            if(!stake) return;

            const pick = pickWeighted(SCRATCH_TABLE);
            const res = document.getElementById('scr-result');
            res.innerText = pick.m > 0 ? `+${Math.round(stake * pick.m)}` : 'Niete';
            res.style.color = pick.m > 0 ? '#ffffff' : '#ff4757';

            const btn = document.getElementById('btn-play');
            btn.disabled = true;
            showMsg('Rubbel das Feld frei!', '');
            prepScratchCover();

            const c = document.getElementById('scr-canvas');
            const ctx = c.getContext('2d');
            let drawing = false, last = null, done = false;

            const finish = () => {
                if(done) return;
                done = true;
                gameAbort = null;
                c.onpointerdown = c.onpointermove = c.onpointerup = c.onpointercancel = null;
                ctx.clearRect(0, 0, c.width, c.height);
                const chips = settle(stake, pick.m);
                resultMsg(chips, pick.m > 0 ? pick.l : '');
                const b = document.getElementById('btn-play');
                if(b) { b.disabled = false; b.innerText = 'Nochmal kaufen'; }
            };

            const pos = e => {
                const r = c.getBoundingClientRect();
                return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height };
            };
            const scratchAt = (p, q) => {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.lineWidth = 34; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
                ctx.beginPath(); ctx.arc(q.x, q.y, 17, 0, Math.PI * 2); ctx.fillStyle = '#000'; ctx.fill();
            };

            c.onpointerdown = e => {
                if(done) return;
                c.setPointerCapture(e.pointerId);
                drawing = true; last = pos(e);
                scratchAt(last, last);
            };
            c.onpointermove = e => {
                if(!drawing || done) return;
                const p = pos(e);
                scratchAt(last, p);
                last = p;
            };
            c.onpointerup = c.onpointercancel = () => {
                if(!drawing) return;
                drawing = false;
                if(!done && scratchedPercent(ctx, c) > 0.5) finish();
            };

            gameAbort = finish;
        }

        /* --- 2. PLINKO --- */
        const PL = { W: 400, H: 350, CX: 200, S: 40, ROWS: 8, TOP: 36, ROWH: 34, BIN_Y: 292, BIN_H: 30 };
        const PL_MULT = [10, 3, 1.5, 0.5, 0.2, 0.5, 1.5, 3, 10];

        function openGamePlinko() {
            runAbort(); gameBusy = false;
            currentGame = 'plinko';
            openActivity('Plinko', 'Dein Charakter fällt unter Schwerkraft, prallt an Pins und Wänden ab und landet im Gewinnfeld. Abbruch oder Reset geben den offenen Einsatz zurück.',
                `<div class="game-stage">
                    ${betBoxHTML()}
                    <canvas id="plinko-canvas" width="${PL.W}" height="${PL.H}"></canvas>
                    <div class="game-msg" id="game-msg"></div>
                    <button class="play-btn" id="btn-play" onclick="startPlinko()">Charakter fallen lassen</button>
                    <button class="play-btn ghost" onclick="openGamblingMenu()">Zurück</button>
                </div>`);
            updateBetUI();
        }

        function plinkoColor(m) { return m >= 3 ? '#e0b35a' : (m >= 1 ? '#9ca6b0' : '#5f6b78'); }

        function rr(x, X, Y, W, H, r) {
            x.beginPath();
            x.moveTo(X + r, Y);
            x.arcTo(X + W, Y, X + W, Y + H, r);
            x.arcTo(X + W, Y + H, X, Y + H, r);
            x.arcTo(X, Y + H, X, Y, r);
            x.arcTo(X, Y, X + W, Y, r);
            x.closePath();
        }

        function drawPlinko(ball, hit) {
            const c = document.getElementById('plinko-canvas');
            if(!c) return;
            const x = c.getContext('2d');
            x.clearRect(0, 0, PL.W, PL.H);

            for(let i = 0; i < PL.ROWS; i++) {
                for(let j = 0; j <= i; j++) {
                    const px = PL.CX + (2 * j - i) * PL.S / 2;
                    const py = PL.TOP + i * PL.ROWH;
                    const g = x.createRadialGradient(px - 1, py - 1, 1, px, py, 5);
                    g.addColorStop(0, '#ffffff');
                    g.addColorStop(1, '#7d8791');
                    x.beginPath(); x.arc(px, py, 4.5, 0, Math.PI * 2);
                    x.fillStyle = g; x.fill();
                }
            }

            PL_MULT.forEach((m, k) => {
                const bx = PL.CX + (k - 4) * PL.S;
                x.fillStyle = (hit === k) ? '#ffffff' : plinkoColor(m);
                rr(x, bx - PL.S / 2 + 2, PL.BIN_Y, PL.S - 4, PL.BIN_H, 6);
                x.fill();
                x.fillStyle = '#111';
                x.font = '700 13px Rajdhani, sans-serif';
                x.textAlign = 'center'; x.textBaseline = 'middle';
                x.fillText(`x${m}`, bx, PL.BIN_Y + PL.BIN_H / 2);
                x.fillStyle = '#d6dde4';
                x.font = '600 11px Exo 2, sans-serif';
                x.fillText(`+${Math.round(bet * m)}`, bx, PL.BIN_Y + PL.BIN_H + 14);
            });

            x.strokeStyle = '#8c9bab66'; x.lineWidth = 2;
            x.beginPath(); x.moveTo(20, 8); x.lineTo(20, 322); x.moveTo(380, 8); x.lineTo(380, 322);
            for (let divider = 60; divider <= 340; divider += 40) { x.moveTo(divider, 287); x.lineTo(divider, 322); }
            x.stroke();
            if (ball) window.EntityApp.drawPlinkoBody(x, ball);
        }

        function startPlinko() { window.EntityApp.startPlinko(); }

        /* --- 3. PACKDRAW --- */
        const PACK_VALUES = [0, 0, 0.5, 1, 3];
        let packState = 'idle';
        let packVals = [];
        let packStake = 0;

        function openGamePack() {
            runAbort(); gameBusy = false;
            currentGame = 'pack';
            packState = 'idle';
            const cards = [0, 1, 2, 3, 4].map(i =>
                `<div class="pk-card" id="pk-${i}" onclick="pickPack(${i})">
                    <div class="pk-inner">
                        <div class="pk-face pk-back">${CUNE[i % CUNE.length]}</div>
                        <div class="pk-face pk-front" id="pk-front-${i}">?</div>
                    </div>
                </div>`).join('');
            openActivity('Packdraw', 'Ziehe ein Pack und wähle eine von fünf Karten. Nur die gewählte Karte zählt, die anderen werden danach aufgedeckt.',
                `<div class="game-stage">
                    ${betBoxHTML()}
                    <div class="pack-row">${cards}</div>
                    <div class="game-msg" id="game-msg"></div>
                    <button class="play-btn" id="btn-play" onclick="startPack()">Pack ziehen</button>
                    <button class="play-btn ghost" onclick="openGamblingMenu()">Zurück</button>
                </div>`);
            updateBetUI();
        }

        function startPack() {
            if(packState === 'picking' || gameBusy) return;
            const stake = payStake();
            if(!stake) return;
            packStake = stake;
            packVals = shuffle(PACK_VALUES.slice());
            document.querySelectorAll('.pk-card').forEach((el, i) => {
                el.classList.remove('flipped', 'picked', 'dim');
                const f = document.getElementById(`pk-front-${i}`);
                const v = packVals[i];
                f.innerText = v > 0 ? `x${v}` : 'Niete';
                f.style.color = v > 0 ? '#ffffff' : '#ff4757';
            });
            packState = 'picking';
            gameAbort = () => { if (packState === 'picking') { packState = 'idle'; settle(packStake, 0); } };
            document.getElementById('btn-play').disabled = true;
            showMsg('Wähle eine Karte.', '');
        }

        function pickPack(i) {
            if(packState !== 'picking') return;
            packState = 'idle'; gameAbort = null;
            const m = packVals[i];
            const chips = settle(packStake, m);

            document.querySelectorAll('.pk-card').forEach((el, j) => {
                setTimeout(() => {
                    el.classList.add('flipped');
                    if(j === i) el.classList.add('picked');
                    else el.classList.add('dim');
                }, j === i ? 0 : 250 + j * 160);
            });

            resultMsg(chips, m > 0 ? `x${m}.` : '');
            const btn = document.getElementById('btn-play');
            if(btn) { btn.disabled = false; btn.innerText = 'Neues Pack'; }
        }

        /* --- 4. AUTOMATEN --- */
        const SLOT_SYM = ['◈', '◆', '✦', '●', '▰'];

        function openGameSlots() {
            runAbort(); gameBusy = false;
            currentGame = 'slots';
            openActivity('Automaten', 'Drei gleiche Symbole bringen das 10-fache des Einsatzes. Zwei gleiche geben den Einsatz zurück.',
                `<div class="game-stage">
                    ${betBoxHTML()}
                    <div class="slot-machine">
                        <div class="slot-reel"><div class="slot-inner" id="slot-1"></div></div>
                        <div class="slot-reel"><div class="slot-inner" id="slot-2"></div></div>
                        <div class="slot-reel"><div class="slot-inner" id="slot-3"></div></div>
                    </div>
                    <div class="game-msg" id="game-msg"></div>
                    <button class="play-btn" id="btn-play" onclick="playSlots()">Drehen</button>
                    <button class="play-btn ghost" onclick="openGamblingMenu()">Zurück</button>
                </div>`);
            initSlots();
            updateBetUI();
        }

        function initSlots() {
            [1, 2, 3].forEach(id => {
                const inner = document.getElementById(`slot-${id}`);
                if(!inner) return;
                inner.style.transition = 'none';
                inner.style.top = '0px';
                inner.innerHTML = '';
                for(let i = 0; i < 20; i++) {
                    inner.innerHTML += `<div class="slot-item">${SLOT_SYM[Math.floor(Math.random() * SLOT_SYM.length)]}</div>`;
                }
                inner.offsetHeight; // Reflow
                inner.style.transition = '';
            });
        }

        function playSlots() {
            if(gameBusy) return;
            const stake = payStake();
            if(!stake) return;
            document.getElementById('btn-play').disabled = true;
            showMsg('', '');
            initSlots();

            const res = [0, 1, 2].map(() => Math.floor(Math.random() * SLOT_SYM.length));

            const animationTimers = [];
            [1, 2, 3].forEach((id, idx) => {
                const inner = document.getElementById(`slot-${id}`);
                inner.querySelectorAll('.slot-item')[10].innerText = SLOT_SYM[res[idx]];
                animationTimers.push(setTimeout(() => { inner.style.top = '-1000px'; }, idx * 250));
            });

            let done = false;
            const finish = () => {
                if (done) return; done = true; gameAbort = null;
                animationTimers.forEach(clearTimeout);
                evalSlots(stake, res);
            };
            animationTimers.push(setTimeout(finish, 2600));
            gameAbort = finish;
        }

        function evalSlots(stake, res) {
            const [a, b, c] = res;
            let m = 0;
            if(a === b && b === c) m = 10;
            else if(a === b || b === c || a === c) m = 1;
            const chips = settle(stake, m);
            resultMsg(chips, m === 10 ? 'Jackpot!' : (m === 1 ? 'Zwei gleiche.' : ''));
            const btn = document.getElementById('btn-play');
            if(btn) btn.disabled = false;
        }

        /* --- 5. GLÜCKSRAD (Gewinne sichtbar auf dem Rad) --- */
        const WHEEL = [{ m: 0 }, { m: 0.5 }, { m: 0 }, { m: 1 }, { m: 0 }, { m: 2 }, { m: 0 }, { m: 4 }];
        const WHEEL_COL = ['#2b3440', '#8e9aa6', '#2b3440', '#c0c8d0', '#2b3440', '#b8912f', '#2b3440', '#8e2f3e'];
        let wheelRot = 0;

        function openGameWheel() {
            runAbort(); gameBusy = false;
            currentGame = 'wheel';
            wheelRot = 0;
            openActivity('Glücksrad', 'Jedes Feld zeigt den möglichen Gewinn in Chips bei deinem aktuellen Einsatz. Wo der Zeiger stehen bleibt, entscheidet der Zufall.',
                `<div class="game-stage">
                    ${betBoxHTML()}
                    <div class="wheel-container">
                        <div class="wheel-pointer"></div>
                        <div class="wheel" id="wheel"></div>
                    </div>
                    <div class="game-msg" id="game-msg"></div>
                    <button class="play-btn" id="btn-play" onclick="playWheel()">Drehen</button>
                    <button class="play-btn ghost" onclick="openGamblingMenu()">Zurück</button>
                </div>`);
            updateBetUI();
        }

        function buildWheel() {
            const w = document.getElementById('wheel');
            if(!w) return;
            const stops = WHEEL_COL.map((c, i) => `${c} ${i * 45}deg ${(i + 1) * 45}deg`).join(', ');
            w.style.background = `conic-gradient(${stops})`;
            w.innerHTML = WHEEL.map((s, i) => {
                const chips = Math.round(bet * s.m);
                const txt = s.m > 0 ? `x${s.m}` : 'Niete';
                const chipTxt = s.m > 0 ? `+${chips}` : '0';
                return `<div class="wh-lbl" style="transform: rotate(${i * 45 + 22.5}deg)"><span><b>${txt}</b><small>${chipTxt}</small></span></div>`;
            }).join('');
        }

        function playWheel() {
            if(gameBusy) return;
            const stake = payStake();
            if(!stake) return;
            document.getElementById('btn-play').disabled = true;
            showMsg('', '');

            const idx = Math.floor(Math.random() * WHEEL.length);
            const center = idx * 45 + 22.5;
            const jitter = (Math.random() - 0.5) * 30;
            const base = Math.floor(wheelRot / 360) * 360 + 360 * 5;
            wheelRot = base + (360 - center) + jitter;

            document.getElementById('wheel').style.transform = `rotate(${wheelRot}deg)`;

            let done = false;
            let timer;
            const finish = () => {
                if (done) return; done = true; gameAbort = null; clearTimeout(timer);
                const m = WHEEL[idx].m;
                const chips = settle(stake, m);
                resultMsg(chips, m > 0 ? `x${m}.` : '');
                const btn = document.getElementById('btn-play');
                if (btn) btn.disabled = false;
            };
            timer = setTimeout(finish, 4300);
            gameAbort = finish;
        }

        /* --- 6. BLACKJACK --- */
        const SUITS = ['♠', '♥', '♦', '♣'];
        const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let bj = null;

        function openGameBlackjack() {
            runAbort(); gameBusy = false;
            currentGame = 'bj';
            bj = { deck: [], player: [], dealer: [], state: 'idle', stake: 0 };
            openActivity('Blackjack', 'Erreiche 21 oder näher am Dealer, ohne über 21 zu gehen. Der Dealer zieht bis 17. Wer die Runde mitten drin abbricht, verliert den Einsatz.',
                `<div class="game-stage">
                    ${betBoxHTML()}
                    <div class="bj-table">
                        <div>
                            <div class="bj-label">Dealer <span id="bj-dval"></span></div>
                            <div class="bj-cards" id="bj-dealer"></div>
                        </div>
                        <div>
                            <div class="bj-label">Du <span id="bj-pval"></span></div>
                            <div class="bj-cards" id="bj-player"></div>
                        </div>
                    </div>
                    <div class="game-msg" id="game-msg"></div>
                    <div class="bj-actions">
                        <button class="play-btn" id="bj-deal" onclick="bjDeal()">Austeilen</button>
                        <button class="play-btn ghost" id="bj-hit" onclick="bjHit()" disabled>Ziehen</button>
                        <button class="play-btn ghost" id="bj-stand" onclick="bjStand()" disabled>Halten</button>
                    </div>
                    <button class="play-btn ghost" onclick="openGamblingMenu()">Zurück</button>
                </div>`);
            bjRender(false);
            updateBetUI();
        }

        function bjVal(c) {
            if(c.r === 'A') return 11;
            if(['J', 'Q', 'K'].includes(c.r)) return 10;
            return parseInt(c.r, 10);
        }

        function handVal(h) {
            let v = h.reduce((a, c) => a + bjVal(c), 0);
            let aces = h.filter(c => c.r === 'A').length;
            while(v > 21 && aces > 0) { v -= 10; aces--; }
            return v;
        }

        function buildDeck() {
            const d = [];
            for(const s of SUITS) for(const r of RANKS) d.push({ r, s });
            return shuffle(d);
        }

        function cardHTML(c) {
            if(!c) return `<div class="bj-card back"><span>${CUNE[0]}</span></div>`;
            const red = c.s === '♥' || c.s === '♦';
            return `<div class="bj-card ${red ? 'red' : ''}"><span>${c.r}</span><span class="bj-s">${c.s}</span></div>`;
        }

        function bjRender(hole) {
            const dEl = document.getElementById('bj-dealer');
            if(!dEl || !bj) return;
            dEl.innerHTML = bj.dealer.map((c, i) => (hole && i === 1) ? cardHTML(null) : cardHTML(c)).join('');
            document.getElementById('bj-player').innerHTML = bj.player.map(c => cardHTML(c)).join('');
            document.getElementById('bj-pval').innerText = bj.player.length ? `(${handVal(bj.player)})` : '';
            document.getElementById('bj-dval').innerText = (bj.dealer.length && !hole) ? `(${handVal(bj.dealer)})` : '';
        }

        function bjButtons(on) {
            const h = document.getElementById('bj-hit');
            const s = document.getElementById('bj-stand');
            if(h) h.disabled = !on;
            if(s) s.disabled = !on;
        }

        function bjDeal() {
            if(!bj || bj.state === 'play' || gameBusy) return;
            const stake = payStake();
            if(!stake) return;

            bj.stake = stake;
            bj.deck = buildDeck();
            bj.player = [bj.deck.pop(), bj.deck.pop()];
            bj.dealer = [bj.deck.pop(), bj.deck.pop()];
            bj.state = 'play';
            gameAbort = () => { if(bj.state === 'play') { bj.state = 'over'; settle(bj.stake, 0); } };

            document.getElementById('bj-deal').disabled = true;
            showMsg('', '');
            bjRender(true);

            const pBJ = handVal(bj.player) === 21;
            const dBJ = handVal(bj.dealer) === 21;
            if(pBJ || dBJ) {
                bjRender(false);
                if(pBJ && dBJ) bjEnd(1, 'Doppel-Blackjack.');
                else if(pBJ) bjEnd(2.5, 'Blackjack!');
                else bjEnd(0, 'Dealer hat Blackjack.');
                return;
            }
            bjButtons(true);
        }

        function bjHit() {
            if(!bj || bj.state !== 'play') return;
            bj.player.push(bj.deck.pop());
            playSFX('coin');
            bjRender(true);
            const v = handVal(bj.player);
            if(v > 21) { bjRender(false); bjEnd(0, 'Überkauft!'); }
            else if(v === 21) bjStand();
        }

        function bjStand() {
            if(!bj || bj.state !== 'play') return;
            bjButtons(false);
            while(handVal(bj.dealer) < 17) bj.dealer.push(bj.deck.pop());
            bjRender(false);
            const p = handVal(bj.player), d = handVal(bj.dealer);
            if(d > 21) bjEnd(2, 'Dealer überkauft!');
            else if(p > d) bjEnd(2, 'Du gewinnst!');
            else if(p === d) bjEnd(1, 'Unentschieden.');
            else bjEnd(0, 'Dealer gewinnt.');
        }

        function bjEnd(mult, text) {
            bj.state = 'over';
            gameAbort = null;
            const chips = settle(bj.stake, mult);
            resultMsg(chips, text);
            bjButtons(false);
            const d = document.getElementById('bj-deal');
            if(d) { d.disabled = false; d.innerText = 'Neue Runde'; }
        }

        /* --- SHOP & SUBSTANCES --- */
        const substances = [
            { id: 'neon-nebel', name: 'Neon-Nebel', cost: 5, desc: 'Übersättigte Farben & Leuchten.' },
            { id: 'traumstaub', name: 'Traumstaub', cost: 10, desc: 'Alles wird weich und schwebt sanft.' },
            { id: 'glitch-gas', name: 'Glitch-Gas', cost: 15, desc: 'Die Realität zerreißt kurzzeitig.' },
            { id: 'turbo-tropfen', name: 'Turbo-Tropfen', cost: 20, desc: 'Extreme Beschleunigung!' },
            { id: 'lachkristalle', name: 'Lachkristalle', cost: 25, desc: 'Erzwungenes, irres Kichern.' },
            { id: 'schwerelos-sirup', name: 'Zero-G Sirup', cost: 30, desc: 'Die Schwerkraft wird umgekehrt.' },
            { id: 'prisma-pulver', name: 'Prisma-Pulver', cost: 35, desc: 'Ein endloser Regenbogen-Trip.' },
            { id: 'zeitblase', name: 'Zeitblase', cost: 40, desc: 'Alles bewegt sich in Zeitlupe.' },
            { id: 'pixel-pilz', name: 'Pixel-Pilz', cost: 45, desc: 'Macht die Sicht unscharf und pixelig.' },
            { id: 'echo-elixier', name: 'Echo-Elixier', cost: 50, desc: 'Doppelvisionen des Gesichts.' },
            { id: 'schatten-sirup', name: 'Schatten-Sirup', cost: 55, desc: 'Verdunkelt die Entität vollständig.' },
            { id: 'gummi-gelee', name: 'Gummi-Gelee', cost: 60, desc: 'Das Gesicht wabbelt wie Pudding.' },
            { id: 'spiegel-saft', name: 'Spiegel-Saft', cost: 65, desc: 'Spiegelt die gesamte Realität.' },
            { id: 'wackel-wasser', name: 'Wackel-Wasser', cost: 70, desc: 'Die Welt schwankt wie ein Boot.' },
            { id: 'zitter-zucker', name: 'Zitter-Zucker', cost: 75, desc: 'Extremes Zittern und Frieren.' },
            { id: 'schrumpf-schluck', name: 'Schrumpftrank', cost: 80, desc: 'Macht das Gesicht winzig.' },
            { id: 'riesen-rausch', name: 'Riesen-Rausch', cost: 85, desc: 'Macht das Gesicht gigantisch.' },
            { id: 'farb-fresser', name: 'Farb-Fresser', cost: 90, desc: 'Entzieht der Welt alle Farben.' },
            { id: 'strudel-staub', name: 'Strudel-Staub', cost: 95, desc: 'Das Gesicht dreht sich unendlich.' },
            { id: 'magnet-matsch', name: 'Magnet-Matsch', cost: 100, desc: 'Verschiebt die Schwerkraft.' }
        ];

        function openShop() {
            runAbort(); currentGame = null; gameBusy = false;
            let gridHTML = '<div class="substance-grid">';
            substances.forEach((s, i) => {
                gridHTML += `
                    <div class="sub-item" onclick="buySubstance('${s.id}', ${s.cost}, '${s.name}')">
                        <div class="sub-icon">${CUNE[i % CUNE.length]}</div>
                        <div class="sub-name">${s.name}</div>
                        <div class="sub-desc">${s.desc}</div>
                        <div class="sub-cost">Preis: ${s.cost} <span class="icon-coin" style="background: var(--coin-win)"></span></div>
                    </div>`;
            });
            gridHTML += '</div>';

            openActivity("Schwarzmarkt", "Tausche deine Gewinnchips gegen experimentelle Substanzen ein. Achtung: Nebenwirkungen garantiert!", gridHTML);
        }

        function buySubstance(id, cost, name) {
            if(player.coinsWin < cost) {
                speak("Zu wenig Chips! Geh ins Casino.", true);
                triggerEmotion('emotion-sad', 2000);
                return;
            }
            addCoins('win', -cost);
            applySubstance(id, true);
            closeActivity();
            playSFX('substance');
            speak(`${name} konsumiert. System wird beeinflusst...`, true);
            addXP(20);
        }

        function applySubstance(id, isNew) {
            resetSubstance(true);
            document.body.classList.add(`sub-${id}`);
            player.activeSubstance = id;
            saveData();
            if(isNew) triggerEmotion('emotion-shocked', 3000);
        }

        function resetSubstance(quiet = false) {
            const classes = document.body.className.split(" ").filter(c => !c.startsWith("sub-"));
            document.body.className = classes.join(" ").trim();
            player.activeSubstance = null;
            saveData();
            if(!quiet) {
                playSFX('drink');
                speak("Milch getrunken. Effekte neutralisiert.", true);
                triggerEmotion('emotion-happy', 2000);
            }
        }

        /* --- MODES --- */
        function toggleMod(modName) {
            const btn = document.getElementById(`btn-${modName}`);
            btn.classList.toggle('active');
            if (btn.classList.contains('active')) document.body.classList.add(`${modName}-mode`);
            else {
                document.body.classList.remove(`${modName}-mode`);
                if(modName === 'gravity') document.querySelector('.face-container').style.transform = 'rotateY(0deg) rotateX(0deg)';
            }
        }

        function toggleSpaMode() {
            const btn = document.getElementById('btn-spa');
            if (document.body.classList.contains('spa-active')) {
                document.body.classList.remove('spa-active'); btn.textContent = 'Starten'; speak("Spa beendet.", true);
            } else {
                document.body.classList.add('spa-active'); btn.textContent = 'Abbrechen';
                speak("Entspanne dich.", true);
            }
        }
