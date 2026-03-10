import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { McpKeysController } from './mcp-keys.controller';
import { McpKeysService } from './mcp-keys.service';
import { TokenExchangeController } from './token-exchange.controller';

@Module({
  imports: [JwtModule.register({})],
  controllers: [McpKeysController, TokenExchangeController],
  providers: [McpKeysService],
  exports: [McpKeysService],
})
export class McpModule {}
