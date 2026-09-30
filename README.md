# Crossword Puzzle

A PHP and JavaScript crossword game. Every day gets a fresh puzzle per category, any puzzle can be shared by its number, and progress is saved in the browser.

## Features

- **Daily puzzle** per word set, plus unlimited random puzzles and an archive of past days
- **Shareable puzzles**: the same puzzle number always gives the same grid
- **Make your own**: paste words and clues on the create page and get a link that holds the whole puzzle
- **Word sets** stored as JSON files with crossword-style clues (animals, food and drink, geography, sports, science, around the house), with several clues per word so repeats vary
- **Stats and streaks** kept in the browser, with a share button for your result
- **Difficulty modes**: easy marks wrong letters as you type, hard hides every check and reveal
- **Pencil mode** for tentative letters, **dark mode**, and **print** for a blank grid or the answer key
- **Grid sizes** from 10x10 to 20x20
- Proper crossword rules: every word crosses another, no side-by-side or end-to-end joins
- Clues numbered in reading order, with the active clue shown above the grid
- Keyboard navigation that follows crossword conventions
- Works on phones: the grid scales to the screen, the active clue stays pinned at the top, and the keyboard stays open while you move between cells
- Check word, check all, reveal letter, reveal word
- Timer, fill percentage, completed clues struck through, and a win message
- Progress and solve state saved per puzzle in the browser
- JSON output for use by other clients

## Requirements

- PHP 8.0 or later
- A web server (Apache, Nginx, etc.), or PHP's built-in server for local use
- Modern web browser with JavaScript enabled

## Installation

1. Clone or download this repository to your web server's document root
2. Navigate to the directory in your web browser

For a quick local look without a web server:

```sh
php -S localhost:8000
```

then open http://localhost:8000 in a browser.

## Usage

### URL parameters

| Parameter | Meaning | Default |
|---|---|---|
| `set` | Word set, the file name in `words/` without `.json` | `animals` |
| `size` | Grid size, 8 to 20 | `12` |
| `seed` | Puzzle number. The same number always gives the same puzzle | Today's date (UTC) |
| `date` | A past day's daily puzzle, as `YYYY-MM-DD`. Overrides `seed` | |
| `custom` | A custom puzzle made on `create.php`. Overrides `set` | |
| `format=json` | Return the puzzle as JSON instead of the page | |

Examples:

- `index.php?set=food` today's food puzzle
- `index.php?set=geography&size=15&seed=4242` a specific, shareable puzzle
- `index.php?set=animals&seed=4242&format=json` the same puzzle as JSON

### Playing

- Tap or click a cell or a clue to select a word. The clue appears in the bar above the grid, with previous and next word buttons
- Type letters. The cursor skips filled cells and jumps to the next unfinished clue at the end of a word
- Arrow keys move along the current direction. Pressing an arrow across the direction switches it
- Enter, Space, or tapping the selected cell again switches between across and down
- Backspace clears and steps back
- **Check word** and **Check all** mark cells green or red without changing them
- **Reveal letter** and **Reveal word** fill in answers, shown in blue
- **Reset** clears the puzzle and restarts the timer
- **Pencil** (or the `.` key) enters tentative letters shown in grey
- **Random puzzle** loads a new puzzle number. Pick a date to play a past daily puzzle, then **Go**
- **Difficulty**: easy shows wrong letters as you type, normal waits for you to check, hard hides check and reveal
- **Print** gives a blank grid with clues. **Print answers** gives the key
- **Share** on the win banner copies your time and the puzzle link. **Stats** shows solves, streak and times
- **Dark** switches the theme; by default it follows your system setting

Progress, stats, mode and theme are saved in the browser. A daily streak counts consecutive days on which you solved that day's puzzle.

### Making your own puzzle

Open `create.php`, give the puzzle a title, and enter one word per line as `WORD: clue`. The page builds a link that contains the whole puzzle, so there is nothing to host or save. Anyone with the link gets the same grid. Words that do not fit the chosen grid size are left out.

## Adding words

Each word set is a JSON file in `words/`:

```json
{
  "name": "Animals",
  "words": {
    "CAT": ["Purring house pet", "Whiskered animal with nine lives, they say"],
    "DOG": "Loyal companion that barks"
  }
}
```

A word may have one clue or a list of clues. Which clue appears depends on the puzzle number, so the same word gets different clues on different days.

Words may contain letters only and must be no longer than the smallest grid you want to support. Words are uppercased on load. A set should hold well over the number of words a grid can fit, since the generator picks as many as fit; 30 or more words is a good size. Drop a new file into `words/` and it appears in the word set menu.

## How It Works

1. The word set is loaded and the random generator is seeded with the puzzle number
2. The longest word goes across the middle
3. Each remaining word is placed so that it crosses an existing word, choosing at random among legal positions. Words that do not fit are retried after each pass
4. The whole process runs a few hundred times and the layout with the most words wins
5. Words are numbered in reading order and the puzzle is emitted as JSON
6. `crossword.js` renders the grid, routes all typing through one hidden input so phone keyboards stay open, saves progress and detects completion

## Project Layout

- `index.php` reads the request, generates the puzzle, and renders the page or JSON
- `create.php` and `create.js` the custom puzzle builder
- `crossword.php` the generator: grid, placement rules, numbering, word set loading
- `crossword.js` the game: rendering, navigation, checking, persistence, stats
- `crossword.css` styles, including dark mode and print
- `words/*.json` word sets
- `tests/generator_test.php` checks the generator, the word sets, seeding and the page
- `.github/workflows/test.yml` runs the tests on PHP 8.0 and 8.4

## Running the Tests

```sh
php tests/generator_test.php
```

## License

This project is open source and available for personal and educational use.

## Contributing

Feel free to fork this project and submit pull requests with improvements or new features.
