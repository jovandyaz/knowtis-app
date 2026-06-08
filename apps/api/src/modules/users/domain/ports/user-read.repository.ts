export interface UserReadModel {
  readonly id: string;
}

export interface UserReadRepository {
  findByEmail(email: string): Promise<UserReadModel | null>;
}

export const USER_READ_REPOSITORY = Symbol('USER_READ_REPOSITORY');
