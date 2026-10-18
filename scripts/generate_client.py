#!/usr/bin/env python3
"""
Generates the typed frontend TypeScript API client (frontend/src/api/client.ts)
and the Turkish API inventory document (tech-arch/api-envanteri.md) directly
from the canonical contract api/openapi.yaml.
"""
from pathlib import Path
from typing import Any, Dict, List
import yaml

ROOT = Path(__file__).resolve().parent.parent
CONTRACT_PATH = ROOT / "api" / "openapi.yaml"
CLIENT_PATH = ROOT / "frontend" / "src" / "api" / "client.ts"
INVENTORY_PATH = ROOT / "tech-arch" / "api-envanteri.md"

ENDPOINT_METADATA = {
    "getHealth": ("services/api_gateway/app.py::get_health", "test_health_and_changelog_endpoints", "Shell.tsx, DashboardScreen.tsx"),
    "getChangelog": ("services/api_gateway/app.py::get_changelog", "test_health_and_changelog_endpoints", "Shell.tsx"),
    "getSyncStatus": ("services/scheduler/app.py::get_sync_status_bundle", "test_circuit_breaker_isolation_and_recovery", "DashboardScreen.tsx, AiScreen.tsx"),
    "triggerSync": ("services/scheduler/app.py::trigger_orchestrated_sync", "test_circuit_breaker_isolation_and_recovery", "DashboardScreen.tsx, ScaleScreen.tsx"),
    "ingestWebhook": ("services/watch6_ingest/app.py::upsert_watch6_daily_records", "test_watch6_and_garmin_webhook_and_comparison", "AiScreen.tsx"),
    "ingestBleScale": ("services/renpho_sync/app.py::upsert_scale_measurement", "test_renpho_ble_scale_ingest_and_13_metrics", "DashboardScreen.tsx, ScaleScreen.tsx"),
    "importHealthFile": ("services/watch6_ingest/app.py::import_health_file_payload", "test_health_connect_sqlite_db_and_csv_import", "ScaleScreen.tsx"),
    "getReconciliationRules": ("services/reconciliation/app.py::get_or_create_config", "test_reconciliation_rules_and_section6_temporal_window_guard", "WearablesScreen.tsx"),
    "updateReconciliationRules": ("services/reconciliation/app.py::update_config", "test_reconciliation_rules_and_section6_temporal_window_guard", "WearablesScreen.tsx"),
    "getDashboardOverview": ("services/api_gateway/app.py::get_dashboard_overview", "test_reconciliation_rules_and_section6_temporal_window_guard", "DashboardScreen.tsx"),
    "listScaleMeasurements": ("services/renpho_sync/app.py::list_scale_records", "test_renpho_ble_scale_ingest_and_13_metrics", "ScaleScreen.tsx"),
    "bulkDeleteScaleMeasurements": ("services/renpho_sync/app.py::bulk_delete_scale_records", "test_scale_bulk_delete_and_validation", "ScaleScreen.tsx"),
    "getWearablesComparison": ("services/reconciliation/app.py::build_wearables_comparison", "test_watch6_and_garmin_webhook_and_comparison", "WearablesScreen.tsx"),
    "getAnalyticsInsights": ("services/analytics_anomaly/app.py::build_analytics_insights", "test_analytics_insights_and_ai_advisor_endpoints", "InsightsScreen.tsx"),
    "getAiPrompts": ("services/ai_advisor/app.py::build_multi_device_prompt", "test_analytics_insights_and_ai_advisor_endpoints", "AiScreen.tsx"),
    "createAiAnalysis": ("services/ai_advisor/app.py::generate_ai_report", "test_analytics_insights_and_ai_advisor_endpoints", "AiScreen.tsx"),
    "listAiReports": ("services/ai_advisor/app.py::list_ai_reports_data", "test_analytics_insights_and_ai_advisor_endpoints", "AiScreen.tsx"),
}


def load_operations() -> List[Dict[str, Any]]:
    contract = yaml.safe_load(CONTRACT_PATH.read_text(encoding="utf-8"))
    ops: List[Dict[str, Any]] = []
    for path, methods in contract.get("paths", {}).items():
        for method, spec in methods.items():
            if method.upper() not in ("GET", "POST", "PUT", "DELETE", "PATCH"):
                continue
            ops.append(
                {
                    "method": method.upper(),
                    "path": path,
                    "operation_id": spec["operationId"],
                    "summary": spec.get("summary", ""),
                    "parameters": spec.get("parameters", []),
                    "has_body": "requestBody" in spec,
                }
            )
    return ops


def build_client_ts(ops: List[Dict[str, Any]]) -> str:
    lines = [
        "// AUTO-GENERATED FROM api/openapi.yaml BY scripts/generate_client.py — DO NOT EDIT MANUALLY",
        "",
        "export interface ApiErrorEnvelope {",
        "  error_code: string;",
        "  message: string;",
        "  details: string;",
        "}",
        "",
        "const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';",
        "",
        "async function requestJson<T>(method: string, path: string, options?: { params?: Record<string, string | number | undefined>; body?: unknown }): Promise<T> {",
        "  const url = new URL(`${API_BASE}${path}`, window.location.origin);",
        "  if (options?.params) {",
        "    for (const [k, v] of Object.entries(options.params)) {",
        "      if (v !== undefined && v !== null && v !== '') {",
        "        url.searchParams.set(k, String(v));",
        "      }",
        "    }",
        "  }",
        "  const response = await fetch(url.toString(), {",
        "    method,",
        "    headers: options?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,",
        "    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,",
        "  });",
        "  if (!response.ok) {",
        "    let errPayload: ApiErrorEnvelope = {",
        "      error_code: `HTTP_${response.status}`,",
        "      message: `İstek başarısız oldu (${response.status})`,",
        "      details: path,",
        "    };",
        "    try {",
        "      const parsed = (await response.json()) as Partial<ApiErrorEnvelope>;",
        "      if (parsed && parsed.message) {",
        "        errPayload = {",
        "          error_code: parsed.error_code || errPayload.error_code,",
        "          message: parsed.message,",
        "          details: parsed.details || errPayload.details,",
        "        };",
        "      }",
        "    } catch {",
        "      // Keep default structured error envelope",
        "    }",
        "    throw new Error(errPayload.message);",
        "  }",
        "  return (await response.json()) as T;",
        "}",
        "",
        "export const apiClient = {",
    ]

    for op in ops:
        op_id = op["operation_id"]
        method = op["method"]
        path = op["path"]
        params = op["parameters"]
        has_body = op["has_body"]

        if params and has_body:
            lines.append(
                f"  {op_id}: <T = any>(params: Record<string, string | number | undefined>, body: Record<string, unknown>): Promise<T> =>"
            )
            lines.append(f"    requestJson<T>('{method}', '{path}', {{ params, body }}),")
        elif params:
            lines.append(
                f"  {op_id}: <T = any>(params?: Record<string, string | number | undefined>): Promise<T> =>"
            )
            lines.append(f"    requestJson<T>('{method}', '{path}', {{ params }}),")
        elif has_body:
            lines.append(f"  {op_id}: <T = any>(body: Record<string, unknown>): Promise<T> =>")
            lines.append(f"    requestJson<T>('{method}', '{path}', {{ body }}),")
        else:
            lines.append(f"  {op_id}: <T = any>(): Promise<T> =>")
            lines.append(f"    requestJson<T>('{method}', '{path}'),")

    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def build_inventory_md(ops: List[Dict[str, Any]]) -> str:
    lines = [
        "# API Envanteri ve Tam Yığın Sözleşme Parite Tablosu",
        "",
        "Bu belge `api/openapi.yaml` sözleşmesinden `make gen-api` komutuyla otomatik üretilir.",
        "",
        "| Uç Nokta (Endpoint) | İşlem Kimliği (`operationId`) | Mikroservis İşleyicisi (Backend Handler) | Backend Testi | Arayüz Tüketicisi (Frontend Consumer) |",
        "| :--- | :--- | :--- | :--- | :--- |",
    ]
    for op in ops:
        op_id = op["operation_id"]
        handler, test_name, consumer = ENDPOINT_METADATA.get(
            op_id, ("services/api_gateway/app.py", "services/test_microservices.py", "App.tsx")
        )
        lines.append(
            f"| `{op['method']} {op['path']}` | `{op_id}` | `{handler}` | `{test_name}` | `{consumer}` |"
        )
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    ops = load_operations()
    CLIENT_PATH.parent.mkdir(parents=True, exist_ok=True)
    INVENTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    CLIENT_PATH.write_text(build_client_ts(ops), encoding="utf-8")
    INVENTORY_PATH.write_text(build_inventory_md(ops), encoding="utf-8")
    print(f"Generated {CLIENT_PATH.relative_to(ROOT)} and {INVENTORY_PATH.relative_to(ROOT)} ({len(ops)} operations).")


if __name__ == "__main__":
    main()
