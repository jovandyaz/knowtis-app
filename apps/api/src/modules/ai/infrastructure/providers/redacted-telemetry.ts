import type { TelemetrySettings } from 'ai';

/** AI SDK telemetry that records prompt/response content only when explicitly
 * opted in. Callers pass recordContent=false in production and for BYOK turns
 * so traces carry spans/metadata but never user content. */
export function buildRedactedTelemetry(
  functionId: string,
  metadata: TelemetrySettings['metadata'],
  recordContent: boolean
): TelemetrySettings {
  return {
    isEnabled: true,
    recordInputs: recordContent,
    recordOutputs: recordContent,
    functionId,
    ...(metadata !== undefined ? { metadata } : {}),
  };
}
