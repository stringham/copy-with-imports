# Change Log
All notable changes to the "copy-with-imports" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.0.4] - 2025-10-06
### Changed
- Converted all file I/O operations from synchronous to asynchronous to prevent blocking the VS Code event loop
- Improved performance when copying/pasting in large projects with complex TypeScript configurations

## [1.0.3] - Previous Release
- Initial release