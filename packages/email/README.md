# @jovandyaz/email

React Email template library for Knowtis. Renders typed, i18n-ready HTML emails from React components using [@react-email](https://react.email).

## Features

- **Typed templates** - Each template has its own props interface via `TemplatePropsMap`
- **i18n support** - Built-in translations for `en` and `es` locales
- **Design tokens** - Shared color palette and typography for consistent branding
- **Tailwind CSS** - Utility-first styling scoped to email-safe output
- **Composable components** - Reusable `Layout`, `Header`, `Footer`, `Button`, `VerificationCode`, and typography primitives (`EmailTitle`, `BodyText`)

## Templates

| Template         | Description                                             |
| ---------------- | ------------------------------------------------------- |
| `verify-email`   | Verification link plus one-time code after registration |
| `reset-password` | Password reset link for forgot-password flow            |

## Usage

```ts
import { emailSubject, renderEmail } from '@jovandyaz/email';

const html = await renderEmail('verify-email', {
  name: 'Ada',
  verificationUrl: 'https://knowtis.app/verify-email?token=abc',
  code: '123456',
  locale: 'es',
});
const subject = emailSubject('verify-email', 'es');
```

`reset-password` takes `{ name, resetUrl, locale }`. Props are typed per template through `TemplatePropsMap`.

## Public API

Exported from `src/index.ts`: `renderEmail`, `emailSubject`, `SUPPORTED_LOCALES` (`['en', 'es']`), `DEFAULT_LOCALE` (`'en'`), and the types `Locale`, `TemplateName`, `TemplatePropsMap`.

## Project Structure

```
src/
├── components/         # Reusable email UI primitives
├── design-tokens/      # Colors, spacing, typography
├── i18n/               # config (locales), locales/{en,es}/, interpolation utils
├── templates/          # Email templates grouped by domain
│   └── auth/           # verify-email, reset-password
├── utils/              # cn() helper (clsx + tailwind-merge)
├── render.ts           # renderEmail() entry point
├── subject.ts          # emailSubject()
└── index.ts            # Public API
tailwind.config.ts      # Tailwind config used by the templates
```

## Preview

```bash
pnpm --filter @jovandyaz/email dev   # email dev --dir src/templates --port 3040
```

## Building

```bash
nx build email
```

## Running unit tests

```bash
nx test email
```
