import { Module } from '@nestjs/common';

import { USER_READ_REPOSITORY } from './domain/ports/user-read.repository';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [
    UsersRepository,
    UsersService,
    { provide: USER_READ_REPOSITORY, useExisting: UsersRepository },
  ],
  exports: [UsersService, USER_READ_REPOSITORY],
})
export class UsersModule {}
