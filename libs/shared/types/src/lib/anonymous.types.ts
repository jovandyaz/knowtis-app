export interface AnonymousLimits {
  maxNotes: number;
  maxAiRequestsPerDay: number;
}

export const ANONYMOUS_LIMITS: AnonymousLimits = {
  maxNotes: 5,
  maxAiRequestsPerDay: 3,
};
