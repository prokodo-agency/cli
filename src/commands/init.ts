import type { Command } from 'commander';
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { saveConfig, configPath, type ProjectConfig } from '../lib/config';
import { success, info, warn, emitJson, fatal } from '../lib/logger';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Scaffold a .prokodo/config.json in the current project')
    .option('--type <type>', 'Project type (currently only n8n-node is supported)')
    .option('--force', 'Overwrite existing config')
    .action(async (opts: { type?: string; force?: boolean }) => {
      const { json: jsonMode } = program.opts<{ json: boolean }>();
      const basePath = process.cwd();
      const filePath = configPath(basePath);

      // Validate --type if provided
      if (opts.type && opts.type !== 'n8n-node') {
        if (opts.type === 'n8n-workflow') {
          // TODO: enable once n8n-workflow verification logic is implemented
          fatal('n8n-workflow is not yet supported.', 2);
        }
        fatal(`--type must be "n8n-node", got "${opts.type}".`, 2);
      }

      // Check for existing config
      const configExists = fs.existsSync(filePath);
      if (configExists && !opts.force) {
        warn(
          `Config already exists at ${path.relative(basePath, filePath)}. Use --force to overwrite.`,
        );
        return;
      }

      // Build minimal config — only include what the user explicitly set
      const config: ProjectConfig = {};
      if (opts.type) {
        config.projectType = opts.type as ProjectConfig['projectType'];
      }

      saveConfig(config, basePath);

      if (jsonMode) {
        emitJson({ created: true, path: filePath, config });
        return;
      }

      success(`Created ${path.relative(basePath, filePath)}`);
      if (config.projectType) {
        info(`  projectType : ${config.projectType}`);
      } else {
        info('  projectType : (auto-detected at verify time)');
      }
      info('');
      info('Run "prokodo verify" when ready.');
    });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/* istanbul ignore next */
function prompt(question: string, defaultValue: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

// keep TS happy — prompt is reserved for future interactive init
void (prompt as unknown);
