import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { NotesModule } from '../notes/notes.module';
import { UsersModule } from '../users/users.module';
import { AccessInvalidationBus } from './access-invalidation.bus';
import { AccessRevalidationService } from './access-revalidation.service';
import { HocuspocusAuthExtension } from './extensions/hocuspocus-auth.extension';
import { HocuspocusPersistenceExtension } from './extensions/hocuspocus-persistence.extension';
import { HocuspocusService } from './hocuspocus.service';
import { NoteAccessChangedListener } from './listeners/note-access-changed.listener';
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
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  providers: [
    AccessRevalidationService,
    AccessInvalidationBus,
    NoteAccessChangedListener,
    HocuspocusAuthExtension,
    HocuspocusPersistenceExtension,
    HocuspocusService,
    NoteUpdatedListener,
  ],
  exports: [HocuspocusService],
})
export class CollaborationModule {}
