import test from "node:test";
import assert from "node:assert/strict";
import { MayneModuleRegistry } from "../dist/index.js";

const module = {
  manifest: {
    id: "property-management-automation",
    name: "Property Management Automation",
    version: "1.0.0",
    maturity: "demo",
    description: "Original property workflow",
    capabilities: ["workflow-automation"],
    foundation: ["logging"],
    owns: ["Property", "MaintenanceRequest"]
  }
};

test("registers and lists an original product module", () => {
  const registry = new MayneModuleRegistry();
  registry.register(module);
  assert.equal(registry.get(module.manifest.id), module);
  assert.deepEqual(registry.list(), [module]);
});

test("rejects duplicate module identifiers", () => {
  const registry = new MayneModuleRegistry();
  registry.register(module);
  assert.throws(() => registry.register(module), /Duplicate Mayne module/);
});
