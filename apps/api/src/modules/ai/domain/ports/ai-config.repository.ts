export const AI_CONFIG_REPOSITORY = Symbol('AI_CONFIG_REPOSITORY');

export interface AIConfigRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, description?: string): Promise<void>;
  getAll(): Promise<Record<string, string>>;
}
