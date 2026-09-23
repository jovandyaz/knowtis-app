import { z } from 'zod';

const CSP_VIOLATION_REPORT_TYPE = 'csp-violation';
const MAX_VIOLATION_GROUPS_PER_REQUEST = 20;
const MAX_WORD_LENGTH = 32;
const WORD = /^[a-z]+(?:-[a-z]+)*$/;
const PATH_PARAMETER = ':param';
const OPAQUE_ORIGIN = 'null';
const DISPOSITIONS = ['enforce', 'report'] as const;

type Disposition = (typeof DISPOSITIONS)[number];

/** A violation reduced to the fields that are safe to log. */
export interface CspViolation {
  effectiveDirective?: string;
  blockedSource?: string;
  documentPath?: string;
  disposition?: Disposition;
}

/** Identical violations folded into one, with how many there were. */
export interface CspViolationGroup extends CspViolation {
  count: number;
}

export interface GroupedCspViolations {
  groups: CspViolationGroup[];
  /** Violations past the group cap, which are counted but not kept. */
  droppedViolations: number;
}

const legacyReportSchema = z.object({
  'csp-report': z.object({
    'effective-directive': z.string().optional(),
    'blocked-uri': z.string().optional(),
    'document-uri': z.string().optional(),
    disposition: z.string().optional(),
  }),
});

const reportBatchSchema = z
  .array(z.object({ type: z.string(), body: z.unknown() }))
  .min(1);

const violationBodySchema = z.object({
  effectiveDirective: z.string().optional(),
  blockedURL: z.string().optional(),
  documentURL: z.string().optional(),
  disposition: z.string().optional(),
});

type ViolationFields = z.infer<typeof violationBodySchema>;

/**
 * Reads the violations out of a report body in either delivery format: the
 * `report-uri` object or a Reporting API batch, whose reports of other types
 * are skipped. Null when the body is neither.
 */
export function readCspViolations(body: unknown): CspViolation[] | null {
  const legacy = legacyReportSchema.safeParse(body);
  if (legacy.success) {
    const report = legacy.data['csp-report'];
    return [
      toViolation({
        effectiveDirective: report['effective-directive'],
        blockedURL: report['blocked-uri'],
        documentURL: report['document-uri'],
        disposition: report.disposition,
      }),
    ];
  }

  const batch = reportBatchSchema.safeParse(body);
  if (!batch.success) {
    return null;
  }
  const violations: CspViolation[] = [];
  for (const report of batch.data) {
    if (report.type !== CSP_VIOLATION_REPORT_TYPE) {
      continue;
    }
    const fields = violationBodySchema.safeParse(report.body);
    if (!fields.success) {
      return null;
    }
    violations.push(toViolation(fields.data));
  }
  return violations;
}

/**
 * Folds identical violations into one group with a count, in first-seen
 * order, and keeps at most MAX_VIOLATION_GROUPS_PER_REQUEST groups: a page
 * repeats one violation many times, and each group becomes a log line.
 */
export function groupCspViolations(
  violations: CspViolation[]
): GroupedCspViolations {
  const groups = new Map<string, CspViolationGroup>();
  let droppedViolations = 0;
  for (const violation of violations) {
    const key = JSON.stringify([
      violation.effectiveDirective,
      violation.blockedSource,
      violation.documentPath,
      violation.disposition,
    ]);
    const group = groups.get(key);
    if (group !== undefined) {
      group.count += 1;
    } else if (groups.size < MAX_VIOLATION_GROUPS_PER_REQUEST) {
      groups.set(key, { ...violation, count: 1 });
    } else {
      droppedViolations += 1;
    }
  }
  return { groups: [...groups.values()], droppedViolations };
}

function toViolation(fields: ViolationFields): CspViolation {
  const violation: CspViolation = {};
  if (
    fields.effectiveDirective !== undefined &&
    isWord(fields.effectiveDirective)
  ) {
    violation.effectiveDirective = fields.effectiveDirective;
  }
  const blockedSource =
    fields.blockedURL === undefined ? undefined : sourceOf(fields.blockedURL);
  if (blockedSource !== undefined) {
    violation.blockedSource = blockedSource;
  }
  const documentPath =
    fields.documentURL === undefined ? undefined : pathOf(fields.documentURL);
  if (documentPath !== undefined) {
    violation.documentPath = documentPath;
  }
  if (isDisposition(fields.disposition)) {
    violation.disposition = fields.disposition;
  }
  return violation;
}

// A blocked URL is whatever the page tried to load, query string included, so
// an exfiltration attempt carries its payload in it: only the origin is kept.
// Keywords (inline, eval) and the bare scheme browsers send for data: or blob:
// pass as they are.
function sourceOf(blocked: string): string | undefined {
  if (isWord(blocked)) {
    return blocked;
  }
  const url = URL.parse(blocked);
  if (url === null) {
    return undefined;
  }
  if (url.origin !== OPAQUE_ORIGIN) {
    return url.origin;
  }
  const scheme = url.protocol.slice(0, -1);
  return isWord(scheme) ? scheme : undefined;
}

// A path segment can be a share-link token, which grants access to the note,
// so only route words survive; ids and tokens become a placeholder.
function pathOf(documentUrl: string): string | undefined {
  const url = URL.parse(documentUrl);
  if (url === null) {
    return undefined;
  }
  return url.pathname
    .split('/')
    .map((segment) =>
      segment === '' || isWord(segment) ? segment : PATH_PARAMETER
    )
    .join('/');
}

function isWord(value: string): boolean {
  return value.length <= MAX_WORD_LENGTH && WORD.test(value);
}

function isDisposition(value: string | undefined): value is Disposition {
  return DISPOSITIONS.some((disposition) => disposition === value);
}
