/**
 * Product analytics vocabulary shared by the API and the Notes browser app so
 * both emitters agree on event names and categorical property values.
 */
export const PRODUCT_EVENT_NAMES = [
  'user signed up',
  'email verified',
  'note created',
  'note activated',
  'note shared',
  'shared note viewed',
  'ai response completed',
  'mcp key created',
] as const;
export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

export const PRODUCT_ACTOR_TYPES = ['anonymous', 'registered'] as const;
export type ProductActorType = (typeof PRODUCT_ACTOR_TYPES)[number];

export const PRODUCT_USER_ROLES = ['user', 'admin'] as const;
export type ProductUserRole = (typeof PRODUCT_USER_ROLES)[number];

export const NOTE_SHARE_TYPES = ['link', 'collaborator'] as const;
export type NoteShareType = (typeof NOTE_SHARE_TYPES)[number];

export const MCP_SCOPE_LEVELS = ['read', 'write', 'share'] as const;
export type McpScopeLevel = (typeof MCP_SCOPE_LEVELS)[number];

export const AI_ASSISTANT_TYPES = ['selection', 'agent', 'ghost_text'] as const;
export type AIAssistantType = (typeof AI_ASSISTANT_TYPES)[number];

/** Common properties every product event carries about the acting user. */
export interface ProductActorContext {
  actor_type: ProductActorType;
  is_internal: boolean;
  locale: string;
}

/** The only person properties identification may set. */
export interface ProductPersonProperties {
  email: string;
  name: string;
  role: ProductUserRole;
  locale: string;
  is_internal: boolean;
}
