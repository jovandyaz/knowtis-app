# @jovandyaz/email-nestjs

NestJS module for sending emails in Knowtis. Wraps `@jovandyaz/email` templates with configurable senders (Resend, Console) and provides domain-specific services like `AuthEmailService`.

## Features

- **Provider-based architecture** - Swap between Resend (production) and Console (development) senders
- **Global module** - Register once with `forRoot` / `forRootAsync`, inject anywhere
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
        resend: { apiKey: config.get('RESEND_API_KEY') },
        defaults: { from: config.get('EMAIL_FROM') },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### Inject AuthEmailService

```ts
import { AuthEmailService } from '@jovandyaz/email-nestjs';

@Injectable()
export class SomeService {
  constructor(private readonly authEmail: AuthEmailService) {}

  async onUserRegistered(email: string, token: string) {
    const result = await this.authEmail.sendEmailVerification(email, token);
    if (result.isErr()) {
      // handle EmailSendError
    }
  }
}
```

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

| Environment Variable | Description                     | Example                         |
| -------------------- | ------------------------------- | ------------------------------- |
| `EMAIL_PROVIDER`     | `'resend'` or `'console'`       | `console`                       |
| `RESEND_API_KEY`     | Resend API key (prod only)      | `re_xxxxx`                      |
| `EMAIL_FROM`         | Default sender address          | `Knowtis <noreply@knowtis.dev>` |
| `FRONTEND_URL`       | Base URL for email action links | `https://app.knowtis.dev`       |

## Building

```bash
nx build email-nestjs
```

## Running unit tests

```bash
nx test email-nestjs
```
