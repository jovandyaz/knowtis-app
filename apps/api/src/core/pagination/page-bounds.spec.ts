import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { PaginatedAuditQueryDto } from '../../modules/admin/dto/paginated-audit-query.dto';
import { PaginatedUsersQueryDto } from '../../modules/admin/dto/paginated-users-query.dto';
import { PaginatedCandidatesQueryDto } from '../../modules/ai/dto/paginated-candidates-query.dto';
import { MAX_LIMIT, MAX_PAGE } from './pagination.constants';

const PAGINATED_QUERY_DTOS = [
  { route: 'GET /admin/audit', dto: PaginatedAuditQueryDto },
  { route: 'GET /admin/users', dto: PaginatedUsersQueryDto },
  { route: 'GET /ai/catalog/candidates', dto: PaginatedCandidatesQueryDto },
];

const EXPONENT_FORM = '1e21';

async function constraintsFor(
  dto: ClassConstructor<object>,
  field: 'page' | 'limit',
  value: string
): Promise<string[]> {
  const errors = await validate(plainToInstance(dto, { [field]: value }));
  return errors
    .filter((error) => error.property === field)
    .flatMap((error) => Object.keys(error.constraints ?? {}));
}

describe.each(PAGINATED_QUERY_DTOS)('$route pagination bounds', ({ dto }) => {
  it('should reject a page before the first one', async () => {
    expect(await constraintsFor(dto, 'page', '0')).toContain('min');
  });

  it('should reject a page past the bound rather than overflow the SQL offset', async () => {
    expect(await constraintsFor(dto, 'page', String(MAX_PAGE + 1))).toContain(
      'max'
    );
  });

  it('should reject an exponent-form page that IsInt accepts on its own', async () => {
    expect(await constraintsFor(dto, 'page', EXPONENT_FORM)).toContain('max');
  });

  it('should accept the first page and the last one inside the bound', async () => {
    expect(await constraintsFor(dto, 'page', '1')).toEqual([]);
    expect(await constraintsFor(dto, 'page', String(MAX_PAGE))).toEqual([]);
  });

  it('should reject an empty page size', async () => {
    expect(await constraintsFor(dto, 'limit', '0')).toContain('min');
  });

  it('should reject a page size past the shared ceiling', async () => {
    expect(await constraintsFor(dto, 'limit', String(MAX_LIMIT + 1))).toContain(
      'max'
    );
  });

  it('should reject an exponent-form page size that IsInt accepts on its own', async () => {
    expect(await constraintsFor(dto, 'limit', EXPONENT_FORM)).toContain('max');
  });

  it('should accept a page size up to the ceiling', async () => {
    expect(await constraintsFor(dto, 'limit', '1')).toEqual([]);
    expect(await constraintsFor(dto, 'limit', String(MAX_LIMIT))).toEqual([]);
  });
});
