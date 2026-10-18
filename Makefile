.PHONY: gen-api contract-check lint ui-check test check build run down logs migrate deploy

DEPLOY_HOST ?= linuxadmin@h-diyet
DEPLOY_DIR ?= ~/health-sync
COMPOSE_PROJECT_NAME ?= health-sync

gen-api:
	python3 scripts/generate_client.py

contract-check:
	python3 scripts/contract_check.py

lint:
	python3 -m py_compile services/common/*.py services/*/app.py services/test_microservices.py scripts/*.py
	cd frontend && npm run lint

ui-check:
	python3 scripts/check_external_assets.py
	cd frontend && npm run build && npx playwright test

test:
	PYTHONPATH=. pytest services/test_microservices.py -v

check: lint contract-check ui-check test

migrate:
	PYTHONPATH=. python3 -m services.common.migrate_db

build:
	docker compose -p $(COMPOSE_PROJECT_NAME) build

run:
	docker compose -p $(COMPOSE_PROJECT_NAME) up -d --build

down:
	docker compose -p $(COMPOSE_PROJECT_NAME) down

logs:
	@if ssh -o BatchMode=yes -o ConnectTimeout=3 $(DEPLOY_HOST) "test -d $(DEPLOY_DIR)" 2>/dev/null; then \
		ssh $(DEPLOY_HOST) "cd $(DEPLOY_DIR) && docker compose -p $(COMPOSE_PROJECT_NAME) logs --tail=50"; \
	else \
		docker compose -p $(COMPOSE_PROJECT_NAME) logs --tail=50; \
	fi

deploy:
	chmod +x ./esitle.sh
	./esitle.sh
