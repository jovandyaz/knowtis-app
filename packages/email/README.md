# @jovandyaz/email

React Email template library for Knowtis. Renders typed, i18n-ready HTML emails from React components using [@react-email](https://react.email).

## Features

- **Typed templates** - Each template has its own props interface via `TemplatePropsMap`
- **i18n support** - Built-in translations for `en` and `es` locales
- **Design tokens** - Shared color palette and typography for consistent branding
- **Tailwind CSS** - Utility-first styling scoped to email-safe output
- **Composable components** - Reusable `Layout`, `Header`, `Footer`, `Button`, and typography primitives

## Templates

| Template         | Description                                  |
| ---------------- | -------------------------------------------- |
| `verify-email`   | Email verification link after registration   |
| `reset-password` | Password reset link for forgot-password flow |

## Usage

```ts
import { renderEmail } from '@jovandyaz/email';

const html = await renderEmail('verify-email', {
  url: 'https://app.knowtis.dev/verify?token=abc',
  locale: 'es',
});
```

## Project Structure

```
src/
├── components/         # Reusable email UI primitives
├── design-tokens/      # Colors, spacing, typography
├── i18n/               # Translations (en, es) and interpolation utils
├── templates/          # Email templates grouped by domain
│   └── auth/           # verify-email, reset-password
├── utils/              # cn() helper (clsx + tailwind-merge)
├── render.ts           # renderEmail() entry point
└── index.ts            # Public API
```

## Building

```bash
nx build email
```

## Running unit tests

```bash
nx test email
```
