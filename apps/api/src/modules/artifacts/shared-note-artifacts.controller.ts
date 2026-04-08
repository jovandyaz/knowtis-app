import { Public } from '@jovandyaz/auth-nestjs';
import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { GetSharedNoteArtifactsHandler } from './application';
import { unwrapOrThrow } from './helpers';

@ApiTags('Shared Notes')
@Controller('notes/shared')
export class SharedNoteArtifactsController {
  constructor(
    private readonly getSharedNoteArtifactsHandler: GetSharedNoteArtifactsHandler
  ) {}

  @ApiOperation({ summary: 'List artifacts for a shared note (public)' })
  @Public()
  @Get(':token/artifacts')
  async getArtifacts(@Param('token') token: string) {
    const result = await this.getSharedNoteArtifactsHandler.execute(token);
    return unwrapOrThrow(result);
  }
}
