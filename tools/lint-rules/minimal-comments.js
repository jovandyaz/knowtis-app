const PRAGMA =
  /(eslint-disable|eslint-enable|@ts-|biome-ignore|prettier-ignore|c8 ignore|istanbul ignore|v8 ignore|@vitest-|<reference |webpackChunkName|@jsx|use client|use server)/;
const TRACKER = /^\s*(TODO|FIXME|HACK|XXX)\b/i;
const RATIONALE =
  /\b(because|since|due to|so|otherwise|unless|or else|but|however|though|although|without|would|must|may|can|cannot|can't|won't|doesn't|does not|too|never|always|still|no longer|workaround|quirk|bug|instead|beware|caveat|assumes?|invariant|deliberate|intentional|requires?|expects?|relies|depends?|prevents?|avoids?|breaks?|fails?|overrides?|ignores?|silently|stale|mismatch|unreliable|unsafe|upstream|race|ordering|known issue|edge case|in practice|turns out|observed|not supported|only works|only way|has to|unlike|despite|even though|per spec|by design|safari|firefox|chrome|legacy api)\b/i;
const EPHEMERAL =
  /(\bTF-\d+|\bJIRA-\d+|\btask\s*#?\d|\bpr\s*#?\d|#\d{2,}|(?:fix(?:es|ed)?|closes?|refs?|see|per|added (?:for|in)|changed per)\s+#\d|per (?:cr|code[- ]?review|review|feedback)|as requested)/i;
const DIVIDER = /^\s*[-=*_#~]{3,}|[-=*_#~]{3,}\s*$/;
const STAMP = /^\s*[A-Za-z][A-Za-z.]*\.?\s*\d{4}([-/]\d{2}){0,2}\s*$/;
const TOMBSTONE =
  /^\s*(removed|deleted|old (logic|code|impl|implementation|version)|kept for reference|commented[- ]out|legacy:|was:|previously)/i;

const MAX_COMMENT_LINES = 6;
const MAX_LITERAL_LABEL_WORDS = 3;

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Allow a comment only as JSDoc, a TODO/FIXME/HACK, a pragma, or a line that states why the code is non-obvious',
    },
    schema: [],
    messages: {
      noWhy:
        'Comment states what the code does, not why. Delete it, or rewrite it around the constraint that makes the code non-obvious.',
      ephemeral:
        'Task/PR/issue reference belongs in the commit message, not in the code — it rots.',
      divider: 'Section divider — use whitespace and module structure instead.',
      stamp: 'Author/date stamp — git blame is authoritative.',
      tombstone: 'Tombstone — delete the dead code; git keeps the history.',
      blockStyle:
        'Multi-line comments use // line comments, not /* */ (Google TypeScript style guide).',
      tooLong:
        'Comment spans {{lines}} lines — state the constraint in a couple of lines and move the prose to the PR description.',
    },
  },

  create(context) {
    const source = context.sourceCode ?? context.getSourceCode();

    const check = (node, body, lineSpan, trailing = false) => {
      if (PRAGMA.test(body)) return;
      if (EPHEMERAL.test(body))
        return context.report({ node, messageId: 'ephemeral' });
      if (DIVIDER.test(body))
        return context.report({ node, messageId: 'divider' });
      if (STAMP.test(body)) return context.report({ node, messageId: 'stamp' });
      if (TOMBSTONE.test(body))
        return context.report({ node, messageId: 'tombstone' });
      if ((body.match(/[A-Za-z]{2,}/g) ?? []).length === 0) return;
      if (TRACKER.test(body)) return;
      if (
        trailing &&
        (body.match(/[^\s]+/g) ?? []).length <= MAX_LITERAL_LABEL_WORDS
      ) {
        return;
      }
      if (lineSpan > MAX_COMMENT_LINES) {
        return context.report({
          node,
          messageId: 'tooLong',
          data: { lines: lineSpan },
        });
      }
      if (!RATIONALE.test(body)) context.report({ node, messageId: 'noWhy' });
    };

    return {
      Program() {
        const comments = source.getAllComments();
        let group = null;

        const flush = () => {
          if (!group) return;
          check(
            group.node,
            group.parts.join(' ').replace(/\s+/g, ' ').trim(),
            group.end - group.start + 1,
            group.trailing
          );
          group = null;
        };

        for (const comment of comments) {
          if (comment.type === 'Block') {
            flush();
            const span = comment.loc.end.line - comment.loc.start.line + 1;
            const isDoc = comment.value.startsWith('*');
            if (!isDoc && span > 1) {
              context.report({ node: comment, messageId: 'blockStyle' });
              continue;
            }
            if (isDoc) continue;
            check(comment, comment.value.replace(/\s+/g, ' ').trim(), span);
            continue;
          }

          const line = comment.loc.start.line;
          const ownLine =
            source.lines[line - 1].slice(0, comment.loc.start.column).trim() ===
            '';

          if (group && ownLine && line === group.end + 1) {
            group.parts.push(comment.value);
            group.end = line;
            continue;
          }
          flush();
          group = {
            node: comment,
            parts: [comment.value],
            start: line,
            end: line,
            trailing: !ownLine,
          };
        }
        flush();
      },
    };
  },
};
