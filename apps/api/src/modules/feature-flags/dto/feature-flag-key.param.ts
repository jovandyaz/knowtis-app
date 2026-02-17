import { Matches, MaxLength } from 'class-validator';

export class FeatureFlagKeyParam {
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'Flag key must contain only lowercase letters, numbers, and underscores',
  })
  @MaxLength(100)
  key!: string;
}
