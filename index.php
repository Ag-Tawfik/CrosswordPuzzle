<?php
declare(strict_types=1);

// Check PHP version requirement
if (version_compare(PHP_VERSION, '8.0.0', '<')) {
    die('This application requires PHP 8.0 or higher. Current version: ' . PHP_VERSION);
}

require_once __DIR__ . '/crossword.php';

$rows = 12;
$columns = 12;

$words = ['CAT', 'DOG', 'MOUSE', 'FISH', 'BIRD', 'LION', 'TIGER', 'BEAR', 'MONKEY', 'COW', 'PIG', 'SHEEP', 'HUMAN'];

[$puzzleGrid, $result] = generateCrossword($rows, $columns, $words);
$placedWords = $result->placed;

function h(string|int $value): string {
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

/**
 * Renders one clue list (across or down) sorted by clue number
 *
 * @param PlacedWord[] $placedWords
 * @param PuzzleCell[][] $puzzleGrid
 */
function renderClues(array $placedWords, array $puzzleGrid, int $orientation): void {
    $entries = [];
    foreach ($placedWords as $word) {
        if ($word->orientation !== $orientation) {
            continue;
        }
        $number = $puzzleGrid[$word->startRow][$word->startColumn]->number;
        $entries[$number] = $word;
    }
    ksort($entries);

    foreach ($entries as $number => $word) {
        echo '<li class="clue" data-orientation="' . $orientation . '" data-row="' . $word->startRow . '" data-col="' . $word->startColumn . '">'
            . $number . '. ' . h(generateClue($word->word)) . '</li>';
    }
}
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= $rows ?>x<?= $columns ?> Crossword Puzzle</title>
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

        .incorrect {
            background-color: #ffb3b3;
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

        .warning {
            width: 50%;
            margin: 10px auto;
            padding: 10px;
            background-color: #fff3cd;
            border: 1px solid #ffeeba;
            color: #856404;
        }

        .clue {
            cursor: pointer;
        }

        .help {
            width: 50%;
            margin: auto;
            font-size: 14px;
            color: #555;
            text-align: center;
        }
    </style>
</head>

<body>

    <h2><?= $rows ?>x<?= $columns ?> Crossword Puzzle</h2>

    <?php if ($result->unplaced !== []): ?>
    <div class="warning">
        Could not fit the following words into the grid: <?= h(implode(', ', $result->unplaced)) ?>.
        Try a larger grid or a different word list.
    </div>
    <?php endif; ?>

    <div class="controls">
        <button id="check-puzzle">Check Answers</button>
        <button id="reveal-puzzle">Reveal Answers</button>
        <button id="reset-puzzle">Reset</button>
    </div>
    <p class="help">Type to fill cells. Arrow keys move. Enter or Space switches between across and down.</p>

    <table id="crossword-grid">
        <?php
        // Render the grid with word numbers and input fields
        for ($i = 0; $i < $rows; $i++) {
            echo '<tr>';
            for ($j = 0; $j < $columns; $j++) {
                $cell = $puzzleGrid[$i][$j];
                if ($cell->letter !== null) {
                    echo '<td class="white">';
                    if ($cell->number !== null) {
                        echo '<span class="number">' . $cell->number . '</span>';
                    }
                    echo '<input type="text" class="cell-input" maxlength="1" autocomplete="off"'
                        . ' aria-label="Row ' . ($i + 1) . ' column ' . ($j + 1) . '"'
                        . ' data-row="' . $i . '" data-col="' . $j . '" data-letter="' . h($cell->letter) . '">';
                    echo '</td>';
                } else {
                    echo '<td class="black"></td>';
                }
            }
            echo '</tr>';
        }
        ?>
    </table>

    <div style="width: 50%; margin: auto; margin-top: 30px;">
        <h3>Across</h3>
        <ul id="across-clues"><?php renderClues($placedWords, $puzzleGrid, PlacedWord::ACROSS); ?></ul>
        <h3>Down</h3>
        <ul id="down-clues"><?php renderClues($placedWords, $puzzleGrid, PlacedWord::DOWN); ?></ul>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const inputs = document.querySelectorAll('.cell-input');
            const clues = document.querySelectorAll('.clue');
            const checkButton = document.getElementById('check-puzzle');
            const revealButton = document.getElementById('reveal-puzzle');
            const resetButton = document.getElementById('reset-puzzle');

            let currentRow = 0;
            let currentCol = 0;
            let currentOrientation = 0; // 0 for across, 1 for down

            function cellAt(row, col) {
                return document.querySelector(`.cell-input[data-row="${row}"][data-col="${col}"]`);
            }

            // Move focus to a cell if it exists
            function moveTo(row, col) {
                const nextInput = cellAt(row, col);
                if (nextInput) {
                    nextInput.focus();
                }
            }

            // Step one cell along the current orientation
            function advance(delta) {
                if (currentOrientation === 0) {
                    moveTo(currentRow, currentCol + delta);
                } else {
                    moveTo(currentRow + delta, currentCol);
                }
            }

            function highlightCurrentWord() {
                inputs.forEach(input => input.classList.remove('selected'));

                if (!cellAt(currentRow, currentCol)) return;

                const dRow = currentOrientation === 1 ? 1 : 0;
                const dCol = currentOrientation === 0 ? 1 : 0;

                // Walk back to the start of the word
                let row = currentRow;
                let col = currentCol;
                while (cellAt(row - dRow, col - dCol)) {
                    row -= dRow;
                    col -= dCol;
                }

                // Walk forward highlighting every cell in the word
                let cell;
                while ((cell = cellAt(row, col))) {
                    cell.classList.add('selected');
                    row += dRow;
                    col += dCol;
                }
            }

            function clearMarks(input) {
                input.classList.remove('correct', 'incorrect');
            }

            inputs.forEach(input => {
                input.addEventListener('focus', function() {
                    currentRow = parseInt(this.dataset.row, 10);
                    currentCol = parseInt(this.dataset.col, 10);
                    this.select();
                    highlightCurrentWord();
                });

                input.addEventListener('keydown', function(e) {
                    const row = parseInt(this.dataset.row, 10);
                    const col = parseInt(this.dataset.col, 10);

                    if (e.key === 'ArrowRight') {
                        moveTo(row, col + 1);
                    } else if (e.key === 'ArrowLeft') {
                        moveTo(row, col - 1);
                    } else if (e.key === 'ArrowDown') {
                        moveTo(row + 1, col);
                    } else if (e.key === 'ArrowUp') {
                        moveTo(row - 1, col);
                    } else if (e.key === 'Enter' || e.key === ' ') {
                        currentOrientation = currentOrientation === 0 ? 1 : 0;
                        highlightCurrentWord();
                    } else if (e.key === 'Backspace' && this.value === '') {
                        advance(-1);
                    } else {
                        return; // let the browser handle it, including Tab
                    }
                    e.preventDefault();
                });

                input.addEventListener('input', function() {
                    clearMarks(this);
                    this.value = this.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 1);
                    if (this.value.length === 1) {
                        advance(1);
                    }
                });
            });

            clues.forEach(clue => {
                clue.addEventListener('click', function() {
                    currentOrientation = parseInt(this.dataset.orientation, 10);
                    moveTo(parseInt(this.dataset.row, 10), parseInt(this.dataset.col, 10));
                    highlightCurrentWord();
                });
            });

            // Mark each filled cell right or wrong; leave the user's letters alone
            checkButton.addEventListener('click', function() {
                inputs.forEach(input => {
                    clearMarks(input);
                    if (input.value === '') return;
                    input.classList.add(input.value.toUpperCase() === input.dataset.letter ? 'correct' : 'incorrect');
                });
            });

            revealButton.addEventListener('click', function() {
                inputs.forEach(input => {
                    clearMarks(input);
                    input.value = input.dataset.letter;
                    input.classList.add('correct');
                });
            });

            resetButton.addEventListener('click', function() {
                inputs.forEach(input => {
                    input.value = '';
                    clearMarks(input);
                });
                currentOrientation = 0;
                moveTo(parseInt(inputs[0]?.dataset.row ?? 0, 10), parseInt(inputs[0]?.dataset.col ?? 0, 10));
            });

            if (inputs.length > 0) {
                inputs[0].focus();
            }
        });
    </script>

</body>

</html>
