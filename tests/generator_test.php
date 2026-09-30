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

// Rendering the page produces no warnings
ob_start();
try {
    require __DIR__ . '/../index.php';
    $html = ob_get_clean();
    check(str_contains($html, 'class="cell-input"'), 'index.php renders inputs');
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
