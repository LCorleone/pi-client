import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/bootstrap.js"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: "dist/pi-bridge.cjs",
  banner: {
    js: 'var __import_meta_url = require("url").pathToFileURL(__filename).href;\n',
  },
  define: {
    "import.meta.url": "__import_meta_url",
  },
  logLevel: "info",
});

console.log("✅ Bridge built → dist/pi-bridge.cjs");
