#!/usr/bin/env sh
set -eu
BASE_URL="${BASE_URL:-http://localhost:3000}"
for scenario in success timeout-once rate-limit-once invalid-ai-once; do
  request_id="smoke-${scenario}-$(date +%s)"
  printf '\n=== %s ===\n' "$scenario"
  curl --fail-with-body --silent --show-error \
    -H 'content-type: application/json' \
    -d "{\"requestId\":\"${request_id}\",\"sessionId\":\"smoke-test\",\"scenario\":\"${scenario}\",\"message\":\"Production webhook automation stopped and the API is failing intermittently.\"}" \
    "$BASE_URL/v1/workflows/support-triage"
done
printf '\n\nSmoke tests completed.\n'
