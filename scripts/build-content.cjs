const path = require("path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");

// content script 必须打成单个 IIFE 文件，避免 MV3 加载时遇到 shared chunk import。
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
