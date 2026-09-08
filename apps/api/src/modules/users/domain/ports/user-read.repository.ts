export interface UserReadModel {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly avatarUrl: string | null;
  readonly isAnonymous: boolean;
}

export interface UserReadRepository {
  findByEmail(email: string): Promise<UserReadModel | null>;
}

export const USER_READ_REPOSITORY = Symbol('USER_READ_REPOSITORY');
