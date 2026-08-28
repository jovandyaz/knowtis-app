import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ConsoleSender } from './adapters/console.sender';
import { ResendSender } from './adapters/resend.sender';
import {
  DEFAULT_FRONTEND_URL,
  EMAIL_MODULE_OPTIONS,
  EMAIL_SENDER,
} from './constants';
import type { EmailModuleOptions } from './email.module-definition';
import type { EmailSender } from './ports/email-sender.port';
import { AuthEmailService } from './services/auth-email.service';

@Module({})
export class EmailModule {
  /* eslint-disable @typescript-eslint/no-explicit-any -- NestJS DI requires any[] for useFactory/inject */
  static forRootAsync(options: {
    useFactory: (
      ...args: any[]
    ) => EmailModuleOptions | Promise<EmailModuleOptions>;
    inject?: any[];
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }): DynamicModule {
    return {
      module: EmailModule,
      global: true,
      providers: [
        {
          provide: EMAIL_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        {
          provide: EMAIL_SENDER,
          useFactory: (moduleOptions: EmailModuleOptions): EmailSender =>
            EmailModule.createSender(moduleOptions),
          inject: [EMAIL_MODULE_OPTIONS],
        },
        {
          provide: AuthEmailService,
          useFactory: (
            sender: EmailSender,
            moduleOptions: EmailModuleOptions,
            configService: ConfigService
          ) =>
            new AuthEmailService(
              sender,
              moduleOptions.defaults,
              configService.get('FRONTEND_URL', DEFAULT_FRONTEND_URL)
            ),
          inject: [EMAIL_SENDER, EMAIL_MODULE_OPTIONS, ConfigService],
        },
      ],
      exports: [EMAIL_SENDER, AuthEmailService],
    };
  }

  private static createSender(options: EmailModuleOptions): EmailSender {
    if (options.provider === 'resend') {
      if (!options.resend?.apiKey) {
        throw new Error(
          'RESEND_API_KEY is required when EMAIL_PROVIDER=resend'
        );
      }
      return new ResendSender(options.resend.apiKey);
    }
    return new ConsoleSender(options.environment);
  }
}
