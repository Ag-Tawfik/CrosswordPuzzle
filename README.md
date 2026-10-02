# Crossword Puzzle

A crossword game that runs entirely in the browser. Every day gets a fresh puzzle per category, any puzzle can be shared by its number, you can build your own from a list of words, and progress is saved locally. No server, no build step: it is static HTML, CSS and JavaScript, hosted on GitHub Pages.

## Features

- **Daily puzzle** per word set, plus unlimited random puzzles and an archive of past days
- **Daily Mini**: a 7×7 of the same set with six or seven words, solvable in a minute, with its own streak and archive
- **Shareable puzzles**: the same puzzle number always gives the same grid
- **Make your own**: paste words and clues on the create page and get a link that holds the whole puzzle
- **Word sets** stored as JSON files with crossword-style clues (animals, food and drink, geography, sports, science, around the house), with several clues per word so repeats vary, plus a **Mixed** set that draws from all of them so the topic gives nothing away
- **A solve moment**: the grid sweeps green, the time counts up, and a verdict compares you with your earlier solves of the same size
- **Challenge a friend**: a link to the exact puzzle with your time to beat; they see the target while solving and the result against it when done. No server, it all lives in the link
- **Stats and streaks** kept in the browser, with a share button for your result, and an **archive calendar** showing which days you have solved, each day a link to that day's puzzle
- **Difficulty modes**: easy marks wrong letters as you type, hard hides every check and reveal and uses harder clues
- **Pencil mode** for tentative letters, **dark mode**, and **print** for a blank grid or the answer key
- Works on phones: the grid scales to the screen, the active clue stays pinned at the top, and the keyboard stays open while you move between cells
- Proper crossword rules: every word crosses another, no side-by-side or end-to-end joins, clues numbered in reading order

## Running it

Open `index.html` from any static web server. For a local look:

```sh
npm run serve
```

then open http://127.0.0.1:8000/ in a browser. Opening the file directly from disk does not work, because the page fetches the word sets.

### GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the repository root to GitHub Pages on every push to `main`. To turn it on once: in the repository settings, under Pages, set the source to **GitHub Actions**. The site then lives at `https://<owner>.github.io/<repo>/`.

## Usage

### URL parameters

| Parameter | Meaning | Default |
|---|---|---|
| `set` | Word set, the file name in `words/` without `.json`, or `mixed` for every set in one pool | `animals` |
| `size` | Grid size, 8 to 20 | `12` |
| `seed` | Puzzle number. The same number always gives the same puzzle | Today's date (UTC) |
| `date` | A past day's daily puzzle, as `YYYY-MM-DD`. Overrides `seed` | |
| `custom` | A custom puzzle made on `create.html`. Overrides `set` | |
| `mini` | `1` for the Mini, a 7×7 of the set. Overrides `size` | |
| `beat` | A challenge: a time in seconds to beat on this exact puzzle. Made by the **Challenge a friend** button | |

Examples:

- `index.html?set=food` today's food puzzle
- `index.html?set=geography&size=15&seed=4242` a specific, shareable puzzle
- `index.html?set=animals&date=2026-03-01` the animals puzzle from that day
- `index.html?set=sports&mini=1` today's sports Mini

### Playing

- Tap or click a cell or a clue to select a word. The clue appears in the bar above the grid, with previous and next word buttons
- Type letters. The cursor skips filled cells and jumps to the next unfinished clue at the end of a word
- Arrow keys move along the current direction. Pressing an arrow across the direction switches it
- Enter, Space, or tapping the selected cell again switches between across and down
- Backspace clears and steps back; Delete clears the cell without moving. Tab leaves the grid
- **Check word** and **Check all** mark cells green or red without changing them
- **Reveal letter** and **Reveal word** fill in answers, shown in blue. Each revealed letter adds 20 seconds to the clock, shown beside the timer and in your result; checking is free
- **Pencil** (or the `.` key) enters tentative letters shown in grey. **Reset** clears every entry and restarts the timer, after asking
- **Random puzzle** loads a new puzzle number. Pick a date to play a past daily puzzle, then **Go**, or open **Archive** for a calendar of the current word set with solved days filled in
- **Difficulty**: easy shows wrong letters as you type, normal waits for you to check, hard hides check and reveal and swaps every clue for a harder, more oblique one. In every mode a full grid that is not correct shows a note saying so, without saying where
- **Print** gives a blank grid with clues. **Print answers** gives the key
- **Share** on the win banner copies your time and the puzzle link. **Stats** shows solves, streak and times
- **Dark** switches the theme; by default it follows your system setting

Progress, stats, mode and theme are saved in the browser. A daily streak counts consecutive days on which you solved that day's puzzle.

### Making your own puzzle

Open `create.html`, give the puzzle a title, and enter one word per line as `WORD: clue`. The page builds a link that contains the whole puzzle, so there is nothing to host or save. Anyone with the link gets the same grid. Words that do not fit the chosen grid size are left out.

## Adding words

Each word set is a JSON file in `words/`, listed in `words/index.json`:

```json
{
  "name": "Animals",
  "words": {
    "CAT": ["Purring house pet", "Whiskered animal with nine lives, they say"],
    "DOG": "Loyal companion that barks"
  },
  "hard": {
    "CAT": "Burglar or walk, with a nine-lives reputation",
    "DOG": "Hot one in a bun, or a hound"
  }
}
```

A word may have one clue or a list of clues. Which clue appears depends on the puzzle number, so the same word gets different clues on different days. An optional `hard` block holds a harder clue (or list) per word, shown in hard mode; a word without one keeps its normal clue there. The shipped sets have a hard clue for every word, and the tests insist on it. Words may contain letters only and must be no longer than the smallest grid you want to support. A set should hold well over the number of words a grid can fit, since the generator picks as many as fit; the shipped sets hold 90 to 135 words, and a 12×12 grid uses 15 to 20 of them. Bigger sets give more varied puzzles but take longer to generate, so the generator makes fewer attempts for them. Add the new file to `words/index.json` and it appears in the word set menu, and in the Mixed set, which is every listed set merged. The Mixed set is far bigger than a grid can use, so each puzzle draws a hand of 150 words chosen by the puzzle number.

## How It Works

1. `app.js` reads the URL, loads the word set, and seeds the random generator with the puzzle number
2. The longest word goes across the middle
3. Each remaining word is placed so that it crosses an existing word, choosing at random among legal positions. Words that do not fit are retried after each pass
4. The whole process runs a few hundred times and the layout that fits the most words wins
5. Words are numbered in reading order and handed to the game
6. `crossword.js` renders the grid, routes all typing through one hidden input so phone keyboards stay open, saves progress and detects completion

## Project Layout

- `index.html` and `app.js` the puzzle page and its bootstrap
- `create.html` and `create.js` the custom puzzle builder
- `generator.js` the generator: grid, placement rules, numbering, word sets, seeded random. Runs in the browser and in Node
- `crossword.js` the game: rendering, navigation, checking, persistence, stats
- `menu.js` desktop-only menus drawn over the native selects, which stay the form fields. Phones keep the system picker
- `crossword.css` styles, including dark mode and print
- `favicon.svg` the tab icon, with `favicon.ico` as the fallback for browsers that ignore SVG icons
- `words/*.json` word sets, listed in `words/index.json`
- `tests/generator.test.js` checks generated grids against crossword rules, seeding and word sets
- `tests/browser.test.js` drives the game in Chromium: typing, navigation, phones, creator, stats, modes, print. Also checks the static server: icons, malformed requests, directory traversal
- `tests/static-server.js` the small file server used by the tests and `npm run serve`. Serves the repository root, or a root passed to `start()`
- `.github/workflows/test.yml` runs the tests on every push; `pages.yml` deploys `main`

## Running the Tests

```sh
npm install
npx playwright install chromium
npm test
```

`npm test` runs a syntax check (`npm run lint`), the generator tests (`npm run test:generator`) and the browser tests (`npm run test:browser`). Each can be run on its own. The browser tests start the static server on a free port, so nothing else needs to be running. The browser tests treat any console error, failed request or 4xx/5xx response as a failure, so a missing asset fails the suite.

## License

This project is open source and available for personal and educational use.

## Contributing

Feel free to fork this project and submit pull requests with improvements or new features.
