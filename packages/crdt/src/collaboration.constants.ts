export const COLLAB_CONFIG = {
  CHANNEL_NAME: 'collaborative-knowtis-sync',
  ROOM_PREFIX: 'knowtis-collab',
  PRESENCE_INTERVAL_MS: 5000,
  STALE_USER_TIMEOUT_MS: 12000,
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
  AWARENESS: 'awareness',
  PRESENCE: 'presence',
  UPDATE: 'update',
  LEAVE: 'leave',
} as const;

/**
 * Type representing valid broadcast message types
 */
export type BroadcastMessageType =
  (typeof BROADCAST_MESSAGE_TYPES)[keyof typeof BROADCAST_MESSAGE_TYPES];
