export const COLLAB_CONFIG = {
  CHANNEL_NAME: 'collaborative-knowtis-sync',
  PROVIDER_INIT_DELAY_MS: 100,
  CURSOR_COLORS: [
    '#f87171', // red
    '#fb923c', // orange
    '#facc15', // yellow
    '#4ade80', // green
    '#22d3ee', // cyan
    '#818cf8', // indigo
    '#c084fc', // purple
    '#f472b6', // pink
  ],
} as const;

/**
 * Message types for cross-tab communication in collaborative editing
 */
export const BROADCAST_MESSAGE_TYPES = {
  UPDATE: 'update',
} as const;
