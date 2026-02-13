# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kanbeasy is a minimal VS Code extension that provides a kanban board interface directly within VS Code. The extension is a wrapper that displays an external kanban application (https://darrenjaworski.github.io/kanbeasy/) in a VS Code WebView panel.

## Token Usage Optimization

This is a **very small codebase** with only 2 source files. Follow these strategies to minimize token usage:

### Source Code
- **Read directly, don't search**: The entire source code is just 2 files:
  - `src/extension.ts` (~65 lines) - Main extension logic
  - `src/test/extension.test.ts` (~16 lines) - Basic test suite
- Read these files directly with the Read tool instead of using Glob/Grep to search

### Configuration Files
- **Key config files** (read directly as needed):
  - `package.json` - Scripts, dependencies, extension metadata
  - `tsconfig.json` - TypeScript configuration
  - `eslint.config.mjs` - Linting rules
  - `esbuild.js` - Build configuration
  - `.vscode/launch.json` - Debug configuration

### Avoid node_modules
- **Never search or glob node_modules** - it contains 300+ packages
- When using Glob/Grep, always exclude node_modules:
  - Use specific paths like `src/**/*.ts` instead of `**/*.ts`
  - Or use patterns that naturally exclude it like `*.json` in root

### Search Strategy
- Use specific file paths when you know what you're looking for
- Example: Read `src/extension.ts` directly instead of globbing for `**/*.ts`
- The codebase is small enough that reading all source files uses fewer tokens than searching

## Development Commands

```bash
# Install dependencies
npm install

# Development workflow
npm run watch          # Watch for changes (runs esbuild + tsc in watch mode)
npm run compile        # Full compile (type check + lint + build)
npm run check-types    # Type check only (no emit)
npm run lint           # Run ESLint

# Testing
npm run test           # Run all tests with vscode-test

# Packaging
npm run package        # Create production build (minified, no sourcemaps)
npm run vsce-package   # Create .vsix extension package
```

## Architecture

### Extension Structure

The extension follows a simple architecture:

1. **Single Entry Point** (`src/extension.ts`):
   - `activate()`: Registers the command and creates the status bar item
   - `deactivate()`: Currently a no-op

2. **WebView Pattern**:
   - Creates a singleton WebViewPanel that displays an iframe
   - The iframe loads the external kanban app from https://darrenjaworski.github.io/kanbeasy/
   - Panel configuration:
     - `enableScripts: true` - Allows JavaScript in the webview
     - `retainContextWhenHidden: true` - Preserves state when panel is hidden
   - Reuses the same panel instance if it already exists (via `reveal()`)

3. **Status Bar Integration**:
   - Shows a project icon (`$(project)`) in the status bar
   - Clicking the icon triggers `kanbeasy.openBoard` command

### Build System

- **Bundler**: esbuild (configured in `esbuild.js`)
- **Entry point**: `src/extension.ts`
- **Output**: `dist/extension.js` (CommonJS format)
- **External dependencies**: `vscode` module is marked as external
- **Production builds**: Minified with no sourcemaps
- **Development builds**: Include sourcemaps

### TypeScript Configuration

- **Module system**: Node16
- **Target**: ES2022
- **Strict mode**: Enabled
- **Root directory**: `src/`

## Testing

The project uses VS Code's testing framework (`@vscode/test-electron`):
- Test files located in `src/test/`
- Run tests with `npm run test`
- Tests are compiled to `out/` directory before running

## Publishing

### Versioning

Follow **Semantic Versioning** (semver: MAJOR.MINOR.PATCH):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backwards compatible) - use for `feat` commits
- **PATCH**: Bug fixes and minor changes - use for `fix` commits

### Release Process

When creating a new release:

1. **Bump version in `package.json`** according to semver:
   - New feature (feat): Minor bump (1.0.2 → 1.1.0)
   - Bug fix (fix): Patch bump (1.0.2 → 1.0.3)
   - Breaking change: Major bump (1.0.2 → 2.0.0)

2. **Update `CHANGELOG.md`**:
   - Add new version heading with date
   - List all changes since last release
   - Categorize by type (Added, Fixed, Changed, etc.)

3. **Update `README.md`**:
   - Update version badges if applicable
   - Add new features to Features section
   - Update screenshots if UI changed

4. **Package the extension**:
   - Run `npm run vsce-package` to create the .vsix file
   - Publish to VS Code marketplace or distribute the .vsix file

## Code Style

ESLint configuration (`eslint.config.mjs`):
- TypeScript-specific rules for naming conventions
- Requires curly braces for control statements
- Enforces strict equality (`===`)
- Requires semicolons
- Warns on throwing literals (should throw Error objects)

## Git Conventions

Use **Conventional Commits** style for all commit messages:

### Format
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Common Types
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Changes to build process, dependencies, or tooling

### Examples
```
feat: add sidebar icon to activity bar
fix: resolve webview panel toggle issue
docs: update README with installation instructions
chore: update dependencies to latest versions
refactor: simplify webview provider implementation
```

## Key Implementation Details

- The extension iframe URL is hardcoded to `https://darrenjaworski.github.io/kanbeasy/`
- The WebView panel ID is `"kanbeasyBoard"`
- Command ID is `"kanbeasy.openBoard"`
- Status bar icon uses VS Code's built-in `$(project)` codicon
