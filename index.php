<?php
declare(strict_types=1);

// Check PHP version requirement
if (version_compare(PHP_VERSION, '8.0.0', '<')) {
    die('This application requires PHP 8.0 or higher. Current version: ' . PHP_VERSION);
}

require_once __DIR__ . '/crossword.php';

// --- Request parameters -------------------------------------------------------
// ?set=animals       word set (a file in words/)
// ?size=12           grid size, 8 to 20
// ?seed=123          any number; the same seed always gives the same puzzle.
// ?date=2026-09-30   the daily puzzle for that date (archive). Overrides seed.
//                    With neither, today's daily puzzle.
// ?custom=<base64>   a custom word list made on create.php; overrides set
// ?format=json       return the puzzle as JSON instead of the page

// The daily seed is taken in UTC so every player gets the same puzzle on the same calendar day
date_default_timezone_set('UTC');

$wordSets = listWordSets();
if ($wordSets === []) {
    http_response_code(500);
    die('No word sets found in the words directory.');
}

$customParam = (string) ($_GET['custom'] ?? '');
$customSet = $customParam !== '' ? customWordSetFromParam($customParam) : null;
$customError = $customParam !== '' && $customSet === null;

$setKey = (string) ($_GET['set'] ?? 'animals');
if (!isset($wordSets[$setKey])) {
    $setKey = (string) array_key_first($wordSets);
}

$size = (int) ($_GET['size'] ?? 12);
$size = max(8, min(20, $size));

$today = date('Y-m-d');
$dateParam = (string) ($_GET['date'] ?? '');
$seedParam = (string) ($_GET['seed'] ?? '');

$puzzleDate = null;
if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateParam) && strtotime($dateParam) !== false && $dateParam <= $today) {
    $puzzleDate = $dateParam;
} elseif (!preg_match('/^\d{1,9}$/', $seedParam)) {
    $puzzleDate = $today;
}

if ($customSet !== null) {
    $wordSet = $customSet;
    $setKey = 'custom';
    // A custom puzzle keeps a fixed layout unless a seed is given explicitly
    $seed = preg_match('/^\d{1,9}$/', $seedParam) ? (int) $seedParam : crc32($customParam) % 1000000000;
    $puzzleDate = null;
} else {
    $wordSet = loadWordSet($setKey);
    $seed = $puzzleDate !== null ? (int) str_replace('-', '', $puzzleDate) : (int) $seedParam;
}

[$puzzleGrid, $result] = generateCrossword($size, $size, $wordSet->words(), 500, $seed);

$puzzle = puzzleToArray($puzzleGrid, $result, $wordSet, $seed) + [
    'set' => $setKey,
    'setName' => $wordSet->name,
    'seed' => $seed,
    'date' => $puzzleDate,
    'daily' => $puzzleDate === $today,
    'custom' => $customSet !== null,
];

if (($_GET['format'] ?? '') === 'json') {
    header('Content-Type: application/json');
    echo json_encode($puzzle, JSON_THROW_ON_ERROR);
    exit;
}


$subtitle = $puzzle['daily']
    ? 'Daily puzzle for ' . date('j F Y', strtotime($today))
    : ($puzzleDate !== null ? 'Daily puzzle for ' . date('j F Y', strtotime($puzzleDate)) : 'Puzzle #' . $seed);
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <title><?= h($wordSet->name) ?> Crossword</title>
    <link rel="stylesheet" href="crossword.css">
</head>

<body>

    <h1><?= h($wordSet->name) ?> Crossword</h1>
    <p class="subtitle">
        <?= h($subtitle) ?>
        &middot; <?= h($size) ?>&times;<?= h($size) ?>
        &middot; <?= h($puzzle['wordCount']) ?> words
    </p>

    <?php if ($customError): ?>
    <div class="banner warn show">That custom puzzle link could not be read. Showing the daily puzzle instead.</div>
    <?php endif; ?>

    <form class="toolbar" method="get" id="toolbar">
        <select name="set" aria-label="Word set">
            <?php foreach ($wordSets as $key => $name): ?>
            <option value="<?= h($key) ?>"<?= $key === $setKey ? ' selected' : '' ?>><?= h($name) ?></option>
            <?php endforeach; ?>
            <?php if ($customSet !== null): ?>
            <option value="custom" selected>Custom: <?= h($wordSet->name) ?></option>
            <?php endif; ?>
        </select>
        <select name="size" aria-label="Grid size">
            <?php foreach ([10, 12, 15, 18, 20] as $option): ?>
            <option value="<?= $option ?>"<?= $option === $size ? ' selected' : '' ?>><?= $option ?>&times;<?= $option ?></option>
            <?php endforeach; ?>
        </select>
        <input type="date" name="date" id="date-picker" aria-label="Puzzle date" max="<?= h($today) ?>" value="<?= h($puzzleDate ?? '') ?>">
        <select id="mode" aria-label="Difficulty">
            <option value="easy">Easy</option>
            <option value="normal" selected>Normal</option>
            <option value="hard">Hard</option>
        </select>
        <button type="submit">Go</button>
        <button type="button" id="new-puzzle" class="primary">Random puzzle</button>
        <a class="button" href="create.php">Create your own</a>
    </form>

    <div class="status">
        <span>Time: <span id="timer">0:00</span></span>
        <span>Filled: <span id="progress">0%</span></span>
        <span id="streak-status" hidden>Streak: <span id="streak">0</span></span>
        <button type="button" id="stats-button" class="link">Stats</button>
        <button type="button" id="theme-button" class="link" aria-label="Toggle dark mode">Dark</button>
    </div>

    <div class="banner" id="win-banner">
        <span id="win-text"></span>
        <button type="button" id="share-button">Share</button>
    </div>

    <div class="clue-bar">
        <button type="button" id="prev-word" aria-label="Previous word">&lsaquo;</button>
        <div class="active-clue" id="active-clue" aria-live="polite"></div>
        <button type="button" id="next-word" aria-label="Next word">&rsaquo;</button>
    </div>

    <input id="kbd" type="text" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" aria-label="Type letters into the crossword">

    <table id="crossword-grid" aria-label="Crossword grid" style="--columns: <?= h($puzzle['columns']) ?>"></table>

    <div class="controls">
        <button type="button" id="check-word" class="needs-check">Check word</button>
        <button type="button" id="check-all" class="needs-check">Check all</button>
        <button type="button" id="reveal-letter" class="needs-check">Reveal letter</button>
        <button type="button" id="reveal-word" class="needs-check">Reveal word</button>
        <button type="button" id="pencil" aria-pressed="false">Pencil</button>
        <button type="button" id="reset-puzzle">Reset</button>
        <button type="button" id="print-blank">Print</button>
        <button type="button" id="print-answers">Print answers</button>
    </div>
    <p class="help">Tap or click a cell and type. Arrow keys move. Enter, Space, or tapping the selected cell switches between across and down. Progress is saved in this browser.</p>

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

    <dialog id="stats-dialog">
        <h2>Your stats</h2>
        <dl id="stats-list"></dl>
        <p class="muted">Stored in this browser only.</p>
        <form method="dialog"><button type="submit">Close</button></form>
    </dialog>

    <script type="application/json" id="puzzle-data"><?= json_encode($puzzle, JSON_HEX_TAG | JSON_HEX_AMP | JSON_THROW_ON_ERROR) ?></script>
    <script src="crossword.js"></script>

</body>

</html>
