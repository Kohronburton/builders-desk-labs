export const webhookSecret = "0123456789abcdef0123456789abcdef";

export function validPaidOrder(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0",
    eventType: "order.paid",
    eventId: "evt-1001",
    occurredAt: new Date().toISOString(),
    source: { system: "wordpress", siteCode: "main-site" },
    customer: {
      externalCustomerId: "customer-1",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com"
    },
    order: {
      externalOrderId: "1001",
      paymentReference: "payment-1001",
      currency: "USD",
      subtotal: 29900,
      tax: 0,
      total: 29900,
      paymentStatus: "paid",
      paidAt: new Date().toISOString()
    },
    production: {
      packageCode: "PACKAGE_STANDARD",
      peopleCount: 2,
      productBranch: "NO_PRODUCT",
      templateCode: "SCENE_MODERN_01",
      performanceStyleCode: "STYLE_CONVERSATIONAL",
      voiceOptionCode: "VOICE_CUSTOMER_SUPPLIED"
    },
    script: {
      text: "HOST: Hello world\n\nGUEST: Welcome friend",
      speakerMode: "MULTI_SPEAKER",
      declaredWordCount: 6,
      declaredSegmentCount: 2,
      speakers: [
        { speakerCode: "HOST", displayName: "Host" },
        { speakerCode: "GUEST", displayName: "Guest" }
      ]
    },
    uploads: [],
    consents: {
      termsAccepted: true,
      mediaProcessingAccepted: true,
      voiceProcessingAccepted: true,
      acceptedAt: new Date().toISOString(),
      termsVersion: "2026-07"
    },
    ...overrides
  };
}
