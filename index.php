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
                    $puzzleGrid[$i][$j] = '<td class="black"></td>';
                }
            }

            return $puzzleGrid;
        }

        function placeWordsInGrid(&$puzzleGrid, $words)
        {
            foreach ($words as $word) {
                $orientation = rand(0, 1);

                $length = strlen($word);
                $maxAttempts = 100;

                for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
                    if ($orientation === 0) {
                        $startRow = rand(0, count($puzzleGrid) - 1);
                        $startColumn = rand(0, count($puzzleGrid[0]) - $length);
                    } else {
                        $startRow = rand(0, count($puzzleGrid) - $length);
                        $startColumn = rand(0, count($puzzleGrid[0]) - 1);
                    }

                    $fits = true;
                    for ($i = 0; $i < $length; $i++) {
                        if ($orientation === 0) {
                            if ($puzzleGrid[$startRow][$startColumn + $i] !== '<td class="black"></td>') {
                                $fits = false;
                                break;
                            }
                        } else {
                            if ($puzzleGrid[$startRow + $i][$startColumn] !== '<td class="black"></td>') {
                                $fits = false;
                                break;
                            }
                        }
                    }

                    if ($fits) {
                        for ($i = 0; $i < $length; $i++) {
                            if ($orientation === 0) {
                                $puzzleGrid[$startRow][$startColumn + $i] = '<td class="white"></td>';
                            } else {
                                $puzzleGrid[$startRow + $i][$startColumn] = '<td class="white"></td>';
                            }
                        }
                        break;
                    }
                }
            }
        }


        $rows = 12;
        $columns = 12;

        $puzzleGrid = generatePuzzleGrid($rows, $columns);

        $words = ['CAT', 'DOG', 'MOUSE', 'FISH', 'BIRD', 'LION', 'TIGER', 'BEAR', 'MONKEY', 'COW', 'PIG', 'SHEEP', 'Human'];

        placeWordsInGrid($puzzleGrid, $words);

        foreach ($puzzleGrid as $row) {
            echo '<tr>';
            foreach ($row as $cell) {
                echo $cell;
            }
            echo '</tr>';
        }
        ?>
    </table>

</body>

</html>