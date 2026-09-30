(function () {
    'use strict';

    const ACROSS = 0;
    const DOWN = 1;

    const puzzle = JSON.parse(document.getElementById('puzzle-data').textContent);
    const storageKey = `crossword:${puzzle.set}:${puzzle.rows}:${puzzle.seed}`;

    const gridEl = document.getElementById('crossword-grid');
    const activeClueEl = document.getElementById('active-clue');
    const timerEl = document.getElementById('timer');
    const progressEl = document.getElementById('progress');
    const bannerEl = document.getElementById('win-banner');
    const clueLists = { [ACROSS]: document.getElementById('across-clues'), [DOWN]: document.getElementById('down-clues') };

    // --- State ----------------------------------------------------------------

    const cells = [];          // cells[r][c] = { td, input, letter, number } or null
    const clues = { [ACROSS]: puzzle.across, [DOWN]: puzzle.down };
    let current = null;        // { r, c }
    let orientation = ACROSS;
    let elapsed = 0;           // seconds
    let solved = false;
    let timerHandle = null;

    // --- Persistence ------------------------------------------------------------

    function loadState() {
        try {
            const raw = localStorage.getItem(storageKey);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function saveState() {
        try {
            const entries = cells.map(row => row.map(cell => cell ? cell.input.value : null));
            localStorage.setItem(storageKey, JSON.stringify({ entries, elapsed, solved }));
        } catch (e) {
            // Storage unavailable (private mode, quota); the game still works without it
        }
    }

    // --- Grid helpers -------------------------------------------------------------

    function cellAt(r, c) {
        return (cells[r] && cells[r][c]) || null;
    }

    function step(o) {
        return o === ACROSS ? { dr: 0, dc: 1 } : { dr: 1, dc: 0 };
    }

    // All cells of the word through (r, c) in orientation o, in order
    function wordCells(r, c, o) {
        const { dr, dc } = step(o);
        while (cellAt(r - dr, c - dc)) { r -= dr; c -= dc; }
        const out = [];
        while (cellAt(r, c)) { out.push({ r, c }); r += dr; c += dc; }
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
        return wordCells(cl.row, cl.col, o).every(p => cellAt(p.r, p.c).input.value !== '');
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
                    if (data.number !== null) {
                        const num = document.createElement('span');
                        num.className = 'number';
                        num.textContent = data.number;
                        td.appendChild(num);
                    }
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'cell-input';
                    input.maxLength = 1;
                    input.autocomplete = 'off';
                    input.setAttribute('aria-label', `Row ${r + 1} column ${c + 1}`);
                    input.dataset.row = r;
                    input.dataset.col = c;
                    td.appendChild(input);
                    cells[r][c] = { td, input, letter: data.letter, number: data.number, r, c };
                    bindCell(cells[r][c]);
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
                li.textContent = `${cl.number}. ${cl.clue}`;
                li.addEventListener('click', () => {
                    orientation = o;
                    const firstEmpty = wordCells(cl.row, cl.col, o).find(p => cellAt(p.r, p.c).input.value === '');
                    setCurrent(firstEmpty || { r: cl.row, c: cl.col });
                });
                cl.el = li;
                clueLists[o].appendChild(li);
            });
        });
    }

    function refreshHighlight() {
        cells.flat().forEach(cell => { if (cell) cell.td.classList.remove('selected', 'current'); });
        Object.values(clues).flat().forEach(cl => cl.el.classList.remove('active'));
        if (!current) return;

        wordCells(current.r, current.c, orientation).forEach(p => cellAt(p.r, p.c).td.classList.add('selected'));
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
        const all = cells.flat().filter(Boolean);
        const filled = all.filter(cell => cell.input.value !== '').length;
        progressEl.textContent = Math.round(100 * filled / all.length) + '%';
    }

    function escapeHtml(s) {
        return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    // --- Navigation ---------------------------------------------------------------

    function setCurrent(pos, opts = {}) {
        if (!cellAt(pos.r, pos.c)) return;
        current = { r: pos.r, c: pos.c };
        // If there is no word in this orientation through the cell, use the other one
        if (!hasWord(pos.r, pos.c, orientation) && hasWord(pos.r, pos.c, 1 - orientation)) {
            orientation = 1 - orientation;
        }
        const input = cellAt(pos.r, pos.c).input;
        if (document.activeElement !== input && !opts.noFocus) {
            input.focus({ preventScroll: true });
        }
        refreshHighlight();
    }

    function toggleOrientation() {
        if (current && hasWord(current.r, current.c, 1 - orientation)) {
            orientation = 1 - orientation;
            refreshHighlight();
        }
    }

    // Move to the next empty cell in the current word after the current cell,
    // otherwise to the first empty cell of the next unfinished clue
    function advance() {
        const word = wordCells(current.r, current.c, orientation);
        const idx = word.findIndex(p => p.r === current.r && p.c === current.c);
        const later = word.slice(idx + 1).find(p => cellAt(p.r, p.c).input.value === '');
        if (later) { setCurrent(later); return; }
        if (idx + 1 < word.length) { setCurrent(word[idx + 1]); return; }
        nextClue();
    }

    function nextClue() {
        const list = orderedClues();
        const cl = clueFor(current.r, current.c, orientation);
        const start = list.findIndex(item => item.cl === cl && item.o === orientation);
        for (let i = 1; i <= list.length; i++) {
            const item = list[(start + i) % list.length];
            const empty = wordCells(item.cl.row, item.cl.col, item.o).find(p => cellAt(p.r, p.c).input.value === '');
            if (empty) {
                orientation = item.o;
                setCurrent(empty);
                return;
            }
        }
        // Everything is filled: stay put
    }

    function retreat() {
        const word = wordCells(current.r, current.c, orientation);
        const idx = word.findIndex(p => p.r === current.r && p.c === current.c);
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
            if (cellAt(r, c)) { setCurrent({ r, c }); return; }
            r += dr; c += dc;
        }
    }

    // --- Cell events ----------------------------------------------------------------

    function bindCell(cell) {
        const { input } = cell;

        input.addEventListener('focus', () => {
            if (!current || current.r !== cell.r || current.c !== cell.c) {
                setCurrent({ r: cell.r, c: cell.c }, { noFocus: true });
            }
        });

        // Clicking the already selected cell toggles direction
        input.addEventListener('mousedown', e => {
            if (document.activeElement === input) {
                e.preventDefault();
                toggleOrientation();
            }
        });

        input.addEventListener('keydown', e => {
            if (solved && !['Tab'].includes(e.key)) { e.preventDefault(); return; }
            switch (e.key) {
                case 'ArrowRight': arrow(0, 1); break;
                case 'ArrowLeft': arrow(0, -1); break;
                case 'ArrowDown': arrow(1, 0); break;
                case 'ArrowUp': arrow(-1, 0); break;
                case 'Enter':
                case ' ': toggleOrientation(); break;
                case 'Backspace':
                    if (input.value === '') {
                        retreat();
                        cellAt(current.r, current.c).input.value = '';
                        markDirty(cellAt(current.r, current.c));
                    } else {
                        input.value = '';
                        markDirty(cell);
                    }
                    afterEdit();
                    break;
                case 'Delete':
                    input.value = '';
                    markDirty(cell);
                    afterEdit();
                    break;
                default:
                    if (!/^[a-z]$/i.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) {
                        return; // leave Tab and shortcuts to the browser
                    }
                    input.value = e.key.toUpperCase();
                    markDirty(cell);
                    afterEdit();
                    advance();
            }
            e.preventDefault();
        });

        // Fallback for on-screen keyboards that only fire input events
        input.addEventListener('input', () => {
            if (solved) { input.value = ''; return; }
            const v = input.value.replace(/[^a-z]/gi, '').toUpperCase().slice(-1);
            input.value = v;
            markDirty(cell);
            afterEdit();
            if (v) advance();
        });
    }

    function markDirty(cell) {
        cell.td.classList.remove('correct', 'incorrect');
    }

    function afterEdit() {
        refreshClueDone();
        refreshProgress();
        checkSolved();
        saveState();
    }

    // --- Checking and revealing -----------------------------------------------------

    function mark(cell) {
        cell.td.classList.remove('correct', 'incorrect');
        if (cell.input.value === '') return;
        cell.td.classList.add(cell.input.value === cell.letter ? 'correct' : 'incorrect');
    }

    function reveal(cell) {
        cell.input.value = cell.letter;
        cell.td.classList.remove('incorrect');
        cell.td.classList.add('correct', 'revealed');
    }

    function checkSolved() {
        const all = cells.flat().filter(Boolean);
        if (!all.every(cell => cell.input.value === cell.letter)) return;
        if (solved) return;
        solved = true;
        stopTimer();
        bannerEl.textContent = `Solved in ${formatTime(elapsed)}. Nice work.`;
        bannerEl.classList.add('show');
        all.forEach(cell => { cell.input.readOnly = true; cell.td.classList.add('correct'); });
        saveState();
    }

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

    // --- Buttons ---------------------------------------------------------------------

    // After any button, hand focus back to the grid so typing keeps working
    function refocus() {
        if (current) cellAt(current.r, current.c).input.focus({ preventScroll: true });
    }
    document.querySelectorAll('.controls button').forEach(btn => btn.addEventListener('click', () => setTimeout(refocus, 0)));

    document.getElementById('check-word').addEventListener('click', () => {
        if (!current) return;
        wordCells(current.r, current.c, orientation).forEach(p => mark(cellAt(p.r, p.c)));
    });

    document.getElementById('check-all').addEventListener('click', () => {
        cells.flat().forEach(cell => { if (cell) mark(cell); });
    });

    document.getElementById('reveal-letter').addEventListener('click', () => {
        if (!current || solved) return;
        reveal(cellAt(current.r, current.c));
        afterEdit();
        if (!solved) advance();
    });

    document.getElementById('reveal-word').addEventListener('click', () => {
        if (!current || solved) return;
        wordCells(current.r, current.c, orientation).forEach(p => reveal(cellAt(p.r, p.c)));
        afterEdit();
        if (!solved) nextClue();
    });

    document.getElementById('reset-puzzle').addEventListener('click', () => {
        if (!confirm('Clear all your entries and restart the timer?')) return;
        cells.flat().forEach(cell => {
            if (!cell) return;
            cell.input.value = '';
            cell.input.readOnly = false;
            cell.td.classList.remove('correct', 'incorrect', 'revealed');
        });
        solved = false;
        elapsed = 0;
        timerEl.textContent = formatTime(0);
        bannerEl.classList.remove('show');
        stopTimer();
        startTimer();
        afterEdit();
        orientation = ACROSS;
        const first = clues[ACROSS][0] || clues[DOWN][0];
        if (first) setCurrent({ r: first.row, c: first.col });
    });

    document.getElementById('new-puzzle').addEventListener('click', () => {
        const form = document.getElementById('toolbar');
        const params = new URLSearchParams(new FormData(form));
        params.set('seed', String(Math.floor(Math.random() * 1e9)));
        window.location.search = params.toString();
    });

    // --- Boot ------------------------------------------------------------------------

    buildGrid();
    buildClues();

    const saved = loadState();
    if (saved && Array.isArray(saved.entries)) {
        cells.forEach((row, r) => row.forEach((cell, c) => {
            if (cell && saved.entries[r] && typeof saved.entries[r][c] === 'string') {
                cell.input.value = saved.entries[r][c];
            }
        }));
        elapsed = Number(saved.elapsed) || 0;
        timerEl.textContent = formatTime(elapsed);
    }

    refreshClueDone();
    refreshProgress();
    checkSolved();
    startTimer();

    const firstClue = clues[ACROSS][0] || clues[DOWN][0];
    if (firstClue) {
        orientation = clues[ACROSS][0] ? ACROSS : DOWN;
        setCurrent({ r: firstClue.row, c: firstClue.col });
    }
})();
