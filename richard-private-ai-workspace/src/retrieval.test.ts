import { describe, expect, it } from "vitest";
import { records } from "./data";
import { groundedAnswer, retrieve } from "./retrieval";

describe("retrieval", () => {
  it("ranks Android capture context first", () => {
    expect(retrieve("Android camera capture", records)[0]?.sourceId).toBe("src-1042");
  });

  it("returns no evidence for an unrelated request", () => {
    expect(retrieve("quarterly payroll benefits", records)).toHaveLength(0);
  });

  it("includes source count in grounded answers", () => {
    expect(groundedAnswer("routing", retrieve("routing", records))).toContain("grounded in");
  });
});
