import type { RequestUser } from '@jovandyaz/auth';
import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { I18nService } from 'nestjs-i18n';

import { AIMetricsService } from '../ai/application/services/ai-metrics.service';
import type { MetricsPeriod } from '../ai/domain/ports/ai-usage.repository';
import { Roles, RolesGuard } from '../authorization/roles.guard';
import { UsersService } from '../users/users.service';
import { DailyUsageResponseDto } from './dto/daily-usage-response.dto';
import { MetricsSummaryResponseDto } from './dto/metrics-summary-response.dto';
import { PaginatedUsersQueryDto } from './dto/paginated-users-query.dto';
import { PaginatedUsersResponseDto } from './dto/paginated-users-response.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UserResponseDto } from './dto/user-response.dto';

const VALID_PERIODS: readonly MetricsPeriod[] = ['day', 'week', 'month'];

function isMetricsPeriod(value: string): value is MetricsPeriod {
  return (VALID_PERIODS as readonly string[]).includes(value);
}

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly usersService: UsersService,
    private readonly aiMetricsService: AIMetricsService,
    private readonly i18n: I18nService
  ) {}

  @ApiOperation({
    summary: 'List users (paginated)',
    description:
      'Returns non-anonymous users, newest first, with optional case-insensitive email search. Excludes password hashes.',
  })
  @ApiOkResponse({
    type: PaginatedUsersResponseDto,
    description: 'One page of users',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — user does not have admin role',
  })
  @Get('users')
  async listUsers(@Query() query: PaginatedUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const { items, total } = await this.usersService.findPage({
      page,
      limit,
      search: query.search,
    });
    return { items, total, page, limit };
  }

  @ApiOperation({
    summary: 'Update a user role',
    description:
      'Changes the role of a specific user. Admins cannot change their own role to prevent accidental lockout.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'The UUID of the user whose role will be updated',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @ApiBody({ type: UpdateRoleDto })
  @ApiOkResponse({
    type: UserResponseDto,
    description: 'User role updated successfully',
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad request — cannot change your own role or invalid role value',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — user does not have admin role',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found — user with the given ID does not exist',
  })
  @Patch('users/:id/role')
  async updateUserRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() currentUser: RequestUser
  ) {
    if (id === currentUser.id) {
      throw new BadRequestException('Cannot change your own role');
    }
    const updated = await this.usersService.updateRole(id, dto.role);
    if (!updated) {
      throw new NotFoundException(this.i18n.t('validation.USER_NOT_FOUND'));
    }
    return updated;
  }

  @ApiOperation({
    summary: 'Get global AI usage for today',
    description:
      'Returns aggregated AI token usage and cost for the current day across all users.',
  })
  @ApiOkResponse({
    type: DailyUsageResponseDto,
    description: 'Global daily AI usage summary',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — user does not have admin role',
  })
  @Get('ai/usage')
  async getGlobalUsage() {
    return this.aiMetricsService.getGlobalDailyUsage();
  }

  @ApiOperation({
    summary: 'Get global AI metrics for a period',
    description:
      'Returns aggregated AI metrics (requests, tokens, cost) for the specified period, broken down by action type.',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['day', 'week', 'month'],
    description: 'Metrics aggregation period. Defaults to "day" if omitted.',
    example: 'week',
  })
  @ApiOkResponse({
    type: MetricsSummaryResponseDto,
    description: 'Global AI metrics summary for the requested period',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request — invalid period value',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — user does not have admin role',
  })
  @Get('ai/metrics')
  async getGlobalMetrics(@Query('period') period?: string) {
    const validPeriod = this.parsePeriod(period);
    return this.aiMetricsService.getGlobalMetricsSummary(validPeriod);
  }

  private parsePeriod(period?: string): MetricsPeriod {
    if (!period) {
      return 'day';
    }
    if (isMetricsPeriod(period)) {
      return period;
    }
    throw new BadRequestException(
      `Invalid period '${period}'. Must be one of: ${VALID_PERIODS.join(', ')}`
    );
  }
}
