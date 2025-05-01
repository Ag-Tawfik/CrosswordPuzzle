# Crossword Puzzle Generator

A PHP-based crossword puzzle generator that automatically creates a 12x12 crossword puzzle from a list of words.

## Features

- Generates a 12x12 crossword puzzle from a predefined list of words
- Words are placed in both horizontal and across directions
- Each word is automatically numbered
- Words are properly isolated with black cells between them
- Displays clues for both "Across" and "Down" words

## Requirements

- PHP 7.0 or higher
- A web server (Apache, Nginx, etc.)

## Installation

1. Clone or download this repository to your web server's document root
2. Navigate to the directory in your web browser
3. The crossword puzzle will be generated and displayed automatically

## Usage

The application will generate a crossword puzzle upon loading. The current version uses a predefined list of words:

```php
$words = ['CAT', 'DOG', 'MOUSE', 'FISH', 'BIRD', 'LION', 'TIGER', 'BEAR', 'MONKEY', 'COW', 'PIG', 'SHEEP', 'HUMAN'];
```

### Customizing Words

To customize the words used in the puzzle, edit the `$words` array in `index.php`:

```php
$words = ['YOUR', 'CUSTOM', 'WORDS', 'HERE'];
```

### Customizing the Grid Size

To change the grid size, modify the `$rows` and `$columns` variables in `index.php`:

```php
$rows = 15;    // Change from 12 to your desired row count
$columns = 15; // Change from 12 to your desired column count
```

## How It Works

1. The application creates an empty grid
2. Places the first (usually longest) word in the middle horizontally
3. Attempts to place remaining words with intersections to existing words
4. If intersection placement fails, tries random placement
5. Numbers each word and generates clue lists for Across and Down words

## Customization

You can customize the appearance of the crossword puzzle by modifying the CSS in the `<style>` section of `index.php`.

## License

This project is open source and available for personal and educational use.

## Contributing

Feel free to fork this project and submit pull requests with improvements or new features. 