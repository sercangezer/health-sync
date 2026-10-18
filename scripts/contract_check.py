#!/usr/bin/env python3
"""
Automated Parity Gate (Section 7 of .agents/rules/infra-requirements.md):
1. Backend routes in services/api_gateway/app.py match api/openapi.yaml 100%
2. Generated client frontend/src/api/client.ts and tech-arch/api-envanteri.md are fresh
3. Every contract operation has at least one frontend consumer (or x-internal: true)
4. Every frontend apiClient.<op>() call resolves to a valid contract operation
5. Prints the Pre-Commit Parity Report table with zero empty cells
"""
import os
from pathlib import Path
import re
import sys
import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from generate_client import (  # noqa: E402
    CLIENT_PATH,
    CONTRACT_PATH,
    ENDPOINT_METADATA,
    INVENTORY_PATH,
    build_client_ts,
    build_inventory_md,
    load_operations,
)

FRONTEND_SRC = ROOT / "frontend" / "src"
IGNORED_ROUTES = {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}


def get_gateway_routes() -> set[tuple[str, str]]:
    os.environ["DATABASE_URL"] = "sqlite:///:memory:"
    from services.api_gateway.app import app

    routes: set[tuple[str, str]] = set()
    for route in app.routes:
        methods = getattr(route, "methods", None)
        path = getattr(route, "path", None)
        if not methods or not path or path in IGNORED_ROUTES:
            continue
        for m in methods:
            if m.upper() in ("GET", "POST", "PUT", "DELETE", "PATCH"):
                routes.add((m.upper(), path))
    return routes


def scan_frontend_usages() -> dict[str, list[str]]:
    usages: dict[str, list[str]] = {}
    pattern = re.compile(r"apiClient\s*\.\s*([A-Za-z0-9_]+)\s*(?:<[^>]*>)?\s*\(")
    if not FRONTEND_SRC.exists():
        return usages
    for path in sorted(FRONTEND_SRC.rglob("*")):
        if path.suffix in (".ts", ".tsx") and path.name != "client.ts":
            text = path.read_text(encoding="utf-8")
            for match in pattern.findall(text):
                usages.setdefault(match, []).append(path.name)
    return usages


def main() -> int:
    print("=== Section 7: Full-Stack Contract Parity Gate ===")
    if not CONTRACT_PATH.exists():
        print(f"FAIL: Missing contract at {CONTRACT_PATH}")
        return 1

    contract = yaml.safe_load(CONTRACT_PATH.read_text(encoding="utf-8"))
    ops = load_operations()
    contract_routes = {(op["method"], op["path"]) for op in ops}
    gateway_routes = get_gateway_routes()

    failed = False

    # Gate 1: Route parity
    missing_in_contract = gateway_routes - contract_routes
    missing_in_gateway = contract_routes - gateway_routes
    if missing_in_contract or missing_in_gateway:
        print(f"FAIL [Gate 1]: Route mismatch! Missing in contract={missing_in_contract}, Missing in gateway={missing_in_gateway}")
        failed = True
    else:
        print(f"PASS [Gate 1]: All {len(gateway_routes)} API Gateway routes match api/openapi.yaml.")

    # Gate 2: Client & inventory freshness
    expected_client = build_client_ts(ops).strip()
    actual_client = CLIENT_PATH.read_text(encoding="utf-8").strip() if CLIENT_PATH.exists() else ""
    expected_inv = build_inventory_md(ops).strip()
    actual_inv = INVENTORY_PATH.read_text(encoding="utf-8").strip() if INVENTORY_PATH.exists() else ""

    if expected_client != actual_client or expected_inv != actual_inv:
        print("FAIL [Gate 2]: Generated client or tech-arch/api-envanteri.md is stale. Run 'make gen-api'.")
        failed = True
    else:
        print("PASS [Gate 2]: frontend/src/api/client.ts and tech-arch/api-envanteri.md are up to date.")

    # Gate 3 & 4: Frontend usage & orphan detection
    usages = scan_frontend_usages()
    valid_op_ids = {op["operation_id"] for op in ops}

    for op in ops:
        op_id = op["operation_id"]
        spec = contract["paths"][op["path"]][op["method"].lower()]
        is_internal = bool(spec.get("x-internal", False))
        if not is_internal and op_id not in usages:
            print(f"FAIL [Gate 3]: Orphan operation '{op_id}' ({op['method']} {op['path']}) has no frontend consumer.")
            failed = True

    for called_op in usages:
        if called_op not in valid_op_ids:
            print(f"FAIL [Gate 4]: Frontend calls unknown operation 'apiClient.{called_op}()'.")
            failed = True

    if not failed:
        print(f"PASS [Gate 3 & 4]: All {len(ops)} operations consumed by frontend with zero orphans.")

    # Pre-Commit Parity Report
    print("\n--- Pre-Commit Parity Report ---")
    print(f"{'Endpoint':<38} | {'Backend handler':<45} | {'Backend test':<48} | {'Frontend consumer'}")
    print("-" * 165)
    for op in ops:
        op_id = op["operation_id"]
        ep_label = f"{op['method']} {op['path']}"
        handler, test_name, _ = ENDPOINT_METADATA.get(op_id, ("", "", ""))
        consumers = ", ".join(sorted(set(usages.get(op_id, []))))
        if not (ep_label and handler and test_name and consumers):
            print(f"FAIL [Parity Report]: Empty cell for {ep_label}")
            failed = True
        print(f"{ep_label:<38} | {handler:<45} | {test_name:<48} | {consumers}")

    if failed:
        return 1
    print("\n=== Automated Parity Gate: 100% PASSED ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
