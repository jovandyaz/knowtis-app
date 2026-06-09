import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

import { McpScopeGuard } from './guards/mcp-scope.guard';
import { McpKeysController } from './mcp-keys.controller';
import { McpKeysService } from './mcp-keys.service';
import { TokenExchangeController } from './token-exchange.controller';

@Module({
  imports: [JwtModule.register({})],
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
