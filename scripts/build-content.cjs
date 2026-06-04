const path = require("path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");

esbuild.buildSync({
  entryPoints: [path.join(root, "src/content/index.ts")],
  outfile: path.join(root, "dist/assets/content.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome88"],
  sourcemap: true,
  logLevel: "info"
});

