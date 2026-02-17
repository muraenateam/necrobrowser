# necrocli

Command-line interface for NecroBrowser session management.

## Setup

```bash
npm install
```

## Usage

```bash
node necrocli.js <command> [options]
```

### Global Options

| Option | Description |
|--------|-------------|
| `--host <url>` | NecroBrowser API URL (default: `http://localhost:3000`) |
| `-V, --version` | Show version |
| `-h, --help` | Show help |

The API URL can also be set via the `NECRO_API` environment variable.

## Commands

### stats

Show cluster status, queue size, workers, and error rate.

```bash
node necrocli.js stats
```

### sessions

List all hijacked sessions with cookie counts, domains, status, and keepalive info.

```bash
node necrocli.js sessions
```

Sessions are grouped by status (completed, running, error, queued) and show:
- Task ID and type
- Cookie count and domains
- Keepalive status (KA = enabled)
- fixSession URL if configured

### tasks

List available task types and methods registered in NecroBrowser.

```bash
node necrocli.js tasks
```

### status \<taskId\>

Get status and results for a specific task.

```bash
node necrocli.js status task:generic:abc123
```

### retrigger \<taskId\>

Retrigger a task by ID. Creates a new task with the same cookies, params, and user agent as the original.

```bash
node necrocli.js retrigger task:office365:abc123
```

### cookies \<taskId\>

Export cookies for a session in [Cookie Editor](https://cookie-editor.com/) JSON format, compatible with the Cookie Editor Chrome/Firefox extension.

```bash
# Print to stdout (pipe-friendly)
node necrocli.js cookies task:office365:abc123

# Save to file
node necrocli.js cookies task:office365:abc123 --output cookies.json
```

The output JSON array can be imported directly into Cookie Editor via its "Import" feature.

### keepalive enable \<taskId\>

Enable keepalive for a task. The keepalive loop will periodically load the task's `fixSession` URL, refresh cookies if rotated by the server, and take a screenshot.

```bash
node necrocli.js keepalive enable task:office365:abc123
```

### keepalive disable \<taskId\>

Disable keepalive for a task.

```bash
node necrocli.js keepalive disable task:office365:abc123
```

## Examples

```bash
# Check cluster health
node necrocli.js stats

# List all sessions, see which have keepalive active
node necrocli.js sessions

# Export cookies from a hijacked session and import into your browser
node necrocli.js cookies task:office365:xyz --output session_cookies.json

# Retrigger a completed task with fresh execution
node necrocli.js retrigger task:generic:abc123

# Enable keepalive to keep a session alive with cookie refresh
node necrocli.js keepalive enable task:office365:abc123

# Connect to a remote NecroBrowser instance
node necrocli.js --host http://10.0.0.5:3000 sessions
```
