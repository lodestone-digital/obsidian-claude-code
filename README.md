# Claude Code for Obsidian

Run [Claude Code](https://docs.anthropic.com/en/docs/claude-code) directly inside Obsidian as a side panel. Get an interactive terminal with full access to Claude's coding capabilities, right next to your notes.

## Features

- **Embedded terminal** - Claude Code runs in a real terminal emulator (xterm.js) within Obsidian's sidebar.
- **File context** - Send the path of your currently active file to Claude Code with one click.
- **Theme integration** - Terminal colors automatically match your Obsidian theme (light and dark).
- **Toolbar controls** - Restart sessions, send file paths, or close the panel from the toolbar.

## Commands

| Command | Description |
|---------|-------------|
| Open Claude Code | Open the Claude Code panel in the right sidebar |
| Restart Claude Code | Restart the current Claude Code session |
| Send current file to Claude Code | Send the active file's path to the terminal |
| Ask Claude Code about current file | Send a prompt asking Claude to explain the active file |
| New Claude Code session | Start a fresh Claude Code session |

## Requirements

- **Desktop only** - This plugin uses Node.js APIs and is not available on mobile.
- **Claude Code CLI** - You must have the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and available in your PATH.
- **Python 3** - Required for terminal emulation (PTY bridge).

## Disclosures

- **Network access** - Claude Code CLI connects to Anthropic's API to process requests. All network communication is handled by the Claude Code CLI, not this plugin directly. See [Anthropic's privacy policy](https://www.anthropic.com/privacy) for details.
- **External file access** - This plugin spawns the Claude Code CLI process with your vault's root directory as the working directory. Claude Code may read and modify files within and outside your vault as directed by your prompts.
- **External process** - This plugin spawns a Python process for terminal emulation and the Claude Code CLI as a child process.

## Installation

1. Open Obsidian Settings.
2. Go to Community plugins and disable Safe mode.
3. Click Browse and search for "Claude Code".
4. Install and enable the plugin.

## Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/lodestone-digital/obsidian-claude-code/releases/latest).
2. Create a folder called `claude-code` in your vault's `.obsidian/plugins/` directory.
3. Copy the downloaded files into that folder.
4. Reload Obsidian and enable the plugin in Settings > Community plugins.

## Building from source

```bash
npm install
npm run build
```

## License

[MIT](LICENSE)
