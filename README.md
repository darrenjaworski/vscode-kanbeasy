# Kanbeasy

A minimal kanban board within VS Code. Kanbeasy is the easiest and simplest way to get work done.

## Installation

Install this extension from the [VS Code marketplace](https://marketplace.visualstudio.com/items?itemName=DarrenJaworski.kanbeasy).

OR

With VS Code open, search for `kanbeasy` in the extension panel (`Ctrl+Shift+X` on Windows/Linux or `Cmd(⌘)+Shift+X` on MacOS) and click install.

OR

With VS Code open, launch VS Code Quick Open (`Ctrl+P` on Windows/Linux or `Cmd(⌘)+P` on MacOS), paste the following command, and press enter.

`ext install darrenjaworski.kanbeasy`

## Features

![Kanbeasy](https://raw.githubusercontent.com/darrenjaworski/vscode-kanbeasy/refs/heads/main/kanbeasy-preview.png)

Kanban is the simplest possible methodology for organizing your work. This extension is an ultra simple kanban board for all your tasks. Define your own columns and cards. Drag and drop cards between columns. Easily manage all your ongoing work from within VS Code.

### Quick Access

- **Activity bar sidebar icon** - Click the Kanbeasy icon in the activity bar (left sidebar) for instant access
- **Toggle functionality** - Open and close your kanban board with a single click
- **Auto-close sidebar** - Sidebar automatically closes when board opens, maximizing your workspace
- **Status bar integration** - Quick access button in the status bar (bottom of VS Code)

### Seamless Integration

- Opens in the main editor area for full workspace utilization
- Retains board state when switching between views
- Works alongside your code without disrupting your workflow

### Copilot / MCP Integration

Kanbeasy ships an **MCP server** ("Kanbeasy Board") so you can manage your board by talking to GitHub Copilot in plain language — _"add a card to In Progress to fix the login bug"_, _"what's on my board?"_, _"move card 12 to Done"_.

#### Requirements

- **VS Code 1.103+** with the **GitHub Copilot** and **GitHub Copilot Chat** extensions.
- Copilot Chat used in **Agent mode** (the mode that can call tools).

No setup is needed beyond installing Kanbeasy — VS Code discovers the bundled MCP server automatically.

#### How to use it

1. Open the **Copilot Chat** view and switch the chat mode selector to **Agent**.
2. Just ask for what you want. Copilot picks the right Kanbeasy tool and, by default, shows you a confirmation before each change.
3. You **don't** need the board panel open — Copilot can read and edit the board at any time. If the panel _is_ open, changes appear in it live.

The first time Copilot uses the server you may be asked to confirm/trust the "Kanbeasy Board" tools. You can see and manage them via **MCP: List Servers** in the Command Palette.

#### Example prompts

- "Show me everything on my Kanbeasy board."
- "Add a card titled 'Write release notes' to the To Do column, due 2026-07-01."
- "Search my cards for anything mentioning 'auth'."
- "Move card #7 to In Progress."
- "Rename the 'Done' column to 'Shipped'."
- "Archive card #3." (then later) "Restore card #3 into To Do."

#### What Copilot can do

- **Read** the board; list and search cards
- **Add, update, move, archive, and restore** cards
- **Add, rename, and remove** columns

#### Good to know

- **"Delete" is recoverable.** Deleting a card _archives_ it (use "restore" to bring it back). Removing a column archives its cards first. Copilot is not given the destructive "reset board" / "empty archive" actions.
- **Cards are referenced by number** (the `#3` shown on each card), so you can say "move card 3" naturally.
- **The board is global** across all your workspaces and owned by the extension, which is why Copilot can work with it whether or not the panel is open.
- **You stay in control** — VS Code Agent mode asks you to confirm each edit before it's applied.

## Requirements

This extension has no dependencies.

## Extension Settings

This extension contributes the following settings:

## Commands

- **Toggle Kanbeasy Board** (`kanbeasy.toggleBoard`) - Open or close the kanban board in the main editor area
- **Open Kanbeasy Board** (`kanbeasy.openBoard`) - Legacy command for opening the board

## Known Issues

[Please report any bugs or issues on the extension's Github repo.](https://github.com/darrenjaworski/vscode-kanbeasy/issues/new)

## Release Notes

### 1.2.2

- Exclude `CLAUDE.md` from the published `.vsix` package
- Remove unsupported Visual Studio Marketplace badges from README

### 1.2.1

- Security: patch transitive dev-dependency advisories (no runtime changes)

### 1.2.0

- Status bar item now displays "Kanbeasy" text label instead of layout icon

### 1.1.2

- Updated documentation with comprehensive installation instructions and feature descriptions

### 1.1.1

- New extension icon with purple kanban column design
- White monochrome activity bar sidebar icon for better theme compatibility

### 1.1.0

**New Features:**

- Activity bar sidebar icon for quick access
- Toggle functionality - open/close board with single click
- Sidebar automatically closes when board opens
- Board now opens in main editor area for better workspace utilization
- Welcome view in sidebar with clear call-to-action
- Updated status bar icon for visual consistency

### 1.0.2

- update docs

### 1.0.1

- update docs

### 1.0.0

- wrapper for kanbeasy
- status bar icon
- command to open kanbeasy
