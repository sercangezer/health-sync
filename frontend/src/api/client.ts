// AUTO-GENERATED FROM api/openapi.yaml BY scripts/generate_client.py — DO NOT EDIT MANUALLY

export interface ApiErrorEnvelope {
  error_code: string;
  message: string;
  details: string;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';

async function requestJson<T>(method: string, path: string, options?: { params?: Record<string, string | number | undefined>; body?: unknown }): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (options?.params) {
    for (const [k, v] of Object.entries(options.params)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }
  const response = await fetch(url.toString(), {
    method,
    headers: options?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    let errPayload: ApiErrorEnvelope = {
      error_code: `HTTP_${response.status}`,
      message: `İstek başarısız oldu (${response.status})`,
      details: path,
    };
    try {
      const parsed = (await response.json()) as Partial<ApiErrorEnvelope>;
      if (parsed && parsed.message) {
        errPayload = {
          error_code: parsed.error_code || errPayload.error_code,
          message: parsed.message,
          details: parsed.details || errPayload.details,
        };
      }
    } catch {
      // Keep default structured error envelope
    }
    throw new Error(errPayload.message);
  }
  return (await response.json()) as T;
}

export const apiClient = {
  getHealth: <T = any>(): Promise<T> =>
    requestJson<T>('GET', '/api/health'),
  getChangelog: <T = any>(): Promise<T> =>
    requestJson<T>('GET', '/api/changelog'),
  getSyncStatus: <T = any>(): Promise<T> =>
    requestJson<T>('GET', '/api/sync/status'),
  triggerSync: <T = any>(body: Record<string, unknown>): Promise<T> =>
    requestJson<T>('POST', '/api/sync/trigger', { body }),
  ingestWebhook: <T = any>(body: Record<string, unknown>): Promise<T> =>
    requestJson<T>('POST', '/api/ingest/webhook', { body }),
  ingestBleScale: <T = any>(body: Record<string, unknown>): Promise<T> =>
    requestJson<T>('POST', '/api/ingest/ble-scale', { body }),
  importHealthFile: <T = any>(body: Record<string, unknown>): Promise<T> =>
    requestJson<T>('POST', '/api/ingest/import-file', { body }),
  getReconciliationRules: <T = any>(): Promise<T> =>
    requestJson<T>('GET', '/api/reconciliation/rules'),
  updateReconciliationRules: <T = any>(body: Record<string, unknown>): Promise<T> =>
    requestJson<T>('PUT', '/api/reconciliation/rules', { body }),
  getDashboardOverview: <T = any>(params?: Record<string, string | number | undefined>): Promise<T> =>
    requestJson<T>('GET', '/api/dashboard/overview', { params }),
  listScaleMeasurements: <T = any>(params?: Record<string, string | number | undefined>): Promise<T> =>
    requestJson<T>('GET', '/api/measurements/scale', { params }),
  bulkDeleteScaleMeasurements: <T = any>(body: Record<string, unknown>): Promise<T> =>
    requestJson<T>('POST', '/api/measurements/scale/bulk-delete', { body }),
  getWearablesComparison: <T = any>(params?: Record<string, string | number | undefined>): Promise<T> =>
    requestJson<T>('GET', '/api/wearables/comparison', { params }),
  getAnalyticsInsights: <T = any>(params?: Record<string, string | number | undefined>): Promise<T> =>
    requestJson<T>('GET', '/api/analytics/insights', { params }),
  getAiPrompts: <T = any>(): Promise<T> =>
    requestJson<T>('GET', '/api/ai/prompts'),
  createAiAnalysis: <T = any>(body: Record<string, unknown>): Promise<T> =>
    requestJson<T>('POST', '/api/ai/analyze', { body }),
  listAiReports: <T = any>(): Promise<T> =>
    requestJson<T>('GET', '/api/ai/reports'),
  getIntegrationSettings: <T = any>(): Promise<T> =>
    requestJson<T>('GET', '/api/settings'),
  updateIntegrationSettings: <T = any>(body: Record<string, unknown>): Promise<T> =>
    requestJson<T>('PUT', '/api/settings', { body }),
  getWebhookHeartbeat: <T = any>(): Promise<T> =>
    requestJson<T>('GET', '/api/webhook/heartbeat'),
  sendWebhookHeartbeat: <T = any>(body: Record<string, unknown>): Promise<T> =>
    requestJson<T>('POST', '/api/webhook/heartbeat', { body }),
};
