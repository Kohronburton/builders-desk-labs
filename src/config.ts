import path from "node:path";
import { realpath } from "node:fs/promises";

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function protectedBranches(): Set<string> {
  const configured = splitList(
    process.env.CLAUDE_GITHUB_PROTECTED_BRANCHES ??
      "main,master,develop,production",
  );
  return new Set(configured);
}

export function protectedWritesEnabled(): boolean {
  return process.env.CLAUDE_GITHUB_ALLOW_PROTECTED_WRITES === "true";
}

export function assertBranchWriteAllowed(
  branch: string,
  operation: string,
): void {
  if (protectedWritesEnabled()) return;

  if (protectedBranches().has(branch)) {
    throw new Error(
      `${operation} is blocked on protected branch '${branch}'. ` +
        "Use a feature branch and pull request, or explicitly set " +
        "CLAUDE_GITHUB_ALLOW_PROTECTED_WRITES=true.",
    );
  }
}

async function canonicalizeExistingPath(input: string): Promise<string> {
  return realpath(path.resolve(input));
}

export async function allowedRepoRoots(): Promise<string[]> {
  const configured = splitList(process.env.CLAUDE_GITHUB_ALLOWED_REPOS);

  if (configured.length === 0) {
    throw new Error(
      "CLAUDE_GITHUB_ALLOWED_REPOS is required. Add one or more repository paths before starting the MCP server.",
    );
  }

  return Promise.all(configured.map(canonicalizeExistingPath));
}

function isPathInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export async function resolveAllowedRepo(input: string): Promise<string> {
  const requested = await canonicalizeExistingPath(input);
  const roots = await allowedRepoRoots();

  if (!roots.some((root) => isPathInside(requested, root))) {
    throw new Error(
      `Repository path '${requested}' is outside CLAUDE_GITHUB_ALLOWED_REPOS.`,
    );
  }

  return requested;
}

export function bearerToken(): string | undefined {
  const value = process.env.MCP_BEARER_TOKEN?.trim();
  return value || undefined;
}
