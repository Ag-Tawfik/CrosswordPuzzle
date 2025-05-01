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
        }

        .black {
            background-color: #000;
        }

        .white {
            background-color: #fff;
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
        function generatePuzzleGrid($rows, $columns)
        {
            $puzzleGrid = [];

            for ($i = 0; $i < $rows; $i++) {
                $puzzleGrid[$i] = [];
                for ($j = 0; $j < $columns; $j++) {
                    $puzzleGrid[$i][$j] = [
                        'cell' => '<td class="black"></td>',
                        'letter' => null
                    ];
                }
            }

            return $puzzleGrid;
        }

        function placeWordsInGrid(&$puzzleGrid, $words)
        {
            $placedWords = [];
            
            // Sort words by length (descending) to place longer words first
            usort($words, function($a, $b) {
                return strlen($b) - strlen($a);
            });
            
            // Place the first word in the middle horizontally
            $firstWord = array_shift($words);
            $firstWordLength = strlen($firstWord);
            $startRow = floor(count($puzzleGrid) / 2);
            $startColumn = floor((count($puzzleGrid[0]) - $firstWordLength) / 2);
            
            for ($i = 0; $i < $firstWordLength; $i++) {
                $puzzleGrid[$startRow][$startColumn + $i]['cell'] = '<td class="white"></td>';
                $puzzleGrid[$startRow][$startColumn + $i]['letter'] = $firstWord[$i];
            }
            
            $placedWords[] = [
                'word' => $firstWord,
                'orientation' => 0, // horizontal
                'startRow' => $startRow,
                'startColumn' => $startColumn
            ];
            
            // Now try to place remaining words with intersections
            foreach ($words as $word) {
                $placed = false;
                $wordLength = strlen($word);
                
                // First try to place word with intersections
                $intersectionAttempts = 100;
                
                for ($attempt = 1; $attempt <= $intersectionAttempts; $attempt++) {
                    // Try each placed word for possible intersections
                    shuffle($placedWords); // Randomize to avoid grid bias
                    
                    foreach ($placedWords as $placedWord) {
                        $placedWordOrientation = $placedWord['orientation'];
                        $newOrientation = 1 - $placedWordOrientation; // Opposite orientation
                        
                        for ($letterIndex = 0; $letterIndex < strlen($placedWord['word']); $letterIndex++) {
                            $placedLetter = $placedWord['word'][$letterIndex];
                            
                            // Find positions in new word where this letter appears
                            for ($i = 0; $i < $wordLength; $i++) {
                                if ($word[$i] === $placedLetter) {
                                    // Found potential intersection
                                    
                                    if ($placedWordOrientation === 0) { // Placed word is horizontal
                                        // New word will be vertical
                                        $row = $placedWord['startRow'] - $i;
                                        $col = $placedWord['startColumn'] + $letterIndex;
                                    } else { // Placed word is vertical
                                        // New word will be horizontal
                                        $row = $placedWord['startRow'] + $letterIndex;
                                        $col = $placedWord['startColumn'] - $i;
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
                                    
                                    // Check if the word fits at this position
                                    $fits = true;
                                    for ($j = 0; $j < $wordLength; $j++) {
                                        if ($newOrientation === 0) { // Horizontal
                                            // Skip check at intersection point
                                            if ($j === $i) continue;
                                            
                                            // Check that cell is either empty or contains matching letter
                                            if ($puzzleGrid[$row][$col + $j]['letter'] !== null && 
                                                $puzzleGrid[$row][$col + $j]['letter'] !== $word[$j]) {
                                                $fits = false;
                                                break;
                                            }
                                            
                                            // Check for adjacent words (crossword rule)
                                            if ($row > 0 && $puzzleGrid[$row - 1][$col + $j]['letter'] !== null && $j !== $i) {
                                                $fits = false;
                                                break;
                                            }
                                            if ($row < count($puzzleGrid) - 1 && $puzzleGrid[$row + 1][$col + $j]['letter'] !== null && $j !== $i) {
                                                $fits = false;
                                                break;
                                            }
                                        } else { // Vertical
                                            // Skip check at intersection point
                                            if ($j === $i) continue;
                                            
                                            // Check that cell is either empty or contains matching letter
                                            if ($puzzleGrid[$row + $j][$col]['letter'] !== null && 
                                                $puzzleGrid[$row + $j][$col]['letter'] !== $word[$j]) {
                                                $fits = false;
                                                break;
                                            }
                                            
                                            // Check for adjacent words (crossword rule)
                                            if ($col > 0 && $puzzleGrid[$row + $j][$col - 1]['letter'] !== null && $j !== $i) {
                                                $fits = false;
                                                break;
                                            }
                                            if ($col < count($puzzleGrid[0]) - 1 && $puzzleGrid[$row + $j][$col + 1]['letter'] !== null && $j !== $i) {
                                                $fits = false;
                                                break;
                                            }
                                        }
                                    }
                                    
                                    if ($fits) {
                                        // Place the word
                                        for ($j = 0; $j < $wordLength; $j++) {
                                            if ($newOrientation === 0) { // Horizontal
                                                $puzzleGrid[$row][$col + $j]['cell'] = '<td class="white"></td>';
                                                $puzzleGrid[$row][$col + $j]['letter'] = $word[$j];
                                            } else { // Vertical
                                                $puzzleGrid[$row + $j][$col]['cell'] = '<td class="white"></td>';
                                                $puzzleGrid[$row + $j][$col]['letter'] = $word[$j];
                                            }
                                        }
                                        
                                        $placedWords[] = [
                                            'word' => $word,
                                            'orientation' => $newOrientation,
                                            'startRow' => $row,
                                            'startColumn' => $col
                                        ];
                                        
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
                    
                    for ($attempt = 1; $attempt <= $randomAttempts; $attempt++) {
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
                                if ($puzzleGrid[$startRow][$startColumn + $i]['letter'] !== null) {
                                    $fits = false;
                                    break;
                                }
                            } else { // Vertical
                                if ($puzzleGrid[$startRow + $i][$startColumn]['letter'] !== null) {
                                    $fits = false;
                                    break;
                                }
                            }
                        }
                        
                        if ($fits) {
                            for ($i = 0; $i < $wordLength; $i++) {
                                if ($orientation === 0) { // Horizontal
                                    $puzzleGrid[$startRow][$startColumn + $i]['cell'] = '<td class="white"></td>';
                                    $puzzleGrid[$startRow][$startColumn + $i]['letter'] = $word[$i];
                                } else { // Vertical
                                    $puzzleGrid[$startRow + $i][$startColumn]['cell'] = '<td class="white"></td>';
                                    $puzzleGrid[$startRow + $i][$startColumn]['letter'] = $word[$i];
                                }
                            }
                            
                            $placedWords[] = [
                                'word' => $word,
                                'orientation' => $orientation,
                                'startRow' => $startRow,
                                'startColumn' => $startColumn
                            ];
                            
                            $placed = true;
                            break;
                        }
                    }
                }
            }
        }

        $rows = 12;
        $columns = 12;

        $puzzleGrid = generatePuzzleGrid($rows, $columns);

        $words = ['CAT', 'DOG', 'MOUSE', 'FISH', 'BIRD', 'LION', 'TIGER', 'BEAR', 'MONKEY', 'COW', 'PIG', 'SHEEP', 'HUMAN'];

        placeWordsInGrid($puzzleGrid, $words);

        foreach ($puzzleGrid as $row) {
            echo '<tr>';
            foreach ($row as $cell) {
                echo $cell['cell'];
            }
            echo '</tr>';
        }
        ?>
    </table>

</body>

</html>