export interface ServerActorContext {
  actor_type: 'registered';
  is_internal: boolean;
  locale: string;
}

export interface ServerPersonProperties {
  email: string;
  name: string;
  role: 'user' | 'admin';
  locale: string;
  is_internal: boolean;
}

export interface ServerProductEventMap {
  'user signed up': { source: 'api' };
  'email verified': {
    source: 'api';
    verification_method: 'code' | 'link' | 'password_reset';
  };
  'note created': { source: 'api'; actor_type: 'registered' };
  'note shared': {
    source: 'api';
    share_type: 'link' | 'collaborator';
    permission: 'viewer' | 'editor';
  };
  'mcp key created': {
    source: 'api';
    scope_level: 'read' | 'write' | 'share';
  };
}

export type ServerProductEventName = keyof ServerProductEventMap;
