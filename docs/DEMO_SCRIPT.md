# 90-Second Demo Script

## 0:00–0:15 — Frame the problem
“This is not another chatbot. It is a reliability lab for the failures that break production AI workflows: malformed webhooks, timeouts, rate limits, invalid model JSON, duplicate delivery, and missing auditability.”

## 0:15–0:30 — Show architecture
Open n8n and point out webhook ingress, normalization, reliability-engine call, controlled success response, and error route. Mention that business rules live in testable code rather than being hidden across visual nodes.

## 0:30–0:50 — Show recovery
In the browser choose **Timeout once, then recover**. Run it. Highlight `diagnosticsAttempts: 2`, completed status, and the persisted audit row.

## 0:50–1:05 — Show AI output enforcement
Choose **Invalid AI JSON once, then repair** with a new request ID. Highlight `aiAttempts: 2` and the final structured contract.

## 1:05–1:20 — Show idempotency
Run the same request ID again. Highlight `duplicate=true` and explain that downstream work did not run again.

## 1:20–1:30 — Close
Show `/metrics`, tests, and documentation. “The same pattern can be applied to an existing n8n SaaS workflow without rewriting the whole platform.”
