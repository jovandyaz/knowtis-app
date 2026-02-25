import 'i18next';

import type { enAuth, enCommon, enErrors, enNotes } from '@knowtis/shared-i18n';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof enCommon;
      auth: typeof enAuth;
      notes: typeof enNotes;
      errors: typeof enErrors;
    };
  }
}
