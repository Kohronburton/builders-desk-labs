# WordPress Developer Handoff

This backend starts only after WooCommerce confirms successful payment. WordPress sends one outbound signed webhook; it does not query production records back from the private backend.

## Staging values to receive from backend owner

- staging endpoint URL
- `X-Webhook-Key-Id`
- staging webhook secret
- allowed WordPress upload hostname(s)
- agreed payload schema version (`1.0`)
- authoritative package/template/style/voice codes once approved
- authoritative word/segment rules once approved

Never commit webhook secrets to the WordPress repository. Store them using the hosting platform's secret/environment mechanism.

## PHP signing example

```php
<?php
function send_paid_order_webhook(array $payload): array {
    $url = getenv('PRIVATE_BACKEND_PAID_ORDER_URL');
    $key_id = getenv('PRIVATE_BACKEND_WEBHOOK_KEY_ID');
    $secret = getenv('PRIVATE_BACKEND_WEBHOOK_SECRET');

    if (!$url || !$key_id || !$secret) {
        throw new RuntimeException('Private backend webhook configuration is missing');
    }

    // Encode once. Sign and send this exact string.
    $body = wp_json_encode($payload, JSON_UNESCAPED_SLASHES);
    if ($body === false) {
        throw new RuntimeException('Could not encode paid-order payload');
    }

    $timestamp = (string) time();
    $nonce = wp_generate_uuid4();
    $order_id = (string) $payload['order']['externalOrderId'];
    $idempotency_key = 'wc-order-' . $order_id . '-paid';

    $canonical = $timestamp . '.' . $nonce . '.' . $body;
    $digest = hash_hmac('sha256', $canonical, $secret);
    $signature = 'sha256=' . $digest;

    $response = wp_remote_post($url, [
        'timeout' => 15,
        'redirection' => 0,
        'headers' => [
            'Content-Type' => 'application/json',
            'X-Webhook-Key-Id' => $key_id,
            'X-Webhook-Timestamp' => $timestamp,
            'X-Webhook-Nonce' => $nonce,
            'X-Webhook-Signature' => $signature,
            'X-Idempotency-Key' => $idempotency_key,
        ],
        'body' => $body,
    ]);

    if (is_wp_error($response)) {
        return [
            'ok' => false,
            'status' => 0,
            'error' => $response->get_error_message(),
            'retryable' => true,
        ];
    }

    $status = wp_remote_retrieve_response_code($response);
    $response_body = wp_remote_retrieve_body($response);

    return [
        'ok' => $status >= 200 && $status < 300,
        'status' => $status,
        'body' => $response_body,
        'retryable' => in_array($status, [408, 429, 500, 502, 503, 504], true),
    ];
}
```

## Critical signing rule

Do **not** do this:

1. encode JSON
2. sign it
3. modify/reformat payload
4. encode again
5. send the second body

The signature will fail because the raw bytes changed. Encode once, sign that exact string, and send that same string.

## WordPress event timing

Trigger only after the order is confirmed paid according to the site's approved WooCommerce payment lifecycle. Do not send on cart submission, Gravity Forms submission alone, pending payment, failed payment, or checkout-page load.

The exact WooCommerce hook/event is a website-side implementation decision and must be validated with the site's payment methods. The backend only trusts `paymentStatus: "paid"` after the request has passed HMAC verification.

## Upload metadata

For each customer upload send:

- stable `externalAssetId`
- business `assetType`
- original file name
- declared MIME type
- exact size in bytes
- HTTPS temporary URL reachable by the private backend
- SHA-256 checksum when available

The temporary URL hostname must match the backend allow-list exactly. Redirect chains are refused. Production will stop using the WordPress URL after successful private ingestion.

## Debugging a failed request

Capture these safe values in WordPress logs:

- external WooCommerce order ID
- event ID
- idempotency key
- timestamp
- nonce
- key ID
- backend HTTP status
- backend `requestId`
- backend validation error body

Never log:

- webhook secret
- full HMAC secret material
- customer voice/media contents
- private storage credentials

## Staging test sequence

1. Backend operator supplies staging URL/key.
2. WordPress developer builds payload matching `docs/paid-order.schema.json`.
3. Test a synthetic valid order.
4. Confirm HTTP 201 and one backend job.
5. Send same logical order again with a new timestamp/nonce but same idempotency key; confirm HTTP 200 and same job ID.
6. Alter the body after signing; confirm 401.
7. Send an invalid email; confirm 422 with `customer.email` error.
8. Send an expired signed request; confirm 401.
9. Test a synthetic upload from the approved WordPress upload hostname and confirm the backend worker rehosts it privately.
10. Do not enable real paid traffic until segmentation/pricing/catalogue placeholders are resolved and `BUSINESS_RULES_APPROVED=true`.

## Retry ownership

WordPress should persist enough safe delivery state to retry transient network/server failures without relying on a browser session. A retry must keep the same logical order/event identifiers and idempotency key while generating a fresh timestamp, nonce, and signature.
