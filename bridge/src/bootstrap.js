#!/usr/bin/env node
// Bootstrap — sets CWD BEFORE any SDK imports to prevent package.json lookup in exe folder
// This MUST be the entry point for the SEA build
try { process.chdir(require("node:os").tmpdir()); } catch {}
require("./index.js");
