import type { NestApplicationOptions } from '@nestjs/common';

export const SHUTDOWN_OPTIONS = {
  forceCloseConnections: true,
} satisfies NestApplicationOptions;
