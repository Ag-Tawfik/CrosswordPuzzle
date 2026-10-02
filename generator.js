// Crossword generator. Runs in the browser (window.Crossword) and in Node (module.exports).
//
// Rules enforced: every word crosses an existing word, no side-by-side runs,
// no end-to-end joins. Placement is randomised from a seed, so the same seed
// and word list always give the same puzzle.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.Crossword = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const ACROSS = 0;
    const DOWN = 1;

    // --- Seeded random ------------------------------------------------------------

    // mulberry32: small, fast, good enough for layout shuffling
    function makeRandom(seed) {
        let a = (seed >>> 0) || 1;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function shuffle(array, random) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // FNV-1a 32-bit, used to pick a clue and to seed custom puzzles
    function hash(str) {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return h >>> 0;
    }

    // --- Word sets ------------------------------------------------------------------

    // Uppercase, letters only, no duplicates, no empties
    function normaliseWords(words) {
        const seen = new Set();
        const out = [];
        for (const raw of words) {
            const word = String(raw).trim().toUpperCase();
            if (word === '' || !/^[A-Z]+$/.test(word) || seen.has(word)) continue;
            seen.add(word);
            out.push(word);
        }
        return out;
    }

    // Builds a word set from {name, words: {WORD: "clue" | ["clue", ...]}}.
    // Throws on malformed input.
    function wordSetFromObject(data, key) {
        if (!data || typeof data !== 'object' || !data.words || typeof data.words !== 'object' || Array.isArray(data.words)) {
            throw new Error(`Malformed word set: ${key}`);
        }
        const clues = {};
        for (const [word, clue] of Object.entries(data.words)) {
            const normalised = normaliseWords([word]);
            const options = (Array.isArray(clue) ? clue : [clue])
                .map(c => (typeof c === 'string' ? c.trim() : ''))
                .filter(c => c !== '');
            if (normalised.length === 0 || options.length === 0) {
                throw new Error(`Malformed entry '${word}' in word set: ${key}`);
            }
            clues[normalised[0]] = options;
        }
        if (Object.keys(clues).length === 0) {
            throw new Error(`Word set has no words: ${key}`);
        }
        // Optional harder clues, used by hard mode; a word without one keeps its normal clue
        const hard = {};
        if (data.hard !== undefined) {
            if (!data.hard || typeof data.hard !== 'object' || Array.isArray(data.hard)) throw new Error(`Malformed hard clues in word set: ${key}`);
            for (const [word, clue] of Object.entries(data.hard)) {
                const normalised = normaliseWords([word]);
                const options = (Array.isArray(clue) ? clue : [clue])
                    .map(c => (typeof c === 'string' ? c.trim() : ''))
                    .filter(c => c !== '');
                if (normalised.length === 0 || !clues[normalised[0]] || options.length === 0) {
                    throw new Error(`Malformed hard clue '${word}' in word set: ${key}`);
                }
                hard[normalised[0]] = options;
            }
        }
        const name = typeof data.name === 'string' && data.name.trim() !== '' ? data.name.trim().slice(0, 60) : key;
        return {
            key,
            name,
            clues,
            hard,
            words() { return Object.keys(clues); },
            // Which clue shows depends only on the seed and the word. With
            // hard set, the harder clue is preferred where the word has one.
            clueFor(word, seed, useHard = false) {
                const options = (useHard && hard[word]) || clues[word] || ['Definition for ' + word.toLowerCase()];
                return options[hash(seed + ':' + word) % options.length];
            },
        };
    }

    // Every set in one: a word that appears in more than one set keeps all its clues
    function mergeWordSets(sets, name, key) {
        const words = {};
        const hard = {};
        const add = (into, word, clue) => {
            const options = Array.isArray(clue) ? clue : [clue];
            const w = word.trim().toUpperCase();
            into[w] = (into[w] || []).concat(options.filter(c => !(into[w] || []).includes(c)));
        };
        for (const set of sets) {
            for (const [word, clue] of Object.entries(set.words || {})) add(words, word, clue);
            for (const [word, clue] of Object.entries(set.hard || {})) add(hard, word, clue);
        }
        return wordSetFromObject({ name, words, hard }, key);
    }

    // A seeded sample of a big word list, so a pool of hundreds costs no more to
    // place than a set, and each seed draws a different hand of words
    function samplePool(words, count, seed) {
        if (words.length <= count) return words.slice();
        const copy = words.slice();
        shuffle(copy, makeRandom(seed * 2654435761 % 4294967296 + 1));
        return copy.slice(0, count);
    }

    function base64urlDecode(encoded) {
        const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((encoded.length + 3) % 4);
        const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }

    function base64urlEncode(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        bytes.forEach(b => { bin += String.fromCharCode(b); });
        const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
        return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    // Decodes a custom puzzle from the URL. Returns null when unusable.
    function customWordSetFromParam(encoded) {
        if (!encoded || encoded.length > 8000) return null;
        try {
            const data = JSON.parse(base64urlDecode(encoded));
            return wordSetFromObject(data, 'custom');
        } catch (e) {
            return null;
        }
    }

    // --- Grid ---------------------------------------------------------------------------

    function generatePuzzleGrid(rows, columns) {
        const grid = [];
        for (let r = 0; r < rows; r++) {
            grid.push(Array.from({ length: columns }, () => ({ letter: null, number: null })));
        }
        return grid;
    }

    function letterAt(grid, r, c) {
        return (grid[r] && grid[r][c]) ? grid[r][c].letter : null;
    }

    // Standard crossword rules for placing a word at a position
    function canPlaceWord(grid, word, orientation, row, col) {
        const rows = grid.length;
        const columns = grid[0].length;
        const length = word.length;
        const dRow = orientation === DOWN ? 1 : 0;
        const dCol = orientation === ACROSS ? 1 : 0;

        if (row < 0 || col < 0) return false;
        if (row + dRow * (length - 1) >= rows || col + dCol * (length - 1) >= columns) return false;

        // Cell before and after must be empty (or off-grid)
        if (letterAt(grid, row - dRow, col - dCol) !== null) return false;
        if (letterAt(grid, row + dRow * length, col + dCol * length) !== null) return false;

        let crossings = 0;
        for (let i = 0; i < length; i++) {
            const r = row + dRow * i;
            const c = col + dCol * i;
            const existing = grid[r][c].letter;
            if (existing !== null) {
                if (existing !== word[i]) return false;
                crossings++;
                continue;
            }
            // Empty cell: perpendicular neighbours must be empty
            if (letterAt(grid, r + dCol, c + dRow) !== null) return false;
            if (letterAt(grid, r - dCol, c - dRow) !== null) return false;
        }
        // A word lying entirely on existing letters adds nothing
        return crossings < length;
    }

    function writeWord(grid, word, orientation, row, col) {
        const dRow = orientation === DOWN ? 1 : 0;
        const dCol = orientation === ACROSS ? 1 : 0;
        for (let i = 0; i < word.length; i++) {
            grid[row + dRow * i][col + dCol * i].letter = word[i];
        }
        return { word, orientation, startRow: row, startColumn: col };
    }

    // Every legal position where word crosses one of the placed words
    function findCrossingPositions(grid, placedWords, word) {
        const candidates = [];
        for (const placed of placedWords) {
            const newOrientation = 1 - placed.orientation;
            for (let letterIndex = 0; letterIndex < placed.word.length; letterIndex++) {
                const placedLetter = placed.word[letterIndex];
                for (let i = 0; i < word.length; i++) {
                    if (word[i] !== placedLetter) continue;
                    let row, col;
                    if (placed.orientation === ACROSS) {
                        row = placed.startRow - i;
                        col = placed.startColumn + letterIndex;
                    } else {
                        row = placed.startRow + letterIndex;
                        col = placed.startColumn - i;
                    }
                    if (canPlaceWord(grid, word, newOrientation, row, col)) {
                        candidates.push([newOrientation, row, col]);
                    }
                }
            }
        }
        return candidates;
    }

    // Numbers in reading order; a cell starting both an across and a down word gets one number
    function numberGrid(grid, placedWords) {
        const starts = new Set(placedWords.map(w => `${w.startRow},${w.startColumn}`));
        let number = 1;
        grid.forEach((row, r) => row.forEach((cell, c) => {
            cell.number = starts.has(`${r},${c}`) ? number++ : null;
        }));
    }

    // One placement pass. Longest word across the middle, then every other word
    // must cross an existing one; unplaced words are retried after each pass.
    function placeWordsInGrid(grid, wordsIn, random) {
        const rows = grid.length;
        const columns = grid[0].length;
        const placed = [];
        const unplaced = [];

        const words = normaliseWords(wordsIn);
        shuffle(words, random);
        words.sort((a, b) => b.length - a.length); // stable, so ties keep the shuffled order

        let remaining = [];
        for (let index = 0; index < words.length; index++) {
            const word = words[index];
            if (word.length > columns) { unplaced.push(word); continue; }
            placed.push(writeWord(grid, word, ACROSS, Math.floor(rows / 2), Math.floor((columns - word.length) / 2)));
            remaining = words.slice(index + 1);
            break;
        }
        if (placed.length === 0) return { placed, unplaced };

        let progress;
        do {
            progress = false;
            const still = [];
            for (const word of remaining) {
                const candidates = findCrossingPositions(grid, placed, word);
                if (candidates.length === 0) { still.push(word); continue; }
                const [orientation, row, col] = candidates[Math.floor(random() * candidates.length)];
                placed.push(writeWord(grid, word, orientation, row, col));
                progress = true;
            }
            remaining = still;
        } while (progress && remaining.length > 0);

        numberGrid(grid, placed);
        return { placed, unplaced: unplaced.concat(remaining) };
    }

    // Runs the placer several times and keeps the layout with the most words
    function generateCrossword(rows, columns, words, attempts = 500, seed = 1) {
        const random = makeRandom(seed);
        let bestGrid = null;
        let bestResult = null;
        for (let attempt = 0; attempt < attempts; attempt++) {
            const grid = generatePuzzleGrid(rows, columns);
            const result = placeWordsInGrid(grid, words, random);
            if (bestResult === null || result.placed.length > bestResult.placed.length) {
                bestGrid = grid;
                bestResult = result;
            }
            if (result.unplaced.length === 0) break;
        }
        return [bestGrid, bestResult];
    }

    // Plain object for the game: cells are null or {letter, number}; clues sorted by number
    function puzzleToObject(grid, result, wordSet, seed) {
        const cells = grid.map(row => row.map(cell => cell.letter === null ? null : { letter: cell.letter, number: cell.number }));
        const clues = { [ACROSS]: [], [DOWN]: [] };
        for (const w of result.placed) {
            clues[w.orientation].push({
                number: grid[w.startRow][w.startColumn].number,
                row: w.startRow,
                col: w.startColumn,
                length: w.word.length,
                clue: wordSet.clueFor(w.word, seed),
                hardClue: wordSet.clueFor(w.word, seed, true),
            });
        }
        clues[ACROSS].sort((a, b) => a.number - b.number);
        clues[DOWN].sort((a, b) => a.number - b.number);
        return {
            rows: grid.length,
            columns: grid[0].length,
            cells,
            across: clues[ACROSS],
            down: clues[DOWN],
            wordCount: result.placed.length,
        };
    }

    return {
        ACROSS, DOWN,
        makeRandom, hash,
        normaliseWords, wordSetFromObject, mergeWordSets, samplePool, customWordSetFromParam, base64urlEncode, base64urlDecode,
        generatePuzzleGrid, letterAt, canPlaceWord, writeWord, findCrossingPositions, numberGrid,
        placeWordsInGrid, generateCrossword, puzzleToObject,
    };
}));
