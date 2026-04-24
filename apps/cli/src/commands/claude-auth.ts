import { createHash, randomBytes } from "node:crypto";

import { input as textInput } from "@inquirer/prompts";
import { Command, Option } from "commander";
import chalk from "chalk";
import ora from "ora";

import { deleteComputer, type Computer } from "../lib/computers.js";
import { openBrowserURL } from "../lib/open-browser.js";
import {
	prepareAuthTarget,
	resolveSSHTarget,
	runRemoteCommand,
	type PreparedTarget,
	type RemoteAuthOptions,
	type SSHTarget,
	type VerificationResult,
	waitForRunning,
} from "../lib/remote-auth.js";

const CLAUDE_OAUTH_CLIENT_ID =
	process.env.CLAUDE_OAUTH_CLIENT_ID ?? "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const CLAUDE_OAUTH_AUTHORIZE_URL =
	process.env.CLAUDE_OAUTH_AUTHORIZE_URL ?? "https://claude.ai/oauth/authorize";
const CLAUDE_OAUTH_TOKEN_URL =
	process.env.CLAUDE_OAUTH_TOKEN_URL ??
	"https://platform.claude.com/v1/oauth/token";
const CLAUDE_OAUTH_REDIRECT_URL =
	process.env.CLAUDE_OAUTH_REDIRECT_URL ??
	"https://platform.claude.com/oauth/code/callback";
const CLAUDE_OAUTH_SCOPES = (
	process.env.CLAUDE_OAUTH_SCOPES ??
	"user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload"
)
	.split(/\s+/)
	.filter(Boolean);

type ClaudeAuthOptions = RemoteAuthOptions;

type OAuthTokens = {
	refreshToken: string;
	scope: string;
};

type ChecklistState = "pending" | "done" | "skipped" | "failed";

type ChecklistItem = {
	id: string;
	label: string;
	state: ChecklistState;
	detail?: string;
};

export const claudeLoginCommand = new Command("claude-login")
	.alias("claude-auth")
	.description("Authenticate Claude Code on a computer")
	.addOption(new Option("--computer <id-or-handle>", "Use a specific computer"))
	.addOption(new Option("--machine <id-or-handle>").hideHelp())
	.option("--keep-helper", "Keep a temporary helper computer if one is created")
	.option("--verbose", "Show step-by-step auth diagnostics")
	.action(async (options: ClaudeAuthOptions) => {
		try {
			await runClaudeLogin(options);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to authenticate Claude";
			console.error(chalk.red(`\n${message}`));
			process.exit(1);
		}
	});

export const claudeAuthCommand = claudeLoginCommand;

export async function runClaudeLogin(
	options: ClaudeAuthOptions,
): Promise<void> {
	const todos = createTodoList();
	let target: Computer | null = null;
	let helperCreated = false;
	let activeTodoID = "target";
	let failureMessage: string | null = null;

	console.log();
	console.log(chalk.cyan("Authenticating with Claude Code...\n"));

	try {
		const prepared = await prepareTargetMachine(options);
		target = prepared.computer;
		helperCreated = prepared.helperCreated;
		markTodo(todos, "target", "done", prepared.detail);

		activeTodoID = "ready";
		target = await waitForRunning(target);
		markTodo(todos, "ready", "done", `${target.handle} is running`);

		activeTodoID = "oauth";
		const oauth = await runManualOAuthFlow();
		markTodo(todos, "oauth", "done", "browser flow completed");

		activeTodoID = "install";
		const sshTarget = await resolveSSHTarget(target);
		await installClaudeAuth(sshTarget, oauth);
		markTodo(
			todos,
			"install",
			"done",
			`installed Claude login on ${target.handle}`,
		);

		activeTodoID = "verify-primary";
		const primaryVerification = await verifyTargetMachine(
			target.handle,
			sshTarget,
		);
		markVerificationTodo(
			todos,
			"verify-primary",
			primaryVerification,
			`${target.handle} fresh login shell sees Claude auth`,
		);
	} catch (error) {
		failureMessage =
			error instanceof Error ? error.message : "Failed to authenticate Claude";
		markTodo(todos, activeTodoID, "failed", failureMessage);
	} finally {
		if (helperCreated && target && !options.keepHelper) {
			try {
				await deleteComputer(target.id);
				markTodo(
					todos,
					"cleanup",
					"done",
					`removed temporary helper ${target.handle}`,
				);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "failed to remove helper";
				markTodo(todos, "cleanup", "failed", message);
			}
		} else if (helperCreated && target && options.keepHelper) {
			markTodo(todos, "cleanup", "skipped", `kept helper ${target.handle}`);
		} else {
			markTodo(todos, "cleanup", "skipped", "no helper created");
		}
		if (options.verbose) {
			printTodoList(todos);
		}
	}

	if (failureMessage) {
		throw new Error(failureMessage);
	}

	if (target) {
		console.log(
			chalk.green(`Claude login installed on ${chalk.bold(target.handle)}.`),
		);
		console.log();
	}
}

function createTodoList(): ChecklistItem[] {
	return [
		{ id: "target", label: "Pick target computer", state: "pending" },
		{ id: "ready", label: "Wait for computer readiness", state: "pending" },
		{ id: "oauth", label: "Complete Claude browser auth", state: "pending" },
		{ id: "install", label: "Install stored Claude login", state: "pending" },
		{
			id: "verify-primary",
			label: "Verify on target computer",
			state: "pending",
		},
		{ id: "cleanup", label: "Clean up temporary helper", state: "pending" },
	];
}

function markTodo(
	items: ChecklistItem[],
	id: string,
	state: ChecklistState,
	detail?: string,
): void {
	const item = items.find((entry) => entry.id === id);
	if (!item) {
		return;
	}
	item.state = state;
	item.detail = detail;
}

function markVerificationTodo(
	items: ChecklistItem[],
	id: string,
	result: VerificationResult,
	successDetail: string,
): void {
	if (result.status === "verified") {
		markTodo(items, id, "done", successDetail);
		return;
	}

	markTodo(items, id, "skipped", result.detail);
}

function printTodoList(items: ChecklistItem[]): void {
	console.log();
	console.log(chalk.dim("TODO"));
	console.log();
	for (const item of items) {
		const marker =
			item.state === "done"
				? chalk.green("[x]")
				: item.state === "skipped"
					? chalk.yellow("[-]")
					: item.state === "failed"
						? chalk.red("[!]")
						: chalk.dim("[ ]");
		const detail = item.detail ? chalk.dim(`  ${item.detail}`) : "";
		console.log(`  ${marker} ${item.label}${detail ? ` ${detail}` : ""}`);
	}
	console.log();
}

async function prepareTargetMachine(
	options: ClaudeAuthOptions,
): Promise<PreparedTarget> {
	return prepareAuthTarget(options, {
		helperPrefix: "claude-auth",
		helperDisplayName: "Claude Auth Helper",
		promptMessage: "Select a computer for Claude auth",
	});
}

async function runManualOAuthFlow(): Promise<OAuthTokens> {
	const codeVerifier = base64url(randomBytes(32));
	const state = randomBytes(16).toString("hex");
	const codeChallenge = base64url(
		createHash("sha256").update(codeVerifier).digest(),
	);
	const url = buildAuthorizationURL(codeChallenge, state);

	console.log("We will open your browser so you can authenticate with Claude.");
	console.log(
		"If the browser does not open automatically, use the URL below:\n",
	);
	console.log(url);
	console.log();

	try {
		await openBrowserURL(url);
	} catch {
		console.log(chalk.yellow("Unable to open the browser automatically."));
	}

	console.log(
		"After completing authentication, copy the code shown on the success page.",
	);
	console.log(
		"You can paste either the full URL, or a value formatted as CODE#STATE.\n",
	);

	const pasted = (
		await textInput({
			message: "Paste the authorization code (or URL) here:",
		})
	).trim();
	if (!pasted) {
		throw new Error("no authorization code provided");
	}

	const parsed = parseAuthorizationInput(pasted, state);
	const spinner = ora("Exchanging authorization code...").start();
	try {
		const response = await fetch(CLAUDE_OAUTH_TOKEN_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				grant_type: "authorization_code",
				code: parsed.code,
				state: parsed.state,
				redirect_uri: CLAUDE_OAUTH_REDIRECT_URL,
				client_id: CLAUDE_OAUTH_CLIENT_ID,
				code_verifier: codeVerifier,
			}),
		});
		if (!response.ok) {
			throw new Error(
				`token exchange failed: ${response.status} ${await response.text()}`,
			);
		}
		const payload = (await response.json()) as {
			refresh_token?: string;
			scope?: string;
		};
		if (!payload.refresh_token || !payload.scope) {
			throw new Error("token exchange returned an incomplete response");
		}
		spinner.succeed("Authorization code exchanged");
		return {
			refreshToken: payload.refresh_token,
			scope: payload.scope,
		};
	} catch (error) {
		spinner.fail(
			error instanceof Error
				? error.message
				: "Failed to exchange authorization code",
		);
		throw error;
	}
}

function buildAuthorizationURL(codeChallenge: string, state: string): string {
	const params = new URLSearchParams({
		code: "true",
		client_id: CLAUDE_OAUTH_CLIENT_ID,
		response_type: "code",
		redirect_uri: CLAUDE_OAUTH_REDIRECT_URL,
		scope: CLAUDE_OAUTH_SCOPES.join(" "),
		code_challenge: codeChallenge,
		code_challenge_method: "S256",
		state,
	});
	return `${CLAUDE_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

function parseAuthorizationInput(
	value: string,
	expectedState: string,
): { code: string; state: string } {
	if (value.startsWith("http://") || value.startsWith("https://")) {
		const parsed = new URL(value);
		const code = parsed.searchParams.get("code");
		const state = parsed.searchParams.get("state");
		if (!code || !state) {
			throw new Error("pasted URL is missing code or state");
		}
		if (state !== expectedState) {
			throw new Error(
				"state mismatch detected; restart the authentication flow",
			);
		}
		return { code, state };
	}

	const [code, state] = value.split("#", 2).map((part) => part?.trim() ?? "");
	if (!code || !state) {
		throw new Error("expected a full URL or a CODE#STATE value");
	}
	if (state !== expectedState) {
		throw new Error("state mismatch detected; restart the authentication flow");
	}
	return { code, state };
}

async function installClaudeAuth(
	target: SSHTarget,
	oauth: OAuthTokens,
): Promise<void> {
	const spinner = ora(
		`Installing Claude auth on ${chalk.bold(target.handle)}...`,
	).start();
	try {
		const installScript = buildInstallScript(oauth.refreshToken, oauth.scope);
		await runRemoteCommand(target, ["bash", "-s"], installScript);
		spinner.succeed(`Installed Claude auth on ${chalk.bold(target.handle)}`);
	} catch (error) {
		spinner.fail(
			error instanceof Error
				? error.message
				: `Failed to install Claude auth on ${target.handle}`,
		);
		throw error;
	}
}

async function verifyTargetMachine(
	handle: string,
	target: SSHTarget,
): Promise<VerificationResult> {
	const spinner = ora(
		`Verifying Claude login on ${chalk.bold(handle)}...`,
	).start();
	const result = await verifyStoredAuth(target);
	if (result.status === "verified") {
		spinner.succeed(`Verified Claude login on ${chalk.bold(handle)}`);
		return result;
	}

	spinner.warn(result.detail);
	return result;
}

function buildInstallScript(refreshToken: string, scopes: string): string {
	const tokenMarker = `TOKEN_${randomSuffix(12)}`;
	const scopeMarker = `SCOPES_${randomSuffix(12)}`;
	return [
		"set -euo pipefail",
		'command -v claude >/dev/null 2>&1 || { echo "claude is not installed on this computer" >&2; exit 1; }',
		"export CLAUDE_CODE_OAUTH_REFRESH_TOKEN=\"$(cat <<'" + tokenMarker + "'",
		refreshToken,
		tokenMarker,
		')\"',
		"export CLAUDE_CODE_OAUTH_SCOPES=\"$(cat <<'" + scopeMarker + "'",
		scopes,
		scopeMarker,
		')\"',
		"claude auth login",
		"unset CLAUDE_CODE_OAUTH_REFRESH_TOKEN",
		"unset CLAUDE_CODE_OAUTH_SCOPES",
	].join("\n");
}

async function verifyStoredAuth(
	target: SSHTarget,
): Promise<VerificationResult> {
	try {
		const result = await runRemoteCommand(target, [
			"bash",
			"--noprofile",
			"--norc",
			"-lc",
			"claude auth status --json 2>/dev/null || claude auth status",
		]);
		const payload = parseStatusOutput(result.stdout, result.stderr);
		if (payload.loggedIn) {
			return { status: "verified", detail: "verified" };
		}
		return {
			status: "failed",
			detail: payload.detail
				? `verification failed: ${payload.detail}`
				: "verification failed",
		};
	} catch (error) {
		return {
			status: "inconclusive",
			detail:
				error instanceof Error
					? error.message
					: "verification command did not complete cleanly",
		};
	}
}

function parseStatusOutput(
	stdout: string,
	stderr: string,
): { loggedIn: boolean; detail?: string } {
	const combined = [stdout, stderr]
		.map((value) => value.trim())
		.filter(Boolean)
		.join("\n");
	const start = combined.indexOf("{");
	const end = combined.lastIndexOf("}");
	if (start === -1 || end === -1 || end <= start) {
		const normalized = combined.toLowerCase();
		if (
			normalized.includes("not logged in") ||
			normalized.includes("logged out")
		) {
			return { loggedIn: false, detail: firstStatusLine(combined) };
		}
		if (normalized.includes("logged in")) {
			return { loggedIn: true };
		}
		throw new Error(
			combined
				? `could not verify Claude auth from status output: ${firstStatusLine(combined)}`
				: "could not verify Claude auth from empty status output",
		);
	}
	const parsed = JSON.parse(combined.slice(start, end + 1)) as {
		loggedIn?: boolean;
		error?: string;
	};
	return {
		loggedIn: parsed.loggedIn === true,
		detail: parsed.loggedIn === true ? undefined : parsed.error,
	};
}

function firstStatusLine(value: string): string {
	return (
		value
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find(Boolean) ?? "unknown output"
	);
}

function base64url(buffer: Buffer): string {
	return buffer
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function randomSuffix(length: number): string {
	return randomBytes(Math.ceil(length / 2))
		.toString("hex")
		.slice(0, length);
}
