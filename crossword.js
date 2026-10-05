// The game. app.js builds the puzzle and calls startGame(puzzle).
window.startGame = function (puzzle) {
    'use strict';

    const ACROSS = 0;
    const DOWN = 1;

    // The key carries a fingerprint of the answer grid, so progress saved against an
    // earlier layout (the word sets grow over time) is ignored rather than restored
    // into the wrong cells
    const layout = Crossword.hash(puzzle.cells.map(row => row.map(c => c ? c.letter : '.').join('')).join('/')).toString(36);
    const storageKey = `crossword:${puzzle.set}:${puzzle.rows}:${puzzle.seed}:${layout}`;
    // The Mini keeps its own history, archive and streak, apart from the full puzzle
    const archiveName = puzzle.mini ? `${puzzle.setName} Mini` : puzzle.setName;
    const STATS_KEY = 'crossword:stats';
    const MODE_KEY = 'crossword:mode';
    const THEME_KEY = 'crossword:theme';

    const gridEl = document.getElementById('crossword-grid');
    const kbd = document.getElementById('kbd');
    const activeClueEl = document.getElementById('active-clue');
    const timerEl = document.getElementById('timer');
    const progressEl = document.getElementById('progress');
    const bannerEl = document.getElementById('win-banner');
    const fullBannerEl = document.getElementById('full-banner');
    const winTextEl = document.getElementById('win-text');
    const winVerdictEl = document.getElementById('win-verdict');
    const modeEl = document.getElementById('mode');
    const pencilButton = document.getElementById('pencil');
    const clueLists = { [ACROSS]: document.getElementById('across-clues'), [DOWN]: document.getElementById('down-clues') };

    // --- State ----------------------------------------------------------------

    const cells = [];          // cells[r][c] = { td, letterEl, value, pencil, letter, number, r, c } or null
    const clues = { [ACROSS]: puzzle.across, [DOWN]: puzzle.down };
    let current = null;        // { r, c }
    let orientation = ACROSS;
    let elapsed = 0;           // seconds
    let reveals = 0;           // letters revealed, for the record
    const REVEAL_PENALTY = 20; // seconds added to the clock per revealed letter
    const penaltyEl = document.getElementById('penalty');
    let penaltyTimer = null;
    let solved = false;
    let pencilMode = false;
    let mode = 'normal';
    let timerHandle = null;

    // --- Storage helpers ----------------------------------------------------------

    function readJson(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function writeJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            // Storage unavailable (private mode, quota); the game still works without it
        }
    }

    // Pencil letters are stored lowercase so the saved shape stays a plain string per cell
    function saveState() {
        const entries = cells.map(row => row.map(cell => cell ? (cell.pencil ? cell.value.toLowerCase() : cell.value) : null));
        writeJson(storageKey, { entries, elapsed, reveals, solved });
    }

    // --- Grid helpers -------------------------------------------------------------

    function cellAt(r, c) {
        return (cells[r] && cells[r][c]) || null;
    }

    function allCells() {
        return cells.flat().filter(Boolean);
    }

    function step(o) {
        return o === ACROSS ? { dr: 0, dc: 1 } : { dr: 1, dc: 0 };
    }

    // All cells of the word through (r, c) in orientation o, in order
    function wordCells(r, c, o) {
        const { dr, dc } = step(o);
        while (cellAt(r - dr, c - dc)) { r -= dr; c -= dc; }
        const out = [];
        while (cellAt(r, c)) { out.push(cellAt(r, c)); r += dr; c += dc; }
        return out;
    }

    function clueFor(r, c, o) {
        const start = wordCells(r, c, o)[0];
        return clues[o].find(cl => cl.row === start.r && cl.col === start.c) || null;
    }

    function hasWord(r, c, o) {
        return wordCells(r, c, o).length > 1;
    }

    function orderedClues() {
        return clues[ACROSS].map(cl => ({ cl, o: ACROSS })).concat(clues[DOWN].map(cl => ({ cl, o: DOWN })));
    }

    function isClueComplete(cl, o) {
        return wordCells(cl.row, cl.col, o).every(cell => cell.value !== '');
    }

    function setValue(cell, value, pencil = false) {
        cell.value = value;
        cell.pencil = pencil && value !== '';
        cell.letterEl.textContent = value;
        cell.td.classList.toggle('pencil', cell.pencil);
        cell.td.classList.remove('correct', 'incorrect');
        if (mode === 'easy' && value !== '' && value !== cell.letter) {
            cell.td.classList.add('incorrect');
        }
    }

    // --- Rendering ----------------------------------------------------------------

    function buildGrid() {
        for (let r = 0; r < puzzle.rows; r++) {
            const tr = document.createElement('tr');
            cells[r] = [];
            for (let c = 0; c < puzzle.columns; c++) {
                const td = document.createElement('td');
                const data = puzzle.cells[r][c];
                if (!data) {
                    td.className = 'black';
                    cells[r][c] = null;
                } else {
                    td.className = 'white';
                    td.dataset.row = r;
                    td.dataset.col = c;
                    td.dataset.answer = data.letter; // used by the printed answer key
                    td.setAttribute('role', 'gridcell');
                    td.setAttribute('aria-label', `Row ${r + 1} column ${c + 1}`);
                    if (data.number !== null) {
                        const num = document.createElement('span');
                        num.className = 'number';
                        num.textContent = data.number;
                        td.appendChild(num);
                    }
                    const letterEl = document.createElement('span');
                    letterEl.className = 'letter';
                    td.appendChild(letterEl);
                    const cell = { td, letterEl, value: '', pencil: false, letter: data.letter, number: data.number, r, c };
                    cells[r][c] = cell;
                    td.addEventListener('pointerdown', e => {
                        e.preventDefault(); // keep focus on the keyboard input
                        const wasActive = document.activeElement === kbd;
                        if (current && current.r === r && current.c === c) {
                            // Tapping the selected cell toggles direction, but only if the
                            // grid was already active; a first tap should just open the keyboard
                            if (wasActive) toggleOrientation();
                        } else {
                            setCurrent(cell);
                        }
                        focusKeyboard();
                    });
                }
                tr.appendChild(td);
            }
            gridEl.appendChild(tr);
        }
    }

    // Hard mode shows the harder clue where a word has one
    function clueText(cl) {
        return mode === 'hard' && cl.hardClue ? cl.hardClue : cl.clue;
    }

    function refreshClueText() {
        Object.values(clues).flat().forEach(cl => {
            if (cl.el) cl.el.querySelector('.t').textContent = clueText(cl);
        });
        if (current) refreshHighlight();
    }

    function buildClues() {
        [ACROSS, DOWN].forEach(o => {
            clues[o].forEach(cl => {
                const li = document.createElement('li');
                li.className = 'clue';
                const n = document.createElement('span');
                n.className = 'n';
                n.textContent = cl.number;
                const t = document.createElement('span');
                t.className = 't';
                t.textContent = clueText(cl);
                li.append(n, t);
                li.addEventListener('click', () => {
                    goToClue(cl, o);
                    focusKeyboard();
                });
                cl.el = li;
                clueLists[o].appendChild(li);
            });
        });
    }

    function refreshHighlight() {
        allCells().forEach(cell => cell.td.classList.remove('selected', 'current'));
        Object.values(clues).flat().forEach(cl => cl.el.classList.remove('active'));
        if (!current) return;

        wordCells(current.r, current.c, orientation).forEach(cell => cell.td.classList.add('selected'));
        cellAt(current.r, current.c).td.classList.add('current');

        const cl = clueFor(current.r, current.c, orientation);
        if (cl) {
            cl.el.classList.add('active');
            activeClueEl.innerHTML = `<b>${cl.number} ${orientation === ACROSS ? 'Across' : 'Down'}</b> ${escapeHtml(clueText(cl))}`;
        } else {
            activeClueEl.textContent = '';
        }
    }

    function refreshClueDone() {
        orderedClues().forEach(({ cl, o }) => cl.el.classList.toggle('done', isClueComplete(cl, o)));
    }

    function refreshProgress() {
        const all = allCells();
        const filled = all.filter(cell => cell.value !== '').length;
        progressEl.textContent = Math.round(100 * filled / all.length) + '%';
    }

    function escapeHtml(s) {
        return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    // --- Keyboard input -------------------------------------------------------------

    function focusKeyboard() {
        if (document.activeElement !== kbd) {
            kbd.focus({ preventScroll: true });
        }
    }

    // Keep the hidden input near the current cell so browsers do not scroll away from it
    function positionKeyboard() {
        if (!current) return;
        const rect = cellAt(current.r, current.c).td.getBoundingClientRect();
        kbd.style.top = Math.max(0, rect.top) + 'px';
        kbd.style.left = Math.max(0, rect.left) + 'px';
    }

    // --- Navigation ---------------------------------------------------------------

    function setCurrent(cell) {
        if (!cell) return;
        current = { r: cell.r, c: cell.c };
        // If there is no word in this orientation through the cell, use the other one
        if (!hasWord(cell.r, cell.c, orientation) && hasWord(cell.r, cell.c, 1 - orientation)) {
            orientation = 1 - orientation;
        }
        refreshHighlight();
        positionKeyboard();
    }

    function toggleOrientation() {
        if (current && hasWord(current.r, current.c, 1 - orientation)) {
            orientation = 1 - orientation;
            refreshHighlight();
        }
    }

    function goToClue(cl, o) {
        orientation = o;
        const word = wordCells(cl.row, cl.col, o);
        setCurrent(word.find(cell => cell.value === '') || word[0]);
    }

    function currentIndex() {
        const word = wordCells(current.r, current.c, orientation);
        return { word, idx: word.findIndex(cell => cell.r === current.r && cell.c === current.c) };
    }

    // Move to the next empty cell in the current word after the current cell,
    // otherwise to the first empty cell of the next unfinished clue
    // Move to the next empty cell in the current word after the current cell,
    // otherwise to the first empty cell of the next unfinished clue. A letter
    // already filled by a crossing is never parked on, so the next keystroke
    // cannot overwrite it. Only when the whole grid is full does the cursor
    // walk along the word, so a wrong word can be retyped.
    function advance() {
        const { word, idx } = currentIndex();
        const later = word.slice(idx + 1).find(cell => cell.value === '');
        if (later) { setCurrent(later); return; }
        if (nextClue(1, true)) return;
        if (idx + 1 < word.length) setCurrent(word[idx + 1]);
    }

    // Step to the next (dir = 1) or previous (dir = -1) clue. With onlyUnfinished,
    // skip clues that are already fully filled. Returns whether it moved.
    function nextClue(dir, onlyUnfinished) {
        const list = orderedClues();
        const cl = clueFor(current.r, current.c, orientation);
        const start = list.findIndex(item => item.cl === cl && item.o === orientation);
        for (let i = 1; i <= list.length; i++) {
            const item = list[((start + dir * i) % list.length + list.length) % list.length];
            if (onlyUnfinished && isClueComplete(item.cl, item.o)) continue;
            goToClue(item.cl, item.o);
            return true;
        }
        return false; // everything is filled: stay put
    }

    function retreat() {
        const { word, idx } = currentIndex();
        if (idx > 0) setCurrent(word[idx - 1]);
    }

    // Arrow key: same axis moves to the next white cell, other axis switches orientation
    function arrow(dr, dc) {
        const axis = dr !== 0 ? DOWN : ACROSS;
        if (axis !== orientation && hasWord(current.r, current.c, axis)) {
            orientation = axis;
            refreshHighlight();
            return;
        }
        let r = current.r + dr, c = current.c + dc;
        while (r >= 0 && c >= 0 && r < puzzle.rows && c < puzzle.columns) {
            if (cellAt(r, c)) { setCurrent(cellAt(r, c)); return; }
            r += dr; c += dc;
        }
    }

    function typeLetter(letter) {
        if (solved || !current) return;
        setValue(cellAt(current.r, current.c), letter.toUpperCase(), pencilMode);
        afterEdit();
        advance();
    }

    function backspace() {
        if (solved || !current) return;
        const cell = cellAt(current.r, current.c);
        if (cell.value === '') {
            retreat();
            setValue(cellAt(current.r, current.c), '');
        } else {
            setValue(cell, '');
        }
        afterEdit();
    }

    kbd.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        switch (e.key) {
            case 'ArrowRight': arrow(0, 1); break;
            case 'ArrowLeft': arrow(0, -1); break;
            case 'ArrowDown': arrow(1, 0); break;
            case 'ArrowUp': arrow(-1, 0); break;
            case 'Enter':
            case ' ': toggleOrientation(); break;
            case 'Backspace': backspace(); break;
            case 'Delete':
                if (!solved && current) { setValue(cellAt(current.r, current.c), ''); afterEdit(); }
                break;
            case '.': togglePencil(); break;
            default:
                if (/^[a-z]$/i.test(e.key)) { typeLetter(e.key); break; }
                return; // Tab, software-keyboard keys and everything else: leave to the browser
        }
        e.preventDefault();
    });

    // Software keyboards often report no usable key on keydown and only fire input.
    // Take whatever landed in the hidden input and clear it.
    kbd.addEventListener('input', () => {
        const v = kbd.value;
        kbd.value = '';
        const m = v.match(/[a-z]/gi);
        if (m) typeLetter(m[m.length - 1]);
    });

    // --- Editing side effects -------------------------------------------------------

    function afterEdit() {
        refreshClueDone();
        refreshProgress();
        checkSolved();
        refreshFullBanner();
        saveState();
    }

    // A full grid that is not solved gets a nudge in every mode, hard included.
    // It says nothing about where the error is, so hard mode keeps its point.
    function refreshFullBanner() {
        const full = !solved && allCells().every(cell => cell.value !== '');
        fullBannerEl.classList.toggle('show', full);
    }

    // --- Checking and revealing -----------------------------------------------------

    function mark(cell) {
        cell.td.classList.remove('correct', 'incorrect');
        if (cell.value === '') return;
        cell.td.classList.add(cell.value === cell.letter ? 'correct' : 'incorrect');
    }

    // A reveal costs time, so it is a decision rather than a free answer
    function reveal(cell) {
        if (cell.value !== cell.letter) {
            reveals++;
            elapsed += REVEAL_PENALTY;
        }
        setValue(cell, cell.letter);
        cell.td.classList.add('correct', 'revealed');
    }

    function checkSolved() {
        const all = allCells();
        if (solved || !all.every(cell => cell.value === cell.letter)) return;
        solved = true;
        stopTimer();
        const wave = startCelebration(all);
        all.forEach(cell => cell.td.classList.add('correct'));
        const record = recordSolve();
        showWin(record, wave);
        saveState();
    }

    // Green sweeps from the top left and each letter pops in turn. Returns how
    // long the sweep takes, so the banner's count-up can keep pace with it.
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let celebrationTimer = null;

    function startCelebration(all) {
        if (reducedMotion) return 0;
        const step = puzzle.rows <= 8 ? 70 : 40;
        let longest = 0;
        all.forEach(cell => {
            const delay = (cell.r + cell.c) * step;
            cell.td.style.setProperty('--d', `${delay}ms`);
            longest = Math.max(longest, delay);
        });
        gridEl.classList.add('solved');
        clearTimeout(celebrationTimer);
        celebrationTimer = setTimeout(endCelebration, longest + 800);
        return longest + 350;
    }

    function endCelebration() {
        clearTimeout(celebrationTimer);
        gridEl.classList.remove('solved');
        allCells().forEach(cell => cell.td.style.removeProperty('--d'));
    }

    // Shows what the reveals just made cost, and the new time at once
    function chargeReveals(count) {
        if (count <= 0) return;
        timerEl.textContent = formatTime(elapsed);
        penaltyEl.textContent = `+${count * REVEAL_PENALTY}s`;
        penaltyEl.classList.remove('show');
        void penaltyEl.offsetWidth; // restart the animation when it fires twice in a row
        penaltyEl.classList.add('show');
        clearTimeout(penaltyTimer);
        penaltyTimer = setTimeout(() => penaltyEl.classList.remove('show'), 1500);
    }

    function revealsNote() {
        if (reveals === 0) return '';
        return `, including ${formatTime(reveals * REVEAL_PENALTY)} for ${reveals} revealed letter${reveals === 1 ? '' : 's'}`;
    }

    // The banner: the time counts up with the sweep on a fresh solve, then a
    // one-line verdict against earlier solves of the same size
    function showWin(record, countUpMs = 0) {
        const textFor = t => {
            let text = `Solved in ${formatTime(t)}${revealsNote()}`;
            if (record && record.streak > 1) text += `. Streak: ${record.streak} days`;
            if (record && record.isBest) text += '. New best time';
            return text + '.';
        };
        winVerdictEl.textContent = [challengeNote(), record ? verdict(record) : ''].filter(Boolean).join(' ');
        challengeBanner.classList.remove('show');
        bannerEl.classList.add('show');
        if (countUpMs <= 0 || elapsed === 0) { winTextEl.textContent = textFor(elapsed); return; }
        winTextEl.textContent = textFor(0); // never a blank banner while the first frame waits
        const started = performance.now();
        const tick = now => {
            const k = Math.min(1, (now - started) / countUpMs);
            const eased = 1 - Math.pow(1 - k, 3);
            winTextEl.textContent = textFor(Math.round(elapsed * eased));
            if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    // --- Challenges ----------------------------------------------------------------
    // A link to this exact puzzle carrying a time to beat. The friend sees the
    // target while solving and the result against it when done.

    const challengeBanner = document.getElementById('challenge-banner');
    if (puzzle.beat) {
        document.getElementById('challenge-target').textContent = formatTime(puzzle.beat);
        challengeBanner.classList.add('show');
    }

    function challengeNote() {
        if (!puzzle.beat) return '';
        if (elapsed < puzzle.beat) return `Challenge beaten by ${formatTime(puzzle.beat - elapsed)}.`;
        if (elapsed === puzzle.beat) return 'Dead heat with the challenge.';
        return `Challenge missed by ${formatTime(elapsed - puzzle.beat)}.`;
    }

    function challengeLink() {
        const params = new URLSearchParams();
        if (puzzle.custom) {
            const custom = new URLSearchParams(window.location.search).get('custom');
            if (custom) params.set('custom', custom);
        } else {
            params.set('set', puzzle.set);
        }
        if (puzzle.mini) params.set('mini', '1');
        else params.set('size', String(puzzle.rows));
        if (puzzle.date) params.set('date', puzzle.date);
        else params.set('seed', String(puzzle.seed));
        params.set('beat', String(elapsed));
        return `${new URL('index.html', window.location.href)}?${params}`;
    }

    document.getElementById('challenge-button').addEventListener('click', async () => {
        const button = document.getElementById('challenge-button');
        const text = `${puzzle.title}: can you beat ${formatTime(elapsed)}?\n${challengeLink()}`;
        const touch = window.matchMedia('(pointer: coarse)').matches;
        try {
            if (touch && navigator.share) {
                await navigator.share({ text });
            } else {
                await navigator.clipboard.writeText(text);
                button.textContent = 'Link copied';
            }
        } catch (e) {
            shareText.value = text;
            shareCopy.textContent = 'Copy';
            shareDialog.showModal();
            shareText.select();
        }
    });

    function verdict(record) {
        const size = puzzle.mini ? 'Mini' : `${puzzle.rows}×${puzzle.rows}`;
        if (record.previous === 0) return `Your first ${size}. Now there is a time to beat.`;
        if (elapsed < record.bestSimilar) return `Your fastest ${size} yet, ${formatTime(record.bestSimilar - elapsed)} under your previous best.`;
        if (elapsed < record.average) return `Faster than your ${size} average of ${formatTime(record.average)}.`;
        if (elapsed === record.average) return `Exactly your ${size} average of ${formatTime(record.average)}.`;
        return `Slower than your ${size} average of ${formatTime(record.average)}.`;
    }

    // --- Stats and streaks ------------------------------------------------------------

    // The player's own calendar day. Streaks and the archive turn over at local
    // midnight; a stored date after today can only be a UTC-dated record from
    // before the day followed local time, and is treated as today's.
    function todayLocal() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function previousDay(dateStr) {
        const d = new Date(dateStr + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
    }

    function loadStats() {
        const s = readJson(STATS_KEY) || {};
        return {
            solved: s.solved || 0,
            totalTime: s.totalTime || 0,
            best: s.best || null,
            streak: s.streak || 0,
            lastDaily: s.lastDaily || null,
            miniStreak: s.miniStreak || 0,
            lastMini: s.lastMini || null,
            history: Array.isArray(s.history) ? s.history : [],
            days: daysFromStats(s),
            bySize: bySizeFromStats(s),
        };
    }

    // Solves, total time and best per grid size, as {"12": {solved, totalTime, best}}.
    // A Mini is not compared with a 15x15. Stats saved before this record existed
    // are read back from their history, which approximates the totals.
    function bySizeFromStats(s) {
        if (s.bySize && typeof s.bySize === 'object' && !Array.isArray(s.bySize)) return s.bySize;
        const bySize = {};
        for (const h of Array.isArray(s.history) ? s.history : []) {
            const entry = bySize[h.size] || (bySize[h.size] = { solved: 0, totalTime: 0, best: null });
            entry.solved += 1;
            entry.totalTime += h.time;
            if (entry.best === null || h.time < entry.best) entry.best = h.time;
        }
        return bySize;
    }

    // Which word sets were solved on which puzzle date, as {date: [set name, ...]}.
    // Kept apart from the history, which is capped. Stats saved before this
    // record existed are read back from their history: a daily's seed is its date.
    function daysFromStats(s) {
        if (s.days && typeof s.days === 'object' && !Array.isArray(s.days)) return s.days;
        const days = {};
        for (const h of Array.isArray(s.history) ? s.history : []) {
            const m = /^(20\d\d)(\d\d)(\d\d)$/.exec(String(h.seed));
            if (!m) continue;
            const date = `${m[1]}-${m[2]}-${m[3]}`;
            if (Number.isNaN(Date.parse(date + 'T00:00:00Z'))) continue;
            days[date] = days[date] || [];
            if (!days[date].includes(h.set)) days[date].push(h.set);
        }
        return days;
    }

    // Called once per solved puzzle. Returns the streak after this solve and
    // whether this was a best time, or null if this solve was already recorded.
    function recordSolve() {
        const stats = loadStats();
        const id = storageKey;
        if (stats.history.some(h => h.id === id)) return null;

        const today = todayLocal();
        if (puzzle.daily && puzzle.date === today) {
            const streakKey = puzzle.mini ? 'miniStreak' : 'streak';
            const lastKey = puzzle.mini ? 'lastMini' : 'lastDaily';
            const last = stats[lastKey];
            if (last === previousDay(today)) stats[streakKey] += 1;
            else if (!(last === today || (last && last > today))) stats[streakKey] = 1;
            stats[lastKey] = today;
        }

        const size = stats.bySize[puzzle.rows] || (stats.bySize[puzzle.rows] = { solved: 0, totalTime: 0, best: null });
        const isBest = size.best !== null && elapsed < size.best;
        size.solved += 1;
        size.totalTime += elapsed;
        if (size.best === null || elapsed < size.best) size.best = elapsed;
        // Earlier solves of the same size, for the verdict: a Mini is not compared with a 15x15
        const similar = stats.history.filter(h => h.size === puzzle.rows);
        const average = similar.length ? Math.round(similar.reduce((sum, h) => sum + h.time, 0) / similar.length) : null;
        const bestSimilar = similar.length ? Math.min(...similar.map(h => h.time)) : null;
        stats.solved += 1;
        stats.totalTime += elapsed;
        if (stats.best === null || elapsed < stats.best) stats.best = elapsed;
        stats.history.unshift({ id, when: today, set: archiveName, seed: puzzle.seed, size: puzzle.rows, time: elapsed, reveals });
        stats.history = stats.history.slice(0, 50);
        if (puzzle.date) {
            const list = stats.days[puzzle.date] || [];
            if (!list.includes(archiveName)) list.push(archiveName);
            stats.days[puzzle.date] = list;
        }
        writeJson(STATS_KEY, stats);
        refreshStreak();
        return { streak: puzzle.mini ? stats.miniStreak : stats.streak, isBest, previous: similar.length, average, bestSimilar };
    }

    // A streak survives until the end of the day after the last daily solve
    function currentStreak(stats, mini = puzzle.mini) {
        const today = todayLocal();
        const last = mini ? stats.lastMini : stats.lastDaily;
        if (last === today || last === previousDay(today) || (last && last > today)) return mini ? stats.miniStreak : stats.streak;
        return 0;
    }

    function refreshStreak() {
        const streak = currentStreak(loadStats());
        document.getElementById('streak').textContent = streak;
        document.getElementById('streak-label').textContent = puzzle.mini ? 'Mini streak' : 'Streak';
        document.getElementById('streak-status').hidden = streak === 0;
    }

    function showStats() {
        const stats = loadStats();
        const list = document.getElementById('stats-list');
        const dayWord = n => n + (n === 1 ? ' day' : ' days');
        const rows = [
            ['Puzzles solved', stats.solved],
            ['Current streak', dayWord(currentStreak(stats, false))],
            ['Mini streak', dayWord(currentStreak(stats, true))],
        ];
        // Best and average per grid size, smallest first
        Object.keys(stats.bySize).map(Number).sort((a, b) => a - b).forEach(n => {
            const e = stats.bySize[n];
            if (!e.solved) return;
            rows.push([`${n}×${n}${n === 7 ? ' Mini' : ''}`, `best ${formatTime(e.best)} · average ${formatTime(Math.round(e.totalTime / e.solved))}`]);
        });
        list.innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(String(k))}</dt><dd>${escapeHtml(String(v))}</dd>`).join('');
        if (stats.history.length) {
            const items = stats.history.slice(0, 10).map(h =>
                `<li><span>${escapeHtml(h.when)} · ${escapeHtml(h.set)} · ${h.size}×${h.size}</span><span>${formatTime(h.time)}${h.reveals ? ' *' : ''}</span></li>`
            ).join('');
            list.insertAdjacentHTML('afterend', `<h3 class="recent">Recent</h3><ul class="recent">${items}</ul>`);
        }
        document.getElementById('stats-dialog').showModal();
    }

    document.getElementById('stats-button').addEventListener('click', () => {
        document.querySelectorAll('#stats-dialog .recent').forEach(el => el.remove());
        showStats();
    });

    // --- Archive calendar -----------------------------------------------------------
    // A month of this word set's daily puzzles: solved days filled, today ringed,
    // every past day a link to that day's puzzle at the current size.

    const calendarDialog = document.getElementById('calendar-dialog');
    const calendarButton = document.getElementById('calendar-button');
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarTitle = document.getElementById('calendar-title');
    const calendarSummary = document.getElementById('calendar-summary');
    const calendarPrev = document.getElementById('calendar-prev');
    const calendarNext = document.getElementById('calendar-next');
    const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    let calendarMonth = null; // {year, month} with month 1-12

    function monthOf(dateStr) {
        return { year: Number(dateStr.slice(0, 4)), month: Number(dateStr.slice(5, 7)) };
    }

    function shiftMonth(ym, by) {
        const d = new Date(Date.UTC(ym.year, ym.month - 1 + by, 1));
        return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
    }

    function dateString(year, month, day) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function renderCalendar() {
        const { year, month } = calendarMonth;
        const today = todayLocal();
        const thisMonth = monthOf(today);
        const days = loadStats().days;
        const first = new Date(Date.UTC(year, month - 1, 1));
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const lead = (first.getUTCDay() + 6) % 7; // Monday first

        calendarTitle.textContent = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        calendarNext.disabled = year > thisMonth.year || (year === thisMonth.year && month >= thisMonth.month);

        const parts = WEEKDAYS.map(d => `<span class="wd" aria-hidden="true">${d}</span>`);
        for (let i = 0; i < lead; i++) parts.push('<span class="day blank"></span>');
        let solvedCount = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const date = dateString(year, month, day);
            const sets = days[date] || [];
            const solved = sets.includes(archiveName);
            if (solved) solvedCount++;
            const classes = ['day'];
            if (solved) classes.push('solved');
            if (sets.some(name => name !== archiveName)) classes.push('other');
            if (date === today) classes.push('today');
            if (date === puzzle.date) classes.push('current');
            if (date > today) {
                classes.push('future');
                parts.push(`<span class="${classes.join(' ')}">${day}</span>`);
            } else {
                const params = new URLSearchParams(puzzle.mini ? { set: puzzle.set, mini: '1', date } : { set: puzzle.set, size: String(puzzle.rows), date });
                const label = `${solved ? 'Solved, ' : ''}${new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
                parts.push(`<a class="${classes.join(' ')}" href="index.html?${params}" aria-label="${escapeHtml(label)}">${day}</a>`);
            }
        }
        calendarGrid.innerHTML = parts.join('');
        calendarSummary.textContent = `${archiveName}: ${solvedCount} solved this month`;
    }

    calendarPrev.addEventListener('click', () => { calendarMonth = shiftMonth(calendarMonth, -1); renderCalendar(); });
    calendarNext.addEventListener('click', () => { calendarMonth = shiftMonth(calendarMonth, 1); renderCalendar(); });

    if (puzzle.custom) {
        calendarButton.hidden = true; // a custom puzzle has no daily archive
    } else {
        calendarButton.addEventListener('click', () => {
            calendarMonth = monthOf(puzzle.date || todayLocal());
            renderCalendar();
            calendarDialog.showModal();
        });
    }

    // --- Share ----------------------------------------------------------------------

    document.getElementById('share-button').addEventListener('click', async () => {
        const label = puzzle.date ? `for ${puzzle.date}` : `#${puzzle.seed}`;
        let text = `${puzzle.title} ${label} (${puzzle.rows}×${puzzle.rows})\nSolved in ${formatTime(elapsed)}${revealsNote()}`;
        if (puzzle.beat) text += `\n${challengeNote()}`;
        text += `\n${window.location.href}`;
        const button = document.getElementById('share-button');
        const touch = window.matchMedia('(pointer: coarse)').matches;
        try {
            if (touch && navigator.share) {
                await navigator.share({ text });
            } else {
                await navigator.clipboard.writeText(text);
                button.textContent = 'Copied';
            }
        } catch (e) {
            shareText.value = text;
            shareCopy.textContent = 'Copy';
            shareDialog.showModal();
            shareText.select();
        }
    });

    // Fallback when the clipboard is unavailable: the result in a box to copy by hand
    const shareDialog = document.getElementById('share-dialog');
    const shareText = document.getElementById('share-text');
    const shareCopy = document.getElementById('share-copy');
    shareCopy.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(shareText.value);
            shareCopy.textContent = 'Copied';
        } catch (e) {
            shareText.focus();
            shareText.select();
        }
    });

    // --- Timer ----------------------------------------------------------------------

    function formatTime(s) {
        const m = Math.floor(s / 60);
        return `${m}:${String(s % 60).padStart(2, '0')}`;
    }

    function startTimer() {
        if (timerHandle || solved) return;
        timerHandle = setInterval(() => {
            if (document.visibilityState === 'visible') {
                elapsed++;
                timerEl.textContent = formatTime(elapsed);
                if (elapsed % 10 === 0) saveState();
            }
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerHandle);
        timerHandle = null;
    }

    // --- Modes, pencil, theme ---------------------------------------------------------

    function applyMode(value) {
        mode = ['easy', 'normal', 'hard'].includes(value) ? value : 'normal';
        modeEl.value = mode;
        document.body.classList.remove('mode-easy', 'mode-normal', 'mode-hard');
        document.body.classList.add('mode-' + mode);
        // Re-evaluate the immediate feedback that easy mode gives
        allCells().forEach(cell => {
            cell.td.classList.remove('incorrect');
            if (mode === 'easy' && cell.value !== '' && cell.value !== cell.letter) cell.td.classList.add('incorrect');
        });
        refreshClueText();
        try { localStorage.setItem(MODE_KEY, mode); } catch (e) { /* ignore */ }
    }

    modeEl.addEventListener('change', () => { applyMode(modeEl.value); focusKeyboard(); });

    function togglePencil() {
        pencilMode = !pencilMode;
        pencilButton.setAttribute('aria-pressed', String(pencilMode));
    }

    function applyTheme(theme) {
        if (theme === 'dark' || theme === 'light') {
            document.documentElement.dataset.theme = theme;
        } else {
            delete document.documentElement.dataset.theme;
        }
        const dark = theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.getElementById('theme-button').textContent = dark ? 'Light' : 'Dark';
    }

    document.getElementById('theme-button').addEventListener('click', () => {
        const dark = document.getElementById('theme-button').textContent === 'Light';
        const next = dark ? 'light' : 'dark';
        try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
        applyTheme(next);
    });

    // --- Buttons ---------------------------------------------------------------------

    function onButton(id, handler) {
        document.getElementById(id).addEventListener('click', () => {
            handler();
            focusKeyboard();
        });
    }

    onButton('prev-word', () => nextClue(-1, false));
    onButton('next-word', () => nextClue(1, false));
    onButton('pencil', togglePencil);

    onButton('check-word', () => {
        if (current) wordCells(current.r, current.c, orientation).forEach(mark);
    });

    onButton('check-all', () => allCells().forEach(mark));

    onButton('reveal-letter', () => {
        if (!current || solved) return;
        const before = reveals;
        reveal(cellAt(current.r, current.c));
        afterEdit();
        chargeReveals(reveals - before);
        if (!solved) advance();
    });

    onButton('reveal-word', () => {
        if (!current || solved) return;
        const before = reveals;
        wordCells(current.r, current.c, orientation).forEach(reveal);
        afterEdit();
        chargeReveals(reveals - before);
        if (!solved) nextClue(1, true);
    });

    // Reset asks first, in a dialog whose safe answer is the default
    const resetDialog = document.getElementById('reset-dialog');
    document.getElementById('reset-puzzle').addEventListener('click', () => {
        resetDialog.returnValue = '';
        resetDialog.showModal();
    });
    resetDialog.addEventListener('close', () => {
        if (resetDialog.returnValue === 'reset') resetPuzzle();
        focusKeyboard();
    });

    function resetPuzzle() {
        endCelebration();
        allCells().forEach(cell => {
            setValue(cell, '');
            cell.td.classList.remove('revealed', 'correct');
        });
        solved = false;
        elapsed = 0;
        reveals = 0;
        timerEl.textContent = formatTime(0);
        bannerEl.classList.remove('show');
        stopTimer();
        startTimer();
        afterEdit();
        const first = clues[ACROSS][0] || clues[DOWN][0];
        if (first) goToClue(first, clues[ACROSS][0] ? ACROSS : DOWN);
    }

    function printWith(className) {
        document.body.classList.add(className);
        const cleanup = () => document.body.classList.remove('print-blank', 'print-answers');
        window.addEventListener('afterprint', cleanup, { once: true });
        window.print();
        setTimeout(cleanup, 1000); // browsers without afterprint
    }

    document.getElementById('print-blank').addEventListener('click', () => printWith('print-blank'));
    document.getElementById('print-answers').addEventListener('click', () => printWith('print-answers'));

    const toolbar = document.getElementById('toolbar');

    // A custom puzzle travels in the URL; keep it when the form changes size
    if (puzzle.custom) {
        const custom = new URLSearchParams(window.location.search).get('custom');
        if (custom) {
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = 'custom';
            hidden.value = custom;
            toolbar.appendChild(hidden);
        }
    }

    document.getElementById('new-puzzle').addEventListener('click', () => {
        const params = new URLSearchParams(new FormData(toolbar));
        params.delete('date');
        params.set('seed', String(Math.floor(Math.random() * 1e9)));
        window.location.search = params.toString();
    });

    document.getElementById('date-picker').addEventListener('change', () => toolbar.requestSubmit());

    window.addEventListener('resize', positionKeyboard);

    // --- Boot ------------------------------------------------------------------------

    applyTheme((() => { try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; } })());
    applyMode((() => { try { return localStorage.getItem(MODE_KEY); } catch (e) { return null; } })());

    buildGrid();
    buildClues();

    const saved = readJson(storageKey);
    if (saved && Array.isArray(saved.entries)) {
        allCells().forEach(cell => {
            const v = saved.entries[cell.r] && saved.entries[cell.r][cell.c];
            if (typeof v === 'string' && /^[A-Za-z]?$/.test(v)) setValue(cell, v.toUpperCase(), v !== v.toUpperCase());
        });
        elapsed = Number(saved.elapsed) || 0;
        reveals = Number(saved.reveals) || 0;
        timerEl.textContent = formatTime(elapsed);
        if (saved.solved) {
            solved = true;
            allCells().forEach(cell => cell.td.classList.add('correct'));
            showWin(null);
        }
    }

    refreshClueDone();
    refreshProgress();
    refreshStreak();
    checkSolved();
    refreshFullBanner();
    startTimer();

    const firstClue = clues[ACROSS][0] || clues[DOWN][0];
    if (firstClue) {
        goToClue(firstClue, clues[ACROSS][0] ? ACROSS : DOWN);
    }
    // Do not steal focus on load on touch devices: that would pop the keyboard immediately
    if (!window.matchMedia('(pointer: coarse)').matches) {
        focusKeyboard();
    }
};
