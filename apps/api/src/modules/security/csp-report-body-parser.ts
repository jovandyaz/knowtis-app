import type { NestExpressApplication } from '@nestjs/platform-express';

const CSP_REPORT_CONTENT_TYPES = [
  'application/csp-report',
  'application/reports+json',
];
const CSP_REPORT_BODY_LIMIT = '16kb';

/**
 * Parses the JSON bodies browsers deliver violation reports in:
 * `application/csp-report` from `report-uri` and `application/reports+json`
 * from the Reporting API. Neither is `application/json`, so the app-wide JSON
 * parser leaves them unread.
 */
export function applyCspReportBodyParser(app: NestExpressApplication): void {
  app.useBodyParser('json', {
    type: CSP_REPORT_CONTENT_TYPES,
    limit: CSP_REPORT_BODY_LIMIT,
  });
}
