import test from "node:test";
import assert from "node:assert/strict";
import type { CatalogueItem, CatalogueKind, CatalogueRepository } from "../src/catalogue/service.js";
import { CatalogueService } from "../src/catalogue/service.js";
import { paidOrderSchema } from "../src/contracts/paid-order.js";
import { validPaidOrder } from "./fixtures.js";

class MemoryCatalogue implements CatalogueRepository {
  constructor(private readonly items: CatalogueItem[]) {}
  async findActive(kind: CatalogueKind, code: string) {
    return this.items.find((item) => item.kind === kind && item.code === code) ?? null;
  }
  async readiness() { return { ok: true }; }
}

function items(placeholder = false): CatalogueItem[] {
  return [
    { kind: "package", code: "PACKAGE_STANDARD", label: "Standard", publicMetadata: { placeholder, maxPeople: 2, productBranches: ["NO_PRODUCT"], templateCodes: ["SCENE_MODERN_01"], styleCodes: ["STYLE_CONVERSATIONAL"], voiceCodes: ["VOICE_CUSTOMER_SUPPLIED"] } },
    { kind: "template", code: "SCENE_MODERN_01", label: "Scene", publicMetadata: { placeholder } },
    { kind: "style", code: "STYLE_CONVERSATIONAL", label: "Style", publicMetadata: { placeholder } },
    { kind: "voice", code: "VOICE_CUSTOMER_SUPPLIED", label: "Voice", publicMetadata: { placeholder } },
    { kind: "product_branch", code: "NO_PRODUCT", label: "Branch", publicMetadata: { placeholder } }
  ];
}

function order() {
  return paidOrderSchema.parse(validPaidOrder());
}

test("approved catalogue accepts compatible selections", async () => {
  const service = new CatalogueService(new MemoryCatalogue(items(false)), false);
  assert.deepEqual(await service.validate(order()), []);
});

test("unknown catalogue code is rejected", async () => {
  const service = new CatalogueService(new MemoryCatalogue(items(false).filter((item) => item.kind !== "template")), false);
  const errors = await service.validate(order());
  assert.ok(errors.some((error) => error.path === "production.templateCode" && error.code === "UNKNOWN_CATALOGUE_CODE"));
});

test("synthetic placeholder catalogue is rejected for production", async () => {
  const service = new CatalogueService(new MemoryCatalogue(items(true)), false);
  const errors = await service.validate(order());
  assert.ok(errors.some((error) => error.code === "PLACEHOLDER_CATALOGUE_CODE"));
});

test("synthetic placeholder catalogue can be used for local/staging integration", async () => {
  const service = new CatalogueService(new MemoryCatalogue(items(true)), true);
  assert.deepEqual(await service.validate(order()), []);
});

test("package people limit is enforced", async () => {
  const payload = validPaidOrder();
  payload.production.peopleCount = 3;
  const service = new CatalogueService(new MemoryCatalogue(items(false)), false);
  const errors = await service.validate(paidOrderSchema.parse(payload));
  assert.ok(errors.some((error) => error.code === "PACKAGE_PEOPLE_LIMIT"));
});
