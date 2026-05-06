import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { NotesModule } from '../notes';
import { UsersModule } from '../users';
import { HocuspocusAuthExtension } from './extensions/hocuspocus-auth.extension';
import { HocuspocusPersistenceExtension } from './extensions/hocuspocus-persistence.extension';
import { HocuspocusService } from './hocuspocus.service';
import { NoteUpdatedListener } from './listeners/note-updated.listener';

@Module({
  imports: [
    ConfigModule,
    NotesModule,
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow('JWT_SECRET'),
      }),
    }),
  ],
  providers: [
    HocuspocusAuthExtension,
    HocuspocusPersistenceExtension,
    HocuspocusService,
    NoteUpdatedListener,
  ],
  exports: [HocuspocusService],
})
export class CollaborationModule {}
