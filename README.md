# Crossword Puzzle Generator

A PHP-based crossword puzzle generator that automatically creates a 12x12 interactive crossword puzzle from a list of words.

## Features

- Generates a 12x12 crossword puzzle from a predefined list of words
- Words are placed in both horizontal and across directions
- Each word is automatically numbered
- Words are properly isolated with black cells between them
- Displays descriptive clues
- **Interactive gameplay** with keyboard navigation and input validation
- **Word highlighting** shows the current word being worked on
- **Check answers** functionality to validate user inputs
- **Reveal solution** option for when you're stuck

## Requirements

- PHP 8.4.6
- A web server (Apache, Nginx, etc.)
- Modern web browser with JavaScript enabled

## Installation

1. Clone or download this repository to your web server's document root
2. Navigate to the directory in your web browser
3. The crossword puzzle will be generated and displayed automatically

## Usage

### Solving the Crossword

- Click on any cell or clue to begin
- Type letters to fill in the cells
- Use arrow keys to navigate between cells
- Press Tab to switch between across and down orientation
- Click on a clue to jump to that word

### Control Buttons

- **Check Answers**: Validates your entries, keeps correct letters and clears incorrect ones
- **Reveal Answers**: Shows the complete solution
- **Reset**: Clears all entries to start over

### Customizing Words

To customize the words used in the puzzle, edit the `$words` array in `index.php`:

```php
$words = ['YOUR', 'CUSTOM', 'WORDS', 'HERE'];
```

You will also need to update the clues in the `generateClue()` function:

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
6. Renders the grid with input fields for user interaction
7. Uses JavaScript to enable keyboard navigation and answer validation

## Customization

You can customize the appearance of the crossword puzzle by modifying the CSS in the `<style>` section of `index.php`.

## License

This project is open source and available for personal and educational use.

## Contributing

Feel free to fork this project and submit pull requests with improvements or new features. 