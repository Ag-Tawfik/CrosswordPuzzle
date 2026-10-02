// Page bootstrap: reads the URL, loads a word set, generates the puzzle and starts the game.
//
// ?set=animals       word set (a file in words/)
// ?size=12           grid size, 8 to 20
// ?seed=123          any number; the same seed always gives the same puzzle
// ?date=2026-09-30   the daily puzzle for that date (archive). Overrides seed.
//                    With neither, today's daily puzzle.
// ?custom=<base64>   a custom word list made on create.html; overrides set

(async function () {
    'use strict';

    const params = new URLSearchParams(window.location.search);
    const subtitleEl = document.querySelector('.subtitle');
    const warnEl = document.getElementById('load-warning');

    function warn(msg) {
        warnEl.textContent = msg;
        warnEl.classList.add('show');
    }

    function text(sel, value) {
        document.querySelector(sel).textContent = value;
    }

    async function loadJson(url) {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        return res.json();
    }

    function formatDate(iso) {
        return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    }

    try {
        const today = new Date().toISOString().slice(0, 10);

        let size = parseInt(params.get('size') || '12', 10);
        if (Number.isNaN(size)) size = 12;
        size = Math.max(8, Math.min(20, size));

        const index = await loadJson('words/index.json');
        if (!Array.isArray(index) || index.length === 0) throw new Error('No word sets found');

        let setKey = params.get('set') || 'animals';
        if (!index.some(s => s.key === setKey)) setKey = index[0].key;

        const customParam = params.get('custom') || '';
        const customSet = customParam ? Crossword.customWordSetFromParam(customParam) : null;
        if (customParam && !customSet) {
            warn('That custom puzzle link could not be read. Showing the daily puzzle instead.');
        }

        const dateParam = params.get('date') || '';
        const seedParam = params.get('seed') || '';
        const hasSeed = /^\d{1,9}$/.test(seedParam);

        let puzzleDate = null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam) && !Number.isNaN(Date.parse(dateParam + 'T00:00:00Z')) && dateParam <= today) {
            puzzleDate = dateParam;
        } else if (!hasSeed) {
            puzzleDate = today;
        }

        let wordSet, seed;
        if (customSet) {
            wordSet = customSet;
            setKey = 'custom';
            // A custom puzzle keeps a fixed layout unless a seed is given explicitly
            seed = hasSeed ? Number(seedParam) : Crossword.hash(customParam) % 1000000000;
            puzzleDate = null;
        } else {
            wordSet = Crossword.wordSetFromObject(await loadJson(`words/${setKey}.json`), setKey);
            seed = puzzleDate !== null ? Number(puzzleDate.replace(/-/g, '')) : Number(seedParam);
        }

        const [grid, result] = Crossword.generateCrossword(size, size, wordSet.words(), 500, seed);
        const puzzle = Object.assign(Crossword.puzzleToObject(grid, result, wordSet, seed), {
            set: setKey,
            setName: wordSet.name,
            seed,
            date: puzzleDate,
            daily: puzzleDate === today,
            custom: !!customSet,
        });

        // --- Fill the page ---------------------------------------------------------
        document.title = `${wordSet.name} Crossword`;
        text('h1', `${wordSet.name} Crossword`);
        const label = puzzle.daily
            ? `Daily puzzle for ${formatDate(today)}`
            : (puzzleDate !== null ? `Daily puzzle for ${formatDate(puzzleDate)}` : `Puzzle #${seed}`);
        subtitleEl.textContent = `${label} · ${size}×${size} · ${puzzle.wordCount} words`;

        const setSelect = document.querySelector('select[name=set]');
        setSelect.innerHTML = '';
        for (const s of index) {
            const opt = document.createElement('option');
            opt.value = s.key;
            opt.textContent = s.name;
            opt.selected = s.key === setKey;
            setSelect.appendChild(opt);
        }
        if (customSet) {
            const opt = document.createElement('option');
            opt.value = 'custom';
            opt.textContent = `Custom: ${wordSet.name}`;
            opt.selected = true;
            setSelect.appendChild(opt);
        }

        const sizeSelect = document.querySelector('select[name=size]');
        if (![...sizeSelect.options].some(o => Number(o.value) === size)) {
            const opt = document.createElement('option');
            opt.value = String(size);
            opt.textContent = `${size}×${size}`;
            sizeSelect.appendChild(opt);
        }
        sizeSelect.value = String(size);

        const datePicker = document.getElementById('date-picker');
        datePicker.max = today;
        datePicker.value = puzzleDate || '';

        document.getElementById('crossword-grid').style.setProperty('--columns', String(puzzle.columns));

        window.__puzzle = puzzle; // for tests and debugging
        startGame(puzzle);
        if (window.Menus) window.Menus.refresh();
    } catch (e) {
        subtitleEl.textContent = '';
        warn('The puzzle could not be loaded. Reload the page to try again.');
        console.error(e);
    }
})();
