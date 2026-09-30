import { Module } from '@nestjs/common';

import { ShutdownDrain } from './shutdown-drain';

@Module({
  providers: [ShutdownDrain],
  exports: [ShutdownDrain],
})
export class ShutdownDrainModule {}
