<?php
declare(strict_types=1);

/**
 * Represents a cell in the crossword puzzle grid
 */
class PuzzleCell {
    public ?string $letter;
    public ?int $number;

    public function __construct(?string $letter = null, ?int $number = null) {
        $this->letter = $letter;
        $this->number = $number;
    }
}

/**
 * Represents a word placed in the crossword puzzle
 */
class PlacedWord {
    public const ACROSS = 0;
    public const DOWN = 1;

    public string $word;
    public int $orientation;
    public int $startRow;
    public int $startColumn;

    public function __construct(string $word, int $orientation, int $startRow, int $startColumn) {
        $this->word = $word;
        $this->orientation = $orientation;
        $this->startRow = $startRow;
        $this->startColumn = $startColumn;
    }
}

/**
 * Result of a placement run: the words that fit and the words that did not
 */
class PlacementResult {
    /** @param PlacedWord[] $placed @param string[] $unplaced */
    public function __construct(public array $placed, public array $unplaced) {}
}

/**
 * Generates a clue for a given word
 */
function generateClue(string $word): string {
    $clues = [
        'CAT' => 'A small domesticated carnivorous mammal that purrs',
        'DOG' => 'Man\'s best friend',
        'MOUSE' => 'A small rodent with a pointed snout',
        'FISH' => 'An aquatic animal with fins and gills',
        'BIRD' => 'A warm-blooded egg-laying vertebrate with wings',
        'LION' => 'The king of the jungle',
        'TIGER' => 'Large Asian big cat with orange fur and black stripes',
        'BEAR' => 'Large, heavy mammal with thick fur and a short tail',
        'MONKEY' => 'A primate that typically has a long tail',
        'COW' => 'A domesticated animal that produces milk',
        'PIG' => 'A domesticated omnivorous mammal with a snout',
        'SHEEP' => 'A domesticated ruminant animal with a woolly coat',
        'HUMAN' => 'Homo sapiens',
    ];

    // Return the clue if it exists, otherwise generate a generic clue
    return $clues[$word] ?? 'Definition for ' . strtolower($word);
}

/**
 * Generates an empty puzzle grid
 *
 * @return PuzzleCell[][]
 */
function generatePuzzleGrid(int $rows, int $columns): array
{
    $puzzleGrid = [];

    for ($i = 0; $i < $rows; $i++) {
        $puzzleGrid[$i] = [];
        for ($j = 0; $j < $columns; $j++) {
            $puzzleGrid[$i][$j] = new PuzzleCell();
        }
    }

    return $puzzleGrid;
}

/**
 * Normalises the word list: uppercase, letters only, no duplicates, no empties
 *
 * @param string[] $words
 * @return string[]
 */
function normaliseWords(array $words): array
{
    $clean = [];
    foreach ($words as $word) {
        $word = strtoupper(trim((string) $word));
        if ($word === '' || !preg_match('/^[A-Z]+$/', $word)) {
            continue;
        }
        $clean[$word] = true;
    }
    return array_keys($clean);
}

/**
 * Returns the letter at a grid position, or null if the position is off-grid or empty
 *
 * @param PuzzleCell[][] $puzzleGrid
 */
function letterAt(array $puzzleGrid, int $row, int $col): ?string
{
    return $puzzleGrid[$row][$col]->letter ?? null;
}

/**
 * Checks whether a word can legally occupy a position under standard crossword rules:
 *  - every cell is either empty or already holds the same letter (a crossing)
 *  - the cells immediately before and after the word are empty (no end-to-end joins)
 *  - every non-crossing cell has empty perpendicular neighbours (no side-by-side runs)
 *
 * @param PuzzleCell[][] $puzzleGrid
 */
function canPlaceWord(array $puzzleGrid, string $word, int $orientation, int $row, int $col): bool
{
    $rows = count($puzzleGrid);
    $columns = count($puzzleGrid[0]);
    $length = strlen($word);

    $dRow = $orientation === PlacedWord::DOWN ? 1 : 0;
    $dCol = $orientation === PlacedWord::ACROSS ? 1 : 0;

    // Grid boundaries
    if ($row < 0 || $col < 0) {
        return false;
    }
    if ($row + $dRow * ($length - 1) >= $rows || $col + $dCol * ($length - 1) >= $columns) {
        return false;
    }

    // Cell before and cell after must be empty (or off-grid)
    if (letterAt($puzzleGrid, $row - $dRow, $col - $dCol) !== null) {
        return false;
    }
    if (letterAt($puzzleGrid, $row + $dRow * $length, $col + $dCol * $length) !== null) {
        return false;
    }

    $crossings = 0;
    for ($i = 0; $i < $length; $i++) {
        $r = $row + $dRow * $i;
        $c = $col + $dCol * $i;
        $existing = $puzzleGrid[$r][$c]->letter;

        if ($existing !== null) {
            if ($existing !== $word[$i]) {
                return false;
            }
            $crossings++;
            continue;
        }

        // Empty cell: perpendicular neighbours must be empty, otherwise we'd
        // create an unintended run alongside another word
        if (letterAt($puzzleGrid, $r + $dCol, $c + $dRow) !== null) {
            return false;
        }
        if (letterAt($puzzleGrid, $r - $dCol, $c - $dRow) !== null) {
            return false;
        }
    }

    // A word that lies entirely on existing letters adds nothing
    return $crossings < $length;
}

/**
 * Writes a word into the grid. Assumes canPlaceWord() returned true.
 *
 * @param PuzzleCell[][] $puzzleGrid
 */
function writeWord(array &$puzzleGrid, string $word, int $orientation, int $row, int $col): PlacedWord
{
    $dRow = $orientation === PlacedWord::DOWN ? 1 : 0;
    $dCol = $orientation === PlacedWord::ACROSS ? 1 : 0;

    for ($i = 0; $i < strlen($word); $i++) {
        $puzzleGrid[$row + $dRow * $i][$col + $dCol * $i]->letter = $word[$i];
    }

    return new PlacedWord($word, $orientation, $row, $col);
}

/**
 * Finds every position where $word crosses one of the already placed words
 *
 * @param PuzzleCell[][] $puzzleGrid
 * @param PlacedWord[] $placedWords
 * @return array<int, array{int, int, int}> list of [orientation, row, col]
 */
function findCrossingPositions(array $puzzleGrid, array $placedWords, string $word): array
{
    $candidates = [];
    $wordLength = strlen($word);

    foreach ($placedWords as $placedWord) {
        $newOrientation = 1 - $placedWord->orientation;

        for ($letterIndex = 0; $letterIndex < strlen($placedWord->word); $letterIndex++) {
            $placedLetter = $placedWord->word[$letterIndex];

            for ($i = 0; $i < $wordLength; $i++) {
                if ($word[$i] !== $placedLetter) {
                    continue;
                }

                if ($placedWord->orientation === PlacedWord::ACROSS) {
                    $row = $placedWord->startRow - $i;
                    $col = $placedWord->startColumn + $letterIndex;
                } else {
                    $row = $placedWord->startRow + $letterIndex;
                    $col = $placedWord->startColumn - $i;
                }

                if (canPlaceWord($puzzleGrid, $word, $newOrientation, $row, $col)) {
                    $candidates[] = [$newOrientation, $row, $col];
                }
            }
        }
    }

    return $candidates;
}

/**
 * Places words in the puzzle grid.
 *
 * Longest word goes across the middle. Every other word must cross an existing
 * word; words that cannot be crossed anywhere are reported back as unplaced
 * rather than dropped on the grid at random (which produced side-by-side
 * runs and disconnected islands). Unplaced words are retried after each pass
 * because later placements can open new crossings.
 *
 * @param PuzzleCell[][] $puzzleGrid
 * @param string[] $words
 */
function placeWordsInGrid(array &$puzzleGrid, array $words): PlacementResult
{
    $placedWords = [];
    $rows = count($puzzleGrid);
    $columns = count($puzzleGrid[0]);

    $words = normaliseWords($words);

    // Shuffle first so that words of equal length are tried in a different
    // order on each run, then sort longest-first (usort is stable)
    shuffle($words);
    usort($words, fn(string $a, string $b): int => strlen($b) <=> strlen($a));

    // Seed the grid with the longest word that fits, across the middle
    $unplaced = [];
    foreach ($words as $index => $word) {
        $wordLength = strlen($word);
        if ($wordLength > $columns) {
            $unplaced[] = $word;
            continue;
        }
        $startRow = intdiv($rows, 2);
        $startColumn = intdiv($columns - $wordLength, 2);
        $placedWords[] = writeWord($puzzleGrid, $word, PlacedWord::ACROSS, $startRow, $startColumn);
        $remaining = array_slice($words, $index + 1);
        break;
    }

    if ($placedWords === []) {
        return new PlacementResult([], $unplaced);
    }

    // Keep passing over the remaining words until a full pass places nothing
    do {
        $progress = false;
        $stillUnplaced = [];

        foreach ($remaining as $word) {
            $candidates = findCrossingPositions($puzzleGrid, $placedWords, $word);
            if ($candidates === []) {
                $stillUnplaced[] = $word;
                continue;
            }
            [$orientation, $row, $col] = $candidates[array_rand($candidates)];
            $placedWords[] = writeWord($puzzleGrid, $word, $orientation, $row, $col);
            $progress = true;
        }

        $remaining = $stillUnplaced;
    } while ($progress && $remaining !== []);

    numberGrid($puzzleGrid, $placedWords);

    return new PlacementResult($placedWords, array_merge($unplaced, $remaining));
}

/**
 * Generates a crossword, running the placer several times and keeping the
 * layout that fits the most words. Placement is randomised and cheap, so
 * restarts are the simplest way to get good coverage.
 *
 * @param string[] $words
 * @return array{0: PuzzleCell[][], 1: PlacementResult}
 */
function generateCrossword(int $rows, int $columns, array $words, int $attempts = 500): array
{
    $bestGrid = null;
    $bestResult = null;

    for ($attempt = 0; $attempt < $attempts; $attempt++) {
        $grid = generatePuzzleGrid($rows, $columns);
        $result = placeWordsInGrid($grid, $words);

        if ($bestResult === null || count($result->placed) > count($bestResult->placed)) {
            $bestGrid = $grid;
            $bestResult = $result;
        }

        if ($result->unplaced === []) {
            break;
        }
    }

    return [$bestGrid, $bestResult];
}

/**
 * Assigns clue numbers in standard reading order (top to bottom, left to right).
 * A cell that starts both an across and a down word gets a single number.
 *
 * @param PuzzleCell[][] $puzzleGrid
 * @param PlacedWord[] $placedWords
 */
function numberGrid(array &$puzzleGrid, array $placedWords): void
{
    $starts = [];
    foreach ($placedWords as $placedWord) {
        $starts[$placedWord->startRow][$placedWord->startColumn] = true;
    }

    $number = 1;
    foreach ($puzzleGrid as $r => $row) {
        foreach ($row as $c => $cell) {
            $cell->number = isset($starts[$r][$c]) ? $number++ : null;
        }
    }
}
