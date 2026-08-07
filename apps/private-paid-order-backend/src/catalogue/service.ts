import { z } from "zod";
import type { PaidOrder } from "../contracts/paid-order.js";

export type CatalogueKind = "package" | "template" | "style" | "voice" | "product_branch";

export interface CatalogueItem {
  kind: CatalogueKind;
  code: string;
  label: string;
  publicMetadata: unknown;
}

export interface CatalogueRepository {
  findActive(kind: CatalogueKind, code: string): Promise<CatalogueItem | null>;
  readiness(): Promise<{ ok: boolean; detail?: string }>;
}

export interface CatalogueFieldError {
  path: string;
  code: string;
  message: string;
}

const packageMetadataSchema = z.object({
  placeholder: z.boolean().optional().default(false),
  maxPeople: z.number().int().positive().optional(),
  productBranches: z.array(z.string()).optional(),
  templateCodes: z.array(z.string()).optional(),
  styleCodes: z.array(z.string()).optional(),
  voiceCodes: z.array(z.string()).optional()
}).passthrough();

const genericMetadataSchema = z.object({ placeholder: z.boolean().optional().default(false) }).passthrough();

export class CatalogueService {
  constructor(private readonly repository: CatalogueRepository, private readonly allowPlaceholders: boolean) {}

  async validate(order: PaidOrder): Promise<CatalogueFieldError[]> {
    const entries = [
      ["package", order.production.packageCode, "production.packageCode"],
      ["template", order.production.templateCode, "production.templateCode"],
      ["style", order.production.performanceStyleCode, "production.performanceStyleCode"],
      ["voice", order.production.voiceOptionCode, "production.voiceOptionCode"],
      ["product_branch", order.production.productBranch, "production.productBranch"]
    ] as const;

    const resolved = await Promise.all(entries.map(async ([kind, code, path]) => ({
      kind,
      code,
      path,
      item: await this.repository.findActive(kind, code)
    })));
    const errors: CatalogueFieldError[] = [];

    for (const entry of resolved) {
      if (!entry.item) {
        errors.push({ path: entry.path, code: "UNKNOWN_CATALOGUE_CODE", message: `${entry.code} is not an active ${entry.kind} code.` });
        continue;
      }
      const metadata = genericMetadataSchema.safeParse(entry.item.publicMetadata);
      if (metadata.success && metadata.data.placeholder && !this.allowPlaceholders) {
        errors.push({ path: entry.path, code: "PLACEHOLDER_CATALOGUE_CODE", message: `${entry.code} is synthetic placeholder data and is not approved for production.` });
      }
    }

    const packageItem = resolved.find((entry) => entry.kind === "package")?.item;
    if (packageItem) {
      const parsed = packageMetadataSchema.safeParse(packageItem.publicMetadata);
      if (!parsed.success) {
        errors.push({ path: "production.packageCode", code: "CATALOGUE_CONFIGURATION_INVALID", message: "Package configuration is invalid." });
      } else {
        const rules = parsed.data;
        if (rules.maxPeople !== undefined && order.production.peopleCount > rules.maxPeople) {
          errors.push({ path: "production.peopleCount", code: "PACKAGE_PEOPLE_LIMIT", message: `Package allows at most ${rules.maxPeople} people.` });
        }
        const compatibility: Array<[readonly string[] | undefined, string, string, string]> = [
          [rules.productBranches, order.production.productBranch, "production.productBranch", "PRODUCT_BRANCH_NOT_ALLOWED"],
          [rules.templateCodes, order.production.templateCode, "production.templateCode", "TEMPLATE_NOT_ALLOWED"],
          [rules.styleCodes, order.production.performanceStyleCode, "production.performanceStyleCode", "STYLE_NOT_ALLOWED"],
          [rules.voiceCodes, order.production.voiceOptionCode, "production.voiceOptionCode", "VOICE_NOT_ALLOWED"]
        ];
        for (const [allowed, value, path, code] of compatibility) {
          if (allowed && !allowed.includes(value)) {
            errors.push({ path, code, message: `${value} is not allowed for package ${order.production.packageCode}.` });
          }
        }
      }
    }

    return errors;
  }

  readiness() {
    return this.repository.readiness();
  }
}
