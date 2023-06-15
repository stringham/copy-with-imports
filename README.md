## Features

When copying and pasting code between files, this extension will attempt to add new imports the file you are pasting into.

![demo](copy-with-imports.gif)

## Known Issues

## Release Notes

### 1.0.0

Update extension to work with vscode version 1.79.0+

### 0.1.5

Fix for projects that don't have a tsconfig.json.

### 0.1.3

Add formatting preferences: `copy-with-imports.space-between-braces` and `copy-with-imports.double-quotes`. Defaults to false but can be set in user settings.

### 0.1.2

Support es6 style imports when copying and pasting between JavaScript files

### 0.1.1

Fix relative paths in Windows.

### 0.1.0

Added the ability to use classic module resolution for relative imports. This will create new import statements relative to the project's tsconfig.json.

To enable, update your user preferences to have: `"copy-with-imports.path-relative-from-tsconfig": true`

### 0.0.11

Add imports to exisitng import statements if possible.

### 0.0.10

Added support for exported functions.

### 0.0.9

Fix bug with finding the position of the end of the last import.

### 0.0.8

Add extension icon

### 0.0.7

Add default key bindings for mac

### 0.0.5

Add support for exported interfaces, enums, type aliases, and modules

### 0.0.4

Auto import exported names from the file you copied from.

### 0.0.3

Add a newline after the last inserted import statement.

### 0.0.2

Added the ability to work with cut.

Combine new imports from the same module into one statement.
### 0.0.1

Initial release of Copy With Imports
