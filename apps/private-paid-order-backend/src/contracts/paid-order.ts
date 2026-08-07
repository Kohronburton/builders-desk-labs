import { z } from "zod";

const code = z.string().trim().min(1).max(100).regex(/^[A-Z0-9][A-Z0-9_-]*$/);
const money = z.number().int().nonnegative();

export const paidOrderSchema = z.object({
  schemaVersion: z.literal("1.0"),
  eventType: z.literal("order.paid"),
  eventId: z.string().trim().min(1).max(200),
  occurredAt: z.string().datetime({ offset: true }),
  source: z.object({
    system: z.literal("wordpress"),
    siteCode: z.string().trim().min(1).max(100)
  }).strict(),
  customer: z.object({
    externalCustomerId: z.string().trim().min(1).max(200).optional(),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(320),
    phone: z.string().trim().max(40).optional()
  }).strict(),
  order: z.object({
    externalOrderId: z.string().trim().min(1).max(200),
    paymentReference: z.string().trim().min(1).max(250),
    currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
    subtotal: money,
    tax: money,
    total: money,
    paymentStatus: z.literal("paid"),
    paidAt: z.string().datetime({ offset: true })
  }).strict().superRefine((order, ctx) => {
    if (order.subtotal + order.tax !== order.total) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["total"], message: "total must equal subtotal + tax" });
    }
  }),
  production: z.object({
    packageCode: code,
    peopleCount: z.number().int().min(1).max(20),
    productBranch: code,
    templateCode: code,
    performanceStyleCode: code,
    voiceOptionCode: code,
    customerNotes: z.string().max(5000).optional()
  }).strict(),
  script: z.object({
    text: z.string().min(1).max(200_000),
    speakerMode: z.enum(["SINGLE_SPEAKER", "MULTI_SPEAKER"]),
    declaredWordCount: z.number().int().nonnegative(),
    declaredSegmentCount: z.number().int().positive(),
    speakers: z.array(z.object({
      speakerCode: code,
      displayName: z.string().trim().min(1).max(100)
    }).strict()).min(1).max(20)
  }).strict(),
  uploads: z.array(z.object({
    externalAssetId: z.string().trim().min(1).max(200),
    assetType: code,
    fileName: z.string().trim().min(1).max(255),
    contentType: z.string().trim().min(1).max(150),
    sizeBytes: z.number().int().positive(),
    temporaryUrl: z.string().url().refine((value) => new URL(value).protocol === "https:", "temporaryUrl must use HTTPS"),
    checksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional()
  }).strict()).max(50),
  consents: z.object({
    termsAccepted: z.literal(true),
    mediaProcessingAccepted: z.literal(true),
    voiceProcessingAccepted: z.boolean(),
    acceptedAt: z.string().datetime({ offset: true }),
    termsVersion: z.string().trim().min(1).max(100)
  }).strict()
}).strict();

export type PaidOrder = z.infer<typeof paidOrderSchema>;

export interface FieldError {
  path: string;
  code: string;
  message: string;
}

export function fieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message
  }));
}
