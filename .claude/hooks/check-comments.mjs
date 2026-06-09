#!/usr/bin/env node
// Guards the minimal-comments rule (.claude/rules/comments.md) after Edit/Write
// on TS/TSX. Short, useful WHY comments and JSDoc are fine — this only flags the
// objectively-bad, machine-detectable cases: over-long blocks, task/PR/issue
// references, section-header dividers, author/date stamps, and tombstones.

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
  if (!/\.(ts|tsx|js|jsx)$/.test(file) || /\.(spec|test)\.[tj]sx?$/.test(file)) {
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

  const BANNED = [
    { re: /\/\/.*\b(task\s*#?\d|pr\s*#?\d|#\d{2,}|per (cr|code[- ]?review|review|feedback)|added (for|in)\b|changed per|fix(ed)? for #|as requested)/i, why: 'task/PR/issue reference — belongs in the commit message, not the code' },
    { re: /(\/\/|\/\*)\s*[-=*_#]{3,}/, why: 'section-header divider — use whitespace/structure instead' },
    { re: /\/\/\s*[A-Za-z][A-Za-z.]*\.?\s*\d{4}([-/]\d{2}){0,2}\b/, why: 'author/date stamp — git blame is authoritative' },
    { re: /\/\/\s*(removed|deleted|old (logic|code|impl|version)|kept for reference|commented[- ]out|legacy:)/i, why: 'tombstone — delete dead code, use git history' },
  ];

  const findings = [];

  for (const block of added) {
    const lines = block.split('\n');
    let run = 0; // consecutive non-JSDoc // comment lines
    for (const line of lines) {
      const t = line.trim();
      for (const b of BANNED) {
        if (b.re.test(t)) findings.push(`  • ${t.slice(0, 70)} — ${b.why}`);
      }
      if (t.startsWith('//') && !/(eslint-disable|@ts-|biome-ignore|prettier-ignore)/.test(t)) {
        run += 1;
        if (run === 4) {
          findings.push('  • a // comment block longer than 3 lines — shorten it or move prose to the PR/design doc');
        }
      } else {
        run = 0;
      }
    }
  }

  if (findings.length === 0) process.exit(0);

  const seen = [...new Set(findings)].slice(0, 6).join('\n');
  process.stderr.write(
    `Minimal-comments rule (.claude/rules/comments.md) — review these in ${file}:\n${seen}\n` +
      `Short, useful WHY comments and JSDoc are fine; remove the flagged ones.\n`
  );
  process.exit(2);
});
