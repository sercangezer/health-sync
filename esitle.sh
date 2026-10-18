#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${DEPLOY_HOST:-linuxadmin@h-diyet}"
REMOTE_DIR="${DEPLOY_DIR:-~/health-sync}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-health-sync}"

echo "=== [1/4] Rsyncing /GIT/health-sync to ${REMOTE_HOST}:${REMOTE_DIR} ==="
ssh "${REMOTE_HOST}" "mkdir -p ${REMOTE_DIR}"
rsync -az --delete \
  --exclude '.git' \
  --exclude 'frontend/node_modules' \
  --exclude 'frontend/dist' \
  --exclude 'frontend/test-results' \
  --exclude 'frontend/playwright-report' \
  --exclude '__pycache__' \
  --exclude '.pytest_cache' \
  /GIT/health-sync/ "${REMOTE_HOST}:${REMOTE_DIR}/"

echo "=== [2/4] Building and starting 11 microservices on ${REMOTE_HOST} ==="
ssh "${REMOTE_HOST}" "cd ${REMOTE_DIR} && docker compose -p ${PROJECT_NAME} up -d --build"

echo "=== [3/4] Waiting for API Gateway and Frontend health checks on ${REMOTE_HOST} ==="
ssh "${REMOTE_HOST}" "
  for i in \$(seq 1 30); do
    if curl -fsS http://127.0.0.1:8996/api/health >/dev/null 2>&1 && curl -fsS http://127.0.0.1:8997/ >/dev/null 2>&1; then
      echo 'All gateway and frontend endpoints are healthy!'
      exit 0
    fi
    sleep 2
  done
  echo 'Timeout waiting for services to become healthy' >&2
  docker compose -p ${PROJECT_NAME} ps
  exit 1
"

echo "=== [4/4] Verifying live container statuses on ${REMOTE_HOST} ==="
ssh "${REMOTE_HOST}" "cd ${REMOTE_DIR} && docker compose -p ${PROJECT_NAME} ps"
