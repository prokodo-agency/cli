import type { Command } from 'commander';
import readline from 'node:readline';
import path from 'node:path';
import {
  saveConfig,
  configPath,
  buildDefaultConfig,
  loadConfig,
  type ProjectConfig,
} from '../lib/config';
import { isInteractive } from '../lib/platform';
import { success, info, warn, emitJson, fatal } from '../lib/logger';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Scaffold a .prokodo/config.json in the current project')
    .option('--slug <slug>', 'Project slug (skip prompt)')
    .option('--defaults', 'Accept all defaults without prompting')
    .option('--force', 'Overwrite existing config')
    .action(async (opts: { slug?: string; defaults?: boolean; force?: boolean }) => {
      const { json: jsonMode } = program.opts<{ json: boolean }>();
      const basePath = process.cwd();
      const filePath = configPath(basePath);

      // Check for existing config
      try {
        loadConfig(basePath);
        if (!opts.force) {
          warn(
            `Config already exists at ${path.relative(basePath, filePath)}. Use --force to overwrite.`,
          );
          process.exit(0);
        }
      } catch {
        // No existing config — proceed
      }

      let projectSlug: string;

      if (opts.slug) {
        projectSlug = opts.slug.trim();
      } else if (opts.defaults || !isInteractive()) {
        // Derive from directory name
        projectSlug = path
          .basename(basePath)
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-');
      } else {
        const defaultSlug = path
          .basename(basePath)
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-');
        projectSlug = await prompt(`Project slug [${defaultSlug}]: `, defaultSlug);
      }

      if (!projectSlug || projectSlug.trim() === '') {
        fatal('Project slug cannot be empty.', 2);
      }

      const config: ProjectConfig = buildDefaultConfig({ projectSlug });
      saveConfig(config, basePath);

      if (jsonMode) {
        emitJson({ created: true, path: filePath, config });
        return;
      }

      success(`Created ${path.relative(basePath, filePath)}`);
      info(`  projectSlug : ${config.projectSlug}`);
      info(`  verifyGlobs : ${config.verifyGlobs.join(', ')}`);
      info(`  timeout     : ${config.timeout}s`);
      info('');
      info('Run "prokodo verify" when ready.');
    });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function prompt(question: string, defaultValue: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}
