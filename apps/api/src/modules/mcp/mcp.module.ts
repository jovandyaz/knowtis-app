import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { McpScopeGuard } from './guards/mcp-scope.guard';
import { McpKeysController } from './mcp-keys.controller';
import { McpKeysService } from './mcp-keys.service';
import { TokenExchangeController } from './token-exchange.controller';

@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      signOptions: { algorithm: 'HS256' },
      verifyOptions: { algorithms: ['HS256'] },
    }),
    AuthModule,
  ],
  controllers: [McpKeysController, TokenExchangeController],
  providers: [
    McpKeysService,
    {
      provide: APP_GUARD,
      useClass: McpScopeGuard,
    },
  ],
  exports: [McpKeysService],
})
export class McpModule {}
