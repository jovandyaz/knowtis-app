import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The repository root, for specs that read files outside the api project. */
export const REPO_ROOT = join(__dirname, '../../../../../..');

const WORKFLOWS_DIR = '.github/workflows';
const JOBS_KEY = 'jobs:';
const JOB_INDENT = '  ';
const TOP_OR_JOB_LEVEL_LINE_RE = /^ {0,2}\S/;
const RUN_KEY_RE = /^( *(?:- )?)run:(.*)$/;
const BLOCK_SCALAR_RE = /^[|>][-+]?$/;
const JQ_TEST_PATTERN_RE = /test\("(.+?)"\)/g;
const JQ_ESCAPED_BACKSLASH = '\\\\';
const JQ_END_OF_INPUT = '\\z';

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

export function readWorkflow(fileName: string): string {
  return readFileSync(join(REPO_ROOT, WORKFLOWS_DIR, fileName), 'utf8');
}

/** One job's text, from its key through the line before the next job. Throws when the workflow declares no such job. */
export function jobSection(workflow: string, job: string): string {
  const lines = workflow.split('\n');
  const start = lines.indexOf(`${JOB_INDENT}${job}:`, lines.indexOf(JOBS_KEY));
  if (start === -1) {
    throw new Error(`workflow declares no job '${job}'`);
  }
  const body = lines.slice(start + 1);
  const end = body.findIndex((line) => TOP_OR_JOB_LEVEL_LINE_RE.test(line));
  return [lines[start], ...(end === -1 ? body : body.slice(0, end))].join('\n');
}

/** Every `run:` script, inline or block scalar, in declaration order. */
export function runScripts(workflow: string): string[] {
  const lines = workflow.split('\n');
  return lines.flatMap((line, index) => {
    const match = RUN_KEY_RE.exec(line);
    if (!match) {
      return [];
    }
    const [, keyPrefix = '', rawValue = ''] = match;
    const value = rawValue.trim();
    if (!BLOCK_SCALAR_RE.test(value)) {
      return [value];
    }
    const rest = lines.slice(index + 1);
    const end = rest.findIndex(
      (next) => next.trim() !== '' && indentOf(next) <= keyPrefix.length
    );
    return [(end === -1 ? rest : rest.slice(0, end)).join('\n')];
  });
}

/** Every jq `test("…")` pattern in `script`, in order, as a RegExp with jq's semantics. Throws unless each one ends with `\z`: jq's `$` also matches before a trailing newline, which would reach `$GITHUB_OUTPUT`. */
export function jqTestPatterns(script: string): RegExp[] {
  return [...script.matchAll(JQ_TEST_PATTERN_RE)].map(([, escaped = '']) => {
    const pattern = escaped.replaceAll(JQ_ESCAPED_BACKSLASH, '\\');
    if (!pattern.endsWith(JQ_END_OF_INPUT)) {
      throw new Error(`jq pattern is not anchored at end of input: ${pattern}`);
    }
    return new RegExp(`${pattern.slice(0, -JQ_END_OF_INPUT.length)}$`);
  });
}
