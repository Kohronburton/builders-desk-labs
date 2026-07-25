# Claude GitHub Operator

A guarded Model Context Protocol (MCP) plugin that lets Claude work with real Git repositories and GitHub pull requests.

Built in the Builder's Desk Labs portfolio spine on the dedicated branch `agent/claude-github-plugin`.

## What Claude can do

- Clone an approved GitHub repository into a hosted workspace
- Inspect repository status and list branches
- Pull with fast-forward-only protection
- Create and switch to feature branches
- Stage files and create commits
- Push branches to GitHub
- Create pull requests
- Merge pull requests using merge, squash, or rebase
- Perform local branch merges when the target is not protected

## Safety model

The server does not receive unrestricted shell access. It exposes a fixed set of typed Git operations.

- `CLAUDE_GITHUB_ALLOWED_REPOS` limits every operation to approved repository roots.
- `main`, `master`, `develop`, and `production` are protected by default.
- Direct commits, pushes, and local merges into protected branches are blocked unless explicitly enabled.
- Pulls use `--ff-only` to avoid surprise merge commits.
- Force pushes use `--force-with-lease`, never plain `--force`.
- Git runs with interactive credential prompts disabled.
- Browser transport can require a bearer token or connector URL token.

The recommended shipping workflow is:

`pull → feature branch → edit → commit → push → pull request → merge pull request`

## MCP tools

| Tool | Purpose |
|---|---|
| `github_clone_repository` | Clone `owner/name` into the hosted workspace |
| `git_status` | Show branch, upstream, and working-tree changes |
| `git_list_branches` | List local and remote branches |
| `git_pull` | Fast-forward-only pull |
| `git_create_branch` | Create/switch branch and optionally push it |
| `git_commit` | Stage selected files and commit |
| `git_push` | Push a non-protected branch |
| `git_merge_local` | Merge into a non-protected local target branch |
| `github_create_pull_request` | Open a GitHub pull request |
| `github_merge_pull_request` | Merge a pull request and optionally delete its branch |

## Prerequisites

- Node.js 20+
- Git
- GitHub CLI (`gh`)
- GitHub CLI authentication or a `GH_TOKEN`

For private repositories, use a fine-grained GitHub token limited to only the required repositories, with repository contents and pull-request permissions. Do not use an account-wide classic token unless necessary.

## Local setup for Claude Desktop or Claude Code

```bash
git clone --branch agent/claude-github-plugin \
  https://github.com/Kohronburton/builders-desk-labs.git
cd builders-desk-labs
npm install
npm run build
gh auth login
```

Set the repositories Claude may operate on.

### Windows PowerShell

```powershell
$env:CLAUDE_GITHUB_ALLOWED_REPOS="C:\code\project-one;C:\code\project-two"
$env:CLAUDE_GITHUB_PROTECTED_BRANCHES="main,master,develop,production"
$env:CLAUDE_GITHUB_ALLOW_PROTECTED_WRITES="false"
```

### macOS or Linux

```bash
export CLAUDE_GITHUB_ALLOWED_REPOS="$HOME/code/project-one,$HOME/code/project-two"
export CLAUDE_GITHUB_PROTECTED_BRANCHES="main,master,develop,production"
export CLAUDE_GITHUB_ALLOW_PROTECTED_WRITES="false"
```

For Claude Desktop, add this server to the desktop MCP configuration and replace the paths:

```json
{
  "mcpServers": {
    "github-operator": {
      "command": "node",
      "args": ["C:\\code\\builders-desk-labs\\dist\\index.js"],
      "env": {
        "CLAUDE_GITHUB_ALLOWED_REPOS": "C:\\code\\project-one;C:\\code\\project-two",
        "CLAUDE_GITHUB_PROTECTED_BRANCHES": "main,master,develop,production",
        "CLAUDE_GITHUB_ALLOW_PROTECTED_WRITES": "false"
      }
    }
  }
}
```

Restart Claude after saving the configuration. The GitHub Operator tools should then appear under Claude's tools/connectors menu.

## Use it in the browser Claude screen

The browser app cannot directly execute Git on your Windows filesystem. It needs the included hosted HTTP MCP service.

1. Deploy this branch using `render.yaml` or the included `Dockerfile`.
2. Add a persistent disk mounted at `/workspace`.
3. Set `GH_TOKEN` to a fine-grained GitHub token.
4. Set `MCP_BEARER_TOKEN` to a long random secret.
5. Keep these defaults:

```text
CLAUDE_GITHUB_WORKSPACE_ROOT=/workspace
CLAUDE_GITHUB_ALLOWED_REPOS=/workspace
CLAUDE_GITHUB_ALLOW_PROTECTED_WRITES=false
```

6. In Claude, open **Search and tools**, then open the connector manager and choose the custom MCP connector option. The exact wording can vary by Claude client version.
7. Add this connector URL:

```text
https://YOUR-SERVICE.example.com/mcp?token=YOUR_MCP_BEARER_TOKEN
```

If the connector UI supports authorization headers, prefer this URL:

```text
https://YOUR-SERVICE.example.com/mcp
```

and send:

```text
Authorization: Bearer YOUR_MCP_BEARER_TOKEN
```

Treat the connector URL as a secret when it contains the token. Rotate the token if the URL is shared.

## Example Claude requests

```text
Clone Kohronburton/builders-desk-labs, pull main, create branch agent/demo-fix, and show me the status.
```

```text
Commit the current changes with message "feat: add workflow reliability checks" and push the branch.
```

```text
Create a pull request from agent/demo-fix into main. Do not merge it yet.
```

```text
Review pull request 12 and, after I approve, squash-merge it and delete the feature branch.
```

## Development

```bash
npm run typecheck
npm test
npm run build
npm run dev
npm run dev:http
```

Health check:

```text
GET /health
```

MCP endpoint:

```text
POST /mcp
```

## Current MVP boundary

This plugin performs Git operations and GitHub pull-request management. It does not yet edit files by itself; Claude needs a coding/filesystem tool in the same environment to change code before calling `git_commit`. A later phase can add guarded file read/write, diff review, CI status checks, and approval policies.
