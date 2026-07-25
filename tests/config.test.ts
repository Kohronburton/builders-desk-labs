import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertBranchWriteAllowed,
  resolveAllowedRepo,
} from "../src/config.js";

const originalEnv = { ...process.env };
const tempPaths: string[] = [];

afterEach(async () => {
  process.env = { ...originalEnv };
  await Promise.all(
    tempPaths.splice(0).map((item) => rm(item, { recursive: true, force: true })),
  );
});

describe("repository allow-list", () => {
  it("allows a repository inside a configured root", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "claude-github-"));
    tempPaths.push(root);
    const repo = path.join(root, "repo");
    await mkdir(repo);
    process.env.CLAUDE_GITHUB_ALLOWED_REPOS = root;

    await expect(resolveAllowedRepo(repo)).resolves.toBe(repo);
  });

  it("rejects a path outside configured roots", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "claude-github-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "claude-outside-"));
    tempPaths.push(root, outside);
    process.env.CLAUDE_GITHUB_ALLOWED_REPOS = root;

    await expect(resolveAllowedRepo(outside)).rejects.toThrow(
      "outside CLAUDE_GITHUB_ALLOWED_REPOS",
    );
  });
});

describe("protected branch guard", () => {
  it("blocks direct writes to main by default", () => {
    process.env.CLAUDE_GITHUB_PROTECTED_BRANCHES = "main,develop";
    process.env.CLAUDE_GITHUB_ALLOW_PROTECTED_WRITES = "false";

    expect(() => assertBranchWriteAllowed("main", "Push")).toThrow(
      "blocked on protected branch",
    );
  });

  it("allows feature branch writes", () => {
    process.env.CLAUDE_GITHUB_PROTECTED_BRANCHES = "main,develop";
    process.env.CLAUDE_GITHUB_ALLOW_PROTECTED_WRITES = "false";

    expect(() =>
      assertBranchWriteAllowed("agent/demo", "Push"),
    ).not.toThrow();
  });
});
