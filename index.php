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

// The daily seed is taken in UTC so every player gets the same puzzle on the same calendar day
date_default_timezone_set('UTC');

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
            --gutter: 16px;
            --cell: min(40px, calc((100vw - 2 * var(--gutter)) / var(--columns, 12)));
            --selected: #cfe3ff;
            --current: #ffd54f;
            --correct: #a2ffa2;
            --incorrect: #ffb3b3;
        }

        * { box-sizing: border-box; }

        body {
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: var(--gutter);
            color: #222;
            background: #fff;
        }

        h1 {
            text-align: center;
            font-size: 22px;
            margin: 4px 0 2px;
        }

        .subtitle {
            text-align: center;
            color: #666;
            font-size: 14px;
            margin: 0 0 10px;
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
            min-height: 40px;
        }

        button.primary { background: #4CAF50; border-color: #4CAF50; color: #fff; }
        button:hover { filter: brightness(0.95); }

        .status {
            display: flex;
            justify-content: center;
            gap: 24px;
            font-size: 14px;
            color: #444;
            margin: 6px 0;
        }

        /* Sticky clue bar with previous / next word buttons */
        .clue-bar {
            position: sticky;
            top: 0;
            z-index: 5;
            display: flex;
            align-items: stretch;
            gap: 6px;
            max-width: 640px;
            margin: 8px auto;
            background: #fff;
            padding: 4px 0;
        }

        .clue-bar button {
            flex: 0 0 44px;
            padding: 0;
            font-size: 20px;
            background: var(--selected);
            border-color: transparent;
        }

        .active-clue {
            flex: 1 1 auto;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 8px 10px;
            background: var(--selected);
            border-radius: 4px;
            min-height: 44px;
            font-size: 15px;
            line-height: 1.3;
        }

        .active-clue b { margin-right: 6px; white-space: nowrap; }

        /* The one real input: keeps the on-screen keyboard open while cells change */
        #kbd {
            position: fixed;
            top: 0;
            left: 0;
            width: 1px;
            height: 1px;
            opacity: 0;
            border: 0;
            padding: 0;
            font-size: 16px; /* prevents iOS from zooming on focus */
        }

        table {
            border-collapse: collapse;
            margin: 10px auto;
            table-layout: fixed;
            width: calc(var(--cell) * var(--columns, 12));
            -webkit-user-select: none;
            user-select: none;
        }

        td {
            border: 1px solid #000;
            height: var(--cell);
            width: var(--cell);
            position: relative;
            padding: 0;
            text-align: center;
            vertical-align: middle;
            font-size: calc(var(--cell) * 0.55);
            line-height: 1;
            text-transform: uppercase;
            cursor: pointer;
        }

        .black { background-color: #000; cursor: default; }
        .white { background-color: #fff; }

        .number {
            position: absolute;
            top: 1px;
            left: 2px;
            font-size: max(8px, calc(var(--cell) * 0.26));
            line-height: 1;
            pointer-events: none;
        }

        td.selected { background-color: var(--selected); }
        td.current { background-color: var(--current); }
        td.correct { background-color: var(--correct); }
        td.incorrect { background-color: var(--incorrect); }
        td.revealed { color: #1565c0; }

        .clues {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 16px 32px;
            max-width: 900px;
            margin: 12px auto;
        }

        .clues section { flex: 1 1 260px; min-width: 0; }
        .clues h3 { margin: 0 0 6px; }
        .clues ol { list-style: none; padding: 0; margin: 0; }

        .clue {
            cursor: pointer;
            padding: 6px;
            border-radius: 3px;
            font-size: 15px;
        }

        .clue:hover { background: #f0f0f0; }
        .clue.active { background: var(--selected); }
        .clue.done { color: #888; text-decoration: line-through; }

        .banner {
            display: none;
            max-width: 640px;
            margin: 10px auto;
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
            max-width: 640px;
            margin: 8px auto;
        }

        @media (max-width: 480px) {
            .status { gap: 16px; font-size: 13px; }
            .help { display: none; }
            .controls button { flex: 1 1 30%; padding: 8px 4px; font-size: 13px; }
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

    <div class="clue-bar">
        <button type="button" id="prev-word" aria-label="Previous word">&lsaquo;</button>
        <div class="active-clue" id="active-clue" aria-live="polite"></div>
        <button type="button" id="next-word" aria-label="Next word">&rsaquo;</button>
    </div>

    <input id="kbd" type="text" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" aria-label="Type letters into the crossword">

    <table id="crossword-grid" aria-label="Crossword grid" style="--columns: <?= h($puzzle['columns']) ?>"></table>

    <div class="controls">
        <button id="check-word">Check word</button>
        <button id="check-all">Check all</button>
        <button id="reveal-letter">Reveal letter</button>
        <button id="reveal-word">Reveal word</button>
        <button id="reset-puzzle">Reset</button>
    </div>
    <p class="help">Tap or click a cell and type. Arrow keys move. Enter, Space, or clicking the selected cell switches between across and down. Progress is saved in this browser.</p>

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
