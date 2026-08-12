/** Largest accepted `?page`. `@IsInt` alone admits exponent forms such as `1e21`, whose `(page - 1) * limit` OFFSET overflows Postgres' bigint and answers 500 instead of 400. */
export const MAX_PAGE = 1_000_000;
