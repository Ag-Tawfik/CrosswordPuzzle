// The game. app.js builds the puzzle and calls startGame(puzzle).
window.startGame = function (puzzle) {
    'use strict';

    const ACROSS = 0;
    const DOWN = 1;

    const storageKey = `crossword:${puzzle.set}:${puzzle.rows}:${puzzle.seed}`;
    const STATS_KEY = 'crossword:stats';
    const MODE_KEY = 'crossword:mode';
    const THEME_KEY = 'crossword:theme';

    const gridEl = document.getElementById('crossword-grid');
    const kbd = document.getElementById('kbd');
    const activeClueEl = document.getElementById('active-clue');
    const timerEl = document.getElementById('timer');
    const progressEl = document.getElementById('progress');
    const bannerEl = document.getElementById('win-banner');
    const winTextEl = document.getElementById('win-text');
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
                t.textContent = cl.clue;
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
            activeClueEl.innerHTML = `<b>${cl.number} ${orientation === ACROSS ? 'Across' : 'Down'}</b> ${escapeHtml(cl.clue)}`;
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
    function advance() {
        const { word, idx } = currentIndex();
        const later = word.slice(idx + 1).find(cell => cell.value === '');
        if (later) { setCurrent(later); return; }
        if (idx + 1 < word.length) { setCurrent(word[idx + 1]); return; }
        nextClue(1, true);
    }

    // Step to the next (dir = 1) or previous (dir = -1) clue. With onlyUnfinished,
    // skip clues that are already fully filled.
    function nextClue(dir, onlyUnfinished) {
        const list = orderedClues();
        const cl = clueFor(current.r, current.c, orientation);
        const start = list.findIndex(item => item.cl === cl && item.o === orientation);
        for (let i = 1; i <= list.length; i++) {
            const item = list[((start + dir * i) % list.length + list.length) % list.length];
            if (onlyUnfinished && isClueComplete(item.cl, item.o)) continue;
            goToClue(item.cl, item.o);
            return;
        }
        // Everything is filled: stay put
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
        saveState();
    }

    // --- Checking and revealing -----------------------------------------------------

    function mark(cell) {
        cell.td.classList.remove('correct', 'incorrect');
        if (cell.value === '') return;
        cell.td.classList.add(cell.value === cell.letter ? 'correct' : 'incorrect');
    }

    function reveal(cell) {
        if (cell.value !== cell.letter) reveals++;
        setValue(cell, cell.letter);
        cell.td.classList.add('correct', 'revealed');
    }

    function checkSolved() {
        const all = allCells();
        if (solved || !all.every(cell => cell.value === cell.letter)) return;
        solved = true;
        stopTimer();
        all.forEach(cell => cell.td.classList.add('correct'));
        const record = recordSolve();
        showWin(record);
        saveState();
    }

    function showWin(record) {
        let text = `Solved in ${formatTime(elapsed)}`;
        if (reveals > 0) text += ` with ${reveals} revealed letter${reveals === 1 ? '' : 's'}`;
        if (record && record.streak > 1) text += `. Streak: ${record.streak} days`;
        if (record && record.isBest) text += '. New best time';
        winTextEl.textContent = text + '.';
        bannerEl.classList.add('show');
    }

    // --- Stats and streaks ------------------------------------------------------------

    function todayUtc() {
        return new Date().toISOString().slice(0, 10);
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
            history: Array.isArray(s.history) ? s.history : [],
        };
    }

    // Called once per solved puzzle. Returns the streak after this solve and
    // whether this was a best time, or null if this solve was already recorded.
    function recordSolve() {
        const stats = loadStats();
        const id = storageKey;
        if (stats.history.some(h => h.id === id)) return null;

        const today = todayUtc();
        if (puzzle.daily && puzzle.date === today) {
            if (stats.lastDaily === previousDay(today)) stats.streak += 1;
            else if (stats.lastDaily !== today) stats.streak = 1;
            stats.lastDaily = today;
        }

        const isBest = stats.best === null || elapsed < stats.best;
        stats.solved += 1;
        stats.totalTime += elapsed;
        if (isBest) stats.best = elapsed;
        stats.history.unshift({ id, when: today, set: puzzle.setName, seed: puzzle.seed, size: puzzle.rows, time: elapsed, reveals });
        stats.history = stats.history.slice(0, 50);
        writeJson(STATS_KEY, stats);
        refreshStreak();
        return { streak: stats.streak, isBest };
    }

    function currentStreak(stats) {
        // A streak survives until the end of the day after the last daily solve
        const today = todayUtc();
        if (stats.lastDaily === today || stats.lastDaily === previousDay(today)) return stats.streak;
        return 0;
    }

    function refreshStreak() {
        const streak = currentStreak(loadStats());
        document.getElementById('streak').textContent = streak;
        document.getElementById('streak-status').hidden = streak === 0;
    }

    function showStats() {
        const stats = loadStats();
        const list = document.getElementById('stats-list');
        const rows = [
            ['Puzzles solved', stats.solved],
            ['Current streak', currentStreak(stats) + (currentStreak(stats) === 1 ? ' day' : ' days')],
            ['Best time', stats.best === null ? '–' : formatTime(stats.best)],
            ['Average time', stats.solved ? formatTime(Math.round(stats.totalTime / stats.solved)) : '–'],
        ];
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

    // --- Share ----------------------------------------------------------------------

    document.getElementById('share-button').addEventListener('click', async () => {
        const label = puzzle.date ? `for ${puzzle.date}` : `#${puzzle.seed}`;
        let text = `${puzzle.setName} Crossword ${label} (${puzzle.rows}×${puzzle.rows})\nSolved in ${formatTime(elapsed)}`;
        if (reveals > 0) text += ` with ${reveals} revealed letter${reveals === 1 ? '' : 's'}`;
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
            window.prompt('Copy your result:', text);
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
        reveal(cellAt(current.r, current.c));
        afterEdit();
        if (!solved) advance();
    });

    onButton('reveal-word', () => {
        if (!current || solved) return;
        wordCells(current.r, current.c, orientation).forEach(reveal);
        afterEdit();
        if (!solved) nextClue(1, true);
    });

    onButton('reset-puzzle', () => {
        if (!confirm('Clear all your entries and restart the timer?')) return;
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
    });

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
