<?php
declare(strict_types=1);

// Check PHP version requirement
if (version_compare(PHP_VERSION, '8.0.0', '<')) {
    die('This application requires PHP 8.0 or higher. Current version: ' . PHP_VERSION);
}

require_once __DIR__ . '/crossword.php';

// --- Request parameters -------------------------------------------------------
// ?set=animals   word set (a file in words/)
// ?size=12       grid size, 8 to 20
// ?seed=123      any number; the same seed always gives the same puzzle.
//                Defaults to today's date, which makes the default a daily puzzle.
// ?format=json   return the puzzle as JSON instead of the page

$wordSets = listWordSets();
if ($wordSets === []) {
    http_response_code(500);
    die('No word sets found in the words directory.');
}

$setKey = (string) ($_GET['set'] ?? 'animals');
if (!isset($wordSets[$setKey])) {
    $setKey = (string) array_key_first($wordSets);
}

$size = (int) ($_GET['size'] ?? 12);
$size = max(8, min(20, $size));

$seedParam = (string) ($_GET['seed'] ?? '');
$seed = preg_match('/^\d{1,9}$/', $seedParam) ? (int) $seedParam : (int) date('Ymd');
$isDaily = !preg_match('/^\d{1,9}$/', $seedParam);

$wordSet = loadWordSet($setKey);
[$puzzleGrid, $result] = generateCrossword($size, $size, $wordSet->words(), 500, $seed);

$puzzle = puzzleToArray($puzzleGrid, $result, $wordSet) + [
    'set' => $setKey,
    'setName' => $wordSet->name,
    'seed' => $seed,
    'daily' => $isDaily,
];

if (($_GET['format'] ?? '') === 'json') {
    header('Content-Type: application/json');
    echo json_encode($puzzle, JSON_THROW_ON_ERROR);
    exit;
}

function h(string|int $value): string {
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= h($wordSet->name) ?> Crossword</title>
    <style>
        :root {
            --cell: 40px;
            --selected: #cfe3ff;
            --current: #ffd54f;
            --correct: #a2ffa2;
            --incorrect: #ffb3b3;
        }

        body {
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 16px;
            color: #222;
        }

        h1 {
            text-align: center;
            font-size: 24px;
            margin: 8px 0 4px;
        }

        .subtitle {
            text-align: center;
            color: #666;
            font-size: 14px;
            margin: 0 0 12px;
        }

        .toolbar, .controls {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 8px;
            margin: 8px auto;
        }

        select, button, .button {
            padding: 8px 12px;
            font-size: 14px;
            border-radius: 4px;
            border: 1px solid #bbb;
            background: #f7f7f7;
            color: #222;
            cursor: pointer;
            text-decoration: none;
        }

        button.primary, .button.primary {
            background: #4CAF50;
            border-color: #4CAF50;
            color: #fff;
        }

        button:hover, .button:hover {
            filter: brightness(0.95);
        }

        .status {
            display: flex;
            justify-content: center;
            gap: 24px;
            font-size: 14px;
            color: #444;
            margin: 8px 0;
        }

        .active-clue {
            max-width: 600px;
            margin: 8px auto;
            padding: 10px 14px;
            background: var(--selected);
            border-radius: 4px;
            min-height: 20px;
            text-align: center;
        }

        .active-clue b {
            margin-right: 6px;
        }

        table {
            border-collapse: collapse;
            margin: 12px auto;
        }

        td {
            border: 1px solid #000;
            height: var(--cell);
            width: var(--cell);
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
            left: 2px;
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
            outline: none;
            caret-color: transparent;
        }

        td.selected { background-color: var(--selected); }
        td.current { background-color: var(--current); }
        td.correct { background-color: var(--correct); }
        td.incorrect { background-color: var(--incorrect); }
        td.revealed .cell-input { color: #1565c0; }

        .clues {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 32px;
            max-width: 900px;
            margin: 16px auto;
        }

        .clues section {
            flex: 1 1 280px;
        }

        .clues h3 {
            margin: 0 0 6px;
        }

        .clues ol {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .clue {
            cursor: pointer;
            padding: 4px 6px;
            border-radius: 3px;
        }

        .clue:hover { background: #f0f0f0; }
        .clue.active { background: var(--selected); }
        .clue.done { color: #888; text-decoration: line-through; }

        .banner {
            display: none;
            max-width: 600px;
            margin: 12px auto;
            padding: 12px 16px;
            background: #e6f4ea;
            border: 1px solid #b7dfc0;
            border-radius: 4px;
            text-align: center;
            font-size: 16px;
        }

        .banner.show { display: block; }

        .help {
            text-align: center;
            font-size: 13px;
            color: #666;
            max-width: 600px;
            margin: 8px auto;
        }
    </style>
</head>

<body>

    <h1><?= h($wordSet->name) ?> Crossword</h1>
    <p class="subtitle">
        <?= $isDaily ? 'Daily puzzle for ' . h(date('j F Y')) : 'Puzzle #' . h($seed) ?>
        &middot; <?= h($size) ?>&times;<?= h($size) ?>
        &middot; <?= h($puzzle['wordCount']) ?> words
    </p>

    <form class="toolbar" method="get" id="toolbar">
        <select name="set" aria-label="Word set">
            <?php foreach ($wordSets as $key => $name): ?>
            <option value="<?= h($key) ?>"<?= $key === $setKey ? ' selected' : '' ?>><?= h($name) ?></option>
            <?php endforeach; ?>
        </select>
        <select name="size" aria-label="Grid size">
            <?php foreach ([10, 12, 15, 18, 20] as $option): ?>
            <option value="<?= $option ?>"<?= $option === $size ? ' selected' : '' ?>><?= $option ?>&times;<?= $option ?></option>
            <?php endforeach; ?>
        </select>
        <button type="submit">Today's puzzle</button>
        <button type="button" id="new-puzzle" class="primary">Random puzzle</button>
    </form>

    <div class="status">
        <span>Time: <span id="timer">0:00</span></span>
        <span>Filled: <span id="progress">0%</span></span>
    </div>

    <div class="banner" id="win-banner"></div>

    <div class="active-clue" id="active-clue"></div>

    <table id="crossword-grid" aria-label="Crossword grid"></table>

    <div class="controls">
        <button id="check-word">Check word</button>
        <button id="check-all">Check all</button>
        <button id="reveal-letter">Reveal letter</button>
        <button id="reveal-word">Reveal word</button>
        <button id="reset-puzzle">Reset</button>
    </div>
    <p class="help">Type to fill cells. Arrow keys move. Enter, Space, or clicking the selected cell switches between across and down. Progress is saved in this browser.</p>

    <div class="clues">
        <section>
            <h3>Across</h3>
            <ol id="across-clues"></ol>
        </section>
        <section>
            <h3>Down</h3>
            <ol id="down-clues"></ol>
        </section>
    </div>

    <script type="application/json" id="puzzle-data"><?= json_encode($puzzle, JSON_HEX_TAG | JSON_HEX_AMP | JSON_THROW_ON_ERROR) ?></script>
    <script src="crossword.js"></script>

</body>

</html>
