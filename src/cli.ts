import { Command } from 'commander';
import { configureLogger } from './lib/logger';
import { getDefaultApiUrl } from './lib/platform';
import { COMMANDS } from './commands/registry';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../package.json') as { version: string };

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('prokodo')
    .description('prokodo developer CLI — verify, inspect and manage your projects')
    .version(version, '-v, --version', 'Print CLI version')
    .helpCommand('help [command]', 'Display help for a command')
    // ── Global options ───────────────────────────────────────────────────────
    .option(
      '--api-url <url>',
      'Marketplace API base URL',
      process.env['PROKODO_API_BASE_URL'] ?? getDefaultApiUrl(),
    )
    .option('--api-key <key>', 'API key (overrides env var and credentials file)')
    .option('--json', 'Output machine-readable JSON (human logs go to stderr)', false)
    .option('--no-color', 'Disable coloured output')
    .option('--verbose', 'Print debug-level detail', false)
    // ── Parse global options early so sub-commands inherit them ──────────────
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts<{
        json: boolean;
        color: boolean;
        verbose: boolean;
      }>();
      configureLogger({
        json: opts.json,
        verbose: opts.verbose,
        noColor: !opts.color || Boolean(process.env['NO_COLOR']),
      });
    })
    .addHelpText(
      'after',
      `
Quick start:
  $ prokodo auth login --key pk_...   Store your API key
  $ prokodo init --slug my-project         Create .prokodo/config.json
  $ prokodo verify                         Run a cloud verification
  $ prokodo doctor --json                  Health-check in JSON mode
  $ prokodo credits                        Show credit balance

Docs: https://prokodo.com/docs/cli`,
    );

  // ── Register commands (driven by src/commands/registry.ts) ───────────────
  for (const { register } of COMMANDS) {
    register(program);
  }

  // ── Unknown command handler ───────────────────────────────────────────────
  program.on('command:*', (args) => {
    process.stderr.write(`Unknown command: "${args[0] as string}"\n`);
    process.stderr.write('Run "prokodo --help" to see available commands.\n');
    process.exit(2);
  });

  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  process.stderr.write(`Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
