#!/usr/bin/env sh
set -eu
docker compose exec n8n n8n import:workflow --input=/workflows/support-triage.json
docker compose exec n8n n8n import:workflow --input=/workflows/error-handler.json
printf '\nImported workflows. Open http://localhost:5678 and activate the support workflow after review.\n'
