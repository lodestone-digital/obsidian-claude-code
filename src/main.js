const { Plugin, ItemView, Notice, setIcon, addIcon } = require("obsidian");
const { Terminal } = require("@xterm/xterm");
const { FitAddon } = require("@xterm/addon-fit");
const { WebLinksAddon } = require("@xterm/addon-web-links");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

const VIEW_TYPE = "claude-code-terminal";
const XTERM_CSS_CONTENT = XTERM_CSS;

// Claude logomark — from official Claude AI SVG, group transform baked in
const CLAUDE_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="2 15 134 134" fill="currentColor"><path d="m 29.05,98.54 29.14,-16.35 0.49,-1.42 -0.49,-0.79 h -1.42 l -4.87,-0.3 -16.65,-0.45 -14.44,-0.6 -13.99,-0.75 -3.52,-0.75 -3.3,-4.35 0.34,-2.17 2.96,-1.99 4.24,0.37 9.37,0.64 14.06,0.97 10.2,0.6 15.11,1.57 h 2.4 l 0.34,-0.97 -0.82,-0.6 -0.64,-0.6 -14.55,-9.86 -15.75,-10.42 -8.25,-6 -4.46,-3.04 -2.25,-2.85 -0.97,-6.22 4.05,-4.46 5.44,0.37 1.39,0.37 5.51,4.24 11.77,9.11 15.37,11.32 2.25,1.87 0.9,-0.64 0.11,-0.45 -1.01,-1.69 -8.36,-15.11 -8.92,-15.37 -3.97,-6.37 -1.05,-3.82 c -0.37,-1.57 -0.64,-2.89 -0.64,-4.5 l 4.61,-6.26 2.55,-0.82 6.15,0.82 2.59,2.25 3.82,8.74 6.19,13.76 9.6,18.71 2.81,5.55 1.5,5.14 0.56,1.57 h 0.97 v -0.9 l 0.79,-10.54 1.46,-12.94 1.42,-16.65 0.49,-4.69 2.32,-5.62 4.61,-3.04 3.6,1.72 2.96,4.24 -0.41,2.74 -1.76,11.44 -3.45,17.92 -2.25,12 h 1.31 l 1.5,-1.5 6.07,-8.06 10.2,-12.75 4.5,-5.06 5.25,-5.59 3.37,-2.66 h 6.37 l 4.69,6.97 -2.1,7.2 -6.56,8.32 -5.44,7.05 -7.8,10.5 -4.87,8.4 0.45,0.67 1.16,-0.11 17.62,-3.75 9.52,-1.72 11.36,-1.95 5.14,2.4 0.56,2.44 -2.02,4.99 -12.15,3 -14.25,2.85 -21.22,5.02 -0.26,0.19 0.3,0.37 9.56,0.9 4.09,0.22 h 10.01 l 18.64,1.39 4.87,3.22 2.92,3.94 -0.49,3 -7.5,3.82 -10.12,-2.4 -23.62,-5.62 -8.1,-2.02 h -1.12 v 0.67 l 6.75,6.6 12.37,11.17 15.49,14.4 0.79,3.56 -1.99,2.81 -2.1,-0.3 -13.61,-10.24 -5.25,-4.61 -11.89,-10.01 h -0.79 v 1.05 l 2.74,4.01 14.47,21.75 0.75,6.67 -1.05,2.17 -3.75,1.31 -4.12,-0.75 -8.47,-11.89 -8.74,-13.39 -7.05,-12 -0.86,0.49 -4.16,44.81 -1.95,2.29 -4.5,1.72 -3.75,-2.85 -1.99,-4.61 1.99,-9.11 2.4,-11.89 1.95,-9.45 1.76,-11.74 1.05,-3.9 -0.07,-0.26 -0.86,0.11 -8.85,12.15 -13.46,18.19 -10.65,11.4 -2.55,1.01 -4.42,-2.29 0.41,-4.09 2.47,-3.64 14.74,-18.75 8.89,-11.62 5.74,-6.71 -0.04,-0.97 h -0.34 l -39.15,25.42 -6.97,0.9 -3,-2.81 0.37,-4.61 1.42,-1.5 11.77,-8.1 -0.04,0.04 z"/></svg>`;

// Python PTY bridge - creates a real pseudoterminal and forwards I/O.
// Resize via custom escape: ESC ] 9 ; rows ; cols BEL
const PYTHON_PTY_SCRIPT = String.raw`
import pty, os, sys, select, signal, struct, fcntl, termios, threading, errno

RESIZE_PREFIX = b'\x1b]9;'
RESIZE_SUFFIX = ord(b'\x07')

def set_winsize(fd, rows, cols):
    s = struct.pack('HHHH', rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, s)

def main():
    cmd = sys.argv[1:]
    if not cmd:
        sys.exit(1)

    rows = int(os.environ.get('LINES', '24'))
    cols = int(os.environ.get('COLUMNS', '80'))

    pid, master_fd = pty.fork()

    if pid == 0:
        # Exec through an interactive login shell so .zshrc is sourced.
        # This ensures nvm, node, npx, homebrew etc. are available for MCP servers.
        shell = os.environ.get('SHELL', '/bin/zsh')
        shell_name = os.path.basename(shell)
        cmd_str = ' '.join(cmd)
        os.execvp(shell, [shell_name, '-l', '-i', '-c', cmd_str])
        sys.exit(1)

    set_winsize(master_fd, rows, cols)

    stdout_fd = sys.stdout.fileno()
    stdin_fd = sys.stdin.fileno()
    alive = True

    # Thread: read from PTY master and write to stdout
    def read_pty():
        nonlocal alive
        while alive:
            try:
                data = os.read(master_fd, 65536)
                if not data:
                    break
                os.write(stdout_fd, data)
            except OSError:
                break
        alive = False

    t = threading.Thread(target=read_pty, daemon=True)
    t.start()

    # Main thread: read from stdin and write to PTY master
    buf = b''
    try:
        while alive:
            try:
                data = os.read(stdin_fd, 65536)
                if not data:
                    break
            except OSError:
                break

            buf += data
            # Process buffer: extract resize escapes, forward the rest
            out = b''
            i = 0
            while i < len(buf):
                # Look for resize escape: ESC ] 9 ; rows ; cols BEL
                if buf[i:i+4] == RESIZE_PREFIX:
                    bel = buf.find(b'\x07', i + 4)
                    if bel == -1:
                        # Incomplete escape - keep in buffer for next read
                        break
                    payload = buf[i+4:bel]
                    try:
                        parts = payload.decode().split(';')
                        if len(parts) == 2:
                            r, c = int(parts[0]), int(parts[1])
                            set_winsize(master_fd, r, c)
                            os.kill(pid, signal.SIGWINCH)
                    except (ValueError, OSError):
                        pass
                    i = bel + 1
                else:
                    out += buf[i:i+1]
                    i += 1

            buf = buf[i:]

            if out:
                try:
                    os.write(master_fd, out)
                except OSError:
                    break
    finally:
        alive = False
        os.close(master_fd)
        try:
            _, status = os.waitpid(pid, 0)
            code = os.WEXITSTATUS(status) if os.WIFEXITED(status) else 1
        except ChildProcessError:
            code = 0
        sys.exit(code)

if __name__ == '__main__':
    main()
`;

class ClaudeCodeView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.terminal = null;
    this.fitAddon = null;
    this.process = null;
    this.styleEl = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return "Claude Code";
  }

  getIcon() {
    return "claude-logo";
  }

  async onOpen() {
    const container = this.contentEl;
    container.empty();
    container.addClass("claude-code-terminal-container");

    if (!document.getElementById("claude-code-xterm-css")) {
      this.styleEl = document.createElement("style");
      this.styleEl.id = "claude-code-xterm-css";
      this.styleEl.textContent = XTERM_CSS_CONTENT;
      document.head.appendChild(this.styleEl);
    }

    // Toolbar
    const toolbar = container.createDiv({ cls: "claude-code-toolbar" });
    const titleEl = toolbar.createSpan({ cls: "claude-code-title" });
    setIcon(titleEl.createSpan(), "claude-logo");
    titleEl.createSpan({ text: " Claude Code" });

    const actions = toolbar.createDiv({ cls: "claude-code-actions" });

    const restartBtn = actions.createEl("button", {
      cls: "claude-code-toolbar-btn",
      attr: { "aria-label": "Restart" },
    });
    setIcon(restartBtn, "refresh-cw");
    restartBtn.addEventListener("click", () => this.restart());

    const sendFileBtn = actions.createEl("button", {
      cls: "claude-code-toolbar-btn",
      attr: { "aria-label": "Send current file path" },
    });
    setIcon(sendFileBtn, "file-input");
    sendFileBtn.addEventListener("click", () => this.sendCurrentFile());

    const closeBtn = actions.createEl("button", {
      cls: "claude-code-toolbar-btn",
      attr: { "aria-label": "Close" },
    });
    setIcon(closeBtn, "x");
    closeBtn.addEventListener("click", () => {
      this.leaf.detach();
    });

    // Terminal container
    const termContainer = container.createDiv({ cls: "claude-code-term" });

    this.terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: 13,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      lineHeight: 1.3,
      scrollback: 10000,
      allowProposedApi: true,
      theme: this.getTheme(),
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new WebLinksAddon());

    this.terminal.open(termContainer);

    setTimeout(() => this.fitAddon.fit(), 50);

    this.resizeObserver = new ResizeObserver(() => {
      if (this.fitAddon) {
        try { this.fitAddon.fit(); } catch (e) {}
      }
    });
    this.resizeObserver.observe(termContainer);

    // Forward terminal input to the process stdin
    this.terminal.onData((data) => {
      if (this.process && this.process.stdin && !this.process.stdin.destroyed) {
        this.process.stdin.write(data);
      }
    });

    // Send resize escape to the Python PTY bridge: ESC ] 9 ; rows ; cols BEL
    this.terminal.onResize(({ cols, rows }) => {
      if (this.process && this.process.stdin && !this.process.stdin.destroyed) {
        this.process.stdin.write(`\x1b]9;${rows};${cols}\x07`);
      }
    });

    this.spawnClaude();

    this.themeObserver = new MutationObserver(() => {
      if (this.terminal) {
        this.terminal.options.theme = this.getTheme();
      }
    });
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  getTheme() {
    const style = getComputedStyle(document.body);
    const isDark = document.body.classList.contains("theme-dark");
    return {
      background: style.getPropertyValue("--background-primary").trim() || (isDark ? "#1e1e1e" : "#ffffff"),
      foreground: style.getPropertyValue("--text-normal").trim() || (isDark ? "#d4d4d4" : "#1e1e1e"),
      cursor: style.getPropertyValue("--text-accent").trim() || (isDark ? "#f97316" : "#f97316"),
      cursorAccent: style.getPropertyValue("--background-primary").trim() || (isDark ? "#1e1e1e" : "#ffffff"),
      selectionBackground: isDark ? "#264f7840" : "#add6ff80",
      black: isDark ? "#1e1e1e" : "#000000",
      red: "#e06c75",
      green: "#98c379",
      yellow: "#e5c07b",
      blue: "#61afef",
      magenta: "#c678dd",
      cyan: "#56b6c2",
      white: isDark ? "#d4d4d4" : "#1e1e1e",
      brightBlack: "#5c6370",
      brightRed: "#e06c75",
      brightGreen: "#98c379",
      brightYellow: "#e5c07b",
      brightBlue: "#61afef",
      brightMagenta: "#c678dd",
      brightCyan: "#56b6c2",
      brightWhite: "#ffffff",
    };
  }

  spawnClaude(args = []) {
    if (this.process) {
      this.killProcess();
    }

    const vaultPath = this.app.vault.adapter.basePath;
    const cols = this.terminal ? this.terminal.cols : 80;
    const rows = this.terminal ? this.terminal.rows : 24;

    const claudePath = this.findClaude();
    if (!claudePath) {
      if (this.terminal) {
        this.terminal.writeln("\x1b[31mError: 'claude' not found in PATH.\x1b[0m");
        this.terminal.writeln("\x1b[33mMake sure Claude Code CLI is installed.\x1b[0m");
      }
      return;
    }

    const pythonPath = this.findPython();
    if (!pythonPath) {
      if (this.terminal) {
        this.terminal.writeln("\x1b[31mError: Python 3 not found.\x1b[0m");
        this.terminal.writeln("\x1b[33mPython is needed for terminal emulation.\x1b[0m");
      }
      return;
    }

    // Write the PTY bridge script to a temp file
    const tmpDir = os.tmpdir();
    this.ptyScriptPath = path.join(tmpDir, "claude-code-pty-bridge.py");
    fs.writeFileSync(this.ptyScriptPath, PYTHON_PTY_SCRIPT);

    // Ensure ~/.local/bin and common paths are in PATH
    const homedir = os.homedir();
    const extraPaths = [
      path.join(homedir, ".local", "bin"),
      path.join(homedir, ".npm-global", "bin"),
      "/usr/local/bin",
      "/opt/homebrew/bin",
    ];
    const currentPath = process.env.PATH || "";
    const fullPath = [...extraPaths, ...currentPath.split(path.delimiter)]
      .filter((v, i, a) => a.indexOf(v) === i) // dedupe
      .join(path.delimiter);

    try {
      this.process = spawn(pythonPath, ["-u", this.ptyScriptPath, claudePath, ...args], {
        cwd: vaultPath,
        env: {
          ...process.env,
          PATH: fullPath,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
          COLUMNS: String(cols),
          LINES: String(rows),
          LANG: process.env.LANG || "en_US.UTF-8",
          PYTHONUNBUFFERED: "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.process.stdout.on("data", (data) => {
        if (this.terminal) {
          this.terminal.write(new Uint8Array(data));
        }
      });

      this.process.stderr.on("data", (data) => {
        if (this.terminal) {
          this.terminal.write(new Uint8Array(data));
        }
      });

      this.process.on("close", (code) => {
        if (this.terminal) {
          this.terminal.writeln("");
          this.terminal.writeln(
            `\x1b[90m[Claude Code exited with code ${code}. Press Restart to relaunch.]\x1b[0m`
          );
        }
        this.process = null;
      });

      this.process.on("error", (err) => {
        if (this.terminal) {
          this.terminal.writeln(`\x1b[31mError: ${err.message}\x1b[0m`);
        }
        this.process = null;
      });

      this.terminal.focus();
    } catch (err) {
      if (this.terminal) {
        this.terminal.writeln(`\x1b[31mFailed to start: ${err.message}\x1b[0m`);
      }
    }
  }

  findClaude() {
    const candidates = [
      path.join(os.homedir(), ".local", "bin", "claude"),
      path.join(os.homedir(), ".npm-global", "bin", "claude"),
      "/usr/local/bin/claude",
      "/opt/homebrew/bin/claude",
    ];
    const pathDirs = (process.env.PATH || "").split(path.delimiter);
    for (const dir of pathDirs) {
      candidates.push(path.join(dir, "claude"));
    }
    for (const candidate of candidates) {
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch (e) {}
    }
    return null;
  }

  findPython() {
    const names = ["python3", "python"];
    const pathDirs = (process.env.PATH || "").split(path.delimiter);
    for (const name of names) {
      for (const dir of pathDirs) {
        const candidate = path.join(dir, name);
        try {
          fs.accessSync(candidate, fs.constants.X_OK);
          return candidate;
        } catch (e) {}
      }
    }
    return null;
  }

  killProcess() {
    if (this.process) {
      this.process.kill("SIGTERM");
      const proc = this.process;
      setTimeout(() => {
        try { if (!proc.killed) proc.kill("SIGKILL"); } catch (e) {}
      }, 2000);
      this.process = null;
    }
  }

  restart() {
    this.killProcess();
    if (this.terminal) {
      this.terminal.clear();
    }
    this.spawnClaude();
  }

  sendCurrentFile() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("No active file");
      return;
    }
    if (this.process && this.process.stdin && !this.process.stdin.destroyed) {
      this.process.stdin.write(file.path);
      this.terminal.focus();
      new Notice(`Sent: ${file.basename}`);
    }
  }

  async onClose() {
    this.killProcess();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.themeObserver) this.themeObserver.disconnect();
    if (this.terminal) { this.terminal.dispose(); this.terminal = null; }
    if (this.styleEl) { this.styleEl.remove(); this.styleEl = null; }
    // Clean up temp script
    if (this.ptyScriptPath) {
      try { fs.unlinkSync(this.ptyScriptPath); } catch (e) {}
    }
  }
}

class ClaudeCodePlugin extends Plugin {
  async onload() {
    addIcon("claude-logo", CLAUDE_LOGO_SVG);
    this.registerView(VIEW_TYPE, (leaf) => new ClaudeCodeView(leaf, this));

    this.addRibbonIcon("claude-logo", "Claude Code", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open",
      name: "Open Claude Code",
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: "restart",
      name: "Restart Claude Code",
      callback: async () => {
        const view = await this.getView();
        if (view) view.restart();
      },
    });

    this.addCommand({
      id: "send-file",
      name: "Send current file to Claude Code",
      callback: async () => {
        const view = await this.getView();
        if (view) view.sendCurrentFile();
        else {
          const v = await this.activateView();
          setTimeout(() => v.sendCurrentFile(), 1500);
        }
      },
    });

    this.addCommand({
      id: "ask-about-file",
      name: "Ask Claude Code about current file",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) { new Notice("No active file"); return; }
        const view = await this.activateView();
        if (view && view.process && view.process.stdin && !view.process.stdin.destroyed) {
          view.process.stdin.write(`Look at the file ${file.path} and tell me what it does.\n`);
          view.terminal.focus();
        }
      },
    });

    this.addCommand({
      id: "new-session",
      name: "New Claude Code session",
      callback: async () => {
        const view = await this.activateView();
        if (view) {
          view.killProcess();
          view.terminal.clear();
          view.spawnClaude();
        }
      },
    });
  }

  onunload() {
  }

  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return existing[0].view;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
    return leaf.view;
  }

  async getView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) return existing[0].view;
    return null;
  }
}

module.exports = ClaudeCodePlugin;
