import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIMetricsService } from '../../ai/application/services/ai-metrics.service';
import type { UsersService } from '../../users/users.service';
import { AdminController } from '../admin.controller';
import type { AdminAuditService } from '../audit/admin-audit.service';

function createMockUsersService() {
  return {
    findById: vi.fn(),
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

function createMockAdminAuditService() {
  return {
    record: vi.fn().mockResolvedValue(undefined),
    findPaginated: vi.fn(),
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
  let adminAuditService: ReturnType<typeof createMockAdminAuditService>;

  beforeEach(() => {
    usersService = createMockUsersService();
    aiMetricsService = createMockAIMetricsService();
    adminAuditService = createMockAdminAuditService();

    controller = new AdminController(
      usersService as unknown as UsersService,
      aiMetricsService as unknown as AIMetricsService,
      adminAuditService as unknown as AdminAuditService,
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

    it('forwards an empty search string as-is', async () => {
      usersService.findPage.mockResolvedValue({ items: [], total: 0 });

      await controller.listUsers({ page: 1, limit: 25, search: '' });

      expect(usersService.findPage).toHaveBeenCalledWith({
        page: 1,
        limit: 25,
        search: '',
      });
    });

    it('propagates a rejection from usersService.findPage', async () => {
      usersService.findPage.mockRejectedValue(new Error('boom'));

      await expect(controller.listUsers({})).rejects.toThrow('boom');
    });
  });

  describe('updateUserRole', () => {
    it('should update role for a different user and record an audit entry', async () => {
      const existingUser = { id: 'other-uuid', role: 'user' };
      const updatedUser = {
        id: 'other-uuid',
        email: 'user@test.com',
        role: 'admin',
      };
      usersService.findById.mockResolvedValue(existingUser);
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
      expect(adminAuditService.record).toHaveBeenCalledWith({
        actorId: ADMIN_USER.id,
        action: 'user.role_changed',
        targetType: 'user',
        targetId: 'other-uuid',
        before: { role: 'user' },
        after: { role: 'admin' },
      });
    });

    it('should throw BadRequestException when changing own role', async () => {
      await expect(
        controller.updateUserRole(ADMIN_USER.id, { role: 'user' }, ADMIN_USER)
      ).rejects.toThrow(BadRequestException);

      expect(usersService.updateRole).not.toHaveBeenCalled();
      expect(adminAuditService.record).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException and not record audit when the target user does not exist', async () => {
      usersService.findById.mockResolvedValue(undefined);

      await expect(
        controller.updateUserRole('missing-uuid', { role: 'admin' }, ADMIN_USER)
      ).rejects.toThrow(NotFoundException);

      expect(usersService.updateRole).not.toHaveBeenCalled();
      expect(adminAuditService.record).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException and not record audit when updateRole returns null', async () => {
      usersService.findById.mockResolvedValue({
        id: 'missing-uuid',
        role: 'user',
      });
      usersService.updateRole.mockResolvedValue(null);

      await expect(
        controller.updateUserRole('missing-uuid', { role: 'admin' }, ADMIN_USER)
      ).rejects.toThrow(NotFoundException);

      expect(adminAuditService.record).not.toHaveBeenCalled();
    });
  });

  describe('listAudit', () => {
    it('returns a paginated envelope with defaults', async () => {
      const page = {
        items: [
          {
            id: 'audit-1',
            actorId: 'admin-uuid',
            actorEmail: 'admin@test.com',
            action: 'user.role_changed',
            targetType: 'user',
            targetId: 'other-uuid',
            before: { role: 'user' },
            after: { role: 'admin' },
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
          },
        ],
        total: 1,
      };
      adminAuditService.findPaginated.mockResolvedValue(page);

      const result = await controller.listAudit({});

      expect(adminAuditService.findPaginated).toHaveBeenCalledWith({
        page: 1,
        limit: 25,
      });
      expect(result).toEqual({
        items: page.items,
        total: 1,
        page: 1,
        limit: 25,
      });
    });

    it('echoes explicit page and limit', async () => {
      adminAuditService.findPaginated.mockResolvedValue({
        items: [],
        total: 0,
      });

      const result = await controller.listAudit({ page: 3, limit: 50 });

      expect(adminAuditService.findPaginated).toHaveBeenCalledWith({
        page: 3,
        limit: 50,
      });
      expect(result).toEqual({ items: [], total: 0, page: 3, limit: 50 });
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
