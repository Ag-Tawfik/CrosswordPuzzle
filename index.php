<?php
declare(strict_types=1);

// Check PHP version requirement
if (version_compare(PHP_VERSION, '8.4.6', '<')) {
    die('This application requires PHP 8.4.6 or higher. Current version: ' . PHP_VERSION);
}

/**
 * Represents a cell in the crossword puzzle grid
 */
class PuzzleCell {
    public string $cell;
    public ?string $letter;
    public ?int $number;
    
    public function __construct(string $cell = '<td class="black"></td>', ?string $letter = null, ?int $number = null) {
        $this->cell = $cell;
        $this->letter = $letter;
        $this->number = $number;
    }
}

/**
 * Represents a word placed in the crossword puzzle
 */
class PlacedWord {
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
 * Generates an empty puzzle grid
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
 * Places words in the puzzle grid
 */
function placeWordsInGrid(array &$puzzleGrid, array $words): array
{
    $placedWords = [];
    $wordNumber = 1;
    $usedWords = [];
    
    // Sort words by length (descending) to place longer words first
    usort($words, function($a, $b) {
        return strlen($b) <=> strlen($a);
    });
    
    // Place the first word in the middle horizontally
    $firstWord = array_shift($words) ?? '';
    if (empty($firstWord)) {
        return $placedWords;
    }
    
    $firstWordLength = strlen($firstWord);
    $startRow = intval(floor(count($puzzleGrid) / 2));
    $startColumn = intval(floor((count($puzzleGrid[0]) - $firstWordLength) / 2));
    
    // Number the first cell of the first word
    $puzzleGrid[$startRow][$startColumn]->number = $wordNumber++;
    
    for ($i = 0; $i < $firstWordLength; $i++) {
        $puzzleGrid[$startRow][$startColumn + $i]->cell = '<td class="white"></td>';
        $puzzleGrid[$startRow][$startColumn + $i]->letter = $firstWord[$i];
    }
    
    $placedWords[] = new PlacedWord(
        $firstWord,
        0, // horizontal
        $startRow,
        $startColumn
    );
    $usedWords[] = $firstWord;
    
    // Now try to place remaining words with intersections
    foreach ($words as $word) {
        // Skip if this word has already been placed
        if (in_array($word, $usedWords, true)) {
            continue;
        }
        
        $placed = false;
        $wordLength = strlen($word);
        
        // First try to place word with intersections
        $intersectionAttempts = 100;
        
        for ($attempt = 1; $attempt <= $intersectionAttempts && !$placed; $attempt++) {
            // Try each placed word for possible intersections
            shuffle($placedWords); // Randomize to avoid grid bias
            
            foreach ($placedWords as $placedWord) {
                $placedWordOrientation = $placedWord->orientation;
                $newOrientation = 1 - $placedWordOrientation; // Opposite orientation
                
                for ($letterIndex = 0; $letterIndex < strlen($placedWord->word); $letterIndex++) {
                    $placedLetter = $placedWord->word[$letterIndex];
                    
                    // Find positions in new word where this letter appears
                    for ($i = 0; $i < $wordLength; $i++) {
                        if ($word[$i] === $placedLetter) {
                            // Found potential intersection
                            
                            if ($placedWordOrientation === 0) { // Placed word is horizontal
                                // New word will be vertical
                                $row = $placedWord->startRow - $i;
                                $col = $placedWord->startColumn + $letterIndex;
                            } else { // Placed word is vertical
                                // New word will be horizontal
                                $row = $placedWord->startRow + $letterIndex;
                                $col = $placedWord->startColumn - $i;
                            }
                            
                            // Check if word fits within grid boundaries
                            if ($newOrientation === 0) { // Horizontal
                                if ($col < 0 || $col + $wordLength > count($puzzleGrid[0])) {
                                    continue;
                                }
                            } else { // Vertical
                                if ($row < 0 || $row + $wordLength > count($puzzleGrid)) {
                                    continue;
                                }
                            }
                            
                            // Check for word boundaries (prevent words from connecting end-to-end)
                            $fits = true;
                            
                            if ($newOrientation === 0) { // Horizontal
                                // Check left boundary (either grid edge or black cell)
                                if ($col > 0 && $puzzleGrid[$row][$col - 1]->letter !== null) {
                                    $fits = false;
                                }
                                // Check right boundary (either grid edge or black cell)
                                if ($col + $wordLength < count($puzzleGrid[0]) && $puzzleGrid[$row][$col + $wordLength]->letter !== null) {
                                    $fits = false;
                                }
                            } else { // Vertical
                                // Check top boundary (either grid edge or black cell)
                                if ($row > 0 && $puzzleGrid[$row - 1][$col]->letter !== null) {
                                    $fits = false;
                                }
                                // Check bottom boundary (either grid edge or black cell)
                                if ($row + $wordLength < count($puzzleGrid) && $puzzleGrid[$row + $wordLength][$col]->letter !== null) {
                                    $fits = false;
                                }
                            }
                            
                            if (!$fits) {
                                continue;
                            }
                            
                            // Check if the word fits at this position
                            for ($j = 0; $j < $wordLength; $j++) {
                                if ($newOrientation === 0) { // Horizontal
                                    // Skip check at intersection point
                                    if ($j === $i) continue;
                                    
                                    // Check that cell is either empty or contains matching letter
                                    if ($puzzleGrid[$row][$col + $j]->letter !== null && 
                                        $puzzleGrid[$row][$col + $j]->letter !== $word[$j]) {
                                        $fits = false;
                                        break;
                                    }
                                    
                                    // Check for adjacent words (crossword rule)
                                    if ($row > 0 && $puzzleGrid[$row - 1][$col + $j]->letter !== null && $j !== $i) {
                                        $fits = false;
                                        break;
                                    }
                                    if ($row < count($puzzleGrid) - 1 && $puzzleGrid[$row + 1][$col + $j]->letter !== null && $j !== $i) {
                                        $fits = false;
                                        break;
                                    }
                                } else { // Vertical
                                    // Skip check at intersection point
                                    if ($j === $i) continue;
                                    
                                    // Check that cell is either empty or contains matching letter
                                    if ($puzzleGrid[$row + $j][$col]->letter !== null && 
                                        $puzzleGrid[$row + $j][$col]->letter !== $word[$j]) {
                                        $fits = false;
                                        break;
                                    }
                                    
                                    // Check for adjacent words (crossword rule)
                                    if ($col > 0 && $puzzleGrid[$row + $j][$col - 1]->letter !== null && $j !== $i) {
                                        $fits = false;
                                        break;
                                    }
                                    if ($col < count($puzzleGrid[0]) - 1 && $puzzleGrid[$row + $j][$col + 1]->letter !== null && $j !== $i) {
                                        $fits = false;
                                        break;
                                    }
                                }
                            }
                            
                            if ($fits) {
                                // Number the first cell of the word if it doesn't already have a number
                                if ($puzzleGrid[$row][$col]->number === null) {
                                    $puzzleGrid[$row][$col]->number = $wordNumber++;
                                }
                                
                                // Place the word
                                for ($j = 0; $j < $wordLength; $j++) {
                                    if ($newOrientation === 0) { // Horizontal
                                        $puzzleGrid[$row][$col + $j]->cell = '<td class="white"></td>';
                                        $puzzleGrid[$row][$col + $j]->letter = $word[$j];
                                    } else { // Vertical
                                        $puzzleGrid[$row + $j][$col]->cell = '<td class="white"></td>';
                                        $puzzleGrid[$row + $j][$col]->letter = $word[$j];
                                    }
                                }
                                
                                $placedWords[] = new PlacedWord(
                                    $word,
                                    $newOrientation,
                                    $row,
                                    $col
                                );
                                $usedWords[] = $word;
                                
                                $placed = true;
                                break 3; // Exit all loops
                            }
                        }
                    }
                }
            }
        }
        
        // If word couldn't be placed with intersections, try random placement
        if (!$placed) {
            $randomAttempts = 50;
            
            for ($attempt = 1; $attempt <= $randomAttempts && !$placed; $attempt++) {
                $orientation = rand(0, 1);
                
                if ($orientation === 0) { // Horizontal
                    $startRow = rand(0, count($puzzleGrid) - 1);
                    $startColumn = rand(0, count($puzzleGrid[0]) - $wordLength);
                } else { // Vertical
                    $startRow = rand(0, count($puzzleGrid) - $wordLength);
                    $startColumn = rand(0, count($puzzleGrid[0]) - 1);
                }
                
                $fits = true;
                for ($i = 0; $i < $wordLength; $i++) {
                    if ($orientation === 0) { // Horizontal
                        if ($puzzleGrid[$startRow][$startColumn + $i]->letter !== null) {
                            $fits = false;
                            break;
                        }
                    } else { // Vertical
                        if ($puzzleGrid[$startRow + $i][$startColumn]->letter !== null) {
                            $fits = false;
                            break;
                        }
                    }
                }
                
                // Check for word boundaries (prevent words from connecting end-to-end)
                if ($fits) {
                    if ($orientation === 0) { // Horizontal
                        // Check left boundary (either grid edge or black cell)
                        if ($startColumn > 0 && $puzzleGrid[$startRow][$startColumn - 1]->letter !== null) {
                            $fits = false;
                        }
                        // Check right boundary (either grid edge or black cell)
                        if ($startColumn + $wordLength < count($puzzleGrid[0]) && $puzzleGrid[$startRow][$startColumn + $wordLength]->letter !== null) {
                            $fits = false;
                        }
                    } else { // Vertical
                        // Check top boundary (either grid edge or black cell)
                        if ($startRow > 0 && $puzzleGrid[$startRow - 1][$startColumn]->letter !== null) {
                            $fits = false;
                        }
                        // Check bottom boundary (either grid edge or black cell)
                        if ($startRow + $wordLength < count($puzzleGrid) && $puzzleGrid[$startRow + $wordLength][$startColumn]->letter !== null) {
                            $fits = false;
                        }
                    }
                }
                
                if ($fits) {
                    // Number the first cell of the word
                    $puzzleGrid[$startRow][$startColumn]->number = $wordNumber++;
                    
                    for ($i = 0; $i < $wordLength; $i++) {
                        if ($orientation === 0) { // Horizontal
                            $puzzleGrid[$startRow][$startColumn + $i]->cell = '<td class="white"></td>';
                            $puzzleGrid[$startRow][$startColumn + $i]->letter = $word[$i];
                        } else { // Vertical
                            $puzzleGrid[$startRow + $i][$startColumn]->cell = '<td class="white"></td>';
                            $puzzleGrid[$startRow + $i][$startColumn]->letter = $word[$i];
                        }
                    }
                    
                    $placedWords[] = new PlacedWord(
                        $word,
                        $orientation,
                        $startRow,
                        $startColumn
                    );
                    $usedWords[] = $word;
                    
                    $placed = true;
                }
            }
        }
    }
    
    return $placedWords;
}

$rows = 12;
$columns = 12;

$puzzleGrid = generatePuzzleGrid($rows, $columns);

$words = ['CAT', 'DOG', 'MOUSE', 'FISH', 'BIRD', 'LION', 'TIGER', 'BEAR', 'MONKEY', 'COW', 'PIG', 'SHEEP', 'HUMAN'];
// Ensure no duplicate words
$words = array_unique($words);

$placedWords = placeWordsInGrid($puzzleGrid, $words);

?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>12x12 Crossword Puzzle</title>
    <style>
        table {
            border-collapse: collapse;
            width: 50%;
            margin: auto;
            margin-top: 50px;
        }

        td {
            border: 1px solid #000;
            height: 30px;
            width: 30px;
            text-align: center;
            position: relative;
        }

        .black {
            background-color: #000;
        }

        .white {
            background-color: #fff;
        }

        .number {
            position: absolute;
            top: 1px;
            left: 1px;
            font-size: 10px;
        }

        h2 {
            text-align: center;
        }
    </style>
</head>

<body>

    <h2>12x12 Crossword Puzzle</h2>

    <table>
        <?php
        // Render the grid with word numbers
        for ($i = 0; $i < $rows; $i++) {
            echo '<tr>';
            for ($j = 0; $j < $columns; $j++) {
                if ($puzzleGrid[$i][$j]->letter !== null) {
                    echo '<td class="white">';
                    if ($puzzleGrid[$i][$j]->number !== null) {
                        echo '<span class="number">' . $puzzleGrid[$i][$j]->number . '</span>';
                    }
                    echo '</td>';
                } else {
                    echo '<td class="black"></td>';
                }
            }
            echo '</tr>';
        }
        
        // Output the clues
        echo '</table>';
        
        echo '<div style="width: 50%; margin: auto; margin-top: 30px;">';
        echo '<h3>Across</h3>';
        echo '<ul>';
        $seenAcrossWords = [];
        foreach ($placedWords as $word) {
            if ($word->orientation === 0) { // Horizontal
                // Skip if we've already seen this word
                if (in_array($word->word, $seenAcrossWords, true)) {
                    continue;
                }
                $seenAcrossWords[] = $word->word;
                
                $number = $puzzleGrid[$word->startRow][$word->startColumn]->number;
                echo '<li>' . $number . '. ' . $word->word . '</li>';
            }
        }
        echo '</ul>';
        
        echo '<h3>Down</h3>';
        echo '<ul>';
        $seenDownWords = [];
        foreach ($placedWords as $word) {
            if ($word->orientation === 1) { // Vertical
                // Skip if we've already seen this word
                if (in_array($word->word, $seenDownWords, true)) {
                    continue;
                }
                $seenDownWords[] = $word->word;
                
                $number = $puzzleGrid[$word->startRow][$word->startColumn]->number;
                echo '<li>' . $number . '. ' . $word->word . '</li>';
            }
        }
        echo '</ul>';
        echo '</div>';
        ?>

</body>

</html>