import type { Ability } from '@jovandyaz/permissions-core';
import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator';
import type { PolicyHandler } from './require-permission.decorator';

export const ABILITY_FACTORY_KEY = Symbol('ABILITY_FACTORY');
export const REQUEST_EXTRACTOR_KEY = Symbol('REQUEST_EXTRACTOR');

/** Extracts the request object from a NestJS ExecutionContext. */
export type RequestExtractor = (context: ExecutionContext) => unknown;

/** Interface for creating abilities from incoming requests. */
export interface AbilityFactory<TAbility extends Ability> {
  createAbility(request: unknown): TAbility | Promise<TAbility>;
}

const defaultHttpExtractor: RequestExtractor = (context) =>
  context.switchToHttp().getRequest();

@Injectable()
export class PoliciesGuard<TAbility extends Ability> implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(ABILITY_FACTORY_KEY)
    private readonly abilityFactory: AbilityFactory<TAbility>,
    @Optional()
    @Inject(REQUEST_EXTRACTOR_KEY)
    private readonly extractRequest: RequestExtractor = defaultHttpExtractor
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handlers = this.reflector.getAllAndOverride<
      PolicyHandler<TAbility>[] | undefined
    >(REQUIRE_PERMISSION_KEY, [context.getHandler(), context.getClass()]);

    if (!handlers || handlers.length === 0) {
      return true;
    }

    const request = this.extractRequest(context);
    const ability = await this.abilityFactory.createAbility(request);

    const allPassed = handlers.every((handler) => handler(ability));

    if (!allPassed) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
