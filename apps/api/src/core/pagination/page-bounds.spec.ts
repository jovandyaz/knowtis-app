import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { PaginatedAuditQueryDto } from '../../modules/admin/dto/paginated-audit-query.dto';
import { PaginatedUsersQueryDto } from '../../modules/admin/dto/paginated-users-query.dto';
import { PaginatedCandidatesQueryDto } from '../../modules/ai/dto/paginated-candidates-query.dto';
import { MAX_PAGE } from './pagination.constants';

const PAGINATED_QUERY_DTOS = [
  { route: 'GET /admin/audit', dto: PaginatedAuditQueryDto },
  { route: 'GET /admin/users', dto: PaginatedUsersQueryDto },
  { route: 'GET /ai/catalog/candidates', dto: PaginatedCandidatesQueryDto },
];

/** `Number.isInteger(1e21)` is true, so `@IsInt` and `@Min` both wave this through. */
const EXPONENT_FORM_PAGE = '1e21';

async function pageConstraints(
  dto: ClassConstructor<object>,
  page: string
): Promise<string[]> {
  const errors = await validate(plainToInstance(dto, { page }));
  return errors
    .filter((error) => error.property === 'page')
    .flatMap((error) => Object.keys(error.constraints ?? {}));
}

describe.each(PAGINATED_QUERY_DTOS)('$route page bounds', ({ dto }) => {
  it('should reject a page before the first one', async () => {
    expect(await pageConstraints(dto, '0')).toContain('min');
  });

  it('should reject a page past the bound rather than overflow the SQL offset', async () => {
    expect(await pageConstraints(dto, String(MAX_PAGE + 1))).toContain('max');
  });

  it('should reject an exponent-form page that IsInt accepts on its own', async () => {
    expect(await pageConstraints(dto, EXPONENT_FORM_PAGE)).toContain('max');
  });

  it('should accept the first page and the last one inside the bound', async () => {
    expect(await pageConstraints(dto, '1')).toEqual([]);
    expect(await pageConstraints(dto, String(MAX_PAGE))).toEqual([]);
  });
});
