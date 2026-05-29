#!/usr/bin/env node
// Bridge entry point — reads JSONL from stdin, writes JSONL events to stdout

import * as readline from "node:readline";
import {
  parseCommand,
  writeEvent,
  type BridgeCommand,
} from "./protocol.js";
import * as agent from "./agent.js";
import { getConfig, setConfig, type BridgeConfig } from "./config.js";

// ── Main loop ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Signal readiness
  writeEvent({ type: "bridge_ready" });

  let commandQueue = Promise.resolve();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on("line", (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    commandQueue = commandQueue.then(() => handleCommandLine(trimmed));
  });

  rl.on("close", () => {
    // stdin closed — shutdown
    agent.destroySession().catch(() => {}).finally(() => process.exit(0));
  });

  // Keep process alive
  await new Promise<void>(() => {});
}

// ── Command dispatch ───────────────────────────────────────────────

/** Parse a line and dispatch to the appropriate handler */
async function handleCommandLine(line: string): Promise<void> {
  const cmd = parseCommand(line);
  if (!cmd) {
    writeEvent({
      type: "bridge_error",
      error: `Invalid command: ${line}`,
    });
    return;
  }
  await handleCommand(cmd);
}

async function handleCommand(cmd: BridgeCommand): Promise<void> {
  try {
    switch (cmd.type) {
      case "ping":
        writeEvent({
          type: "response",
          id: cmd.id,
          success: true,
          data: {},
        });
        break;

      case "init":
        await agent.initSession(cmd.cwd, cmd.sessionId);
        writeEvent({
          type: "response",
          id: cmd.id,
          success: true,
          data: agent.getState(),
        });
        break;

      case "prompt":
        await agent.sendPrompt(cmd.message, cmd.images);
        writeEvent({
          type: "response",
          id: cmd.id,
          success: true,
        });
        break;

      case "steer":
        await agent.sendSteer(cmd.message);
        writeEvent({
          type: "response",
          id: cmd.id,
          success: true,
        });
        break;

      case "follow_up":
        await agent.sendFollowUp(cmd.message);
        writeEvent({
          type: "response",
          id: cmd.id,
          success: true,
        });
        break;

      case "abort":
        await agent.sendAbort();
        writeEvent({
          type: "response",
          id: cmd.id,
          success: true,
        });
        break;

      case "set_model":
        await agent.setModel(cmd.provider, cmd.modelId);
        writeEvent({
          type: "response",
          id: cmd.id,
          success: true,
          data: agent.getState(),
        });
        break;

      case "get_models": {
        const models = agent.getModels();
        writeEvent({
          type: "response",
          id: cmd.id,
          success: true,
          data: { models },
        });
        break;
      }

      case "get_state": {
        writeEvent({
          type: "response",
          id: cmd.id,
          success: true,
          data: agent.getState(),
        });
        break;
      }

      case "get_messages": {
        writeEvent({
          type: "response",
          id: cmd.id,
          success: true,
          data: { messages: agent.getMessages() },
        });
        break;
      }

      case "new_session":
        await agent.destroySession();
        writeEvent({
          type: "response",
          id: cmd.id,
          success: true,
        });
        break;

      case "compact":
        await agent.compact(cmd.customInstructions);
        writeEvent({
          type: "response",
          id: cmd.id,
          success: true,
        });
        break;

      case "shutdown":
        await agent.destroySession();
        writeEvent({
          type: "response",
          id: cmd.id,
          success: true,
        });
        process.exit(0);
        break;

      case "set_config": {
        const cfg = (cmd as any).config as Partial<BridgeConfig>;
        const updated = setConfig(cfg);
        writeEvent({
          type: "response",
          id: cmd.id,
          success: true,
          data: updated,
        });
        break;
      }

      case "get_config": {
        const current = getConfig();
        writeEvent({
          type: "response",
          id: cmd.id,
          success: true,
          data: current,
        });
        break;
      }

      default:
        writeEvent({
          type: "bridge_error",
          id: (cmd as any).id,
          error: `Unknown command type: ${(cmd as any).type}`,
        });
    }
  } catch (err: any) {
    writeEvent({
      type: "bridge_error",
      id: cmd.id,
      error: err?.message ?? String(err),
    });
  }
}

main().catch((err) => {
  writeEvent({
    type: "bridge_error",
    error: `Bridge fatal: ${err?.message ?? String(err)}`,
  });
  process.exit(1);
});
