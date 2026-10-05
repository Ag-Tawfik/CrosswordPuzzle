// Browser tests for the game. Run with: npm run test:browser
// Serves the repository root on a free port and drives the pages with Playwright.

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { start } = require('./static-server.js');

let server, browser, base;

before(async () => {
    server = await start(0);
    base = `http://127.0.0.1:${server.address().port}/`;
    browser = await chromium.launch();
});

after(async () => {
    await browser?.close();
    server?.close();
});

async function newPage(options = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 1200 }, ...options });
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) page.errors.push(`${r.status()} ${r.url()}`); });
    // A navigation cancels in-flight requests (e.g. a favicon fetch); that is not a failure.
    page.on('requestfailed', r => { const t = r.failure()?.errorText; if (t !== 'net::ERR_ABORTED') page.errors.push(`${t} ${r.url()}`); });
    return page;
}

// Navigate and wait for app.js to have generated the puzzle and started the game
async function go(page, url) {
    await page.goto(url);
    await page.waitForFunction(() => window.__puzzle !== undefined);
}
const puzzleData = page => page.evaluate(() => window.__puzzle);
const cellSel = (r, c) => `td[data-row="${r}"][data-col="${c}"]`;
const letterAt = (page, r, c) => page.locator(`${cellSel(r, c)} .letter`).innerText();
const activeClue = page => page.locator('#active-clue').innerText();
const activeLabel = page => page.locator('#active-clue b').textContent();
const rowText = (page, r, c, n) => page.evaluate(([r, c, n]) => {
    let s = '';
    for (let i = 0; i < n; i++) s += document.querySelector(`td[data-row="${r}"][data-col="${c + i}"] .letter`).textContent;
    return s;
}, [r, c, n]);

// A cell that belongs to both an across and a down word
async function crossingCell(page) {
    return page.evaluate(() => {
        const p = window.__puzzle;
        for (const a of p.across) for (const d of p.down)
            for (let i = 0; i < a.length; i++) for (let j = 0; j < d.length; j++)
                if (a.row === d.row + j && a.col + i === d.col) return [a.row, a.col + i];
        throw new Error('no crossing cell');
    });
}

async function solve(page) {
    const p = await puzzleData(page);
    const empties = await page.evaluate(() =>
        [...document.querySelectorAll('td.white')]
            .filter(td => td.querySelector('.letter').textContent === '')
            .map(td => [Number(td.dataset.row), Number(td.dataset.col)]));
    for (const [r, c] of empties) {
        await page.click(cellSel(r, c));
        await page.keyboard.press(p.cells[r][c].letter);
    }
}

describe('desktop play', () => {
    test('typing fills the word, advances, and persists across reload', async () => {
        const page = await newPage();
        await go(page, base + 'index.html?set=geography&size=12&seed=77');
        await page.evaluate(() => localStorage.clear());
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        const p = await puzzleData(page);
        const first = p.across[0];
        const word = Array.from({ length: first.length }, (_, i) => p.cells[first.row][first.col + i].letter).join('');

        assert.equal(await page.evaluate(() => document.activeElement.id), 'kbd', 'keyboard input focused on load');
        await page.keyboard.type(word);
        assert.equal(await rowText(page, first.row, first.col, first.length), word);
        assert.equal(await page.locator(`${cellSel(first.row, first.col + first.length - 1)}.current`).count(), 0, 'moved on after the word');

        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        assert.equal(await rowText(page, first.row, first.col, first.length), word, 'entries restored');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('finishing a word whose last letter a crossing already filled moves straight on', async () => {
        const page = await newPage();
        await go(page, base + 'index.html?set=animals&seed=5');
        await page.evaluate(() => localStorage.clear());
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        const p = await puzzleData(page);
        // An across word whose last cell is also in a down word
        const pick = p.across.find(a => p.down.some(d => d.col === a.col + a.length - 1 && a.row >= d.row && a.row < d.row + d.length));
        assert.ok(pick, 'a crossing at the end of an across word');
        const last = [pick.row, pick.col + pick.length - 1];
        await page.click(cellSel(...last));
        await page.keyboard.press(p.cells[last[0]][last[1]].letter);
        const i = p.across.findIndex(a => a.row === pick.row && a.col === pick.col);
        await page.click(`#across-clues .clue >> nth=${i}`);
        for (let k = 0; k < pick.length - 1; k++) await page.keyboard.press(p.cells[pick.row][pick.col + k].letter);
        const word = Array.from({ length: pick.length }, (_, k) => p.cells[pick.row][pick.col + k].letter).join('');
        assert.equal(await rowText(page, pick.row, pick.col, pick.length), word, 'the word is complete');
        const cur = await page.evaluate(() => { const td = document.querySelector('td.current'); return [Number(td.dataset.row), Number(td.dataset.col)]; });
        assert.ok(!(cur[0] === pick.row && cur[1] >= pick.col && cur[1] < pick.col + pick.length), `the cursor left the finished word, is at ${cur}`);
        // One more letter must not overwrite the crossing
        await page.keyboard.press('Q');
        assert.equal(await rowText(page, pick.row, pick.col, pick.length), word, 'the crossing letter survived');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('clicking the selected cell toggles direction; arrows, prev/next and Tab behave', async () => {
        const page = await newPage();
        await go(page, base + 'index.html?set=geography&size=12&seed=77');
        const [r, c] = await crossingCell(page);

        await page.click(cellSel(r, c));
        const a = await activeClue(page);
        await page.click(cellSel(r, c));
        const b = await activeClue(page);
        assert.notEqual(a, b, 'second click toggled direction');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'kbd');

        await page.click('#next-word');
        const n = await activeClue(page);
        await page.click('#prev-word');
        assert.notEqual(n, b);
        assert.equal(await activeClue(page), b, 'prev undoes next');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'kbd', 'buttons hand focus back');

        await page.click(cellSel(r, c));
        const before = await activeClue(page);
        await page.keyboard.press(/^\d+ Across$/.test(await activeLabel(page)) ? 'ArrowDown' : 'ArrowRight');
        assert.notEqual(await activeClue(page), before, 'arrow across the axis switches direction');

        await page.keyboard.press('Tab');
        assert.notEqual(await page.evaluate(() => document.activeElement.id), 'kbd', 'Tab leaves the grid');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('check word marks cells, solving shows the banner and records stats', async () => {
        const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
        await go(page, base + 'index.html?set=science');
        await page.evaluate(() => localStorage.clear());
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        const p = await puzzleData(page);
        assert.equal(p.daily, true);
        const first = p.across[0];

        await page.keyboard.press(p.cells[first.row][first.col].letter === 'Z' ? 'Q' : 'Z');
        await page.click('#across-clues .clue >> nth=0');
        await page.click('#check-word');
        assert.equal(await page.locator('td.incorrect').count(), 1);

        // A reveal costs 20 seconds, shown at once; revealing a word charges only the letters it fills
        await page.click(`${cellSel(first.row, first.col)}`);
        const secondsBefore = await page.evaluate(() => { const [m, s] = document.getElementById('timer').innerText.split(':'); return Number(m) * 60 + Number(s); });
        await page.click('#reveal-letter');
        const secondsAfter = await page.evaluate(() => { const [m, s] = document.getElementById('timer').innerText.split(':'); return Number(m) * 60 + Number(s); });
        assert.ok(secondsAfter >= secondsBefore + 20 && secondsAfter < secondsBefore + 25, `reveal added 20s, went ${secondsBefore} -> ${secondsAfter}`);
        assert.equal(await page.locator('#penalty').innerText(), '+20s');
        await page.click(`${cellSel(first.row, first.col)}`);
        await page.click('#reveal-word');
        assert.equal(await page.locator('#penalty').innerText(), `+${(first.length - 1) * 20}s`, 'the already revealed letter is not charged again');
        await page.click(`${cellSel(first.row, first.col)}`);
        await page.click('#reveal-letter');
        const secondsLater = await page.evaluate(() => { const [m, s] = document.getElementById('timer').innerText.split(':'); return Number(m) * 60 + Number(s); });
        assert.ok(secondsLater < secondsBefore + first.length * 20 + 5, 'revealing a correct letter costs nothing');
        await solve(page);

        // The solve: the grid sweeps green, the time counts up to the real one, and a verdict follows
        assert.equal(await page.locator('#crossword-grid.solved').count(), 1, 'the sweep runs');
        assert.ok(await page.evaluate(() => document.querySelector('td.white').style.getPropertyValue('--d') !== ''), 'cells carry their delay');
        const finalTime = await page.evaluate(() => document.getElementById('timer').innerText);
        await page.waitForFunction(t => document.getElementById('win-text').innerText.startsWith(`Solved in ${t}`), finalTime);
        const win = await page.locator('#win-text').innerText();
        assert.match(win, new RegExp(`^Solved in \\d+:\\d\\d, including ${first.length < 3 ? '0:' : ''}\\d:\\d\\d for ${first.length} revealed letters`));
        assert.equal(await page.locator('#win-verdict').innerText(), 'Your first 12×12. Now there is a time to beat.');
        await page.waitForFunction(() => !document.getElementById('crossword-grid').classList.contains('solved'));
        assert.ok(await page.evaluate(() => document.querySelector('td.white').style.getPropertyValue('--d') === ''), 'delays are cleared after the sweep');
        assert.equal(await page.locator('#streak').innerText(), '1');
        assert.equal(await page.locator('#progress').innerText(), '100%');

        await page.click('#share-button');
        await page.waitForFunction(() => document.getElementById('share-button').innerText === 'Copied');
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        assert.match(clip, /Science Crossword for \d{4}-\d{2}-\d{2}/);
        assert.ok(clip.includes('index.html?set=science'));

        // Challenge a friend: a link to this exact puzzle with the time to beat
        await page.click('#challenge-button');
        await page.waitForFunction(() => document.getElementById('challenge-button').innerText === 'Link copied');
        const challenge = await page.evaluate(() => navigator.clipboard.readText());
        const seconds = await page.evaluate(() => { const [m, s] = document.getElementById('timer').innerText.split(':'); return Number(m) * 60 + Number(s); });
        const today = await page.evaluate(() => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; });
        assert.match(challenge, /^Science Crossword: can you beat \d+:\d\d\?\n/);
        const link = challenge.split('\n')[1];
        assert.ok(link.includes(`set=science&size=12&date=${today}&beat=${seconds}`), `link pins the puzzle and the time: ${link}`);

        // The friend sees the target and, solving faster, beats it; the share text says so
        const friend = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
        await go(friend, link);
        await friend.evaluate(() => localStorage.clear());
        await friend.reload(); await friend.waitForFunction(() => window.__puzzle !== undefined);
        assert.equal(await friend.locator('#challenge-banner.show').count(), 1);
        assert.match(await friend.locator('#challenge-target').innerText(), /^\d+:\d\d$/);
        await solve(friend);
        assert.equal(await friend.locator('#challenge-banner.show').count(), 0, 'target goes once solved');
        assert.match(await friend.locator('#win-verdict').innerText(), /^Challenge beaten by \d+:\d\d\. Your first 12×12/);
        await friend.click('#share-button');
        await friend.waitForFunction(() => document.getElementById('share-button').innerText === 'Copied');
        assert.match(await friend.evaluate(() => navigator.clipboard.readText()), /Challenge beaten by/);
        assert.deepEqual(friend.errors, []);
        await friend.context().close();

        // Without a clipboard the result is offered in a dialog instead of a prompt
        await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('blocked')); });
        await page.click('#share-button');
        assert.ok(await page.locator('#share-dialog[open]').count() === 1, 'share fallback dialog opens');
        assert.match(await page.inputValue('#share-text'), /Solved in \d+:\d\d/);
        await page.keyboard.press('Escape');

        await page.click('#stats-button');
        const stats = (await page.locator('#stats-list').innerText()).replace(/\s+/g, ' ');
        assert.match(stats, /Puzzles solved 1 Current streak 1 day/);
        assert.match(stats, /12×12 best \d+:\d\d · average \d+:\d\d/, 'best and average are per size');
        assert.ok(!stats.includes('Best time'), 'the global best is gone');
        await page.keyboard.press('Escape');

        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        assert.equal(await page.locator('#win-banner.show').count(), 1, 'solved state persists');
        assert.equal(await page.locator('#win-verdict').innerText(), '', 'no verdict on a reload');
        assert.equal(await page.locator('#crossword-grid.solved').count(), 0, 'no sweep on a reload');
        await page.click('#stats-button');
        assert.match((await page.locator('#stats-list').innerText()).replace(/\s+/g, ' '), /Puzzles solved 1 /, 'not double counted');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('modes, pencil, theme and print classes', async () => {
        const page = await newPage();
        await go(page, base + 'index.html?set=animals&seed=5');
        await page.evaluate(() => localStorage.clear());
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        const p = await puzzleData(page);
        const first = p.across[0];
        const right = p.cells[first.row][first.col].letter;
        const wrong = right === 'Z' ? 'Q' : 'Z';

        // Hard mode swaps every clue for the harder one, in the list and the bar, and back again
        const animals = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'words', 'animals.json'), 'utf8'));
        const firstWord = Array.from({ length: first.length }, (_, i) => p.cells[first.row][first.col + i].letter).join('');
        const normalClues = [].concat(animals.words[firstWord]);
        const hardClues = [].concat(animals.hard[firstWord]);
        await page.click(cellSel(first.row, first.col));
        assert.ok(normalClues.includes(await page.locator('#across-clues .clue >> nth=0 >> .t').innerText()), 'normal clue in the list');
        await page.selectOption('#mode', 'hard');
        assert.ok(await page.locator('#check-word').isHidden(), 'hard hides check');
        assert.ok(hardClues.includes(await page.locator('#across-clues .clue >> nth=0 >> .t').innerText()), 'hard clue in the list');
        // The bar shows whichever clue is active, which is also swapped
        const bar = await activeClue(page);
        const activeText = await page.locator('.clue.active .t').innerText();
        const allHard = Object.values(animals.hard).flat();
        assert.ok(bar.endsWith(activeText) && allHard.includes(activeText), `hard clue in the bar: ${bar}`);
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        assert.equal(await page.inputValue('#mode'), 'hard', 'mode persists');
        assert.ok(hardClues.includes(await page.locator('#across-clues .clue >> nth=0 >> .t').innerText()), 'hard clue survives a reload');

        await page.selectOption('#mode', 'easy');
        await page.click(cellSel(first.row, first.col));
        await page.keyboard.press(wrong);
        assert.equal(await page.locator(`${cellSel(first.row, first.col)}.incorrect`).count(), 1, 'easy marks wrong letters');
        await page.selectOption('#mode', 'normal');
        assert.equal(await page.locator('td.incorrect').count(), 0);
        assert.ok(normalClues.includes(await page.locator('#across-clues .clue >> nth=0 >> .t').innerText()), 'normal clue is back');

        await page.click('#pencil');
        await page.click(cellSel(first.row, first.col));
        await page.keyboard.press('Backspace');
        await page.keyboard.press(right);
        assert.equal(await page.locator(`${cellSel(first.row, first.col)}.pencil`).count(), 1);
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        assert.equal(await page.locator(`${cellSel(first.row, first.col)}.pencil`).count(), 1, 'pencil persists');
        assert.equal(await letterAt(page, first.row, first.col), right);

        // Reset asks in a dialog: Escape and Enter keep the entries, the Reset button clears them
        await page.click('#reset-puzzle');
        assert.equal(await page.locator('#reset-dialog[open]').count(), 1, 'reset asks first');
        await page.keyboard.press('Escape');
        assert.equal(await letterAt(page, first.row, first.col), right, 'escape keeps the entries');
        await page.click('#reset-puzzle');
        assert.equal(await page.evaluate(() => document.activeElement.value), 'cancel', 'cancel is the default');
        await page.keyboard.press('Enter');
        assert.equal(await letterAt(page, first.row, first.col), right, 'enter is cancel');
        await page.click('#reset-puzzle');
        await page.click('#reset-dialog button[value="reset"]');
        // The dialog's close event, which performs the reset, is queued by the browser
        await page.waitForFunction(() => !document.getElementById('reset-dialog').open && document.activeElement.id === 'kbd');
        assert.equal(await letterAt(page, first.row, first.col), '', 'reset cleared the grid');
        assert.equal(await page.locator('#timer').innerText(), '0:00');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'kbd', 'focus returns to the grid');

        await page.click('#theme-button');
        assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'theme persists');

        await page.evaluate(() => { window.print = () => {}; });
        await page.click('#print-answers');
        assert.ok(await page.evaluate(() => document.body.classList.contains('print-answers')));
        await page.emulateMedia({ media: 'print' });
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('td.white .letter')).display), 'none');
        assert.match(await page.evaluate(() => getComputedStyle(document.querySelector('td.white'), '::after').content), /^"[A-Z]"$/);
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('a full but wrong grid says so, in hard mode too, and the nudge goes when a cell is cleared', async () => {
        const page = await newPage();
        await go(page, base + 'index.html?set=animals&seed=5');
        await page.evaluate(() => localStorage.clear());
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        await page.selectOption('#mode', 'hard');
        const p = await puzzleData(page);
        const first = p.across[0];
        const whiteCells = await page.locator('td.white').count();
        await page.click(cellSel(first.row, first.col));
        // A press can land on an already filled cell, so keep going until the grid is full
        for (let i = 0; i < whiteCells * 3 && await page.locator('#progress').innerText() !== '100%'; i++) await page.keyboard.press('Z');
        assert.equal(await page.locator('#progress').innerText(), '100%');
        assert.equal(await page.locator('#full-banner.show').count(), 1, 'nudge shows on a full wrong grid');
        assert.equal(await page.locator('#win-banner.show').count(), 0, 'no win');
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        assert.equal(await page.locator('#full-banner.show').count(), 1, 'nudge survives a reload');
        await page.click(cellSel(first.row, first.col));
        await page.keyboard.press('Backspace');
        assert.equal(await page.locator('#full-banner.show').count(), 0, 'nudge goes once a cell is empty');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('desktop menus drive the native selects', async () => {
        const page = await newPage();
        await go(page, base + 'index.html?set=animals&seed=5');
        await page.evaluate(() => localStorage.clear());
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        assert.equal(await page.locator('.menu.enhanced').count(), 3, 'set, size and mode are menus');
        assert.ok(await page.locator('select[name=set]').isVisible(), 'the select is still there for forms and tests');

        // Labels reflect what app.js put in the selects after load
        const setButton = page.locator('.menu-button[aria-label="Word set"]');
        const modeButton = page.locator('.menu-button[aria-label="Difficulty"]');
        assert.equal(await setButton.innerText(), 'Animals');
        assert.equal(await modeButton.innerText(), 'Normal');

        // Keyboard: open, move, choose; the change reaches the game
        await modeButton.click();
        assert.equal(await modeButton.getAttribute('aria-expanded'), 'true');
        assert.equal(await page.locator('.menu-list:visible li[aria-selected="true"]').innerText(), 'Normal');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        assert.equal(await page.inputValue('#mode'), 'hard');
        assert.equal(await modeButton.innerText(), 'Hard');
        assert.equal(await modeButton.getAttribute('aria-expanded'), 'false');
        assert.ok(await page.locator('#check-word').isHidden(), 'the change event applied hard mode');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'kbd', 'the game moves focus to the grid after a mode change, as with a native select');

        // Escape closes without choosing; a letter jumps while open
        await modeButton.click();
        await page.keyboard.press('e');
        assert.equal(await page.locator('.menu-list:visible li.active').innerText(), 'Easy');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.menu-list:visible').count(), 0);
        assert.equal(await page.inputValue('#mode'), 'hard', 'escape keeps the value');

        // Mouse: the set menu lists every word set and clicking one selects it
        await setButton.click();
        assert.equal(await page.locator('.menu-list:visible li').count(), await page.locator('select[name=set] option').count());
        await page.locator('.menu-list:visible li', { hasText: 'Geography' }).click();
        assert.equal(await page.inputValue('select[name=set]'), 'geography');
        assert.equal(await setButton.innerText(), 'Geography');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Word set', 'focus stays on the button');

        // Clicking elsewhere closes an open menu
        await setButton.click();
        await page.mouse.click(5, 5);
        assert.equal(await page.locator('.menu-list:visible').count(), 0);

        // Selecting through the native select, as tests and scripts do, updates the button
        await page.selectOption('#mode', 'easy');
        assert.equal(await modeButton.innerText(), 'Easy');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });
});

describe('phone', () => {
    test('fits the screen, keeps the keyboard input focused, accepts input events', async () => {
        const page = await newPage({ ...devices['iPhone 13'] });
        await go(page, base + 'index.html?set=geography&size=12&seed=771');
        await page.evaluate(() => localStorage.clear());
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);

        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll');
        assert.notEqual(await page.evaluate(() => document.activeElement.id), 'kbd', 'keyboard not forced open on load');
        assert.equal(await page.locator('.menu.enhanced').count(), 0, 'phones keep the native selects');
        assert.ok(await page.locator('select[name=set]').isVisible());

        const p = await puzzleData(page);
        const first = p.across[0];
        await page.tap(cellSel(first.row, first.col));
        assert.equal(await page.evaluate(() => document.activeElement.id), 'kbd', 'tap focuses the keyboard input');
        assert.match(await activeLabel(page), /^\d+ Across$/, 'first tap does not flip direction');

        const word = Array.from({ length: first.length }, (_, i) => p.cells[first.row][first.col + i].letter);
        for (const ch of word) {
            // Software keyboards often deliver only an input event
            await page.evaluate(ch => {
                const k = document.getElementById('kbd');
                k.value = ch.toLowerCase();
                k.dispatchEvent(new Event('input', { bubbles: true }));
            }, ch);
        }
        assert.equal(await rowText(page, first.row, first.col, first.length), word.join(''));
        assert.equal(await page.evaluate(() => document.getElementById('kbd').value), '');

        await go(page, base + 'index.html?set=geography&size=20&seed=3');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '20x20 fits too');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });
});

describe('static server', () => {
    test('serves both icons with the right types and survives bad requests', async () => {
        const page = await newPage();
        const svg = await page.request.get(base + 'favicon.svg');
        assert.equal(svg.status(), 200);
        assert.equal(svg.headers()['content-type'], 'image/svg+xml');
        const ico = await page.request.get(base + 'favicon.ico');
        assert.equal(ico.status(), 200);
        assert.equal(ico.headers()['content-type'], 'image/x-icon');

        assert.equal((await page.request.get(base + '%E0%A4%A')).status(), 400, 'malformed escape is a 400, not a crash');
        assert.equal((await page.request.get(base + 'index.html')).status(), 200, 'server still up afterwards');
    });

    test('a sibling directory sharing the root name prefix is not served', async () => {
        // Serve <tmp>/root and put a secret in <tmp>/root-other, so a prefix-only root check would leak it.
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crossword-'));
        const root = path.join(dir, 'root');
        fs.mkdirSync(root);
        fs.mkdirSync(path.join(dir, 'root-other'));
        fs.writeFileSync(path.join(dir, 'root-other', 'secret.txt'), 'leak');
        fs.writeFileSync(path.join(root, 'ok.txt'), 'fine');
        const srv = await start(0, root);
        const url = `http://127.0.0.1:${srv.address().port}/`;
        const page = await newPage();
        try {
            assert.equal((await page.request.get(url + 'ok.txt')).status(), 200, 'files inside the root are served');
            assert.equal((await page.request.get(url + '..%2Froot-other%2Fsecret.txt')).status(), 404, 'sibling directory stays outside the root');
        } finally {
            await page.context().close();
            srv.close();
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('creator and archive', () => {
    test('create page validates input and produces a working link', async () => {
        const page = await newPage();
        await page.goto(base + 'create.html');
        await page.fill('#title', 'Our <party>');
        await page.fill('#words', 'CAKE: Sweet\nBAD WORD: has a space\nROSE: Flower');
        await page.click('button[type=submit]');
        assert.ok(await page.locator('#create-error').isVisible());
        assert.match(await page.locator('#create-error').innerText(), /letters only/);

        await page.fill('#words', 'CAKE: Sweet thing\nparis - Where we met\notter\tHer favourite\nROSE: Flower\nSTAR: Night light');
        await page.selectOption('#size', '10');
        await page.click('button[type=submit]');
        const link = await page.inputValue('#create-link');
        assert.ok(link.includes('custom=') && link.includes('size=10'));

        await go(page, link);
        assert.equal(await page.locator('h1').innerText(), 'Our <party> Crossword', 'name escaped, not rendered as HTML');
        const p = await puzzleData(page);
        assert.equal(p.custom, true);
        assert.equal(p.wordCount, 5);

        await page.selectOption('select[name=size]', '12');
        await page.click('#toolbar button[type=submit]');
        await page.waitForFunction(() => window.__puzzle !== undefined && window.__puzzle.rows === 12);
        assert.ok(page.url().includes('custom='), 'custom payload survives a size change');

        await go(page, base + 'index.html?custom=zzz');
        assert.equal(await page.locator('.banner.warn.show').count(), 1, 'bad link shows a notice');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('a date loads that day\'s puzzle', async () => {
        const page = await newPage();
        await go(page, base + 'index.html?set=food&date=2026-03-01');
        assert.match(await page.locator('.subtitle').innerText(), /Daily puzzle for 1 March 2026/);
        assert.equal(await page.inputValue('#date-picker'), '2026-03-01');
        assert.equal((await puzzleData(page)).seed, 20260301);
        await page.context().close();
    });

    test('a bare visit shows Today: a card per set with its daily and Mini, ticked once solved', async () => {
        const page = await newPage();
        await go(page, base + 'index.html');
        await page.evaluate(() => localStorage.clear());
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        assert.equal(await page.evaluate(() => window.__puzzle), null, 'no puzzle is generated on the front door');
        assert.ok(await page.locator('#today').isVisible());
        assert.ok(await page.locator('#toolbar').isHidden(), 'the puzzle chrome is hidden');
        assert.equal(await page.locator('h1').innerText(), 'Crossword');
        // The weekday comma depends on the browser's ICU version
        assert.match(await page.locator('.subtitle').innerText(), /^[A-Z][a-z]+day,? \d{1,2} [A-Z][a-z]+ \d{4}$/);
        const setCount = (await page.request.get(base + 'words/index.json')).ok() ? (await (await page.request.get(base + 'words/index.json')).json()).length + 1 : 0;
        assert.equal(await page.locator('.today-card').count(), setCount, 'one card per set, Mixed included');
        assert.equal(await page.locator('.today-card a').count(), setCount * 2);
        assert.equal(await page.locator('.today-card a.solved').count(), 0);
        assert.ok(await page.locator('#today-streaks').isHidden(), 'no streak line without a streak');
        const miniHref = await page.locator('.today-card').first().locator('a').nth(1).getAttribute('href');
        assert.ok(miniHref.includes('mini=1'));

        // The cards sit in one row that scrolls sideways; arrows step it and hide at the ends
        const track = page.locator('#today-track');
        assert.ok(await page.locator('.today-card').evaluateAll(cards => cards.every(c => c.getBoundingClientRect().top === cards[0].getBoundingClientRect().top)), 'every card is on one row');
        assert.ok(await track.evaluate(el => el.scrollWidth > el.clientWidth), 'the row overflows, so it scrolls');
        assert.ok(await page.locator('#today-prev').isDisabled(), 'no way back from the start');
        assert.ok(await track.evaluate(el => el.classList.contains('fade-r') && !el.classList.contains('fade-l')), 'only the far edge fades at the start');

        // The featured card: today's pick rotates with the date and shows a thumbnail of its real grid
        const featured = page.locator('#today-featured');
        assert.ok(await featured.isVisible(), 'a featured card shows');
        const sets = (await (await page.request.get(base + 'words/index.json')).json()).concat([{ key: 'mixed', name: 'Mixed' }]);
        const dayNumber = await page.evaluate(() => { const d = new Date(), p = n => String(n).padStart(2, '0'); return Math.round(Date.parse(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T00:00:00Z`) / 864e5); });
        const pick = sets[dayNumber % sets.length];
        assert.ok((await featured.getAttribute('href')).endsWith(`set=${pick.key}`), `the pick rotates with the date: ${pick.key}`);
        assert.equal(await page.locator('#featured-name').innerText(), pick.name);
        assert.match(await page.locator('#featured-meta').innerText(), /^12×12 · \d+ words$/);
        assert.ok(await page.locator('#featured-thumb rect').count() > 60, 'the thumbnail draws the white cells');
        assert.equal(await page.locator('#featured-eyebrow').evaluate(el => el.textContent), "Today's pick");
        assert.equal(await page.locator('.today-card .mono').count(), sets.length, 'every card has a monogram');
        // On a first visit the explanation sits under the date, above the featured card
        assert.ok(await page.locator('#today-help').isVisible(), 'the help line shows on a first visit');
        assert.ok(await page.evaluate(() => document.getElementById('today-help').getBoundingClientRect().top < document.getElementById('today-featured').getBoundingClientRect().top), 'the help line sits above the featured card');
        assert.ok(await page.locator('#today-next').isVisible(), 'the forward arrow shows on desktop');
        await page.click('#today-next');
        await page.waitForFunction(() => document.getElementById('today-track').scrollLeft > 100);
        assert.ok(!(await page.locator('#today-prev').isDisabled()), 'the back arrow appears once scrolled');
        await track.evaluate(el => { el.scrollLeft = el.scrollWidth; });
        await page.waitForFunction(() => document.getElementById('today-next').disabled);
        assert.ok(await page.locator('.today-card').last().evaluate(c => { const r = c.getBoundingClientRect(); return r.right <= window.innerWidth; }), 'the last card is fully in view at the end');
        assert.ok(await track.evaluate(el => el.classList.contains('fade-l') && !el.classList.contains('fade-r')), 'only the near edge fades at the end');
        await track.evaluate(el => { el.scrollLeft = 0; });
        await page.waitForFunction(() => document.getElementById('today-prev').disabled);

        // Solve the first set's Mini, come back: it is ticked and the Mini streak shows
        await page.locator('.today-card').first().locator('a').nth(1).click();
        await page.waitForFunction(() => window.__puzzle && window.__puzzle.mini);
        await solve(page);
        await page.click('#today-link');
        await page.waitForFunction(() => document.getElementById('today') && !document.getElementById('today').hidden);
        assert.equal(await page.locator('.today-card a.solved').count(), 1);
        assert.ok(await page.locator('.today-card').first().locator('a').nth(1).evaluate(a => a.classList.contains('solved')), 'the solved Mini is ticked');
        assert.match(await page.locator('#today-streaks').innerText(), /^1 of \d+ solved today · Mini streak 1$/);
        assert.ok(!(await page.locator('#today-streaks').innerText()).includes('Streak 1'), 'no full streak yet');
        assert.ok(await page.locator('#today-help').isHidden(), 'the help line goes once anything is solved');
        assert.ok((await page.locator('#today-random').getAttribute('href')).includes('set=mixed&seed='));
        assert.match(await page.locator('.today-card').first().locator('.today-sub').innerText(), /1 of 2 solved/);

        // Once the pick's daily is solved, the featured card says so
        await page.evaluate(name => {
            const d = new Date(), p = n => String(n).padStart(2, '0');
            const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
            const s = JSON.parse(localStorage.getItem('crossword:stats'));
            s.days[today] = (s.days[today] || []).concat([name]);
            localStorage.setItem('crossword:stats', JSON.stringify(s));
        }, pick.name);
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        assert.ok(await featured.evaluate(el => el.classList.contains('solved')));
        assert.equal(await page.locator('#featured-eyebrow').evaluate(el => el.textContent), 'Solved today');
        assert.equal(await page.locator('#featured-cta').innerText(), 'Open');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('the day turns over at local midnight, not UTC: Today, the daily and the streak follow the player\'s clock', async () => {
        // Pick a zone whose calendar date differs from UTC right now
        const timezoneId = new Date().getUTCHours() < 12 ? 'Etc/GMT+12' : 'Pacific/Kiritimati';
        const page = await newPage({ timezoneId });
        await go(page, base + 'index.html');
        await page.evaluate(() => localStorage.clear());
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        const dates = await page.evaluate(() => {
            const d = new Date(), p = n => String(n).padStart(2, '0');
            return { local: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, utc: d.toISOString().slice(0, 10) };
        });
        assert.notEqual(dates.local, dates.utc, 'the chosen zone is on a different date from UTC');
        const expected = await page.evaluate(() => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
        assert.equal(await page.locator('.subtitle').innerText(), expected, 'Today shows the local date');

        // The daily is dated with the local day and seeded from it
        await page.locator('.today-card').first().locator('a').first().click();
        await page.waitForFunction(() => window.__puzzle);
        const daily = await page.evaluate(() => ({ date: window.__puzzle.date, daily: window.__puzzle.daily, seed: window.__puzzle.seed }));
        assert.equal(daily.date, dates.local);
        assert.ok(daily.daily, 'the local day\'s puzzle is the daily');
        assert.equal(daily.seed, Number(dates.local.replace(/-/g, '')));

        // A solve is recorded against the local day and starts the streak
        await page.goto(base + 'index.html?set=animals&mini=1');
        await page.waitForFunction(() => window.__puzzle && window.__puzzle.mini);
        await solve(page);
        const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('crossword:stats')));
        assert.equal(stats.lastMini, dates.local);
        assert.equal(stats.miniStreak, 1);
        assert.ok(stats.days[dates.local].includes('Animals Mini'));

        // A record dated by UTC from before the change still counts as today's
        await page.evaluate(utc => {
            const s = JSON.parse(localStorage.getItem('crossword:stats'));
            s.lastDaily = utc; s.streak = 4;
            localStorage.setItem('crossword:stats', JSON.stringify(s));
        }, dates.utc);
        await page.goto(base + 'index.html');
        await page.waitForFunction(() => window.__puzzle !== undefined);
        assert.match(await page.locator('#today-streaks').innerText(), /Streak 4/);
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('a report link under the clues opens a prefilled issue for the clue in view', async () => {
        const page = await newPage();
        await go(page, base + 'index.html?set=animals&seed=5');
        const line = page.locator('#report-line');
        assert.ok(await line.isVisible(), 'the report line shows once a clue is selected');
        const first = page.locator('#across-clues .clue').first();
        const number = (await first.locator('.n').innerText()).replace(/\D/g, '');
        await first.click();
        const href = await page.locator('#report-link').getAttribute('href');
        assert.ok(href.startsWith('https://github.com/Ag-Tawfik/CrosswordPuzzle/issues/new?title='), href);
        const url = new URL(href);
        const answer = await page.evaluate(() => [...document.querySelectorAll('td.selected')].map(td => td.dataset.answer).join(''));
        assert.equal(url.searchParams.get('title'), `Clue report: ${answer} (Animals)`);
        const body = url.searchParams.get('body');
        assert.ok(body.includes(`**Clue:** ${number} Across:`), body);
        assert.ok(body.includes('**Set:** Animals (animals)') && body.includes('seed 5, 12×12') && body.includes(`**Answer:** ${answer}`), body);
        assert.ok(body.includes('set=animals&size=12&seed=5'), 'the body links to this exact puzzle');
        assert.equal(await page.locator('#report-link').getAttribute('target'), '_blank');
        // A custom puzzle has no one to report to
        const custom = await page.evaluate(() => Crossword.base64urlEncode(JSON.stringify({ name: 'T', words: { CAT: 'Pet', ACT: 'Deed', TEA: 'Drink', EAT: 'Dine' } })));
        await go(page, base + 'index.html?custom=' + custom);
        assert.ok(await page.evaluate(() => window.__puzzle && window.__puzzle.custom), 'the custom puzzle loaded');
        assert.ok(await line.isHidden(), 'no report line on a custom puzzle');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('stats can be copied as a backup code and restored in another browser', async () => {
        const page = await newPage();
        await go(page, base + 'index.html?set=animals&mini=1&seed=3');
        await solve(page);
        await page.evaluate(() => { navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }; });
        await page.click('#stats-button');
        assert.match((await page.locator('#stats-list').innerText()).replace(/\s+/g, ' '), /Puzzles solved 1/);
        await page.click('#backup-copy');
        const code = await page.evaluate(() => window.__copied);
        assert.ok(code && code.startsWith('CW1.'), 'a backup code was copied');
        assert.equal(await page.locator('#backup-copy').innerText(), 'Copied');
        await page.keyboard.press('Escape');

        // A fresh browser has nothing; a wrong code is refused; the right one brings the stats back
        const other = await newPage();
        await go(other, base + 'index.html?set=food&seed=9');
        await other.click('#stats-button');
        assert.match((await other.locator('#stats-list').innerText()).replace(/\s+/g, ' '), /Puzzles solved 0/);
        await other.click('#backup-restore');
        assert.ok(await other.locator('#restore-dialog').isVisible());
        await other.fill('#restore-text', 'not a code');
        await other.click('#restore-go');
        assert.ok(await other.locator('#restore-error').isVisible(), 'junk is refused');
        await other.fill('#restore-text', code);
        await other.click('#restore-go');
        await other.waitForFunction(() => document.getElementById('stats-dialog').open);
        const restored = (await other.locator('#stats-list').innerText()).replace(/\s+/g, ' ');
        assert.match(restored, /Puzzles solved 1/);
        assert.match(restored, /7×7 Mini best \d+:\d\d/, 'the per-size record came across');
        assert.deepEqual(other.errors, []);
        await other.context().close();
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('the grid carries roles and labels a screen reader can follow', async () => {
        const page = await newPage();
        await go(page, base + 'index.html?set=animals&seed=5');
        assert.equal(await page.locator('#crossword-grid').getAttribute('role'), 'grid');
        assert.equal(await page.locator('#crossword-grid tr').first().getAttribute('role'), 'row');
        assert.equal(await page.locator('td.black').first().getAttribute('aria-hidden'), 'true');
        const first = page.locator('td.white').first();
        assert.match(await first.getAttribute('aria-label'), /^Row \d+, column \d+(, \d+)?, empty$/);
        await first.click();
        assert.equal(await first.getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator('td[aria-selected="true"]').count(), 1, 'exactly one cell is selected');
        const label = await page.locator('#kbd').getAttribute('aria-label');
        assert.match(label, /^\d+ (Across|Down): .+\. Row \d+, column \d+.*\. Type a letter\.$/, label);
        await page.keyboard.press('Q');
        assert.match(await first.getAttribute('aria-label'), /, letter Q$/);
        assert.equal(await page.locator('#kbd').getAttribute('aria-describedby'), 'active-clue');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('the page carries a description and social card tags with an absolute image that exists', async () => {
        const page = await newPage();
        for (const file of ['index.html', 'create.html']) {
            const html = await (await page.request.get(base + file)).text();
            assert.match(html, /<meta name="description" content="[^"]{40,}">/, `${file} has a description`);
            assert.match(html, /<meta property="og:image" content="https:\/\/ag-tawfik\.github\.io\/CrosswordPuzzle\/docs\/social\.png">/, `${file} names an absolute social image`);
            assert.match(html, /<meta name="twitter:card" content="summary_large_image">/, `${file} has a Twitter card`);
        }
        const img = await page.request.get(base + 'docs/social.png');
        assert.ok(img.ok(), 'the social image is served');
        assert.equal(img.headers()['content-type'], 'image/png');
        await page.context().close();
    });

    test('the mixed set draws from every topic and works as a Mini', async () => {
        const page = await newPage();
        await go(page, base + 'index.html?set=mixed&seed=11');
        assert.equal(await page.locator('h1').innerText(), 'Mixed Crossword');
        assert.equal(await page.inputValue('select[name=set]'), 'mixed');
        assert.equal(await page.locator('select[name=set] option').last().innerText(), 'Mixed', 'listed after the topic sets');
        const p = await puzzleData(page);
        assert.ok(p.wordCount >= 12, `placed ${p.wordCount}`);
        // The Mini link and the archive keep the set
        assert.ok((await page.locator('#mini-link').getAttribute('href')).includes('set=mixed'));
        await go(page, base + 'index.html?set=mixed&mini=1');
        assert.equal(await page.locator('h1').innerText(), 'Mixed Mini');
        assert.equal((await puzzleData(page)).rows, 7);
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('the daily Mini is a 7x7 of the same set with its own streak and archive', async () => {
        const page = await newPage();
        await go(page, base + 'index.html?set=animals');
        await page.evaluate(() => localStorage.clear());
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        const miniLink = page.locator('#mini-link');
        assert.equal(await miniLink.innerText(), 'Daily Mini');
        assert.ok((await miniLink.getAttribute('href')).includes('set=animals&mini=1'));

        await miniLink.click();
        await page.waitForFunction(() => window.__puzzle !== undefined && window.__puzzle.mini);
        const p = await puzzleData(page);
        assert.equal(p.rows, 7);
        assert.ok(p.wordCount >= 5, `a Mini has a handful of words, got ${p.wordCount}`);
        assert.equal(await page.locator('h1').innerText(), 'Animals Mini');
        assert.match(await page.locator('.subtitle').innerText(), /^Daily Mini for .* · 7×7 · \d+ words$/);
        assert.ok(await page.locator('select[name=size]').isHidden(), 'no size choice in the Mini');
        assert.equal(await miniLink.innerText(), 'Full puzzle');
        assert.ok(!(await miniLink.getAttribute('href')).includes('mini'));
        assert.ok(await page.evaluate(() => document.body.classList.contains('mini')));

        // Random and the date picker stay in the Mini
        await page.click('#new-puzzle');
        await page.waitForFunction(() => window.__puzzle !== undefined && /seed=\d+/.test(location.search));
        assert.ok(page.url().includes('mini=1'));
        assert.equal((await puzzleData(page)).rows, 7);
        assert.match(await page.locator('.subtitle').innerText(), /^Mini #\d+/);

        // Solving today's Mini starts the Mini streak, not the full streak
        await go(page, base + 'index.html?set=animals&mini=1');
        await solve(page);
        assert.match(await page.locator('#win-text').innerText(), /^Solved in/);
        assert.equal(await page.locator('#win-verdict').innerText(), 'Your first Mini. Now there is a time to beat.');
        assert.equal(await page.locator('#streak').innerText(), '1');
        assert.equal(await page.locator('#streak-label').innerText(), 'Mini streak');

        // A second Mini is judged against the first, never against the full puzzles
        await go(page, base + 'index.html?set=animals&mini=1&seed=77');
        await solve(page);
        assert.match(await page.locator('#win-verdict').innerText(), /^(Your fastest Mini yet|Faster than your Mini average|Exactly your Mini average|Slower than your Mini average)/);
        await page.click('#stats-button');
        const stats = (await page.locator('#stats-list').innerText()).replace(/\s+/g, ' ');
        assert.match(stats, /Current streak 0 days Mini streak 1 day/);
        assert.match(stats, /7×7 Mini best \d+:\d\d/, 'the Mini has its own best');
        assert.ok(!/12×12 best/.test(stats), 'no 12x12 row without a 12x12 solve');
        await page.keyboard.press('Escape');
        await page.click('#calendar-button');
        assert.match(await page.locator('#calendar-summary').innerText(), /Animals Mini: 1 solved/);
        assert.ok((await page.locator('#calendar-grid .day.solved').getAttribute('href')).includes('mini=1'));
        await page.keyboard.press('Escape');

        await go(page, base + 'index.html?set=animals');
        assert.ok(await page.locator('#streak-status').isHidden(), 'the full puzzle streak is untouched');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('the archive calendar shows solved days and links to past puzzles', async () => {
        const page = await newPage();
        await go(page, base + 'index.html?set=food&date=2026-03-01');
        await page.evaluate(() => localStorage.clear());
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);

        await page.click('#calendar-button');
        assert.equal(await page.locator('#calendar-dialog[open]').count(), 1);
        assert.equal(await page.locator('#calendar-title').innerText(), 'March 2026', 'opens on the puzzle\'s month');
        assert.equal(await page.locator('#calendar-grid .day.solved').count(), 0, 'nothing solved yet');
        assert.equal(await page.locator('#calendar-grid a.day').count(), 31, 'every day of a past month is a link');
        assert.ok((await page.locator('#calendar-grid a.day').first().getAttribute('href')).includes('set=food&size=12&date=2026-03-01'));
        assert.equal(await page.locator('#calendar-grid .wd').first().innerText(), 'M', 'weeks start on Monday');
        await page.click('#calendar-prev');
        assert.equal(await page.locator('#calendar-title').innerText(), 'February 2026');
        assert.equal(await page.locator('#calendar-grid a.day').count(), 28);
        await page.keyboard.press('Escape');

        await solve(page);
        await page.click('#calendar-button');
        const solved = page.locator('#calendar-grid .day.solved');
        assert.equal(await solved.count(), 1, 'the solved day is filled');
        assert.equal(await solved.innerText(), '1');
        assert.match(await page.locator('#calendar-summary').innerText(), /Food & Drink: 1 solved this month/);
        await page.keyboard.press('Escape');

        // Another set on the same day shows as a dot, not as solved; today is ringed and later days are not links
        await go(page, base + 'index.html?set=animals&date=2026-03-01');
        await page.click('#calendar-button');
        assert.equal(await page.locator('#calendar-grid .day.solved').count(), 0);
        assert.equal(await page.locator('#calendar-grid .day.other').count(), 1);
        while (!(await page.locator('#calendar-next').isDisabled())) await page.click('#calendar-next');
        assert.equal(await page.locator('#calendar-grid .day.today').count(), 1);
        assert.equal(await page.locator('#calendar-grid a.day.future').count(), 0, 'future days are not links');
        await page.keyboard.press('Escape');

        // Stats saved before the day record existed are read back from the history
        await page.evaluate(() => {
            const s = JSON.parse(localStorage.getItem('crossword:stats'));
            delete s.days;
            s.history.push({ id: 'old', when: '2026-02-10', set: 'Animals', seed: 20260210, size: 12, time: 60, reveals: 0 });
            localStorage.setItem('crossword:stats', JSON.stringify(s));
        });
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        await page.click('#calendar-button');
        await page.click('#calendar-prev');
        assert.equal(await page.locator('#calendar-grid .day.solved').innerText(), '10', 'legacy daily solve inferred from its seed');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });
});
