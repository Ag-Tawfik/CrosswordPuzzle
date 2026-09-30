# Crossword Puzzle Generator

A PHP-based crossword puzzle generator that automatically creates a 12x12 interactive crossword puzzle from a list of words.

## Features

- Generates a 12x12 crossword puzzle from a predefined list of words
- Words are placed across and down and every word crosses at least one other word
- Standard crossword rules are enforced: no words touching side by side, no words joined end to end
- Clues are numbered in reading order (top to bottom, left to right)
- Words that cannot be fitted are listed on the page rather than dropped silently
- Displays descriptive clues
- **Interactive gameplay** with keyboard navigation and input validation
- **Word highlighting** shows the current word being worked on
- **Check answers** marks each filled cell right or wrong
- **Reveal solution** option for when you're stuck

## Requirements

- PHP 8.0 or later
- A web server (Apache, Nginx, etc.), or PHP's built-in server for local use
- Modern web browser with JavaScript enabled

## Installation

1. Clone or download this repository to your web server's document root
2. Navigate to the directory in your web browser
3. The crossword puzzle will be generated and displayed automatically

For a quick local look without a web server:

```sh
php -S localhost:8000
```

then open http://localhost:8000 in a browser.

## Usage

### Solving the Crossword

- Click on any cell or clue to begin
- Type letters to fill in the cells; the cursor advances along the highlighted word
- Use arrow keys to navigate between cells
- Press Enter or Space to switch between across and down
- Click on a clue to jump to that word

### Control Buttons

- **Check Answers**: Marks each filled cell green (correct) or red (incorrect). Your letters are left in place
- **Reveal Answers**: Shows the complete solution
- **Reset**: Clears all entries to start over

### Customizing Words

To customize the words used in the puzzle, edit the `$words` array in `index.php`:

```php
$words = ['YOUR', 'CUSTOM', 'WORDS', 'HERE'];
```

Words are uppercased automatically. Entries containing anything other than letters are ignored, as are duplicates.

You will also need to update the clues in the `generateClue()` function in `crossword.php`:

```php
function generateClue(string $word): string {
    $clues = [
        'YOUR' => 'Clue for your word',
        'CUSTOM' => 'Clue for custom',
        // Add more clues here
    ];

    return $clues[$word] ?? 'Definition for ' . strtolower($word);
}
```

Not every word list fits in every grid. Words that could not be placed are listed in a notice above the puzzle. Use a larger grid or a word list with more shared letters to fit more words.

### Customizing the Grid Size

To change the grid size, modify the `$rows` and `$columns` variables in `index.php`:

```php
$rows = 15;    // Change from 12 to your desired row count
$columns = 15; // Change from 12 to your desired column count
```

## How It Works

1. The application creates an empty grid
2. Places the longest word across the middle
3. Places each remaining word so that it crosses an existing word, choosing at random among the legal positions
4. Retries any words that did not fit after each pass, since new words open new crossings
5. Repeats the whole process a few hundred times and keeps the layout that fits the most words
6. Numbers the words in reading order and generates clue lists for Across and Down
7. Renders the grid with input fields for user interaction
8. Uses JavaScript to enable keyboard navigation and answer validation

## Project Layout

- `index.php` renders the page and holds the word list and grid size
- `crossword.php` holds the generator: grid, placement rules, numbering and clues
- `tests/generator_test.php` checks that generated grids obey crossword rules

## Running the Tests

```sh
php tests/generator_test.php
```

## Customization

You can customize the appearance of the crossword puzzle by modifying the CSS in the `<style>` section of `index.php`.

## License

This project is open source and available for personal and educational use.

## Contributing

Feel free to fork this project and submit pull requests with improvements or new features.
