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
            height: 40px;
            width: 40px;
            text-align: center;
            position: relative;
            padding: 0;
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
            z-index: 1;
            pointer-events: none;
        }

        .cell-input {
            width: 100%;
            height: 100%;
            border: none;
            text-align: center;
            font-size: 20px;
            text-transform: uppercase;
            background: transparent;
            box-sizing: border-box;
            position: relative;
            outline: none;
        }

        .selected {
            background-color: #ffeb3b;
        }

        .correct {
            background-color: #a2ffa2;
        }

        button {
            padding: 10px 15px;
            margin: 10px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }

        button:hover {
            background-color: #45a049;
        }

        h2 {
            text-align: center;
        }

        .controls {
            text-align: center;
            margin: 20px;
        }
    </style>
</head>

<body>

    <h2>12x12 Crossword Puzzle</h2>

    <div class="controls">
        <button id="check-puzzle">Check Answers</button>
        <button id="reveal-puzzle">Reveal Answers</button>
        <button id="reset-puzzle">Reset</button>
    </div>

    <table id="crossword-grid">
        <?php
        // Render the grid with word numbers and input fields
        for ($i = 0; $i < $rows; $i++) {
            echo '<tr>';
            for ($j = 0; $j < $columns; $j++) {
                if ($puzzleGrid[$i][$j]->letter !== null) {
                    echo '<td class="white" data-row="' . $i . '" data-col="' . $j . '">';
                    if ($puzzleGrid[$i][$j]->number !== null) {
                        echo '<span class="number">' . $puzzleGrid[$i][$j]->number . '</span>';
                    }
                    echo '<input 
                        type="text" 
                        class="cell-input" 
                        maxlength="1" 
                        data-row="' . $i . '" 
                        data-col="' . $j . '" 
                        data-letter="' . $puzzleGrid[$i][$j]->letter . '">';
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
        echo '<ul id="across-clues">';
        $seenAcrossWords = [];
        foreach ($placedWords as $word) {
            if ($word->orientation === 0) { // Horizontal
                // Skip if we've already seen this word
                if (in_array($word->word, $seenAcrossWords, true)) {
                    continue;
                }
                $seenAcrossWords[] = $word->word;
                
                $number = $puzzleGrid[$word->startRow][$word->startColumn]->number;
                $clue = generateClue($word->word);
                echo '<li data-word="' . $word->word . '" data-orientation="0" data-row="' . $word->startRow . '" data-col="' . $word->startColumn . '" class="clue">' . $number . '. ' . $clue . '</li>';
            }
        }
        echo '</ul>';
        
        echo '<h3>Down</h3>';
        echo '<ul id="down-clues">';
        $seenDownWords = [];
        foreach ($placedWords as $word) {
            if ($word->orientation === 1) { // Vertical
                // Skip if we've already seen this word
                if (in_array($word->word, $seenDownWords, true)) {
                    continue;
                }
                $seenDownWords[] = $word->word;
                
                $number = $puzzleGrid[$word->startRow][$word->startColumn]->number;
                $clue = generateClue($word->word);
                echo '<li data-word="' . $word->word . '" data-orientation="1" data-row="' . $word->startRow . '" data-col="' . $word->startColumn . '" class="clue">' . $number . '. ' . $clue . '</li>';
            }
        }
        echo '</ul>';
        echo '</div>';
        ?>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const grid = document.getElementById('crossword-grid');
            const inputs = document.querySelectorAll('.cell-input');
            const clues = document.querySelectorAll('.clue');
            const checkButton = document.getElementById('check-puzzle');
            const revealButton = document.getElementById('reveal-puzzle');
            const resetButton = document.getElementById('reset-puzzle');
            
            let currentRow = 0;
            let currentCol = 0;
            let currentOrientation = 0; // 0 for horizontal, 1 for vertical
            
            // Initialize the first input
            const firstInput = document.querySelector('.cell-input');
            if (firstInput) {
                firstInput.focus();
                highlightCurrentWord();
            }
            
            // Add event listeners to all input cells
            inputs.forEach(input => {
                // Focus event to track current position
                input.addEventListener('focus', function(e) {
                    currentRow = parseInt(this.getAttribute('data-row'));
                    currentCol = parseInt(this.getAttribute('data-col'));
                    highlightCurrentWord();
                });
                
                // Key input handling
                input.addEventListener('keydown', function(e) {
                    const row = parseInt(this.getAttribute('data-row'));
                    const col = parseInt(this.getAttribute('data-col'));
                    
                    // Arrow key navigation
                    if (e.key === 'ArrowRight') {
                        moveTo(row, col + 1);
                        e.preventDefault();
                    } else if (e.key === 'ArrowLeft') {
                        moveTo(row, col - 1);
                        e.preventDefault();
                    } else if (e.key === 'ArrowDown') {
                        moveTo(row + 1, col);
                        e.preventDefault();
                    } else if (e.key === 'ArrowUp') {
                        moveTo(row - 1, col);
                        e.preventDefault();
                    } else if (e.key === 'Tab') {
                        e.preventDefault();
                        currentOrientation = currentOrientation === 0 ? 1 : 0;
                        highlightCurrentWord();
                    } else if (e.key === 'Backspace' && this.value === '') {
                        // Move to previous cell when backspacing on empty cell
                        if (currentOrientation === 0) {
                            moveTo(row, col - 1);
                        } else {
                            moveTo(row - 1, col);
                        }
                        e.preventDefault();
                    }
                });
                
                // Auto-advance to next cell after input
                input.addEventListener('input', function(e) {
                    if (this.value.length === 1) {
                        this.value = this.value.toUpperCase();
                        // Move to next cell based on current orientation
                        if (currentOrientation === 0) {
                            moveTo(currentRow, currentCol + 1);
                        } else {
                            moveTo(currentRow + 1, currentCol);
                        }
                    }
                });
                
                // Handle click on clue
                clues.forEach(clue => {
                    clue.addEventListener('click', function() {
                        const row = parseInt(this.getAttribute('data-row'));
                        const col = parseInt(this.getAttribute('data-col'));
                        currentOrientation = parseInt(this.getAttribute('data-orientation'));
                        
                        moveTo(row, col);
                        highlightCurrentWord();
                    });
                });
            });
            
            // Check button handler
            checkButton.addEventListener('click', function() {
                inputs.forEach(input => {
                    const correctLetter = input.getAttribute('data-letter');
                    if (input.value.toUpperCase() === correctLetter) {
                        input.classList.add('correct');
                    } else if (input.value !== '') {
                        input.classList.remove('correct');
                        input.value = '';
                    }
                });
            });
            
            // Reveal button handler
            revealButton.addEventListener('click', function() {
                inputs.forEach(input => {
                    const correctLetter = input.getAttribute('data-letter');
                    input.value = correctLetter;
                    input.classList.add('correct');
                });
            });
            
            // Reset button handler
            resetButton.addEventListener('click', function() {
                inputs.forEach(input => {
                    input.value = '';
                    input.classList.remove('correct');
                    input.classList.remove('selected');
                });
                
                // Focus the first input
                const firstInput = document.querySelector('.cell-input');
                if (firstInput) {
                    firstInput.focus();
                }
            });
            
            // Helper function to move to a specific cell
            function moveTo(row, col) {
                const nextInput = document.querySelector(`.cell-input[data-row="${row}"][data-col="${col}"]`);
                if (nextInput) {
                    nextInput.focus();
                    currentRow = row;
                    currentCol = col;
                }
            }
            
            // Helper function to highlight the current word
            function highlightCurrentWord() {
                // Clear all highlights
                inputs.forEach(input => {
                    input.classList.remove('selected');
                });
                
                // Find current cell
                const currentCell = document.querySelector(`.cell-input[data-row="${currentRow}"][data-col="${currentCol}"]`);
                if (!currentCell) return;
                
                // Find all cells in the current word
                if (currentOrientation === 0) { // Horizontal
                    // Find start of horizontal word
                    let startCol = currentCol;
                    while (startCol > 0) {
                        const prevCell = document.querySelector(`.cell-input[data-row="${currentRow}"][data-col="${startCol-1}"]`);
                        if (!prevCell) break;
                        startCol--;
                    }
                    
                    // Highlight all cells in horizontal word
                    let colIndex = startCol;
                    while (true) {
                        const cell = document.querySelector(`.cell-input[data-row="${currentRow}"][data-col="${colIndex}"]`);
                        if (!cell) break;
                        cell.classList.add('selected');
                        colIndex++;
                    }
                } else { // Vertical
                    // Find start of vertical word
                    let startRow = currentRow;
                    while (startRow > 0) {
                        const prevCell = document.querySelector(`.cell-input[data-row="${startRow-1}"][data-col="${currentCol}"]`);
                        if (!prevCell) break;
                        startRow--;
                    }
                    
                    // Highlight all cells in vertical word
                    let rowIndex = startRow;
                    while (true) {
                        const cell = document.querySelector(`.cell-input[data-row="${rowIndex}"][data-col="${currentCol}"]`);
                        if (!cell) break;
                        cell.classList.add('selected');
                        rowIndex++;
                    }
                }
            }
        });
    </script>

</body>

</html>