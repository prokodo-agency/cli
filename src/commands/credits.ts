import type { Command } from 'commander';
import { ApiClient } from '../lib/apiClient';
import { resolveApiKey } from '../lib/auth';
import { getDefaultApiUrl } from '../lib/platform';
import { info, emitJson } from '../lib/logger';
import type { CreditsResponse } from '../types/api';

export function registerCreditsCommand(program: Command): void {
  program
    .command('credits')
    .description('Show your current credit balance')
    .action(async () => {
      const {
        json: jsonMode,
        apiUrl,
        apiKey: cliKey,
      } = program.opts<{
        json: boolean;
        apiUrl?: string;
        apiKey?: string;
      }>();

      const key = resolveApiKey(cliKey);
      const client = new ApiClient({
        baseUrl: apiUrl ?? getDefaultApiUrl(),
        apiKey: key,
      });

      const res = await client.get<CreditsResponse>('/api/cli/v1/credits');

      if (jsonMode) {
        emitJson(res);
        return;
      }

      const stubNote = res.stub ? ' (preview — credits model coming soon)' : '';
      info(`Balance: ${res.balance} ${res.unit}${stubNote}`);
    });
}
