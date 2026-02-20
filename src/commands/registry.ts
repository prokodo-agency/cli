/**
 * Central registry of every top-level CLI command.
 *
 * This is the single source of truth that wires three things together:
 *   1. src/cli.ts        — iterates COMMANDS to register each one with Commander
 *   2. integration tests — imports COMMAND_NAMES to assert that every registered
 *                          command appears in `prokodo --help` output
 *
 * IMPORTANT: adding a new command here is the ONLY thing needed to register it
 * with the CLI.  Forgetting to add it keeps the CLI broken, meaning the
 * integration tests will catch the omission automatically.
 */

import type { Command } from 'commander';
import { registerAuthCommands } from './auth';
import { registerCreditsCommand } from './credits';
import { registerInitCommand } from './init';
import { registerVerifyCommand } from './verify';
import { registerDoctorCommand } from './doctor';

export interface CommandEntry {
  /** Top-level command name as it appears in `prokodo --help`. */
  name: string;
  /** One-line summary shown alongside the name in `prokodo --help`. */
  summary: string;
  /** Function that attaches the command (and any sub-commands) to `program`. */
  register: (program: Command) => void;
}

/**
 * Ordered list of every top-level command registered with the CLI.
 *
 * When you add a new command:
 *   1. Create its implementation in `src/commands/<name>.ts`
 *   2. Add an entry here — that's it.
 */
export const COMMANDS: CommandEntry[] = [
  {
    name: 'auth',
    summary: 'Log in, log out, and inspect the active API key',
    register: registerAuthCommands,
  },
  {
    name: 'credits',
    summary: 'Show your current credit balance',
    register: registerCreditsCommand,
  },
  {
    name: 'init',
    summary: 'Scaffold .prokodo/config.json in the current project',
    register: registerInitCommand,
  },
  {
    name: 'verify',
    summary: 'Upload project files and run a cloud verification',
    register: registerVerifyCommand,
  },
  {
    name: 'doctor',
    summary: 'Check Node version, credentials, config, and API reachability',
    register: registerDoctorCommand,
  },
];

/**
 * All top-level command names derived from COMMANDS.
 * Imported by integration tests for the help-completeness assertion.
 */
export const COMMAND_NAMES: string[] = COMMANDS.map((c) => c.name);
