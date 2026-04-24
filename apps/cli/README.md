# `aicomputer`

CLI for managing computers through the public API.

## Install

```bash
curl -fsSL https://agentcomputer.ai/install.sh | bash
```

Upgrade later with:

```bash
computer upgrade
```

Or run directly from this checkout:

```bash
nix run path:./apps/cli -- --version
```

## Commands

```bash
computer login --api-key <ak_...>
computer login
computer logout
computer whoami
computer claude-login
computer codex-login
computer create my-box
computer ls
computer get my-box
computer power-off my-box
computer power-on my-box
computer image ls
computer image get <image-id>
computer open my-box
computer ssh my-box
computer sync ./my-project
computer ports ls my-box
computer ports publish my-box 3000 --name my-app
computer ports publish my-box 3000 --name my-app --private
# Ports are public by default: the URL is reachable without an access session.
# Pass --private to require an access session (browser login) instead.
computer ports rm my-box 3000
computer rm my-box
```

`computer login` stores a Clerk API key locally or opens the browser login flow.
`computer claude-login` and `computer codex-login` install Claude Code or Codex credentials onto a computer after the CLI is already logged in.
`computer open`, `computer ssh`, and `computer sync` resolve against the current public API.
`computer sync <path>` opens a picker for active SSH-enabled computers and copies the local file or directory into `/home/node/` over `scp`.
The access commands expect local OpenSSH tools such as `ssh` and `scp` to be available in `PATH`.

The CLI is intentionally thin: it reflects the public API primitives and stays
out of legacy app-owned workflows.
