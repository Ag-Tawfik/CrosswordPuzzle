(function () {
    'use strict';

    const form = document.getElementById('create-form');
    const titleEl = document.getElementById('title');
    const wordsEl = document.getElementById('words');
    const sizeEl = document.getElementById('size');
    const errorEl = document.getElementById('create-error');
    const resultEl = document.getElementById('create-result');
    const linkEl = document.getElementById('create-link');
    const openEl = document.getElementById('open-link');

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.hidden = false;
        errorEl.classList.add('show');
        resultEl.hidden = true;
    }

    function hideError() {
        errorEl.hidden = true;
        errorEl.classList.remove('show');
    }

    // Accepts "WORD: clue", "WORD - clue" or "WORD<tab>clue"
    function parseLines(text) {
        const words = {};
        const problems = [];
        text.split(/\r?\n/).forEach((line, i) => {
            const trimmed = line.trim();
            if (trimmed === '') return;
            const m = trimmed.match(/^([^:\t-]+)(?:[:\t]|\s-\s|-)\s*(.+)$/);
            if (!m) { problems.push(`Line ${i + 1}: expected "WORD: clue"`); return; }
            const word = m[1].trim().toUpperCase();
            const clue = m[2].trim();
            if (!/^[A-Z]+$/.test(word)) { problems.push(`Line ${i + 1}: "${m[1].trim()}" must be letters only`); return; }
            if (word.length < 2) { problems.push(`Line ${i + 1}: "${word}" is too short`); return; }
            if (clue === '') { problems.push(`Line ${i + 1}: "${word}" has no clue`); return; }
            words[word] = clue;
        });
        return { words, problems };
    }

    function base64url(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        bytes.forEach(b => { bin += String.fromCharCode(b); });
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    form.addEventListener('submit', e => {
        e.preventDefault();
        const size = parseInt(sizeEl.value, 10);
        const { words, problems } = parseLines(wordsEl.value);
        const list = Object.keys(words);

        const tooLong = list.filter(w => w.length > size);
        if (tooLong.length) problems.push(`Too long for a ${size}×${size} grid: ${tooLong.join(', ')}`);
        if (list.length < 3) problems.push('Enter at least three words.');
        if (problems.length) { showError(problems.join(' ')); return; }

        const payload = base64url(JSON.stringify({ name: titleEl.value.trim(), words }));
        const url = new URL('index.php', window.location.href);
        url.searchParams.set('custom', payload);
        url.searchParams.set('size', String(size));

        if (url.href.length > 6000) {
            showError('That is too many words for one link. Remove some, or split them into two puzzles.');
            return;
        }

        hideError();
        linkEl.value = url.href;
        openEl.href = url.href;
        resultEl.hidden = false;
        linkEl.focus();
        linkEl.select();
    });

    document.getElementById('copy-link').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(linkEl.value);
            document.getElementById('copy-link').textContent = 'Copied';
        } catch (err) {
            linkEl.focus();
            linkEl.select();
        }
    });
})();
