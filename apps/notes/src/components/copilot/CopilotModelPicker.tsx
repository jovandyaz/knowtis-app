import {
  useAISettings,
  useAvailableModels,
  useUpdateAISettings,
} from '@/hooks';
import { useAgentStore } from '@/stores/agent.store';
import { useAuthUser } from '@jovandyaz/auth-react';

import { DEFAULT_MODEL_INTENT, type ModelIntent } from '@knowtis/shared-types';

import { advancedOverride } from './intent-picker-options';
import { IntentModelPicker } from './IntentModelPicker';

export function CopilotModelPicker() {
  const user = useAuthUser();
  // Anonymous users cannot persist preferences, so they run on the server default intent and get no picker.
  const showPicker = user != null && !user.isAnonymous;
  const { data: models, isError, refetch } = useAvailableModels(showPicker);
  const { data: prefs } = useAISettings(showPicker);
  const { mutate: update } = useUpdateAISettings();
  const sessionModel = useAgentStore((s) => s.selectedModel);
  const setSessionModel = useAgentStore((s) => s.setSelectedModel);

  const selectIntent = (value: ModelIntent) => {
    setSessionModel(null);
    update({ preferredModel: null, preferredIntent: value });
  };

  const clearOverride = () => {
    setSessionModel(null);
    update({ preferredModel: null });
  };

  if (!showPicker) {
    return null;
  }

  return (
    <IntentModelPicker
      models={models}
      isError={isError}
      onRetry={() => void refetch()}
      intent={prefs?.preferredIntent ?? DEFAULT_MODEL_INTENT}
      overrideModel={
        sessionModel ?? advancedOverride(prefs?.preferredModel, models)
      }
      onSelectIntent={selectIntent}
      onSelectModel={setSessionModel}
      onClearOverride={clearOverride}
      triggerClassName="h-8"
    />
  );
}
