// Generator tests. Run with: node --test tests/generator.test.js
//
// Generates many grids and checks that each one obeys crossword rules:
//  - every horizontal or vertical run of 2+ letters is exactly one placed word
//  - every placed word crosses at least one other once more than one is placed
//  - clue numbers run in reading order with no gaps
//  - unplaced words are reported, never silently dropped

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../generator.js');

const WORDS_DIR = path.join(__dirname, '..', 'words');
const DEFAULT = ['CAT', 'DOG', 'MOUSE', 'FISH', 'BIRD', 'LION', 'TIGER', 'BEAR', 'MONKEY', 'COW', 'PIG', 'SHEEP', 'HUMAN'];

function runsIn(grid, orientation) {
    const rows = grid.length, columns = grid[0].length;
    const dRow = orientation === C.DOWN ? 1 : 0, dCol = orientation === C.ACROSS ? 1 : 0;
    const runs = {};
    for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
        if (grid[r][c].letter === null) continue;
        if (C.letterAt(grid, r - dRow, c - dCol) !== null) continue;
        let s = '', rr = r, cc = c;
        while (rr < rows && cc < columns && grid[rr][cc].letter !== null) { s += grid[rr][cc].letter; rr += dRow; cc += dCol; }
        if (s.length > 1) runs[`${r},${c}`] = s;
    }
    return runs;
}

function assertValidCrossword(grid, result, inputWords, label) {
    const byPos = { [C.ACROSS]: {}, [C.DOWN]: {} };
    for (const w of result.placed) byPos[w.orientation][`${w.startRow},${w.startColumn}`] = w.word;

    for (const o of [C.ACROSS, C.DOWN]) {
        assert.deepEqual(runsIn(grid, o), byPos[o], `${label}: runs on grid do not match placed words (orientation ${o})`);
    }

    if (result.placed.length > 1) {
        for (const w of result.placed) {
            const dRow = w.orientation === C.DOWN ? 1 : 0, dCol = w.orientation === C.ACROSS ? 1 : 0;
            let crosses = false;
            for (let i = 0; i < w.word.length; i++) {
                const r = w.startRow + dRow * i, c = w.startColumn + dCol * i;
                if (C.letterAt(grid, r + dCol, c + dRow) !== null || C.letterAt(grid, r - dCol, c - dRow) !== null) { crosses = true; break; }
            }
            assert.ok(crosses, `${label}: ${w.word} does not cross any other word`);
        }
    }

    let expected = 1;
    const starts = new Set(result.placed.map(w => `${w.startRow},${w.startColumn}`));
    grid.forEach((row, r) => row.forEach((cell, c) => {
        if (starts.has(`${r},${c}`)) {
            assert.equal(cell.number, expected, `${label}: cell ${r},${c} numbered ${cell.number}, expected ${expected}`);
            expected++;
        } else {
            assert.equal(cell.number, null, `${label}: cell ${r},${c} has a number but starts no word`);
        }
    }));

    const seen = result.placed.map(w => w.word).concat(result.unplaced).sort();
    assert.deepEqual(seen, C.normaliseWords(inputWords).sort(), `${label}: placed + unplaced does not equal the input word list`);
}

function loadSet(key) {
    return C.wordSetFromObject(JSON.parse(fs.readFileSync(path.join(WORDS_DIR, `${key}.json`), 'utf8')), key);
}

describe('placement rules', () => {
    test('500 single-pass grids obey crossword rules', () => {
        for (let i = 0; i < 500; i++) {
            const grid = C.generatePuzzleGrid(12, 12);
            const result = C.placeWordsInGrid(grid, DEFAULT, C.makeRandom(i + 1));
            assertValidCrossword(grid, result, DEFAULT, `single pass run ${i}`);
        }
    });

    test('generateCrossword places at least 10 of the 13 default words', () => {
        for (let i = 0; i < 5; i++) {
            const [grid, result] = C.generateCrossword(12, 12, DEFAULT, 500, 100 + i);
            assertValidCrossword(grid, result, DEFAULT, `generateCrossword run ${i}`);
            assert.ok(result.placed.length >= 10, `run ${i} placed only ${result.placed.length}`);
        }
    });

    test('oversized words are reported, not written out of bounds', () => {
        const grid = C.generatePuzzleGrid(5, 5);
        const result = C.placeWordsInGrid(grid, ['ELEPHANT', 'CAT', 'ACE'], C.makeRandom(1));
        assert.ok(result.unplaced.includes('ELEPHANT'));
        assertValidCrossword(grid, result, ['ELEPHANT', 'CAT', 'ACE'], 'oversized word');
    });

    test('empty and all-invalid lists do not crash', () => {
        let [, result] = C.generateCrossword(5, 5, [], 10, 1);
        assert.deepEqual([result.placed, result.unplaced], [[], []]);
        [, result] = C.generateCrossword(5, 5, ['123'], 10, 1);
        assert.deepEqual([result.placed, result.unplaced], [[], []]);
    });
});

describe('seeding', () => {
    test('same seed gives the same grid, different seeds differ', () => {
        const words = loadSet('animals').words();
        const dump = g => g.map(row => row.map(c => c.letter || '.').join('')).join('');
        const [g1] = C.generateCrossword(12, 12, words, 50, 42);
        const [g2] = C.generateCrossword(12, 12, words, 50, 42);
        const [g3] = C.generateCrossword(12, 12, words, 50, 43);
        assert.equal(dump(g1), dump(g2));
        assert.notEqual(dump(g1), dump(g3));
    });

    test('clue choice is stable per seed and varies across seeds', () => {
        const set = loadSet('animals');
        assert.ok(set.clues.CAT.length >= 2);
        assert.equal(set.clueFor('CAT', 5), set.clueFor('CAT', 5));
        const variants = new Set();
        for (let i = 0; i < 50; i++) variants.add(set.clueFor('CAT', i));
        assert.ok(variants.size >= 2);
    });
});

describe('word sets', () => {
    test('normaliseWords uppercases, trims, dedupes and drops non-letters', () => {
        assert.deepEqual(C.normaliseWords(['cat', ' Dog ', 'CAT', 'a-b', '', '12']), ['CAT', 'DOG']);
    });

    test('the mixed set merges every shipped set, keeps both clues of a shared word, and draws a seeded pool', () => {
        const index = JSON.parse(fs.readFileSync(path.join(WORDS_DIR, 'index.json'), 'utf8'));
        const files = index.map(s => JSON.parse(fs.readFileSync(path.join(WORDS_DIR, `${s.key}.json`), 'utf8')));
        const mixed = C.mergeWordSets(files, 'Mixed', 'mixed');
        const total = new Set(files.flatMap(f => Object.keys(f.words).map(w => w.toUpperCase()))).size;
        assert.equal(mixed.words().length, total, 'every word once');
        assert.ok(mixed.words().length > 600);
        assert.ok(mixed.clues.BAT.length >= 2, 'BAT keeps its animal and its sports clue');

        const a = C.samplePool(mixed.words(), 150, 20261002);
        const b = C.samplePool(mixed.words(), 150, 20261002);
        const c = C.samplePool(mixed.words(), 150, 20261003);
        assert.equal(a.length, 150);
        assert.deepEqual(a, b, 'the same seed draws the same hand');
        assert.notDeepEqual(a, c, 'another seed draws another hand');
        assert.ok(c.filter(w => !a.includes(w)).length > 50, 'the hands differ substantially');
        assert.deepEqual(C.samplePool(['A', 'B'], 5, 1), ['A', 'B'], 'a small list is returned whole');

        for (const seed of [20261001, 20261002, 20261003]) {
            const [, result] = C.generateCrossword(12, 12, C.samplePool(mixed.words(), 150, seed), 100, seed);
            assert.ok(result.placed.length >= 12, `mixed seed ${seed} placed only ${result.placed.length}`);
        }
    });

    test('every shipped set loads, fits 12x12 and fills at least 12 words', () => {
        const index = JSON.parse(fs.readFileSync(path.join(WORDS_DIR, 'index.json'), 'utf8'));
        assert.ok(index.length >= 3, 'at least three word sets in the index');
        for (const { key } of index) {
            const set = loadSet(key);
            assert.ok(set.words().length >= 20, `${key} has at least 20 words`);
            for (const w of set.words()) assert.ok(w.length <= 12, `${w} in ${key} too long for 12x12`);
            const [grid, result] = C.generateCrossword(12, 12, set.words(), 100, 1);
            assertValidCrossword(grid, result, set.words(), `word set ${key}`);
            assert.ok(result.placed.length >= 12, `${key} placed only ${result.placed.length}`);
        }
        const files = fs.readdirSync(WORDS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json').map(f => f.slice(0, -5)).sort();
        assert.deepEqual(index.map(s => s.key).sort(), files, 'index.json lists exactly the set files');
    });

    test('custom payloads decode, normalise, and reject garbage', () => {
        const payload = C.base64urlEncode(JSON.stringify({ name: 'Our <b>party</b>', words: { cake: 'Sweet', PARIS: ['Where we met', 'City'], otter: 'Her favourite' } }));
        const custom = C.customWordSetFromParam(payload);
        assert.equal(custom.key, 'custom');
        assert.deepEqual(custom.words(), ['CAKE', 'PARIS', 'OTTER']);
        assert.equal(custom.name, 'Our <b>party</b>');
        assert.equal(C.customWordSetFromParam('not base64!'), null);
        assert.equal(C.customWordSetFromParam(C.base64urlEncode('{"words":{"a1":"x"}}')), null);
        assert.equal(C.customWordSetFromParam(C.base64urlEncode('{"words":{}}')), null);
        assert.equal(C.base64urlDecode(C.base64urlEncode('héllo wörld')), 'héllo wörld');
    });

    test('puzzleToObject produces sorted clues matching the cells', () => {
        const set = loadSet('animals');
        const [grid, result] = C.generateCrossword(12, 12, set.words(), 50, 42);
        const p = C.puzzleToObject(grid, result, set, 42);
        assert.equal(p.rows, 12);
        assert.equal(p.cells.length, 12);
        const numbers = p.across.map(c => c.number);
        assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b));
        assert.equal(p.across.length + p.down.length, result.placed.length);
        for (const cl of p.across.concat(p.down)) assert.equal(p.cells[cl.row][cl.col].number, cl.number);
    });
});
