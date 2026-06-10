import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  Body,
  Controller,
  NotFoundException,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { I18nService } from 'nestjs-i18n';

import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly i18n: I18nService
  ) {}

  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @Patch('profile')
  async updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateProfileDto
  ) {
    const updated = await this.usersService.update(user.id, dto);
    if (!updated) {
      throw new NotFoundException(this.i18n.t('validation.USER_NOT_FOUND'));
    }
    return { user: this.usersService.sanitizeUser(updated) };
  }
}
