import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, ValidateIf } from 'class-validator';

const isProvided = (_: unknown, value: unknown) => value !== undefined;

const readRawValue = Transform(
  ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key]
);

/**
 * Accepts only a real boolean, rejecting `"no"`, `0` and `null`.
 * The global pipe enables implicit conversion, which coerces every non-null
 * value through `Boolean()` before validation runs, so `@IsBoolean()` on its
 * own can never reject; this hands the validator the untouched request value.
 */
export function IsStrictBoolean() {
  return applyDecorators(readRawValue, IsBoolean());
}

/** As `IsStrictBoolean`, but an absent property is left alone. An explicit `null` is still rejected. */
export function IsOptionalStrictBoolean() {
  return applyDecorators(ValidateIf(isProvided), readRawValue, IsBoolean());
}
