#!/usr/bin/env node
// Guards the minimal-comments rule (.claude/rules/comments.md) after Edit/Write
// on TS/TSX. Short, useful WHY comments and JSDoc are fine — this only flags the
// objectively-bad, machine-detectable cases: over-long blocks, task/PR/issue
// references, section-header dividers, author/date stamps, tombstones, and
// comments that only restate the code they sit on.
//
// This hook BLOCKS the edit, so every rule here is tuned for precision over
// recall: a redundancy rule fires only when the comment's own words are already
// in the identifiers below it. Judging whether a WHY is *worth* saying is the
// author's job — a regex that guessed at that would cry wolf and get ignored.

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
    /\.gen\.[tj]sx?$/.test(file)
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

  const BANNED = [
    { re: /\/\/.*\b(task\s*#?\d|pr\s*#?\d|#\d{2,}|per (cr|code[- ]?review|review|feedback)|added (for|in)\b|changed per|fix(ed)? for #|as requested)/i, why: 'task/PR/issue reference — belongs in the commit message, not the code' },
    { re: /(\/\/|\/\*)\s*[-=*_#]{3,}/, why: 'section-header divider — use whitespace/structure instead' },
    { re: /\/\/\s*[A-Za-z][A-Za-z.]*\.?\s*\d{4}([-/]\d{2}){0,2}\b/, why: 'author/date stamp — git blame is authoritative' },
    { re: /\/\/\s*(removed|deleted|old (logic|code|impl|version)|kept for reference|commented[- ]out|legacy:)/i, why: 'tombstone — delete dead code, use git history' },
  ];

  // Openers that promise a restatement of the next line rather than a reason.
  const PARAPHRASE_VERB =
    /^(increments?|decrements?|sets?|gets?|returns?|creates?|builds?|initiali[sz]es?|inits?|adds?|removes?|deletes?|updates?|checks?|validates?|loops?|iterates?|calls?|invokes?|declares?|defines?|assigns?|renders?|handles?|maps?|filters?|converts?|parses?|formats?|resets?|clears?|starts?|stops?|fetch(es)?|sends?|saves?|loads?)\b/i;
  const SECTION_NAME =
    /^(helpers?|types?|constants?|state|public api|private (methods?|api)|utils?|imports?|exports?|setup|teardown|props?|hooks?|handlers?|selectors?|actions?|styles?|interfaces?|variables?|methods?|main|misc)$/i;
  const STOPWORDS = new Set(
    ('the a an to of for and or if is are be this that it its in on at we should will with from by as not no then so into via when which their they them our all each any new here there do does done use used using one only'
      .split(' '))
  );
  const PRAGMA = /(eslint-disable|@ts-|biome-ignore|prettier-ignore|c8 |istanbul )/;

  const stem = (w) =>
    w
      .replace(/ies$/, 'y')
      .replace(/(sses|shes|ches|xes)$/, (m) => m.slice(0, -2))
      .replace(/s$/, '')
      .replace(/(ing|ed|er|or)$/, '');

  const words = (text) =>
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .map(stem);

  const identifierWords = (code) => {
    const out = new Set();
    for (const id of code.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []) {
      for (const part of id
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[_$\s]+/)) {
        if (part.length > 2) out.add(stem(part.toLowerCase()));
      }
    }
    return out;
  };

  const isCode = (t) =>
    t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');

  // A comment is redundant when its own words are already spelled out in the
  // code it introduces — not merely because it is short.
  const restatesCode = (text, following, maxWords, minShared) => {
    const cw = words(text);
    if (cw.length === 0 || cw.length > maxWords) return false;
    const ids = identifierWords(following.join(' '));
    const shared = cw.filter((w) => ids.has(w));
    return shared.length >= minShared && shared.length / cw.length >= 0.6;
  };

  const findings = [];
  const flag = (text, why) =>
    findings.push(`  • ${text.slice(0, 70)} — ${why}`);

  for (const block of added) {
    const lines = block.split('\n');
    const codeAfter = (i) =>
      lines
        .slice(i + 1)
        .filter((l) => isCode(l.trim()))
        .slice(0, 2);

    let run = 0; // consecutive non-JSDoc // comment lines
    for (const [i, line] of lines.entries()) {
      const t = line.trim();
      for (const b of BANNED) {
        if (b.re.test(t)) flag(t, b.why);
      }

      const jsdoc = t.match(/^\/\*\*\s*(.+?)\s*\*\/$/);
      if (jsdoc && restatesCode(jsdoc[1], codeAfter(i), 5, 2)) {
        flag(t, 'JSDoc that only respells the signature — say what a caller cannot infer, or drop it');
      }

      if (t.startsWith('//') && !PRAGMA.test(t)) {
        const text = t.replace(/^\/+\s*/, '');
        if (SECTION_NAME.test(text.replace(/[:.]$/, ''))) {
          flag(t, 'section header — use whitespace/structure instead');
        } else if (PARAPHRASE_VERB.test(text) && restatesCode(text, codeAfter(i), 12, 2)) {
          flag(t, 'restates the code below it — explain a non-obvious WHY or delete it');
        }
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
