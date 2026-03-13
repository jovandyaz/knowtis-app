import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

/**
 * Common 401 Unauthorized response decorator.
 */
export const ApiUnauthorized = () =>
  ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid JWT',
  });

/**
 * Common 403 Forbidden response decorator with a customizable reason.
 */
export const ApiForbidden = (reason: string) =>
  ApiResponse({
    status: 403,
    description: `Forbidden — ${reason}`,
  });

/**
 * Common 400 Bad Request response decorator with a customizable reason.
 */
export const ApiBadRequest = (reason = 'invalid input') =>
  ApiResponse({
    status: 400,
    description: `Bad request — ${reason}`,
  });

/**
 * Common 404 Not Found response decorator.
 * Pass the full reason (e.g. "note does not exist").
 */
export const ApiNotFound = (reason: string) =>
  ApiResponse({
    status: 404,
    description: `Not found — ${reason}`,
  });

/**
 * Combines 401 + 403 responses for protected endpoints.
 */
export const ApiAuthErrors = (forbiddenReason: string) =>
  applyDecorators(ApiUnauthorized(), ApiForbidden(forbiddenReason));
