import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  commitChanges,
  createBranch,
  createPullRequest,
  gitStatus,
  listBranches,
  mergeLocalBranch,
  mergePullRequest,
  pullBranch,
  pushBranch,
  type CommandResult,
} from "./git.js";
import { cloneRepository } from "./workspace.js";

function formatResults(results: CommandResult | CommandResult[]): string {
  const list = Array.isArray(results) ? results : [results];
  return list
    .map((result) => {
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
      return `$ ${result.command}${output ? `\n${output}` : ""}`;
    })
    .join("\n\n");
}

async function toolResponse(
  action: () => Promise<CommandResult | CommandResult[]>,
) {
  try {
    const result = await action();
    return {
      content: [{ type: "text" as const, text: formatResults(result) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: "text" as const, text: message }],
    };
  }
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "claude-github-operator",
    version: "0.1.0",
  });

  server.tool(
    "github_clone_repository",
    "Clone an owner/name GitHub repository into the configured hosted workspace.",
    {
      repository: z.string().min(3),
      destination_name: z.string().optional(),
    },
    async ({ repository, destination_name }) =>
      toolResponse(() => cloneRepository(repository, destination_name)),
  );

  server.tool(
    "git_status",
    "Show the current branch, upstream, and uncommitted changes for an allowed repository.",
    { repo_path: z.string().min(1) },
    async ({ repo_path }) => toolResponse(() => gitStatus(repo_path)),
  );

  server.tool(
    "git_list_branches",
    "List local and remote branches for an allowed repository.",
    { repo_path: z.string().min(1) },
    async ({ repo_path }) => toolResponse(() => listBranches(repo_path)),
  );

  server.tool(
    "git_pull",
    "Pull a branch from a remote using fast-forward-only mode. The working tree must be clean.",
    {
      repo_path: z.string().min(1),
      remote: z.string().default("origin"),
      branch: z.string().optional(),
    },
    async ({ repo_path, remote, branch }) =>
      toolResponse(() => pullBranch(repo_path, remote, branch)),
  );

  server.tool(
    "git_create_branch",
    "Create and switch to a new branch, optionally pushing it to GitHub immediately.",
    {
      repo_path: z.string().min(1),
      branch_name: z.string().min(1),
      start_point: z.string().default("HEAD"),
      push: z.boolean().default(false),
      remote: z.string().default("origin"),
    },
    async ({ repo_path, branch_name, start_point, push, remote }) =>
      toolResponse(() =>
        createBranch(repo_path, branch_name, start_point, push, remote),
      ),
  );

  server.tool(
    "git_commit",
    "Stage selected files and create a commit on the current non-protected branch.",
    {
      repo_path: z.string().min(1),
      message: z.string().min(1),
      files: z.array(z.string().min(1)).default(["."]),
    },
    async ({ repo_path, message, files }) =>
      toolResponse(() => commitChanges(repo_path, message, files)),
  );

  server.tool(
    "git_push",
    "Push a non-protected branch to GitHub and establish its upstream.",
    {
      repo_path: z.string().min(1),
      branch: z.string().optional(),
      remote: z.string().default("origin"),
      force_with_lease: z.boolean().default(false),
    },
    async ({ repo_path, branch, remote, force_with_lease }) =>
      toolResponse(() =>
        pushBranch(repo_path, branch, remote, force_with_lease),
      ),
  );

  server.tool(
    "git_merge_local",
    "Merge a source branch into a non-protected local target branch. Protected branches must be merged through a pull request unless explicitly enabled.",
    {
      repo_path: z.string().min(1),
      source_branch: z.string().min(1),
      target_branch: z.string().min(1),
      remote: z.string().default("origin"),
      push: z.boolean().default(false),
    },
    async ({ repo_path, source_branch, target_branch, remote, push }) =>
      toolResponse(() =>
        mergeLocalBranch(
          repo_path,
          source_branch,
          target_branch,
          remote,
          push,
        ),
      ),
  );

  server.tool(
    "github_create_pull_request",
    "Create a GitHub pull request using the authenticated GitHub CLI.",
    {
      repo_path: z.string().min(1),
      title: z.string().min(1),
      body: z.string().default(""),
      base: z.string().default("main"),
      head: z.string().min(1),
      draft: z.boolean().default(false),
    },
    async ({ repo_path, title, body, base, head, draft }) =>
      toolResponse(() =>
        createPullRequest(repo_path, title, body, base, head, draft),
      ),
  );

  server.tool(
    "github_merge_pull_request",
    "Merge a GitHub pull request using merge, squash, or rebase, optionally deleting its branch.",
    {
      repo_path: z.string().min(1),
      pull_request: z.number().int().positive(),
      method: z.enum(["merge", "squash", "rebase"]).default("squash"),
      delete_branch: z.boolean().default(true),
    },
    async ({ repo_path, pull_request, method, delete_branch }) =>
      toolResponse(() =>
        mergePullRequest(repo_path, pull_request, method, delete_branch),
      ),
  );

  return server;
}
