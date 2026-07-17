#!/usr/bin/env node
// Guards the magic-values rule (~/.claude/rules/magic-values.md) after
// Edit/Write on TS/TSX: bare numbers doing logic (comparisons/arithmetic),
// string literals repeated 3+ times, and hardcoded frontend routes.
//
// This hook BLOCKS the edit, so every rule is tuned for precision over
// recall: declaration sites, framework-idiom args, and config/catalog files
// are exempt — naming a value at its definition is the fix, not the crime.

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const input = payload?.tool_input ?? {};
  const file = input.file_path ?? '';
  if (
    !/\.(ts|tsx|js|jsx)$/.test(file) ||
    /\.(spec|test)\.[tj]sx?$/.test(file) ||
    /\.(gen|config|stories)\.[tj]sx?$/.test(file) ||
    /\/(drizzle|\.storybook|\.claude)\//.test(file) ||
    /\.(constants|catalog|tokens)\.[tj]sx?$/.test(file)
  ) {
    process.exit(0);
  }

  const added = [];
  if (typeof input.content === 'string') added.push(input.content);
  if (typeof input.new_string === 'string') added.push(input.new_string);
  if (Array.isArray(input.edits)) {
    for (const e of input.edits) {
      if (typeof e?.new_string === 'string') added.push(e.new_string);
    }
  }
  if (added.length === 0) process.exit(0);

  const ALLOWED_INTS = new Set(['0', '1', '2', '-1']);
  // A SCREAMING const may compose magic factors (24 * 60 * 1000) — the name
  // carries the meaning. Any other declaration is only exempt when its value
  // is a bare literal: naming a computation does not name its factors.
  const SCREAMING_DECL =
    /\b(const|readonly|static|enum)\s+[A-Z][A-Z0-9_]*\s*[:=]|^\s*[A-Z][A-Z0-9_]*\s*[:=]/;
  // Pure literal math after a name (`staleTime: 1000 * 60 * 5`) is named by
  // the key itself, same as a SCREAMING const composing unit factors.
  const BARE_LITERAL_VALUE =
    /(?<![<>!=+\-*/%])[:=]\s*-?[\d_e\s*+\-/.()}\]]+[,;]?\s*$/;
  const JSX_OBJECT_PROP = /\w+=\{\{/;
  const COMPARISON_NUM =
    /(?:[<>]=?|[=!]==?)\s*(-?\d[\d_]*(?:\.\d+)?)(?![\d_.\w])/g;
  // Binary context only: `y: -10` and `(-3)` are signed values, not
  // subtraction, and `3e-7` is an exponent, not arithmetic.
  const ARITHMETIC_NUM =
    /(?<=[\w)\]])(?<!\d[eE])\s*[-+*/%]\s*(\d[\d_]*(?:\.\d+)?)(?![\d_.\w%])/g;
  const ROUTE_STRING = /(?:navigate\(|to=|href=)["'`]\/(?!\/)/;

  const stripLiterals = (line) =>
    line
      .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""')
      .replace(/(?<![\w)\]])\/(?:\\.|[^/\n])+\/[gimsuy]*/g, '/re/')
      .replace(/\/\/.*$/, '')
      .replace(/\/\*.*?\*\//g, '');

  const magicNumbersIn = (line) => {
    const code = stripLiterals(line);
    if (
      SCREAMING_DECL.test(code) ||
      BARE_LITERAL_VALUE.test(code) ||
      JSX_OBJECT_PROP.test(code) ||
      /\bas const\b/.test(code)
    ) {
      return [];
    }
    const out = [];
    for (const re of [COMPARISON_NUM, ARITHMETIC_NUM]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(code)) !== null) {
        const value = m[1].replace(/_/g, '');
        const isDecimal = value.includes('.');
        if (isDecimal || !ALLOWED_INTS.has(value)) out.push(m[1]);
      }
    }
    return out;
  };

  // Single quotes only: the repo's Prettier puts JSX attribute values in
  // double quotes, and `type="button"` × 4 is not a constant waiting to exist.
  const STRING_LITERAL = /'((?:\\.|[^'])*)'/g;
  const IGNORE_STRING_LINE =
    /^\s*(import|export)\b|className|@knowtis|@jovandyaz|data-testid|typeof /;

  const findings = [];
  const flag = (text, why) => findings.push(`  • ${text.slice(0, 70)} — ${why}`);

  for (const block of added) {
    const lines = block.split('\n');
    const stringCount = new Map();

    for (const line of lines) {
      const t = line.trim();

      const numbers = magicNumbersIn(t);
      if (numbers.length > 0) {
        flag(
          t,
          `magic number ${[...new Set(numbers)].join(', ')} in logic — name it (SCREAMING_SNAKE const stating unit/role)`
        );
      }

      if (
        ROUTE_STRING.test(t) &&
        /\/(apps)\/(notes|backoffice)\//.test(file)
      ) {
        flag(t, 'hardcoded route — use ROUTES.* from the app config');
      }

      if (!IGNORE_STRING_LINE.test(t)) {
        STRING_LITERAL.lastIndex = 0;
        let m;
        while ((m = STRING_LITERAL.exec(t)) !== null) {
          const s = m[1];
          if (s.length >= 4 && !/^[\s\W]*$/.test(s)) {
            stringCount.set(s, (stringCount.get(s) ?? 0) + 1);
          }
        }
      }
    }

    for (const [s, n] of stringCount) {
      if (n >= 3) {
        flag(
          `'${s}' × ${n}`,
          'repeated string literal — extract a const, or derive a union from a const array if it is a closed set'
        );
      }
    }
  }

  if (findings.length === 0) process.exit(0);

  const seen = [...new Set(findings)].slice(0, 6).join('\n');
  process.stderr.write(
    `Magic-values rule (~/.claude/rules/magic-values.md) — review these in ${file}:\n${seen}\n` +
      `Named constants at the definition site are exempt; fix by naming, not by suppressing.\n`
  );
  process.exit(2);
});
