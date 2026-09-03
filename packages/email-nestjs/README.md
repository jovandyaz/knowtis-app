# @jovandyaz/email-nestjs

NestJS module for sending emails in Knowtis. Wraps `@jovandyaz/email` templates with configurable senders (Resend, Console) and provides domain-specific services like `AuthEmailService`.

## Features

- **Provider-based architecture** - Swap between Resend (production) and Console (development) senders
- **Global module** - Register once with `forRootAsync`, inject anywhere
- **Ports & Adapters** - `EmailSender` port with `ResendSender` and `ConsoleSender` adapters
- **Result pattern** - Uses `neverthrow` for typed error handling on send operations
- **Auth integration** - `AuthEmailService` implements the auth module's `EmailService` port

## Usage

### Register the module

```ts
// app.module.ts
import { EmailModule } from '@jovandyaz/email-nestjs';

@Module({
  imports: [
    EmailModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        provider: config.get('EMAIL_PROVIDER'), // 'resend' | 'console'
        resend: { apiKey: config.get('RESEND_API_KEY') ?? '' },
        defaults: { from: config.get('EMAIL_FROM') },
        environment: config.get('NODE_ENV'), // required; gates console body output
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

Real wiring: `apps/api/src/app/app.module.ts`.

### Inject AuthEmailService

```ts
import { AuthEmailService } from '@jovandyaz/email-nestjs';

@Injectable()
export class SomeService {
  constructor(private readonly authEmail: AuthEmailService) {}

  async onUserRegistered(
    email: string,
    token: string,
    code: string,
    name: string,
    locale?: string
  ) {
    const result = await this.authEmail.sendEmailVerification(
      email,
      { token, code },
      name,
      locale
    );
    if (result.isErr()) {
      // result.error is an AuthDomainError with code EMAIL_ERROR_SEND_FAILED
    }
  }
}
```

`sendPasswordReset(email, token, name, locale?)` follows the same shape. Links are built as `${FRONTEND_URL}${AUTH_PATH_VERIFY_EMAIL}?token=...` and `${FRONTEND_URL}${AUTH_PATH_RESET_PASSWORD}?token=...`.

## Public API

Exported from `src/index.ts`:

- `EmailModule`, `EmailModuleOptions`
- `AuthEmailService`
- `EmailSender`, `SendEmailOptions`, `EmailSendError` (port)
- `ResendSender`, `ConsoleSender` (adapters)
- DI tokens and constants: `EMAIL_SENDER`, `EMAIL_MODULE_OPTIONS`, `AUTH_PATH_VERIFY_EMAIL`, `AUTH_PATH_RESET_PASSWORD`, `EMAIL_ERROR_SEND_FAILED`, `DEFAULT_FRONTEND_URL`, `DEFAULT_FROM_ADDRESS`

## Project Structure

```
src/
├── adapters/               # EmailSender implementations
│   ├── console.sender.ts   # Logs to console (development)
│   └── resend.sender.ts    # Sends via Resend API (production)
├── ports/                  # Interfaces
│   └── email-sender.port.ts
├── services/               # Domain services
│   └── auth-email.service.ts
├── constants.ts            # DI tokens, default values
├── email.module.ts         # NestJS module definition
├── email.module-definition.ts # Options interface
└── index.ts                # Public API
```

## Configuration

The module itself only receives `EmailModuleOptions`; the host app maps env vars to them (`apps/api/src/config/env.config.ts`). `FRONTEND_URL` is the exception: `EmailModule` reads it through `ConfigService` when constructing `AuthEmailService`.

| Environment Variable | Description                                                                                 | Default                              |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| `EMAIL_PROVIDER`     | `'resend'` or `'console'`                                                                   | `console`                            |
| `RESEND_API_KEY`     | Resend API key; required when provider is `resend`                                          | -                                    |
| `EMAIL_FROM`         | Default sender address (`DEFAULT_FROM_ADDRESS`)                                             | `Knowtis <noreply@mail.knowtis.app>` |
| `FRONTEND_URL`       | Base URL for email action links (`DEFAULT_FRONTEND_URL`)                                    | `http://localhost:4200`              |
| `NODE_ENV`           | Passed as `environment`; the console sender prints bodies only for `development` and `test` | -                                    |

## Building

```bash
nx build email-nestjs
```

## Running unit tests

```bash
nx test email-nestjs
```
