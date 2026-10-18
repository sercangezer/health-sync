import os
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional
import httpx


class CircuitBreakerOpenError(RuntimeError):
    """Raised when a microservice circuit breaker is currently OPEN."""


class CircuitBreaker:
    """
    Fault-isolating Circuit Breaker (CLOSED -> OPEN -> HALF_OPEN -> CLOSED)
    for inter-microservice communication.
    """

    def __init__(
        self,
        service_name: str,
        role: str,
        failure_threshold: Optional[int] = None,
        recovery_seconds: Optional[float] = None,
    ):
        self.service_name = service_name
        self.role = role
        self.failure_threshold = failure_threshold or int(os.getenv("CIRCUIT_FAILURE_THRESHOLD", "3"))
        self.recovery_seconds = recovery_seconds or float(os.getenv("CIRCUIT_RECOVERY_SECONDS", "30"))
        self.state = "CLOSED"
        self.failure_count = 0
        self.last_failure_epoch = 0.0
        self.last_latency_ms = 1.2
        self.last_check_iso = datetime.now(timezone.utc).isoformat()

    def _evaluate_window(self) -> str:
        if self.state == "OPEN":
            elapsed = time.monotonic() - self.last_failure_epoch
            if elapsed >= self.recovery_seconds:
                self.state = "HALF_OPEN"
        return self.state

    def allow_request(self) -> bool:
        current = self._evaluate_window()
        return current in ("CLOSED", "HALF_OPEN")

    def record_success(self, latency_ms: float) -> None:
        self.failure_count = 0
        self.state = "CLOSED"
        self.last_latency_ms = round(max(0.1, latency_ms), 2)
        self.last_check_iso = datetime.now(timezone.utc).isoformat()

    def record_failure(self, latency_ms: float = 0.0) -> None:
        self.failure_count += 1
        self.last_failure_epoch = time.monotonic()
        if latency_ms > 0:
            self.last_latency_ms = round(latency_ms, 2)
        self.last_check_iso = datetime.now(timezone.utc).isoformat()
        if self.failure_count >= self.failure_threshold or self.state == "HALF_OPEN":
            self.state = "OPEN"

    def snapshot(self) -> Dict[str, Any]:
        current = self._evaluate_window()
        health_status = "healthy" if current == "CLOSED" else ("degraded" if current == "HALF_OPEN" else "unavailable")
        return {
            "name": self.service_name,
            "role": self.role,
            "status": health_status,
            "circuit_state": current,
            "latency_ms": self.last_latency_ms,
            "last_check": self.last_check_iso,
        }


class ResilientServiceRegistry:
    """Manages circuit breakers and fallback execution for all downstream microservices."""

    def __init__(self):
        self.breakers: Dict[str, CircuitBreaker] = {
            "renpho-sync-service": CircuitBreaker("renpho-sync-service", "Renpho ES-26BB-B Cloud & BLE Sync"),
            "garmin-sync-service": CircuitBreaker("garmin-sync-service", "Garmin Connect Smart Band Sync"),
            "watch6-ingest-service": CircuitBreaker("watch6-ingest-service", "Galaxy Watch6 Webhook & DB Ingest"),
            "reconciliation-service": CircuitBreaker("reconciliation-service", "Multi-Device Priority & Cycle Guard"),
            "analytics-anomaly-service": CircuitBreaker("analytics-anomaly-service", "Recovery, Pearson r & Anomaly Engine"),
            "ai-advisor-service": CircuitBreaker("ai-advisor-service", "Gemini AI & Prompt Studio"),
            "scheduler-orchestrator": CircuitBreaker("scheduler-orchestrator", "Automated Sync & Pipeline Orchestrator"),
        }

    def get_breaker(self, service_name: str) -> CircuitBreaker:
        if service_name not in self.breakers:
            self.breakers[service_name] = CircuitBreaker(service_name, service_name)
        return self.breakers[service_name]

    def execute_with_resilience(
        self,
        service_name: str,
        operation: Callable[[], Any],
        fallback: Optional[Callable[[], Any]] = None,
    ) -> Any:
        breaker = self.get_breaker(service_name)
        if not breaker.allow_request():
            if fallback is not None:
                return fallback()
            raise CircuitBreakerOpenError(f"Circuit breaker OPEN for {service_name}")

        start = time.monotonic()
        try:
            result = operation()
            elapsed_ms = (time.monotonic() - start) * 1000.0
            breaker.record_success(elapsed_ms)
            return result
        except Exception:
            elapsed_ms = (time.monotonic() - start) * 1000.0
            breaker.record_failure(elapsed_ms)
            if fallback is not None:
                return fallback()
            raise

    def call_http_or_local(
        self,
        service_name: str,
        base_url: Optional[str],
        method: str,
        path: str,
        local_handler: Callable[[], Any],
        fallback: Optional[Callable[[], Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """
        Calls remote microservice via HTTP when REMOTE_MICROSERVICES_ENABLED=1,
        or executes the microservice handler in-process with identical CircuitBreaker isolation.
        """
        use_remote = os.getenv("REMOTE_MICROSERVICES_ENABLED", "0") == "1" and bool(base_url)
        timeout = float(os.getenv("SERVICE_TIMEOUT_SECONDS", "5.0"))

        def _op():
            if use_remote:
                url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
                with httpx.Client(timeout=timeout) as client:
                    resp = client.request(method=method.upper(), url=url, json=json_body, params=params)
                    resp.raise_for_status()
                    return resp.json()
            return local_handler()

        return self.execute_with_resilience(service_name=service_name, operation=_op, fallback=fallback)

    def all_statuses(self) -> list[Dict[str, Any]]:
        return [b.snapshot() for b in self.breakers.values()]


registry = ResilientServiceRegistry()
