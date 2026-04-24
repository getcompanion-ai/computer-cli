// Direct-edge SSH access.
//
// This module replaces the old flow that went:
//
//   CLI ──▶ SSH Gateway (MITM, re-auth) ──▶ Firecracker host ──▶ guest sshd
//
// with a single-hop, end-to-end-verified flow:
//
//   CLI ──TLS(SNI=<computer_id>.<suffix>)──▶ ssh-edge ──TCP──▶ host:ssh_relay_port ──▶ guest sshd
//
// The edge is a dumb byte splicer. Auth, host-key verification, and even
// OpenSSH's ControlMaster multiplexing all run client-side against the real
// guest. The first `ssh` call mints ephemeral credentials from the API; every
// subsequent call in the cert TTL window reuses the cached bundle and piggy-
// backs on the ControlMaster socket (so "next ssh" is essentially free).

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { api, getBaseURL } from "./api.js";
import { resolveComputer, type Computer } from "./computers.js";

const TMUX_SESSION_NAME = "agentcomputer";
const TMUX_INCOMPATIBLE_SSH_ARGS = new Set(["-N", "-T", "-f"]);
const DEFAULT_REMOTE_SYNC_DIR = "/home/node/";
const SSH_BINARY = process.env.COMPUTER_SSH_BINARY?.trim() || "ssh";
const SCP_BINARY = process.env.COMPUTER_SCP_BINARY?.trim() || "scp";

// Refresh credentials when fewer than this many seconds remain. Keeps us well
// clear of the guest sshd rejecting a just-expired cert.
const CREDENTIAL_REFRESH_MARGIN_SECONDS = 120;

export type SSHCredentials = {
	computer_id: string;
	computer_handle: string;
	ssh_user: string;
	edge_host: string;
	edge_port: number;
	sni: string;
	client_private_key: string;
	client_public_key: string;
	client_certificate: string;
	guest_host_public_key?: string;
	expires_at: string;
};

export type SSHConnection = {
	computer: Computer;
	credentials: SSHCredentials;
	/** Absolute path to the per-computer ssh_config fragment. */
	configPath: string;
	args: string[];
};

export type SCPTransfer = {
	computer: Computer;
	credentials: SSHCredentials;
	configPath: string;
	sourcePath: string;
	remotePath: string;
	args: string[];
};

export type SSHConnectionOptions = {
	/** Flags passed to ssh *before* user@host (e.g. `-L 8080:localhost:80`, `-v`). */
	extraSSHFlags?: string[];
	/** Command to run on the remote host (passed *after* user@host). */
	remoteCommand?: string[];
	/** If true, wrap the session in a persistent tmux session. */
	tmux?: boolean;
};

export type SCPTransferOptions = {
	recursive?: boolean;
	remotePath?: string;
};

export async function prepareSSHConnection(
	computer: Computer,
	options: SSHConnectionOptions = {},
): Promise<SSHConnection> {
	const credentials = await ensureFreshCredentials(computer);
	const configPath = await writeSSHConfig(credentials);

	const tmux = options.tmux === true;
	const extraSSHFlags = options.extraSSHFlags ?? [];
	const remoteCommand = options.remoteCommand ?? [];

	if (tmux) {
		const incompatible = extraSSHFlags.find((arg) => TMUX_INCOMPATIBLE_SSH_ARGS.has(arg));
		if (incompatible) {
			throw new Error(`--tmux cannot be combined with ${incompatible}`);
		}
		if (remoteCommand.length > 0) {
			throw new Error("--tmux cannot be combined with a remote command");
		}
	}

	const needsTTY = tmux || remoteCommand.length > 0;
	const host = sshHostAlias(credentials.computer_id);

	const args: string[] = [
		"-F", configPath,
		...(needsTTY ? ["-t"] : []),
		...extraSSHFlags,
		`${credentials.ssh_user}@${host}`,
	];
	if (tmux) {
		args.push("tmux", "new-session", "-A", "-s", TMUX_SESSION_NAME);
	} else if (remoteCommand.length > 0) {
		args.push(...remoteCommand);
	}

	return { computer, credentials, configPath, args };
}

export async function prepareSSHConnectionByIdentifier(
	identifier: string,
	options: SSHConnectionOptions = {},
): Promise<SSHConnection> {
	const computer = await resolveComputer(identifier);
	return prepareSSHConnection(computer, options);
}

export async function openSSHConnection(connection: SSHConnection): Promise<void> {
	await runOpenSSHClient(SSH_BINARY, connection.args);
}

export function prepareSCPTransfer(
	connection: SSHConnection,
	sourcePath: string,
	options: SCPTransferOptions = {},
): SCPTransfer {
	const remotePath = options.remotePath?.trim() || DEFAULT_REMOTE_SYNC_DIR;
	const recursive = options.recursive === true;
	const host = sshHostAlias(connection.credentials.computer_id);
	const args = [
		// Guest images do not expose an SFTP subsystem, so force classic SCP mode.
		"-O",
		"-F", connection.configPath,
		...(recursive ? ["-r"] : []),
		"--",
		sourcePath,
		`${connection.credentials.ssh_user}@${host}:${remotePath}`,
	];

	return {
		computer: connection.computer,
		credentials: connection.credentials,
		configPath: connection.configPath,
		sourcePath,
		remotePath,
		args,
	};
}

export async function openSCPTransfer(transfer: SCPTransfer): Promise<void> {
	// scp -O (legacy protocol) may exit with code 1 during session teardown
	// even when the transfer completed successfully, so tolerate that exit code.
	await runOpenSSHClient(SCP_BINARY, transfer.args, { tolerateExitCode1: true });
}

// ---------------------------------------------------------------------------
// Credentials and on-disk layout
// ---------------------------------------------------------------------------

/**
 * Per-computer state dir:
 *
 *   ~/.agentcomputer/ssh/<computer_id>/
 *     config              ssh_config fragment (referenced via -F)
 *     id_ed25519          ephemeral private key
 *     id_ed25519-cert.pub ephemeral user cert signed by the guest-login CA
 *     known_hosts         pinned guest host key (for StrictHostKeyChecking=yes)
 *     creds.json          metadata (edge host/port, SNI, expiry)
 *     control.sock        OpenSSH ControlMaster socket (managed by ssh)
 */
export async function removeComputerSSHState(computerID: string): Promise<void> {
	// Wipe the per-computer state dir (pinned known_hosts, cached creds,
	// ControlMaster socket). Called after `computer rm` so a later computer
	// that reuses the same UUID doesn't inherit a stale host-key pin and
	// wedge every subsequent `computer ssh` with StrictHostKeyChecking=yes.
	const dir = computerStateDir(computerID);
	await fsp.rm(dir, { recursive: true, force: true });
}

function computerStateDir(computerID: string): string {
	const base =
		process.env.AGENTCOMPUTER_CONFIG_DIR?.trim() ||
		path.join(os.homedir(), ".agentcomputer");
	return path.join(base, "ssh", computerID);
}

function sshHostAlias(computerID: string): string {
	// The `Host` entry in the per-computer ssh_config is the computer id
	// itself so OpenSSH's host resolution picks it up unambiguously.
	return computerID;
}

async function ensureFreshCredentials(computer: Computer): Promise<SSHCredentials> {
	const dir = computerStateDir(computer.id);
	await fsp.mkdir(dir, { recursive: true, mode: 0o700 });

	const credsPath = path.join(dir, "creds.json");
	const existing = await readExistingCredentials(credsPath);
	if (existing && !isNearExpiry(existing)) {
		return existing;
	}

	const next = await requestSSHCredentials(computer.id);
	await writeCredentialBundle(dir, next);
	return next;
}

async function readExistingCredentials(credsPath: string): Promise<SSHCredentials | null> {
	try {
		const raw = await fsp.readFile(credsPath, "utf8");
		const parsed = JSON.parse(raw) as SSHCredentials;
		if (!parsed.expires_at) {
			return null;
		}
		return parsed;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return null;
		}
		return null;
	}
}

function isNearExpiry(creds: SSHCredentials): boolean {
	const expiresAtMs = Date.parse(creds.expires_at);
	if (!Number.isFinite(expiresAtMs)) {
		return true;
	}
	const remainingSeconds = (expiresAtMs - Date.now()) / 1000;
	return remainingSeconds < CREDENTIAL_REFRESH_MARGIN_SECONDS;
}

async function requestSSHCredentials(computerID: string): Promise<SSHCredentials> {
	return api<SSHCredentials>(
		`/v1/computers/${encodeURIComponent(computerID)}/ssh-credentials`,
		{ method: "POST", body: JSON.stringify({}) },
	);
}

async function writeCredentialBundle(dir: string, creds: SSHCredentials): Promise<void> {
	await fsp.writeFile(path.join(dir, "id_ed25519"), ensureTrailingNewline(creds.client_private_key), { mode: 0o600 });
	await fsp.writeFile(path.join(dir, "id_ed25519.pub"), ensureTrailingNewline(creds.client_public_key), { mode: 0o600 });
	await fsp.writeFile(path.join(dir, "id_ed25519-cert.pub"), ensureTrailingNewline(creds.client_certificate), { mode: 0o600 });

	const knownHostsPath = path.join(dir, "known_hosts");
	if (creds.guest_host_public_key && creds.guest_host_public_key.trim() !== "") {
		// StrictHostKeyChecking=yes against this file makes the client pin
		// the guest's real host key end-to-end; the edge can't MITM because
		// it never holds a matching private key.
		const knownHostsLine = `${sshHostAlias(creds.computer_id)} ${creds.guest_host_public_key.trim()}\n`;
		await fsp.writeFile(knownHostsPath, knownHostsLine, { mode: 0o600 });
		} else {
			// No pinned host key yet (pre-migration VM). Fall back to
			// accept-new so the first connection records the key, then pins it
			// for subsequent calls.
			await ensureKnownHostsFile(knownHostsPath);
		}

		await fsp.writeFile(path.join(dir, "creds.json"), JSON.stringify(creds, null, 2), { mode: 0o600 });
	}

async function ensureKnownHostsFile(knownHostsPath: string): Promise<void> {
	const handle = await fsp.open(knownHostsPath, "a", 0o600);
	await handle.close();
	try {
		await fsp.chmod(knownHostsPath, 0o600);
	} catch {}
}

function ensureTrailingNewline(value: string): string {
	return value.endsWith("\n") ? value : value + "\n";
}

async function writeSSHConfig(creds: SSHCredentials): Promise<string> {
	const dir = computerStateDir(creds.computer_id);
	const configPath = path.join(dir, "config");
	const controlPath = resolveControlPath(dir);
	const host = sshHostAlias(creds.computer_id);
	const proxyCommand = buildProxyCommand(creds.computer_id);
	const strictHostKeyChecking = creds.guest_host_public_key?.trim() ? "yes" : "accept-new";
	const remoteTerm = resolveRemoteTerm();

	const lines = [
		`# Auto-generated by agentcomputer CLI. Do not edit; regenerated on every ssh.`,
		`Host ${host}`,
		`  HostName ${host}`,
		`  User ${creds.ssh_user}`,
		`  IdentityFile ${path.join(dir, "id_ed25519")}`,
		`  CertificateFile ${path.join(dir, "id_ed25519-cert.pub")}`,
		`  IdentitiesOnly yes`,
		`  UserKnownHostsFile ${path.join(dir, "known_hosts")}`,
		`  StrictHostKeyChecking ${strictHostKeyChecking}`,
		`  UpdateHostKeys no`,
		`  ServerAliveInterval 30`,
		`  ServerAliveCountMax 3`,
		`  ControlMaster auto`,
		`  ControlPath ${controlPath}`,
		`  ControlPersist 10m`,
		`  SetEnv TERM=${remoteTerm}`,
		`  ProxyCommand ${proxyCommand}`,
		``,
	];
	await fsp.writeFile(configPath, lines.join("\n"), { mode: 0o600 });
	return configPath;
}

// macOS caps Unix-domain socket paths at ~104 chars (sun_path). The per-
// computer state dir (`~/.agentcomputer/ssh/<uuid>/control.sock`) routinely
// overflows this on long $HOMEs, breaking ControlMaster multiplexing. We
// keep all other state under the config dir (which can be long) and only
// relocate the socket itself to a short base, hashed via OpenSSH's %C token
// so each (user, host, port) tuple still gets its own socket.
function resolveControlPath(stateDir: string): string {
	const candidate = path.join(stateDir, "control.sock");
	// Comfortable margin below the 104-char macOS limit: OpenSSH appends
	// ".<random>" to the ControlPath while the master is starting up, so we
	// need slack beyond the final path length.
	const SUN_PATH_SAFE_LIMIT = 90;
	if (candidate.length <= SUN_PATH_SAFE_LIMIT) {
		return candidate;
	}
	const shortBase = process.env.AGENTCOMPUTER_CONTROL_DIR?.trim() || os.tmpdir();
	try {
		fs.mkdirSync(shortBase, { recursive: true, mode: 0o700 });
	} catch {}
	// %C = SHA-1 of (local user, host, port, remote user) — fixed 40 chars,
	// keeps per-connection isolation without relying on the long state dir.
	return path.join(shortBase, "ac-%C.sock");
}

// Ghostty (and a few other modern terminals) advertise a TERM value the
// guest's terminfo database doesn't carry, which corrupts tmux/less/vim
// rendering over ssh. Downgrade to a universally-known TERM for the remote
// side only; the local terminal keeps its real value. Users can override
// with AGENTCOMPUTER_REMOTE_TERM, or skip the downgrade entirely by setting
// it to an empty string.
function resolveRemoteTerm(): string {
	const override = process.env.AGENTCOMPUTER_REMOTE_TERM;
	if (override !== undefined) {
		return override.trim() || "xterm-256color";
	}
	const localTerm = process.env.TERM?.trim() ?? "";
	// "dumb" is intentionally excluded: it lacks cursor/clear capabilities,
	// which breaks tmux ("open terminal failed: terminal does not support
	// clear") and mangles vim/less. Parent environments like Cursor or
	// Claude Code's embedded CLIs export TERM=dumb; we upgrade those to
	// xterm-256color for the remote side only.
	const knownOnGuest = new Set([
		"xterm", "xterm-256color", "screen", "screen-256color",
		"tmux", "tmux-256color", "vt100", "vt220", "linux",
	]);
	if (knownOnGuest.has(localTerm)) {
		return localTerm;
	}
	return "xterm-256color";
}

function buildProxyCommand(computerID: string): string {
	// Re-invoke the CLI itself as the ProxyCommand. The `ssh-proxy` hidden
	// subcommand opens a TLS connection to the edge (with SNI set from the
	// cached creds.json) and pipes bytes stdin<->socket. This avoids a
	// runtime dependency on openssl/socat and keeps credential loading
	// isolated to one code path.
	return [...resolveSelfCommand(), "ssh-proxy", computerID].map(shellQuote).join(" ");
}

function resolveSelfCommand(): string[] {
	// For standalone single-file binaries (bun build --compile, pkg, etc.)
	// argv[1] is a virtual path inside the embedded FS like "/$bunfs/root/..."
	// which isn't dispatchable; the binary itself (execPath) knows how to
	// run the embedded entrypoint, so pass only execPath.
	const execPath = process.execPath;
	const scriptPath = process.argv[1];
	if (isCompiledSingleFileBinary(execPath, scriptPath)) {
		return [execPath];
	}
	// Regular node invocation: pass both node + the script path so ssh's
	// ProxyCommand works even when spawned from an arbitrary cwd.
	if (scriptPath && path.isAbsolute(scriptPath)) {
		return [execPath, scriptPath];
	}
	return ["agentcomputer"];
}

function isCompiledSingleFileBinary(execPath: string, scriptPath: string | undefined): boolean {
	if (!scriptPath) {
		return true;
	}
	// bun single-file compile: argv[1] starts with "/$bunfs/".
	if (scriptPath.startsWith("/$bunfs/") || scriptPath.startsWith("B:\\~BUN\\")) {
		return true;
	}
	// pkg / nexe / similar also embed virtual paths that don't exist on disk.
	if (!path.isAbsolute(scriptPath)) {
		return false;
	}
	try {
		fs.accessSync(scriptPath, fs.constants.F_OK);
		return false;
	} catch {
		// argv[1] is not a real file on disk — treat as an embedded entrypoint
		// and trust the binary to dispatch itself.
		return true;
	}
}

function shellQuote(value: string): string {
	if (/^[A-Za-z0-9_\-./= :]+$/.test(value)) {
		// Still quote whitespace to be safe; plain-safe characters only pass through.
		return /\s/.test(value) ? `"${value}"` : value;
	}
	return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

// ---------------------------------------------------------------------------
// ssh-proxy subcommand implementation (exported so index.ts can register it)
// ---------------------------------------------------------------------------

/**
 * Runs the ProxyCommand used by OpenSSH: opens a TLS connection to the edge
 * with the correct SNI and splices stdin<->socket. Never writes to stdout
 * outside of the proxied stream (OpenSSH treats stdout as the transport).
 */
export async function runSSHProxy(computerID: string): Promise<void> {
	const dir = computerStateDir(computerID);
	const credsPath = path.join(dir, "creds.json");
	const creds = await readExistingCredentials(credsPath);
	if (!creds) {
		writeProxyError(`no cached ssh credentials for ${computerID}; run 'agentcomputer ssh ${computerID}' once to provision them`);
		process.exit(2);
	}

	const tls = await import("node:tls");
	const baseURL = getBaseURL();
	const rejectUnauthorized = !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(baseURL) && !process.env.COMPUTER_EDGE_INSECURE;

	const socket = tls.connect({
		host: creds.edge_host,
		port: creds.edge_port,
		servername: creds.sni,
		rejectUnauthorized,
		ALPNProtocols: ["ssh"],
	});

	await new Promise<void>((resolve, reject) => {
		socket.once("secureConnect", () => resolve());
		socket.once("error", reject);
	});

	// Standard bidirectional pipe. Stderr is reserved for diagnostics.
	process.stdin.pipe(socket);
	socket.pipe(process.stdout);

	// Tear down as soon as EITHER side goes away. Waiting for both directions
	// to close cleanly is tempting but unreliable: `process.stdin` frequently
	// fails to emit `end`/`close` when the parent (ssh) closes its pipe —
	// especially under bun single-file binaries — which would leave the proxy
	// (and therefore the ssh client, and therefore `agentcomputer ssh`)
	// hanging after the user types Ctrl-D / logs out / hits Ctrl-C. Once one
	// half of the byte-splice is gone the other half is useless, so we just
	// destroy everything and exit.
	await new Promise<void>((resolve) => {
		let settled = false;
		const done = () => {
			if (settled) return;
			settled = true;
			try { process.stdin.unpipe(socket); } catch {}
			try { process.stdin.pause(); } catch {}
			try { socket.destroy(); } catch {}
			try { process.stdout.end(); } catch {}
			resolve();
		};
		socket.once("close", done);
		socket.once("end", done);
		socket.once("error", done);
		process.stdin.once("close", done);
		process.stdin.once("end", done);
		// Some signals (SIGHUP when the parent ssh dies, SIGPIPE from a
		// broken stdout write) would otherwise kill us silently before our
		// cleanup runs; route them through the same teardown path.
		process.once("SIGHUP", done);
		process.once("SIGTERM", done);
		process.once("SIGINT", done);
	});
}

function writeProxyError(message: string): void {
	try {
		fs.writeSync(2, `agentcomputer ssh-proxy: ${message}\n`);
	} catch {}
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

type RunOptions = {
	tolerateExitCode1?: boolean;
};

async function runOpenSSHClient(binary: string, args: string[], options: RunOptions = {}): Promise<void> {
	// While the child ssh is running it owns the TTY. Signals delivered by the
	// terminal (Ctrl-C → SIGINT, Ctrl-\ → SIGQUIT, SIGHUP on pane close) are
	// sent to the whole foreground process group, so both this CLI and the
	// child receive them simultaneously. Node's default SIGINT handler would
	// kill us mid-await and orphan the child (and, crucially, the proxy the
	// child spawned), making the terminal appear to "hang" after Ctrl-C. We
	// want ssh itself to decide what to do with those signals (it forwards
	// them to the remote over the TTY), so we ignore them locally for the
	// lifetime of the child and rely solely on the child's exit status.
	const forwardedSignals: NodeJS.Signals[] = ["SIGINT", "SIGQUIT", "SIGTSTP", "SIGHUP", "SIGTERM"];
	const noopHandlers = new Map<NodeJS.Signals, () => void>();
	for (const sig of forwardedSignals) {
		const handler = () => {};
		noopHandlers.set(sig, handler);
		process.on(sig, handler);
	}

	try {
		await new Promise<void>((resolve, reject) => {
			const child = spawn(binary, args, { stdio: "inherit" });
			child.on("error", (error) => {
				if ("code" in error && error.code === "ENOENT") {
					reject(new Error(`${binary} is required but was not found in PATH`));
					return;
				}
				reject(error);
			});
			child.on("exit", (code, signal) => {
				if (code === 0 || (options.tolerateExitCode1 && code === 1)) {
					resolve();
					return;
				}
				if (signal) {
					// Child was killed by a signal (e.g. user sent SIGTERM or
					// connection died). Treat as a clean exit rather than
					// surfacing a confusing "exited with code null" error.
					resolve();
					return;
				}
				reject(new Error(`${binary} exited with code ${code ?? 1}`));
			});
		});
	} finally {
		for (const [sig, handler] of noopHandlers) {
			process.off(sig, handler);
		}
	}
}
