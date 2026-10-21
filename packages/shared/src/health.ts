export interface HealthStatus {
  /** 'error' is sent with HTTP 503 when the database check fails. */
  status: 'ok' | 'error';
  db: 'ok' | 'down';
  service: string;
  version: string;
  time: string;
}
