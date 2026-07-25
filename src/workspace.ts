import path from "node:path";
import { mkdir, realpath } from "node:fs/promises";
import { execa } from "execa";
import type { CommandResult } from "./git.js";

function validateRepositoryName(repository: string): void {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("repository must use the owner/name format.");
  }
}

function validateDirectoryName(name: string): void {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
    throw new Error(
      "destination_name may contain only letters, numbers, dots, underscores, and hyphens.",
    );
  }
}

export async function workspaceRoot(): Promise<string> {
  const configured = process.env.CLAUDE_GITHUB_WORKSPACE_ROOT?.trim();
  if (!configured) {
    throw new Error(
      "CLAUDE_GITHUB_WORKSPACE_ROOT is required for repository cloning.",
    );
  }

  const root = path.resolve(configured);
  await mkdir(root, { recursive: true });
  return realpath(root);
}

export async function cloneRepository(
  repository: string,
  destinationName?: string,
): Promise<CommandResult> {
  validateRepositoryName(repository);

  const root = await workspaceRoot();
  const selectedName = destinationName?.trim() || repository.split("/")[1];
  validateDirectoryName(selectedName);

  const destination = path.join(root, selectedName);
  const relative = path.relative(root, destination);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Clone destination escapes the configured workspace root.");
  }

  const args = ["repo", "clone", repository, selectedName];
  const result = await execa("gh", args, {
    cwd: root,
    timeout: 180_000,
    reject: true,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  });

  return {
    command: ["gh", ...args].join(" "),
    stdout: [result.stdout, `Repository path: ${destination}`]
      .filter(Boolean)
      .join("\n"),
    stderr: result.stderr,
  };
}
