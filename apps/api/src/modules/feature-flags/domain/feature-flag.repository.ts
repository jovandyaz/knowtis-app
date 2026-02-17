export const FEATURE_FLAG_REPOSITORY = Symbol('FEATURE_FLAG_REPOSITORY');

export interface FeatureFlagEntity {
  readonly key: string;
  readonly enabled: boolean;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UpsertFeatureFlagData {
  readonly key: string;
  readonly enabled: boolean;
  readonly description?: string;
}

export interface FeatureFlagRepository {
  findByKey(key: string): Promise<FeatureFlagEntity | null>;
  findAll(): Promise<FeatureFlagEntity[]>;
  upsert(data: UpsertFeatureFlagData): Promise<FeatureFlagEntity>;
  delete(key: string): Promise<void>;
}
