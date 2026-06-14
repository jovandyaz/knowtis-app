import type {
  ApiProvider,
  Assertion,
  CallApiContextParams,
  ProviderResponse,
} from 'promptfoo';

export interface EvalSuiteConfig {
  readonly providers: ApiProvider[];
  readonly prompts: string[];
  readonly tests: Array<{
    readonly description?: string;
    readonly vars: Record<string, unknown>;
    readonly assert: Assertion[];
  }>;
  readonly defaultTest?: { readonly options?: { readonly provider?: string } };
}

export function createStructuredProvider<TVars, TOut>(
  id: string,
  run: (vars: TVars) => Promise<TOut>
): ApiProvider {
  return {
    id: () => id,
    callApi: async (
      _prompt: string,
      context?: CallApiContextParams
    ): Promise<ProviderResponse> => {
      const vars = (context?.vars ?? {}) as TVars;
      const output = await run(vars);
      return { output: output as ProviderResponse['output'] };
    },
  };
}

export function resolveEvalModel(envVar: string, fallback: string): string {
  const value = process.env[envVar];
  return value && value.trim() ? value.trim() : fallback;
}

export function evalGateOpen(): boolean {
  const key = process.env['ANTHROPIC_API_KEY'];
  if (!key || !key.trim()) {
    // eslint-disable-next-line no-console
    console.log('eval skipped: ANTHROPIC_API_KEY not set');
    return false;
  }
  return true;
}

export interface EvalRunStats {
  readonly successes: number;
  readonly failures: number;
  readonly errors: number;
}

export async function runEvalSuite(
  suite: EvalSuiteConfig
): Promise<EvalRunStats> {
  const promptfoo = (await import('promptfoo')).default;
  const record = await promptfoo.evaluate(
    suite as Parameters<typeof promptfoo.evaluate>[0],
    { maxConcurrency: 1 }
  );
  const summary = await record.toEvaluateSummary();

  /* eslint-disable no-console */
  for (const result of summary.results) {
    const status = result.success ? 'PASS' : 'FAIL';
    const label = (result.vars?.['message'] as string | undefined) ?? '(case)';
    console.log(`[${status}] ${label}`);
  }
  console.log(
    `\nPassed: ${summary.stats.successes}  Failed: ${summary.stats.failures}  Errors: ${summary.stats.errors}`
  );
  /* eslint-enable no-console */

  return {
    successes: summary.stats.successes,
    failures: summary.stats.failures,
    errors: summary.stats.errors,
  };
}
