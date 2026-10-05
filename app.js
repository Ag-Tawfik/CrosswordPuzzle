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
// No parameters at all shows Today: one card per word set with its daily and Mini.

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

    // Reads what the game saves, without the game: the theme and the solved days
    function readJson(key) {
        try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
    }

    // The player's own calendar day, as YYYY-MM-DD. The day, the daily puzzle
    // and the streaks all turn over at local midnight, not at UTC midnight,
    // so an evening solve in New York counts for the day it was made.
    function localDate(d = new Date()) {
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function previousDay(dateStr) {
        const d = new Date(dateStr + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
    }

    const MIXED = { key: 'mixed', name: 'Mixed' };
    const MIXED_POOL = 150; // words drawn per puzzle from the mixed set
    let index = []; // the word sets listed in words/index.json, set once loaded

    async function loadWordSet(setKey) {
        if (setKey === MIXED.key) {
            const files = await Promise.all(index.map(s => loadJson(`words/${s.key}.json`)));
            return Crossword.mergeWordSets(files, MIXED.name, MIXED.key);
        }
        return Crossword.wordSetFromObject(await loadJson(`words/${setKey}.json`), setKey);
    }

    // The mixed set is too big to place whole; each seed draws its own hand of words.
    // The placer runs many times and keeps the best layout. Each run costs about
    // as much as the pool has words, so bigger pools get fewer runs: the work stays
    // near that of a 36-word set at 500 runs, and the result changes little past 100
    function placeWords(wordSet, setKey, size, seed) {
        const pool = setKey === MIXED.key ? Crossword.samplePool(wordSet.words(), MIXED_POOL, seed) : wordSet.words();
        const attempts = Math.max(100, Math.min(500, Math.round(18000 / Math.max(1, pool.length))));
        return Crossword.generateCrossword(size, size, pool, attempts, seed);
    }

    // One tint per word set, for the monogram on its card
    const TINTS = ['#007aff', '#ff9500', '#34c759', '#af52de', '#ff2d55', '#5ac8fa', '#5856d6', '#ff3b30', '#ffcc00', '#a2845e'];

    async function showToday(sets, today) {
        const theme = (() => { try { return localStorage.getItem('crossword:theme'); } catch (e) { return null; } })();
        if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
        document.body.classList.add('today-mode');
        document.title = 'Crossword';
        text('h1', 'Crossword');
        subtitleEl.textContent = new Date(today + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

        const stats = readJson('crossword:stats') || {};
        const solvedToday = (stats.days && stats.days[today]) || [];
        // A date after today can only be a UTC-dated record from before the day
        // followed local time; it counts as today's
        const alive = last => last === today || last === previousDay(today) || last > today;
        const streak = alive(stats.lastDaily) ? stats.streak || 0 : 0;
        const miniStreak = alive(stats.lastMini) ? stats.miniStreak || 0 : 0;
        const streaksEl = document.getElementById('today-streaks');
        if (streak || miniStreak) {
            const parts = [];
            if (streak) parts.push(`Streak <strong>${streak}</strong>`);
            if (miniStreak) parts.push(`Mini streak <strong>${miniStreak}</strong>`);
            streaksEl.innerHTML = parts.join(' · ');
            streaksEl.hidden = false;
        }

        // The shelf: one card per set, a tinted monogram, its daily and its Mini
        const TICK = '<span class="tick" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
        const CHEV = '<span class="chev" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="m7.5 4 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
        const track = document.getElementById('today-track');
        track.innerHTML = '';
        sets.forEach((s, i) => {
            const card = document.createElement('div');
            card.className = 'today-card';
            const head = document.createElement('div');
            head.className = 'card-head';
            const mono = document.createElement('span');
            mono.className = 'mono';
            mono.style.setProperty('--c', TINTS[i % TINTS.length]);
            mono.textContent = s.name.charAt(0).toUpperCase();
            mono.setAttribute('aria-hidden', 'true');
            const h2 = document.createElement('h2');
            h2.textContent = s.name;
            head.append(mono, h2);
            card.appendChild(head);
            let done = 0;
            const links = [];
            for (const [label, size, mini, name] of [['Daily puzzle', '12×12', false, s.name], ['Mini', '7×7', true, `${s.name} Mini`]]) {
                const a = document.createElement('a');
                const q = new URLSearchParams({ set: s.key });
                if (mini) q.set('mini', '1');
                a.href = `index.html?${q}`;
                const solved = solvedToday.includes(name);
                if (solved) done++;
                a.className = solved ? 'solved' : '';
                a.innerHTML = `<span>${label}</span><span class="size">${size}</span>${TICK}${CHEV}`;
                if (solved) a.setAttribute('aria-label', `${s.name} ${label}, solved`);
                links.push(a);
            }
            if (done) {
                const sub = document.createElement('p');
                sub.className = 'today-sub';
                sub.textContent = done === 2 ? 'Both solved' : '1 of 2 solved';
                card.appendChild(sub);
            }
            card.append(...links);
            track.appendChild(card);
        });
        document.getElementById('today-random').href = `index.html?set=mixed&seed=${Math.floor(Math.random() * 1e9)}`;

        // The featured card: one set's daily, rotating with the date, drawn as a
        // thumbnail of today's real grid. If it cannot be built the shelf still shows.
        try {
            const dayNumber = Math.round(Date.parse(today + 'T00:00:00Z') / 864e5);
            const pick = sets[dayNumber % sets.length];
            const seed = Number(today.replace(/-/g, ''));
            const [grid, result] = placeWords(await loadWordSet(pick.key), pick.key, 12, seed);
            const n = grid.length;
            let rects = '';
            grid.forEach((row, r) => row.forEach((cell, c) => {
                if (cell.letter) rects += `<rect x="${c + 0.06}" y="${r + 0.06}" width="0.88" height="0.88"/>`;
            }));
            document.getElementById('featured-thumb').innerHTML = `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">${rects}</svg>`;
            const featured = document.getElementById('today-featured');
            const solved = solvedToday.includes(pick.name);
            featured.href = `index.html?set=${pick.key}`;
            featured.classList.toggle('solved', solved);
            document.getElementById('featured-eyebrow').textContent = solved ? 'Solved today' : "Today's pick";
            document.getElementById('featured-name').textContent = pick.name;
            document.getElementById('featured-meta').textContent = `${n}×${n} · ${result.placed.length} words`;
            document.getElementById('featured-cta').textContent = solved ? 'Open' : 'Play';
            featured.hidden = false;
        } catch (e) {
            console.warn('Featured puzzle not shown:', e);
        }

        document.getElementById('today').hidden = false;

        // The row scrolls sideways; arrows step it one card at a time for mouse
        // users and hide at either end. The edge with more beyond it fades out.
        const prev = document.getElementById('today-prev');
        const next = document.getElementById('today-next');
        const step = () => {
            const card = track.querySelector('.today-card');
            const gap = parseFloat(getComputedStyle(track).columnGap) || 14;
            return card ? card.getBoundingClientRect().width + gap : 300;
        };
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const slide = dir => track.scrollBy({ left: dir * step(), behavior: reduced ? 'auto' : 'smooth' });
        const update = () => {
            prev.disabled = track.scrollLeft <= 1;
            next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
            track.classList.toggle('fade-l', !prev.disabled);
            track.classList.toggle('fade-r', !next.disabled);
        };
        prev.onclick = () => slide(-1);
        next.onclick = () => slide(1);
        track.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        update();
    }

    try {
        const today = localDate();

        const mini = params.get('mini') === '1';
        let size = parseInt(params.get('size') || '12', 10);
        if (Number.isNaN(size)) size = 12;
        size = Math.max(8, Math.min(20, size));
        if (mini) size = 7;

        index = await loadJson('words/index.json');
        if (!Array.isArray(index) || index.length === 0) throw new Error('No word sets found');

        const sets = index.concat([MIXED]);

        // --- Today: the front door ----------------------------------------------------
        if ([...params.keys()].length === 0) {
            await showToday(sets, today);
            window.__puzzle = null; // for tests: loading is finished, there is no puzzle
            return;
        }

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
        } else {
            wordSet = await loadWordSet(setKey);
            seed = puzzleDate !== null ? Number(puzzleDate.replace(/-/g, '')) : Number(seedParam);
        }
        const [grid, result] = placeWords(wordSet, setKey, size, seed);
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
