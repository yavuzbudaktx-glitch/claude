/**
 * Builds dist/discipline-quest.html: one self-contained page (app JS + CSS inlined,
 * React from cdnjs) that runs anywhere, including as a claude.ai Artifact.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build, type Plugin } from "esbuild";

const root = path.resolve(__dirname, "..");
const REACT = "18.3.1";

// Use the page's global React/ReactDOM (loaded from cdnjs) instead of bundling them.
const reactGlobals: Plugin = {
  name: "react-globals",
  setup(b) {
    const map: Record<string, string> = {
      react: "module.exports = window.React;",
      "react-dom": "module.exports = window.ReactDOM;",
      "react-dom/client": "module.exports = window.ReactDOM;",
      "react/jsx-runtime": `
        const R = window.React;
        const make = (spread) => (type, props, key) => {
          const { children, ...rest } = props || {};
          if (key !== undefined) rest.key = key;
          if (children === undefined) return R.createElement(type, rest);
          return spread ? R.createElement(type, rest, ...children) : R.createElement(type, rest, children);
        };
        module.exports = { Fragment: R.Fragment, jsx: make(false), jsxs: make(true) };`,
    };
    b.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (a) => (map[a.path] ? { path: a.path, namespace: "rg" } : undefined));
    b.onLoad({ filter: /.*/, namespace: "rg" }, (a) => ({ contents: map[a.path], loader: "js" }));
  },
};

async function main() {
  const js = await build({
    entryPoints: [path.join(root, "src/standalone.tsx")],
    bundle: true,
    write: false,
    minify: true,
    format: "iife",
    target: "es2020",
    jsx: "automatic",
    alias: { "@": path.join(root, "src") },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [reactGlobals],
  });
  const code = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

  const css = execFileSync(
    path.join(root, "node_modules/.bin/tailwindcss"),
    ["-c", "tailwind.config.ts", "-i", "src/app/globals.css", "--minify"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );

  const html = `<title>Discipline Quest</title>
<meta name="theme-color" content="#161a2e">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap">
<style>:root{color-scheme:dark}${css}</style>
<div id="root"><div style="padding:32px;text-align:center;color:#fff;font-family:monospace">Loading room…</div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/${REACT}/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/${REACT}/umd/react-dom.production.min.js"></script>
<script>${code}</script>
`;
  mkdirSync(path.join(root, "dist"), { recursive: true });
  const out = path.join(root, "dist/discipline-quest.html");
  writeFileSync(out, html);
  console.log(`wrote ${path.relative(root, out)} (${(html.length / 1024).toFixed(0)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
