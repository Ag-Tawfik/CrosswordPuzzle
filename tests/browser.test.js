// Browser tests for the game. Run with: npm run test:browser
// Serves the repository root on a free port and drives the pages with Playwright.

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');
const path = require('node:path');
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
    page.on('requestfailed', r => page.errors.push(`${r.failure()?.errorText} ${r.url()}`));
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
        assert.ok(clip.includes('index.html?set=science'));

        await page.click('#stats-button');
        const stats = (await page.locator('#stats-list').innerText()).replace(/\s+/g, ' ');
        assert.match(stats, /Puzzles solved 1 Current streak 1 day/);
        await page.keyboard.press('Escape');

        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        assert.equal(await page.locator('#win-banner.show').count(), 1, 'solved state persists');
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

        await page.selectOption('#mode', 'hard');
        assert.ok(await page.locator('#check-word').isHidden(), 'hard hides check');
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
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
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);
        assert.equal(await page.locator(`${cellSel(first.row, first.col)}.pencil`).count(), 1, 'pencil persists');
        assert.equal(await letterAt(page, first.row, first.col), right);

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
});

describe('phone', () => {
    test('fits the screen, keeps the keyboard input focused, accepts input events', async () => {
        const page = await newPage({ ...devices['iPhone 13'] });
        await go(page, base + 'index.html?set=geography&size=12&seed=771');
        await page.evaluate(() => localStorage.clear());
        await page.reload(); await page.waitForFunction(() => window.__puzzle !== undefined);

        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll');
        assert.notEqual(await page.evaluate(() => document.activeElement.id), 'kbd', 'keyboard not forced open on load');

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
        assert.equal((await page.request.get(base + '..%2F' + path.basename(path.join(__dirname, '..')) + '-other%2Fx')).status(), 404, 'sibling directory with the same name prefix stays outside the root');
        assert.equal((await page.request.get(base + 'index.html')).status(), 200, 'server still up afterwards');
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
});
