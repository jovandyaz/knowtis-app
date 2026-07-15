export const ADMIN_AUDIT_REPOSITORY = Symbol('ADMIN_AUDIT_REPOSITORY');

export type AuditPayload = Record<string, unknown>;

export interface AdminAuditEntry {
  readonly id: string;
  readonly actorId: string;
  readonly actorEmail: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly before: AuditPayload | null;
  readonly after: AuditPayload | null;
  readonly createdAt: Date;
}

export interface NewAdminAuditEntry {
  readonly actorId: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId?: string;
  readonly before?: AuditPayload;
  readonly after?: AuditPayload;
}

export interface AuditPage {
  readonly items: AdminAuditEntry[];
  readonly total: number;
}

export interface AdminAuditRepository {
  insert(entry: NewAdminAuditEntry): Promise<void>;
  findPaginated(params: { page: number; limit: number }): Promise<AuditPage>;
}
