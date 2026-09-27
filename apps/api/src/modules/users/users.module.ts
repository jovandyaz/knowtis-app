import { Module } from '@nestjs/common';

import { USER_READ_REPOSITORY } from './domain/ports/user-read.repository';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { VerifiedIdentityPolicy } from './verified-identity.policy';

@Module({
  controllers: [UsersController],
  providers: [
    UsersRepository,
    UsersService,
    VerifiedIdentityPolicy,
    { provide: USER_READ_REPOSITORY, useExisting: UsersRepository },
  ],
  exports: [UsersService, USER_READ_REPOSITORY, VerifiedIdentityPolicy],
})
export class UsersModule {}
