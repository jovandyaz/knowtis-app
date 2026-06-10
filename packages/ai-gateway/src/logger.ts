export interface GatewayLogger {
  warn(payload: Record<string, unknown>): void;
  error(payload: Record<string, unknown>): void;
}
