// Page bootstrap: reads the URL, loads a word set, generates the puzzle and starts the game.
//
// ?set=animals       word set (a file in words/)
// ?size=12           grid size, 8 to 20
// ?seed=123          any number; the same seed always gives the same puzzle
// ?date=2026-09-30   the daily puzzle for that date (archive). Overrides seed.
//                    With neither, today's daily puzzle.
// ?custom=<base64>   a custom word list made on create.html; overrides set
// ?mini=1            the Mini: a 7x7 of the same set, with its own streak. Overrides size.
// ?set=mixed         every word set in one pool; each puzzle draws a seeded hand of words
// ?beat=252          a challenge: a friend's time in seconds to beat on this exact puzzle

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

        const mini = params.get('mini') === '1';
        let size = parseInt(params.get('size') || '12', 10);
        if (Number.isNaN(size)) size = 12;
        size = Math.max(8, Math.min(20, size));
        if (mini) size = 7;

        const index = await loadJson('words/index.json');
        if (!Array.isArray(index) || index.length === 0) throw new Error('No word sets found');

        const MIXED = { key: 'mixed', name: 'Mixed' };
        const MIXED_POOL = 150; // words drawn per puzzle from the mixed set
        const sets = index.concat([MIXED]);
        let setKey = params.get('set') || 'animals';
        if (!sets.some(s => s.key === setKey)) setKey = index[0].key;

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
        } else if (setKey === MIXED.key) {
            const files = await Promise.all(index.map(s => loadJson(`words/${s.key}.json`)));
            wordSet = Crossword.mergeWordSets(files, MIXED.name, MIXED.key);
            seed = puzzleDate !== null ? Number(puzzleDate.replace(/-/g, '')) : Number(seedParam);
        } else {
            wordSet = Crossword.wordSetFromObject(await loadJson(`words/${setKey}.json`), setKey);
            seed = puzzleDate !== null ? Number(puzzleDate.replace(/-/g, '')) : Number(seedParam);
        }

        // The mixed set is too big to place whole; each seed draws its own hand of words
        const pool = setKey === MIXED.key ? Crossword.samplePool(wordSet.words(), MIXED_POOL, seed) : wordSet.words();

        // The placer runs many times and keeps the best layout. Each run costs about
        // as much as the pool has words, so bigger pools get fewer runs: the work stays
        // near that of a 36-word set at 500 runs, and the result changes little past 100
        const attempts = Math.max(100, Math.min(500, Math.round(18000 / Math.max(1, pool.length))));
        const [grid, result] = Crossword.generateCrossword(size, size, pool, attempts, seed);
        const puzzle = Object.assign(Crossword.puzzleToObject(grid, result, wordSet, seed), {
            set: setKey,
            setName: wordSet.name,
            title: `${wordSet.name} ${mini ? 'Mini' : 'Crossword'}`,
            seed,
            date: puzzleDate,
            daily: puzzleDate === today,
            custom: !!customSet,
            mini,
            beat: /^\d{1,6}$/.test(params.get('beat') || '') && Number(params.get('beat')) > 0 ? Number(params.get('beat')) : null,
        });

        // --- Fill the page ---------------------------------------------------------
        document.title = puzzle.title;
        text('h1', puzzle.title);
        document.body.classList.toggle('mini', mini);
        const kind = mini ? 'Mini' : 'puzzle';
        const label = puzzle.daily
            ? `Daily ${kind} for ${formatDate(today)}`
            : (puzzleDate !== null ? `Daily ${kind} for ${formatDate(puzzleDate)}` : `${mini ? 'Mini' : 'Puzzle'} #${seed}`);
        subtitleEl.textContent = `${label} · ${size}×${size} · ${puzzle.wordCount} words`;

        // The Mini link swaps between the Mini and the full puzzle of the same set
        const miniLink = document.getElementById('mini-link');
        if (customSet) {
            miniLink.hidden = true;
        } else {
            const linkParams = new URLSearchParams({ set: setKey });
            if (!mini) linkParams.set('mini', '1');
            miniLink.href = `index.html?${linkParams}`;
            miniLink.textContent = mini ? 'Full puzzle' : 'Daily Mini';
        }

        const setSelect = document.querySelector('select[name=set]');
        setSelect.innerHTML = '';
        for (const s of sets) {
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
        if (mini) {
            // The Mini has one size; the form carries the mode instead
            const sizeControl = sizeSelect.closest('.menu') || sizeSelect;
            sizeControl.hidden = true;
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = 'mini';
            hidden.value = '1';
            document.getElementById('toolbar').appendChild(hidden);
        } else {
            if (![...sizeSelect.options].some(o => Number(o.value) === size)) {
                const opt = document.createElement('option');
                opt.value = String(size);
                opt.textContent = `${size}×${size}`;
                sizeSelect.appendChild(opt);
            }
            sizeSelect.value = String(size);
        }

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
