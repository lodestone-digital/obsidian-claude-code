import esbuild from "esbuild";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const xtermCss = readFileSync(
  join(__dirname, "node_modules", "@xterm", "xterm", "css", "xterm.css"),
  "utf8"
);

esbuild.build({
  entryPoints: ["src/main.js"],
  bundle: true,
  outfile: "main.js",
  format: "cjs",
  platform: "node",
  target: "es2020",
  external: ["obsidian", "electron"],
  define: {
    XTERM_CSS: JSON.stringify(xtermCss),
  },
  logLevel: "info",
});
