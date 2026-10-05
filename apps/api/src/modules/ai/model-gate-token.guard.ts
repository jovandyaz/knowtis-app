import { createHash, timingSafeEqual } from 'node:crypto';

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const BEARER_PREFIX = 'Bearer ';

const digest = (value: string): Buffer =>
  createHash('sha256').update(value).digest();

/**
 * Admits only callers presenting `MODEL_GATE_TOKEN` as a bearer. While the
 * token is unset the routes answer 404, as if they did not exist. Comparing
 * fixed-length digests keeps the check constant-time whatever length is sent.
 */
@Injectable()
export class ModelGateTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('MODEL_GATE_TOKEN');
    if (!expected) {
      throw new NotFoundException();
    }
    const header =
      context.switchToHttp().getRequest<Request>().headers.authorization ?? '';
    const presented = header.startsWith(BEARER_PREFIX)
      ? header.slice(BEARER_PREFIX.length)
      : '';
    if (!timingSafeEqual(digest(presented), digest(expected))) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
