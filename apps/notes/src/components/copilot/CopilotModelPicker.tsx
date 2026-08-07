import { useAuthUser } from '@jovandyaz/auth-react';

import { useFeatureFlag } from '@knowtis/data-access-feature-flags';
import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { IntentModelPicker } from './IntentModelPicker';
import { ModelListPicker } from './ModelListPicker';

export function CopilotModelPicker() {
  const intentUxOn = useFeatureFlag(FEATURE_FLAG_KEYS.AI_INTENT_UX);
  const user = useAuthUser();

  if (!intentUxOn) {
    return <ModelListPicker />;
  }
  // Anonymous users cannot persist preferences, so they run on the server default intent.
  if (user?.isAnonymous) {
    return null;
  }
  return <IntentModelPicker />;
}
