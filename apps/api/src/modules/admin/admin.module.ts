import { Module } from '@nestjs/common';

import { AIModule } from '../ai';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [UsersModule, AIModule],
  controllers: [AdminController],
})
export class AdminModule {}
