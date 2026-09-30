// Browser tests for the game. Run with: npm test  (or node --test tests/browser.test.js)
// Starts PHP's built-in server on a free port and drives the page with Playwright.

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..');
let server, browser, base;

function freePort() {
    return new Promise(resolve => {
        const s = net.createServer().listen(0, '127.0.0.1', () => {
            const port = s.address().port;
            s.close(() => resolve(port));
        });
    });
}

async function waitFor(url, tries = 50) {
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(url);
            if (res.ok) return;
        } catch (e) { /* not up yet */ }
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('server did not start');
}

before(async () => {
    const port = await freePort();
    base = `http://127.0.0.1:${port}/`;
    server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', ROOT], { stdio: 'ignore' });
    await waitFor(base + 'index.php?format=json');
    browser = await chromium.launch();
});

after(async () => {
    await browser?.close();
    server?.kill();
});

async function newPage(options = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 1200 }, ...options });
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
    return page;
}

const puzzleData = page => page.evaluate(() => JSON.parse(document.getElementById('puzzle-data').textContent));
const cellSel = (r, c) => `td[data-row="${r}"][data-col="${c}"]`;
const letterAt = (page, r, c) => page.locator(`${cellSel(r, c)} .letter`).innerText();
const activeClue = page => page.locator('#active-clue').innerText();
const rowText = (page, r, c, n) => page.evaluate(([r, c, n]) => {
    let s = '';
    for (let i = 0; i < n; i++) s += document.querySelector(`td[data-row="${r}"][data-col="${c + i}"] .letter`).textContent;
    return s;
}, [r, c, n]);

// A cell that belongs to both an across and a down word
async function crossingCell(page) {
    return page.evaluate(() => {
        const p = JSON.parse(document.getElementById('puzzle-data').textContent);
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
        await page.goto(base + 'index.php?set=geography&size=12&seed=77');
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        const p = await puzzleData(page);
        const first = p.across[0];
        const word = Array.from({ length: first.length }, (_, i) => p.cells[first.row][first.col + i].letter).join('');

        assert.equal(await page.evaluate(() => document.activeElement.id), 'kbd', 'keyboard input focused on load');
        await page.keyboard.type(word);
        assert.equal(await rowText(page, first.row, first.col, first.length), word);
        assert.equal(await page.locator(`${cellSel(first.row, first.col + first.length - 1)}.current`).count(), 0, 'moved on after the word');

        await page.reload();
        assert.equal(await rowText(page, first.row, first.col, first.length), word, 'entries restored');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('clicking the selected cell toggles direction; arrows, prev/next and Tab behave', async () => {
        const page = await newPage();
        await page.goto(base + 'index.php?set=geography&size=12&seed=77');
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
        await page.keyboard.press(before.includes('Across') ? 'ArrowDown' : 'ArrowRight');
        assert.notEqual(await activeClue(page), before, 'arrow across the axis switches direction');

        await page.keyboard.press('Tab');
        assert.notEqual(await page.evaluate(() => document.activeElement.id), 'kbd', 'Tab leaves the grid');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('check word marks cells, solving shows the banner and records stats', async () => {
        const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
        await page.goto(base + 'index.php?set=science');
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        const p = await puzzleData(page);
        assert.equal(p.daily, true);
        const first = p.across[0];

        await page.keyboard.press(p.cells[first.row][first.col].letter === 'Z' ? 'Q' : 'Z');
        await page.click(first ? `#across-clues .clue >> nth=0` : '');
        await page.click('#check-word');
        assert.equal(await page.locator('td.incorrect').count(), 1);

        await page.click(`${cellSel(first.row, first.col)}`);
        await page.click('#reveal-letter');
        await solve(page);

        const win = await page.locator('#win-text').innerText();
        assert.match(win, /^Solved in \d+:\d\d with 1 revealed letter/);
        assert.equal(await page.locator('#streak').innerText(), '1');
        assert.equal(await page.locator('#progress').innerText(), '100%');

        await page.click('#share-button');
        await page.waitForFunction(() => document.getElementById('share-button').innerText === 'Copied');
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        assert.match(clip, /Science Crossword for \d{4}-\d{2}-\d{2}/);
        assert.ok(clip.includes('index.php?set=science'));

        await page.click('#stats-button');
        const stats = (await page.locator('#stats-list').innerText()).replace(/\s+/g, ' ');
        assert.match(stats, /Puzzles solved 1 Current streak 1 day/);
        await page.keyboard.press('Escape');

        await page.reload();
        assert.equal(await page.locator('#win-banner.show').count(), 1, 'solved state persists');
        await page.click('#stats-button');
        assert.match((await page.locator('#stats-list').innerText()).replace(/\s+/g, ' '), /Puzzles solved 1 /, 'not double counted');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('modes, pencil, theme and print classes', async () => {
        const page = await newPage();
        await page.goto(base + 'index.php?set=animals&seed=5');
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        const p = await puzzleData(page);
        const first = p.across[0];
        const right = p.cells[first.row][first.col].letter;
        const wrong = right === 'Z' ? 'Q' : 'Z';

        await page.selectOption('#mode', 'hard');
        assert.ok(await page.locator('#check-word').isHidden(), 'hard hides check');
        await page.reload();
        assert.equal(await page.inputValue('#mode'), 'hard', 'mode persists');

        await page.selectOption('#mode', 'easy');
        await page.click(cellSel(first.row, first.col));
        await page.keyboard.press(wrong);
        assert.equal(await page.locator(`${cellSel(first.row, first.col)}.incorrect`).count(), 1, 'easy marks wrong letters');
        await page.selectOption('#mode', 'normal');
        assert.equal(await page.locator('td.incorrect').count(), 0);

        await page.click('#pencil');
        await page.click(cellSel(first.row, first.col));
        await page.keyboard.press('Backspace');
        await page.keyboard.press(right);
        assert.equal(await page.locator(`${cellSel(first.row, first.col)}.pencil`).count(), 1);
        await page.reload();
        assert.equal(await page.locator(`${cellSel(first.row, first.col)}.pencil`).count(), 1, 'pencil persists');
        assert.equal(await letterAt(page, first.row, first.col), right);

        await page.click('#theme-button');
        assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
        await page.reload();
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
});

describe('phone', () => {
    test('fits the screen, keeps the keyboard input focused, accepts input events', async () => {
        const page = await newPage({ ...devices['iPhone 13'] });
        await page.goto(base + 'index.php?set=geography&size=12&seed=771');
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll');
        assert.notEqual(await page.evaluate(() => document.activeElement.id), 'kbd', 'keyboard not forced open on load');

        const p = await puzzleData(page);
        const first = p.across[0];
        await page.tap(cellSel(first.row, first.col));
        assert.equal(await page.evaluate(() => document.activeElement.id), 'kbd', 'tap focuses the keyboard input');
        assert.ok((await activeClue(page)).includes('Across'), 'first tap does not flip direction');

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

        await page.goto(base + 'index.php?set=geography&size=20&seed=3');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '20x20 fits too');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });
});

describe('creator and archive', () => {
    test('create page validates input and produces a working link', async () => {
        const page = await newPage();
        await page.goto(base + 'create.php');
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

        await page.goto(link);
        assert.equal(await page.locator('h1').innerText(), 'Our <party> Crossword', 'name escaped, not rendered as HTML');
        const p = await puzzleData(page);
        assert.equal(p.custom, true);
        assert.equal(p.wordCount, 5);

        await page.selectOption('select[name=size]', '12');
        await page.click('#toolbar button[type=submit]');
        await page.waitForLoadState();
        assert.ok(page.url().includes('custom='), 'custom payload survives a size change');

        await page.goto(base + 'index.php?custom=zzz');
        assert.equal(await page.locator('.banner.warn.show').count(), 1, 'bad link shows a notice');
        assert.deepEqual(page.errors, []);
        await page.context().close();
    });

    test('a date loads that day\'s puzzle', async () => {
        const page = await newPage();
        await page.goto(base + 'index.php?set=food&date=2026-03-01');
        assert.match(await page.locator('.subtitle').innerText(), /Daily puzzle for 1 March 2026/);
        assert.equal(await page.inputValue('#date-picker'), '2026-03-01');
        assert.equal((await puzzleData(page)).seed, 20260301);
        await page.context().close();
    });
});
