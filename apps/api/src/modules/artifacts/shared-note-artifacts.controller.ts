import { Public } from '@jovandyaz/auth-nestjs';
import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { unwrapOrThrow } from '../../core/http';
import { GetSharedNoteArtifactsHandler } from './application';
import { ARTIFACT_ERROR_STATUS_MAP } from './artifact-error-status.map';

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
    return unwrapOrThrow(result, ARTIFACT_ERROR_STATUS_MAP);
  }
}
