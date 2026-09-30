<?php
declare(strict_types=1);

/**
 * Regression test for the crossword generator. Run with: php tests/generator_test.php
 *
 * Generates many grids and checks that each one obeys crossword rules:
 *  - every horizontal or vertical run of 2+ letters is exactly one placed word
 *  - every placed word crosses at least one other (no islands) once more than one is placed
 *  - clue numbers run in reading order with no gaps
 *  - unplaced words are reported, never silently dropped
 */

require_once __DIR__ . '/../crossword.php';

// Turn every warning or notice into a failure
set_error_handler(function (int $severity, string $message, string $file, int $line): bool {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

$failures = 0;
function check(bool $condition, string $message): void {
    global $failures;
    if (!$condition) {
        $failures++;
        echo "FAIL: $message\n";
    }
}

/** @param PuzzleCell[][] $grid */
function runsIn(array $grid, int $orientation): array {
    $rows = count($grid);
    $columns = count($grid[0]);
    $dRow = $orientation === PlacedWord::DOWN ? 1 : 0;
    $dCol = $orientation === PlacedWord::ACROSS ? 1 : 0;
    $runs = [];
    for ($r = 0; $r < $rows; $r++) {
        for ($c = 0; $c < $columns; $c++) {
            if ($grid[$r][$c]->letter === null) continue;
            if (letterAt($grid, $r - $dRow, $c - $dCol) !== null) continue; // not a run start
            $s = '';
            $rr = $r; $cc = $c;
            while ($rr < $rows && $cc < $columns && $grid[$rr][$cc]->letter !== null) {
                $s .= $grid[$rr][$cc]->letter;
                $rr += $dRow; $cc += $dCol;
            }
            if (strlen($s) > 1) {
                $runs["$r,$c"] = $s;
            }
        }
    }
    return $runs;
}

/** @param PuzzleCell[][] $grid */
function assertValidCrossword(array $grid, PlacementResult $result, array $inputWords, string $label): void {
    $placedByPos = [PlacedWord::ACROSS => [], PlacedWord::DOWN => []];
    foreach ($result->placed as $w) {
        $placedByPos[$w->orientation][$w->startRow . ',' . $w->startColumn] = $w->word;
    }

    // Every run on the grid is exactly one placed word, and vice versa
    foreach ([PlacedWord::ACROSS, PlacedWord::DOWN] as $o) {
        $runs = runsIn($grid, $o);
        check($runs == $placedByPos[$o], "$label: runs on grid do not match placed words (orientation $o)");
    }

    // Every word crosses another once more than one is placed
    if (count($result->placed) > 1) {
        foreach ($result->placed as $w) {
            $dRow = $w->orientation === PlacedWord::DOWN ? 1 : 0;
            $dCol = $w->orientation === PlacedWord::ACROSS ? 1 : 0;
            $crosses = false;
            for ($i = 0; $i < strlen($w->word); $i++) {
                $r = $w->startRow + $dRow * $i;
                $c = $w->startColumn + $dCol * $i;
                if (letterAt($grid, $r + $dCol, $c + $dRow) !== null || letterAt($grid, $r - $dCol, $c - $dRow) !== null) {
                    $crosses = true;
                    break;
                }
            }
            check($crosses, "$label: {$w->word} does not cross any other word");
        }
    }

    // Numbers run 1..n in reading order, only on word starts
    $expected = 1;
    $starts = [];
    foreach ($result->placed as $w) {
        $starts[$w->startRow . ',' . $w->startColumn] = true;
    }
    foreach ($grid as $r => $row) {
        foreach ($row as $c => $cell) {
            if (isset($starts["$r,$c"])) {
                check($cell->number === $expected, "$label: cell $r,$c numbered {$cell->number}, expected $expected");
                $expected++;
            } else {
                check($cell->number === null, "$label: cell $r,$c has a number but starts no word");
            }
        }
    }

    // Every input word is either placed or reported unplaced, exactly once
    $seen = array_merge(array_map(fn($w) => $w->word, $result->placed), $result->unplaced);
    sort($seen);
    $expectedWords = normaliseWords($inputWords);
    sort($expectedWords);
    check($seen === $expectedWords, "$label: placed + unplaced does not equal the input word list");
}

$words = ['CAT', 'DOG', 'MOUSE', 'FISH', 'BIRD', 'LION', 'TIGER', 'BEAR', 'MONKEY', 'COW', 'PIG', 'SHEEP', 'HUMAN'];

// Single-pass placer, many runs
for ($i = 0; $i < 500; $i++) {
    $grid = generatePuzzleGrid(12, 12);
    $result = placeWordsInGrid($grid, $words);
    assertValidCrossword($grid, $result, $words, "single pass run $i");
}

// Best-of-N wrapper places at least 10 of the 13 default words
for ($i = 0; $i < 5; $i++) {
    [$grid, $result] = generateCrossword(12, 12, $words);
    assertValidCrossword($grid, $result, $words, "generateCrossword run $i");
    check(count($result->placed) >= 10, "generateCrossword run $i placed only " . count($result->placed) . " words");
}

// Normalisation: lowercase, whitespace, duplicates, non-letters
check(normaliseWords(['cat', ' Dog ', 'CAT', 'a-b', '', '12']) === ['CAT', 'DOG'], 'normaliseWords');

// Words longer than the grid are reported, not written out of bounds
$grid = generatePuzzleGrid(5, 5);
$result = placeWordsInGrid($grid, ['ELEPHANT', 'CAT', 'ACE']);
check(in_array('ELEPHANT', $result->unplaced, true), 'oversized word reported as unplaced');
assertValidCrossword($grid, $result, ['ELEPHANT', 'CAT', 'ACE'], 'oversized word');

// Empty and all-invalid lists do not crash
$grid = generatePuzzleGrid(5, 5);
$result = placeWordsInGrid($grid, []);
check($result->placed === [] && $result->unplaced === [], 'empty list');
[$grid, $result] = generateCrossword(5, 5, ['123']);
check($result->placed === [] && $result->unplaced === [], 'all-invalid list');

// Every shipped word set loads, and every word fits the largest supported grid
$sets = listWordSets();
check(count($sets) >= 3, 'at least three word sets ship');
foreach (array_keys($sets) as $key) {
    $set = loadWordSet($key);
    check(count($set->clues) >= 20, "word set $key has at least 20 words");
    foreach ($set->words() as $w) {
        check(strlen($w) <= 12, "word $w in set $key is too long for a 12x12 grid");
    }
    [$grid, $result] = generateCrossword(12, 12, $set->words(), 100, 1);
    assertValidCrossword($grid, $result, $set->words(), "word set $key");
    check(count($result->placed) >= 12, "word set $key placed only " . count($result->placed) . " words on 12x12");
}

// Invalid word set keys are rejected before touching the filesystem
try {
    loadWordSet('../etc/passwd');
    check(false, 'path traversal key accepted');
} catch (InvalidArgumentException $e) {
    check(true, '');
}

// Seeding makes generation reproducible, and different seeds differ
$animals = loadWordSet('animals')->words();
[$g1, $r1] = generateCrossword(12, 12, $animals, 50, 42);
[$g2, $r2] = generateCrossword(12, 12, $animals, 50, 42);
[$g3, $r3] = generateCrossword(12, 12, $animals, 50, 43);
$dump = fn(array $g) => implode('', array_map(fn($row) => implode('', array_map(fn($c) => $c->letter ?? '.', $row)), $g));
check($dump($g1) === $dump($g2), 'same seed gives the same grid');
check($dump($g1) !== $dump($g3), 'different seeds give different grids');

// puzzleToArray produces sorted clues and matching cells
$arr = puzzleToArray($g1, $r1, loadWordSet('animals'));
check($arr['rows'] === 12 && count($arr['cells']) === 12, 'puzzleToArray dimensions');
$numbers = array_column($arr['across'], 'number');
$sorted = $numbers;
sort($sorted);
check($numbers === $sorted, 'across clues sorted by number');
check(count($arr['across']) + count($arr['down']) === count($r1->placed), 'clue count matches placed words');
foreach (array_merge($arr['across'], $arr['down']) as $cl) {
    check($arr['cells'][$cl['row']][$cl['col']]['number'] === $cl['number'], 'clue number matches cell number');
}

// Multiple clues per word: choice is deterministic per seed and varies across seeds
$animalsSet = loadWordSet('animals');
check(count($animalsSet->clues['CAT']) >= 2, 'CAT has more than one clue');
check($animalsSet->clueFor('CAT', 5) === $animalsSet->clueFor('CAT', 5), 'clue choice is stable for a seed');
$variants = [];
for ($i = 0; $i < 50; $i++) $variants[$animalsSet->clueFor('CAT', $i)] = true;
check(count($variants) >= 2, 'clue choice varies across seeds');

// Custom word sets from the URL
$payload = rtrim(strtr(base64_encode(json_encode(['name' => 'Our <b>party</b>', 'words' => ['cake' => 'Sweet', 'PARIS' => ['Where we met', 'City'], 'otter' => 'Her favourite']])), '+/', '-_'), '=');
$custom = customWordSetFromParam($payload);
check($custom !== null && $custom->key === 'custom', 'custom set decodes');
check($custom !== null && $custom->words() === ['CAKE', 'PARIS', 'OTTER'], 'custom words are normalised');
check($custom !== null && $custom->name === 'Our <b>party</b>', 'custom name kept raw (escaped on output)');
check(customWordSetFromParam('not base64!') === null, 'garbage custom payload rejected');
check(customWordSetFromParam(rtrim(strtr(base64_encode('{"words":{"a1":"x"}}'), '+/', '-_'), '=')) === null, 'custom payload with invalid word rejected');
check(customWordSetFromParam(rtrim(strtr(base64_encode('{"words":{}}'), '+/', '-_'), '=')) === null, 'custom payload with no words rejected');

// A custom puzzle renders, escapes its name, and keeps a stable layout
$_GET = ['custom' => $payload, 'size' => '10'];
ob_start();
try {
    require __DIR__ . '/../index.php';
    $html = ob_get_clean();
    check(str_contains($html, 'Our &lt;b&gt;party&lt;/b&gt; Crossword'), 'custom puzzle name is escaped');
    check(str_contains($html, '"custom":true'), 'custom flag in puzzle data');
} catch (Throwable $e) {
    ob_end_clean();
    check(false, 'index.php (custom) raised: ' . $e->getMessage());
}

// A dated puzzle uses the date as its seed; a future date falls back to today
$_GET = ['set' => 'animals', 'date' => '2026-01-15'];
ob_start();
try {
    require __DIR__ . '/../index.php';
    $html = ob_get_clean();
    check(str_contains($html, '"seed":20260115'), 'date parameter becomes the seed');
    check(str_contains($html, '"date":"2026-01-15"'), 'date carried in puzzle data');
    check(str_contains($html, 'Daily puzzle for 15 January 2026'), 'dated subtitle');
} catch (Throwable $e) {
    ob_end_clean();
    check(false, 'index.php (date) raised: ' . $e->getMessage());
}
$_GET = ['set' => 'animals', 'date' => '2999-01-01'];
ob_start();
try {
    require __DIR__ . '/../index.php';
    $html = ob_get_clean();
    check(str_contains($html, '"daily":true'), 'future date falls back to today');
} catch (Throwable $e) {
    ob_end_clean();
    check(false, 'index.php (future date) raised: ' . $e->getMessage());
}

$_GET = ['set' => 'food', 'size' => '12', 'seed' => '7'];
ob_start();
try {
    require __DIR__ . '/../index.php';
    $html = ob_get_clean();
    check(str_contains($html, 'id="puzzle-data"'), 'index.php embeds puzzle data');
    check(str_contains($html, 'Food'), 'index.php uses the requested word set');
} catch (Throwable $e) {
    ob_end_clean();
    check(false, 'index.php raised: ' . $e->getMessage());
}

if ($failures === 0) {
    echo "OK\n";
    exit(0);
}
echo "$failures failure(s)\n";
exit(1);
