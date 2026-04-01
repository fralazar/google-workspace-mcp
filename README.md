# Google Workspace MCP Server

Give AI agents full access to Google Workspace — Gmail, Calendar, Drive, and more — through a single MCP server that handles multi-account credential routing, response formatting for AI consumption, and contextual guidance.

Built on [Google's official Workspace CLI](https://github.com/googleworkspace/cli) (`gws`), which means API coverage grows as Google does. The server uses a manifest-driven factory that turns declarative YAML into fully functional MCP tools — adding a new Google API operation is a config change, not a code change.

## Why This MCP Server

**For users:** One install gives your AI agent real, authenticated access to your Google accounts. Search email, check your calendar, manage Drive files, chain multi-step workflows — all through natural conversation.

**For teams:** Multi-account support means your agent can work across personal and work accounts simultaneously, with per-account credential isolation and XDG-compliant storage.

**For developers:** The factory architecture means coverage expands fast. Google's Workspace CLI already supports 15+ services and hundreds of API operations. The manifest curates which ones are exposed, patches add domain-specific formatting, and the defaults handle everything else.

## What's Available

**5 tools, 32+ operations across 3 core services:**

| Tool | Operations | What It Does |
|------|-----------|--------------|
| `manage_email` | search, read, send, reply, replyAll, forward, triage, trash, untrash, modify, labels, threads, getThread | Full Gmail — search, read, compose, thread management, label management |
| `manage_calendar` | list, agenda, get, create, quickAdd, update, delete, calendars, freebusy | Calendar CRUD, natural language event creation, availability checks |
| `manage_drive` | search, get, upload, download, copy, delete, export, listPermissions, share, unshare | File management, Google Docs export, sharing and permissions |
| `manage_accounts` | list, authenticate, remove, status, refresh, scopes | Multi-account lifecycle — add accounts, manage credentials and scopes |
| `queue_operations` | — | Chain operations sequentially with `$N.field` result references |

Every response includes **next-steps** guidance — the agent always knows what it can do next.

## How It Works

```
                          ┌─────────────────────────┐
MCP Client ──stdio──▶     │  manifest.yaml           │
                          │  (52 operations declared) │
                          └────────┬────────────────┘
                                   │
                          ┌────────▼────────────────┐
                          │  Factory Generator       │
                          │  schemas + handlers      │
                          └────────┬────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
              ┌──────────┐  ┌──────────┐  ┌──────────┐
              │  Gmail   │  │ Calendar │  │  Drive   │
              │  Patch   │  │  Patch   │  │  Patch   │
              └────┬─────┘  └────┬─────┘  └────┬─────┘
                   │             │             │
                   └──────┬──────┘──────┬──────┘
                          ▼             ▼
                    Account Router ──▶ gws CLI ──▶ Google APIs
```

The **factory** reads a YAML manifest and generates MCP tool schemas and request handlers at startup. **Patches** add domain-specific behavior where needed — Gmail search hydration, calendar formatting, Drive file type detection. Operations without patches get sensible defaults automatically.

The underlying engine is Google's `@googleworkspace/cli` — a Rust binary that wraps the full Google Workspace API surface. The MCP server curates which operations to expose and shapes the responses for AI consumption.

## Install

### MCPB Bundle (Claude Desktop and other MCP clients)

Download the `.mcpb` bundle for your platform from the [latest release](https://github.com/aaronsb/google-workspace-mcp/releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `google-workspace-mcp-darwin-arm64.mcpb` |
| macOS (Intel) | `google-workspace-mcp-darwin-x64.mcpb` |
| Linux x64 | `google-workspace-mcp-linux-x64.mcpb` |
| Linux ARM64 | `google-workspace-mcp-linux-arm64.mcpb` |
| Windows x64 | `google-workspace-mcp-windows-x64.mcpb` |

In Claude Desktop, drag the `.mcpb` file into the app. Other MCP clients that support `.mcpb` extensions can install it the same way. The bundle includes everything: the server, the gws binary, and all dependencies.

### Claude Code / npm

```bash
npm install @aaronsb/google-workspace-mcp
```

Or run directly:

```bash
npx @aaronsb/google-workspace-mcp
```

### Prerequisites

1. **Node.js** 18+
2. **Google Cloud service account with domain-wide delegation:**
   - Create a service account in [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts)
   - Enable domain-wide delegation on the service account
   - Download the JSON key file
   - In **Google Admin Console** (admin.google.com), go to Security → API controls → Domain-wide delegation and add the service account's client ID with these scopes:
     ```
     https://www.googleapis.com/auth/gmail.readonly
     https://www.googleapis.com/auth/drive.readonly
     https://www.googleapis.com/auth/calendar.readonly
     https://www.googleapis.com/auth/spreadsheets.readonly
     https://www.googleapis.com/auth/documents.readonly
     https://www.googleapis.com/auth/tasks.readonly
     https://www.googleapis.com/auth/presentations.readonly
     https://www.googleapis.com/auth/meetings.space.readonly
     ```
3. Set the environment variable (path to key file or inline JSON):
   ```bash
   export GOOGLE_SERVICE_ACCOUNT_KEY="/path/to/service-account-key.json"
   ```

## MCP Client Configuration

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "npx",
      "args": ["@aaronsb/google-workspace-mcp"],
      "env": {
        "GOOGLE_SERVICE_ACCOUNT_KEY": "/path/to/service-account-key.json"
      }
    }
  }
}
```

### Claude Code

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "npx",
      "args": ["@aaronsb/google-workspace-mcp"],
      "env": {
        "GOOGLE_SERVICE_ACCOUNT_KEY": "/path/to/service-account-key.json"
      }
    }
  }
}
```

### Docker

Build and run via Docker Compose, or use the image directly in `.mcp.json`:

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "--network=host", "google-workspace-mcp"]
    }
  }
}
```

The `docker-compose.yaml` mounts the key file as a read-only secret and sets `GOOGLE_SERVICE_ACCOUNT_KEY` automatically.

## Usage

Use any tool with a domain user's email — the service account impersonates the user automatically:

```
manage_email    { "operation": "triage", "email": "user@yourdomain.com" }
manage_calendar { "operation": "agenda", "email": "user@yourdomain.com" }
manage_drive    { "operation": "search", "email": "user@yourdomain.com", "query": "quarterly report" }
```

### Multi-Step Workflows

Chain operations with result references — the output of one step feeds the next:

```json
{
  "operations": [
    { "tool": "manage_email", "args": { "operation": "search", "email": "you@gmail.com", "query": "from:boss subject:review" }},
    { "tool": "manage_email", "args": { "operation": "read", "email": "you@gmail.com", "messageId": "$0.messageId" }}
  ]
}
```

## Expanding Coverage

The server discovers operations from the gws CLI, which already supports 15+ Google services (Sheets, Docs, Tasks, People, Chat, and more). Adding coverage is a manifest edit:

```bash
make manifest-discover   # Find all 287+ available operations
make manifest-lint       # Validate the curated manifest
make test                # Verify everything works
```

New operations get default formatting automatically. Add a patch only when you need domain-specific presentation.

## Data Storage

| Data | Location |
|------|----------|
| Service account key | Provided via `GOOGLE_SERVICE_ACCOUNT_KEY` env var (file path or inline JSON) |
| Access tokens | Cached in-memory only — no credential files written to disk |

No secrets are stored in the project directory. Tokens are minted on demand via JWT exchange with Google's token endpoint and held in memory for the lifetime of the process.

## License

MIT
