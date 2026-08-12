/** Largest accepted `?page`. `@IsInt` admits exponent forms like `1e21`, whose OFFSET overflows Postgres' bigint. */
export const MAX_PAGE = 1_000_000;
