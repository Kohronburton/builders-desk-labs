import { execa } from "execa";
import {
  assertBranchWriteAllowed,
  resolveAllowedRepo,
} from "./config.js";

export interface CommandResult {
  command: string;
  stdout: string;
  stderr: string;
}

async function execute(
  binary: string,
  args: string[],
  cwd: string,
): Promise<CommandResult> {
  const result = await execa(binary, args, {
    cwd,
    timeout: 120_000,
    reject: true,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  });

  return {
    command: [binary, ...args].join(" "),
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function resolveGitRepo(repoPath: string): Promise<string> {
  const requested = await resolveAllowedRepo(repoPath);
  const result = await execute(
    "git",
    ["rev-parse", "--show-toplevel"],
    requested,
  );
  return resolveAllowedRepo(result.stdout.trim());
}

export async function runGit(
  repoPath: string,
  args: string[],
): Promise<CommandResult> {
  const repo = await resolveGitRepo(repoPath);
  return execute("git", args, repo);
}

export async function runGh(
  repoPath: string,
  args: string[],
): Promise<CommandResult> {
  const repo = await resolveGitRepo(repoPath);
  return execute("gh", args, repo);
}

export async function currentBranch(repoPath: string): Promise<string> {
  const result = await runGit(repoPath, ["branch", "--show-current"]);
  const branch = result.stdout.trim();

  if (!branch) {
    throw new Error("The repository is in detached HEAD state.");
  }

  return branch;
}

export async function assertClean(repoPath: string): Promise<void> {
  const result = await runGit(repoPath, ["status", "--porcelain"]);
  if (result.stdout.trim()) {
    throw new Error(
      "The working tree has uncommitted changes. Commit or stash them before this operation.",
    );
  }
}

export async function gitStatus(repoPath: string): Promise<CommandResult> {
  return runGit(repoPath, ["status", "--short", "--branch"]);
}

export async function listBranches(repoPath: string): Promise<CommandResult> {
  return runGit(repoPath, [
    "branch",
    "--all",
    "--format=%(refname:short)|%(upstream:short)|%(objectname:short)|%(subject)",
  ]);
}

export async function pullBranch(
  repoPath: string,
  remote = "origin",
  branch?: string,
): Promise<CommandResult> {
  await assertClean(repoPath);
  const selectedBranch = branch ?? (await currentBranch(repoPath));
  return runGit(repoPath, ["pull", "--ff-only", remote, selectedBranch]);
}

export async function createBranch(
  repoPath: string,
  branchName: string,
  startPoint = "HEAD",
  push = false,
  remote = "origin",
): Promise<CommandResult[]> {
  await assertClean(repoPath);
  await runGit(repoPath, ["check-ref-format", "--branch", branchName]);

  const results: CommandResult[] = [];
  results.push(
    await runGit(repoPath, ["switch", "--create", branchName, startPoint]),
  );

  if (push) {
    assertBranchWriteAllowed(branchName, "Push");
    results.push(
      await runGit(repoPath, [
        "push",
        "--set-upstream",
        remote,
        branchName,
      ]),
    );
  }

  return results;
}

export async function commitChanges(
  repoPath: string,
  message: string,
  files: string[] = ["."],
): Promise<CommandResult[]> {
  const branch = await currentBranch(repoPath);
  assertBranchWriteAllowed(branch, "Commit");

  const results: CommandResult[] = [];
  results.push(await runGit(repoPath, ["add", "--", ...files]));
  results.push(await runGit(repoPath, ["commit", "-m", message]));
  return results;
}

export async function pushBranch(
  repoPath: string,
  branch?: string,
  remote = "origin",
  forceWithLease = false,
): Promise<CommandResult> {
  const selectedBranch = branch ?? (await currentBranch(repoPath));
  assertBranchWriteAllowed(selectedBranch, "Push");

  const args = ["push", "--set-upstream"];
  if (forceWithLease) args.push("--force-with-lease");
  args.push(remote, selectedBranch);

  return runGit(repoPath, args);
}

export async function mergeLocalBranch(
  repoPath: string,
  sourceBranch: string,
  targetBranch: string,
  remote = "origin",
  push = false,
): Promise<CommandResult[]> {
  assertBranchWriteAllowed(targetBranch, "Local merge");
  await assertClean(repoPath);

  const results: CommandResult[] = [];
  results.push(await runGit(repoPath, ["switch", targetBranch]));
  results.push(
    await runGit(repoPath, ["pull", "--ff-only", remote, targetBranch]),
  );
  results.push(
    await runGit(repoPath, [
      "merge",
      "--no-ff",
      sourceBranch,
      "-m",
      `Merge ${sourceBranch} into ${targetBranch}`,
    ]),
  );

  if (push) {
    results.push(await runGit(repoPath, ["push", remote, targetBranch]));
  }

  return results;
}

export async function createPullRequest(
  repoPath: string,
  title: string,
  body: string,
  base: string,
  head: string,
  draft = false,
): Promise<CommandResult> {
  const args = [
    "pr",
    "create",
    "--title",
    title,
    "--body",
    body,
    "--base",
    base,
    "--head",
    head,
  ];
  if (draft) args.push("--draft");
  return runGh(repoPath, args);
}

export async function mergePullRequest(
  repoPath: string,
  pullRequest: number,
  method: "merge" | "squash" | "rebase" = "squash",
  deleteBranch = true,
): Promise<CommandResult> {
  const args = ["pr", "merge", String(pullRequest), `--${method}`];
  if (deleteBranch) args.push("--delete-branch");
  return runGh(repoPath, args);
}
