#!/usr/bin/env node
// Guards the magic-values rule (~/.claude/rules/magic-values.md) after
// Edit/Write on TS/TSX: bare numbers doing logic (comparisons/arithmetic,
// either operand), string literals repeated 3+ times, and hardcoded frontend
// routes.
//
// This hook BLOCKS the edit, so every rule is tuned for precision over
// recall: declaration sites, framework-idiom args, and config/catalog files
// are exempt — naming a value at its definition is the fix, not the crime.
// Number detection runs on a lexically-projected copy of each block (strings,
// template literals, and comments blanked across line boundaries) so a literal
// or comment spanning lines never leaks into the code scan.

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
  // Numeric literal as the RIGHT operand of a comparison / arithmetic op.
  const COMPARISON_NUM_RIGHT =
    /(?:[<>]=?|[=!]==?)\s*(-?\d[\d_]*(?:\.\d+)?)(?![\d_.\w])/g;
  const ARITHMETIC_NUM_RIGHT =
    /(?<=[\w)\]])(?<!\d[eE])\s*[-+*/%]\s*(\d[\d_]*(?:\.\d+)?)(?![\d_.\w%])/g;
  // ...and as the LEFT operand (`10 < retryCount`, `5 * timeoutMs`). Guarded
  // against exponents (`3e-7`) and member access so only a literal that
  // actually starts a binary expression is caught. Left arithmetic is limited
  // to `* / %` (`5 - 1` / `5 + 1` overlap with signed values) and skips a
  // SCREAMING named unit on the right (`30 * DAY_SECONDS` is self-documenting;
  // `5 * timeoutMs` is not).
  const COMPARISON_NUM_LEFT =
    /(?<![\w.$])(?<![eE][-+]?)(-?\d[\d_]*(?:\.\d+)?)\s*(?:[<>]=?|[=!]==?)(?![=>])/g;
  const ARITHMETIC_NUM_LEFT =
    /(?<![\w.$])(?<![eE][-+]?)(\d[\d_]*(?:\.\d+)?)\s*[*/%]\s*(?![A-Z][A-Z0-9_]*\b)(?=[\w("'`])/g;
  const ROUTE_STRING = /(?:navigate\(|to=|href=)["'`]\/(?!\/)/;
  // Regex literals survive code projection (a lone `/` is code); strip them
  // per line so a quantifier or char class is never scanned for numbers.
  const REGEX_LITERAL = /(?<![\w)\]])\/(?:\\.|[^/\n])+\/[gimsuy]*/g;

  // Blank every string, template literal, and comment across the whole block
  // (newlines preserved, so line indices stay aligned with the raw block) and
  // leave surrounding code intact. A stateful scan is the only way a multi-line
  // construct is stripped without leaking its body into the code scan.
  const projectCode = (src) => {
    let out = '';
    let state = 'code';
    let quote = '';
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      const c2 = src[i + 1];
      if (state === 'code') {
        if (c === '/' && c2 === '/') {
          state = 'line';
          out += '  ';
          i++;
        } else if (c === '/' && c2 === '*') {
          state = 'block';
          out += '  ';
          i++;
        } else if (c === "'" || c === '"' || c === '`') {
          state = 'string';
          quote = c;
          out += ' ';
        } else {
          out += c;
        }
      } else if (state === 'line') {
        if (c === '\n') {
          state = 'code';
          out += '\n';
        } else {
          out += ' ';
        }
      } else if (state === 'block') {
        if (c === '*' && c2 === '/') {
          state = 'code';
          out += '  ';
          i++;
        } else {
          out += c === '\n' ? '\n' : ' ';
        }
      } else {
        if (c === '\\') {
          out += '  ';
          i++;
        } else if (c === quote) {
          state = 'code';
          out += ' ';
        } else {
          out += c === '\n' ? '\n' : ' ';
        }
      }
    }
    return out;
  };

  const magicNumbersIn = (codeLine) => {
    const code = codeLine.replace(REGEX_LITERAL, '/re/');
    if (
      SCREAMING_DECL.test(code) ||
      BARE_LITERAL_VALUE.test(code) ||
      JSX_OBJECT_PROP.test(code) ||
      /\bas const\b/.test(code)
    ) {
      return [];
    }
    const out = [];
    for (const re of [
      COMPARISON_NUM_RIGHT,
      COMPARISON_NUM_LEFT,
      ARITHMETIC_NUM_RIGHT,
      ARITHMETIC_NUM_LEFT,
    ]) {
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

  // Both quote styles: the hook sees raw pre-Prettier input, where a code
  // string may still carry double quotes. Genuine JSX attribute values
  // (`type="button"`) are excluded by the `name=` context below, not by
  // ignoring double quotes wholesale.
  const STRING_LITERAL = /(['"])((?:\\.|(?!\1).)*)\1/g;
  const JSX_ATTR_BEFORE = /[A-Za-z_][\w-]*=$/;
  const IGNORE_STRING_LINE =
    /^\s*(import|export)\b|className|@knowtis|@jovandyaz|data-testid|typeof /;

  const findings = [];
  const flag = (text, why) =>
    findings.push(`  • ${text.slice(0, 70)} — ${why}`);
  // Counted across the whole edit: a MultiEdit adding the same literal once
  // per hunk still reaches the threshold.
  const stringCount = new Map();

  for (const block of added) {
    const rawLines = block.split('\n');
    const codeLines = projectCode(block).split('\n');

    for (let i = 0; i < rawLines.length; i++) {
      const rawLine = rawLines[i];
      const rawTrimmed = rawLine.trim();
      const codeTrimmed = (codeLines[i] ?? '').trim();

      const numbers = magicNumbersIn(codeTrimmed);
      if (numbers.length > 0) {
        flag(
          rawTrimmed,
          `magic number ${[...new Set(numbers)].join(', ')} in logic — name it (SCREAMING_SNAKE const stating unit/role)`
        );
      }

      if (
        ROUTE_STRING.test(rawTrimmed) &&
        /\/(apps)\/(notes|backoffice)\//.test(file)
      ) {
        flag(rawTrimmed, 'hardcoded route — use ROUTES.* from the app config');
      }

      if (!IGNORE_STRING_LINE.test(rawTrimmed)) {
        STRING_LITERAL.lastIndex = 0;
        let m;
        while ((m = STRING_LITERAL.exec(rawLine)) !== null) {
          if (JSX_ATTR_BEFORE.test(rawLine.slice(0, m.index))) continue;
          const s = m[2];
          if (s.length >= 4 && !/^[\s\W]*$/.test(s)) {
            stringCount.set(s, (stringCount.get(s) ?? 0) + 1);
          }
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

  if (findings.length === 0) process.exit(0);

  const seen = [...new Set(findings)].slice(0, 6).join('\n');
  process.stderr.write(
    `Magic-values rule (~/.claude/rules/magic-values.md) — review these in ${file}:\n${seen}\n` +
      `Named constants at the definition site are exempt; fix by naming, not by suppressing.\n`
  );
  process.exit(2);
});
