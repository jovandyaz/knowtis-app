export const AI_CONFIG_REPOSITORY = Symbol('AI_CONFIG_REPOSITORY');

export interface AIConfigRow {
  key: string;
  value: string;
  description: string | null;
  updatedAt: Date;
}

export interface AIConfigRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, description?: string): Promise<void>;
  getAllRows(): Promise<AIConfigRow[]>;
}
