import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIMetricsService } from '../../ai/application/services/ai-metrics.service';
import type { UsersService } from '../../users/users.service';
import { AdminController } from '../admin.controller';

function createMockUsersService() {
  return {
    findPage: vi.fn(),
    updateRole: vi.fn(),
  };
}

function createMockAIMetricsService() {
  return {
    getGlobalDailyUsage: vi.fn(),
    getGlobalMetricsSummary: vi.fn(),
  };
}

const ADMIN_USER = {
  id: 'admin-uuid',
  email: 'admin@test.com',
  name: 'Admin',
  role: 'admin' as const,
};

describe('AdminController', () => {
  let controller: AdminController;
  let usersService: ReturnType<typeof createMockUsersService>;
  let aiMetricsService: ReturnType<typeof createMockAIMetricsService>;

  beforeEach(() => {
    usersService = createMockUsersService();
    aiMetricsService = createMockAIMetricsService();

    controller = new AdminController(
      usersService as unknown as UsersService,
      aiMetricsService as unknown as AIMetricsService,
      { t: vi.fn().mockReturnValue('User not found') } as unknown as I18nService
    );
  });

  describe('listUsers', () => {
    it('returns a paginated envelope with defaults', async () => {
      const page = {
        items: [{ id: '1', email: 'a@test.com', name: 'A', role: 'user' }],
        total: 1,
      };
      usersService.findPage.mockResolvedValue(page);

      const result = await controller.listUsers({});

      expect(usersService.findPage).toHaveBeenCalledWith({
        page: 1,
        limit: 25,
        search: undefined,
      });
      expect(result).toEqual({
        items: page.items,
        total: 1,
        page: 1,
        limit: 25,
      });
    });

    it('passes page, limit and search through', async () => {
      usersService.findPage.mockResolvedValue({ items: [], total: 0 });

      const result = await controller.listUsers({
        page: 3,
        limit: 50,
        search: 'ada',
      });

      expect(usersService.findPage).toHaveBeenCalledWith({
        page: 3,
        limit: 50,
        search: 'ada',
      });
      expect(result).toEqual({ items: [], total: 0, page: 3, limit: 50 });
    });
  });

  describe('updateUserRole', () => {
    it('should update role for a different user', async () => {
      const updatedUser = {
        id: 'other-uuid',
        email: 'user@test.com',
        role: 'admin',
      };
      usersService.updateRole.mockResolvedValue(updatedUser);

      const result = await controller.updateUserRole(
        'other-uuid',
        { role: 'admin' },
        ADMIN_USER
      );

      expect(result).toEqual(updatedUser);
      expect(usersService.updateRole).toHaveBeenCalledWith(
        'other-uuid',
        'admin'
      );
    });

    it('should throw BadRequestException when changing own role', async () => {
      await expect(
        controller.updateUserRole(ADMIN_USER.id, { role: 'user' }, ADMIN_USER)
      ).rejects.toThrow(BadRequestException);

      expect(usersService.updateRole).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the user does not exist', async () => {
      usersService.updateRole.mockResolvedValue(null);

      await expect(
        controller.updateUserRole('missing-uuid', { role: 'admin' }, ADMIN_USER)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getGlobalUsage', () => {
    it('should return daily usage', async () => {
      const usage = {
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        totalCostUsd: 0.015,
        requestCount: 10,
      };
      aiMetricsService.getGlobalDailyUsage.mockResolvedValue(usage);

      const result = await controller.getGlobalUsage();

      expect(result).toEqual(usage);
      expect(aiMetricsService.getGlobalDailyUsage).toHaveBeenCalled();
    });
  });

  describe('getGlobalMetrics', () => {
    it('should return metrics with default period when none provided', async () => {
      const metrics = { totalRequests: 100, totalInputTokens: 5000 };
      aiMetricsService.getGlobalMetricsSummary.mockResolvedValue(metrics);

      const result = await controller.getGlobalMetrics(undefined);

      expect(result).toEqual(metrics);
      expect(aiMetricsService.getGlobalMetricsSummary).toHaveBeenCalledWith(
        'day'
      );
    });

    it('should accept valid period values', async () => {
      const metrics = { totalRequests: 200 };
      aiMetricsService.getGlobalMetricsSummary.mockResolvedValue(metrics);

      for (const period of ['day', 'week', 'month']) {
        await controller.getGlobalMetrics(period);
        expect(aiMetricsService.getGlobalMetricsSummary).toHaveBeenCalledWith(
          period
        );
      }
    });

    it('should throw BadRequestException for invalid period', async () => {
      await expect(controller.getGlobalMetrics('year')).rejects.toThrow(
        BadRequestException
      );

      expect(aiMetricsService.getGlobalMetricsSummary).not.toHaveBeenCalled();
    });
  });
});
