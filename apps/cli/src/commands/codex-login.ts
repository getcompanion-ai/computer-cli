import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { Command, Option } from "commander";
import chalk from "chalk";
import ora from "ora";

import { deleteComputer, type Computer } from "../lib/computers.js";
import {
	prepareAuthTarget,
	randomSuffix,
	resolveSSHTarget,
	runRemoteCommand,
	type PreparedTarget,
	type RemoteAuthOptions,
	type SSHTarget,
	type VerificationResult,
	waitForRunning,
} from "../lib/remote-auth.js";

type CodexLoginOptions = RemoteAuthOptions;

type ChecklistState = "pending" | "done" | "skipped" | "failed";

type ChecklistItem = {
	id: string;
	label: string;
	state: ChecklistState;
	detail?: string;
};

type LocalCodexAuth = {
	authJSON: string;
	detail: string;
};

export const codexLoginCommand = new Command("codex-login")
	.alias("codex-auth")
	.description("Authenticate Codex on a computer")
	.addOption(new Option("--computer <id-or-handle>", "Use a specific computer"))
	.addOption(new Option("--machine <id-or-handle>").hideHelp())
	.option("--keep-helper", "Keep a temporary helper computer if one is created")
	.option("--verbose", "Show step-by-step auth diagnostics")
	.action(async (options: CodexLoginOptions) => {
		try {
			await runCodexLogin(options);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to authenticate Codex";
			console.error(chalk.red(`\n${message}`));
			process.exit(1);
		}
	});

export const codexAuthCommand = codexLoginCommand;

export async function runCodexLogin(options: CodexLoginOptions): Promise<void> {
	const todos = createTodoList();
	let target: Computer | null = null;
	let helperCreated = false;
	let activeTodoID = "target";
	let failureMessage: string | null = null;

	console.log();
	console.log(chalk.cyan("Authenticating with Codex...\n"));

	try {
		const prepared = await prepareTargetMachine(options);
		target = prepared.computer;
		helperCreated = prepared.helperCreated;
		markTodo(todos, "target", "done", prepared.detail);

		activeTodoID = "ready";
		target = await waitForRunning(target);
		markTodo(todos, "ready", "done", `${target.handle} is running`);

		activeTodoID = "local-auth";
		const localAuth = await ensureLocalCodexAuth();
		markTodo(todos, "local-auth", "done", localAuth.detail);

		activeTodoID = "install";
		const sshTarget = await resolveSSHTarget(target);
		await installCodexAuth(sshTarget, localAuth.authJSON);
		markTodo(
			todos,
			"install",
			"done",
			`installed Codex login on ${target.handle}`,
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
			`${target.handle} fresh login shell sees Codex auth`,
		);
	} catch (error) {
		failureMessage =
			error instanceof Error ? error.message : "Failed to authenticate Codex";
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
			chalk.green(`Codex login installed on ${chalk.bold(target.handle)}.`),
		);
		console.log();
	}
}

function createTodoList(): ChecklistItem[] {
	return [
		{ id: "target", label: "Pick target computer", state: "pending" },
		{ id: "ready", label: "Wait for computer readiness", state: "pending" },
		{ id: "local-auth", label: "Complete local Codex auth", state: "pending" },
		{ id: "install", label: "Install stored Codex login", state: "pending" },
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
	options: CodexLoginOptions,
): Promise<PreparedTarget> {
	return prepareAuthTarget(options, {
		helperPrefix: "codex-login",
		helperDisplayName: "Codex Login Helper",
		promptMessage: "Select a computer for Codex login",
	});
}

async function ensureLocalCodexAuth(): Promise<LocalCodexAuth> {
	const localStatus = await getLocalCodexStatus();
	if (localStatus.loggedIn) {
		return {
			authJSON: await readLocalCodexAuthFile(),
			detail: "reused existing local Codex login",
		};
	}

	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		throw new Error(
			"local Codex login is required when not running interactively",
		);
	}

	console.log(
		"We will open your browser so you can authenticate Codex locally.",
	);
	console.log(
		"If Codex falls back to device auth, complete that flow and return here.\n",
	);

	await runInteractiveCodexLogin();
	const refreshedStatus = await getLocalCodexStatus();
	if (!refreshedStatus.loggedIn) {
		throw new Error(
			refreshedStatus.detail || "codex login did not complete successfully",
		);
	}

	return {
		authJSON: await readLocalCodexAuthFile(),
		detail: "local Codex login completed",
	};
}

async function getLocalCodexStatus(): Promise<{
	loggedIn: boolean;
	detail?: string;
}> {
	const result = await captureLocalCommand("codex", ["login", "status"]);
	return parseCodexStatusOutput(result.stdout, result.stderr);
}

async function readLocalCodexAuthFile(): Promise<string> {
	const authPath = join(homedir(), ".codex", "auth.json");
	let raw: string;
	try {
		raw = await readFile(authPath, "utf8");
	} catch (error) {
		throw new Error(
			error instanceof Error
				? `failed to read ${authPath}: ${error.message}`
				: `failed to read ${authPath}`,
		);
	}

	try {
		JSON.parse(raw);
	} catch (error) {
		throw new Error(
			error instanceof Error
				? `local Codex auth file is invalid JSON: ${error.message}`
				: "local Codex auth file is invalid JSON",
		);
	}

	return `${raw.trimEnd()}\n`;
}

async function runInteractiveCodexLogin(): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn("codex", ["login"], {
			stdio: "inherit",
		});

		child.on("error", (error) => {
			reject(
				error instanceof Error
					? new Error(`failed to start local codex login: ${error.message}`)
					: new Error("failed to start local codex login"),
			);
		});

		child.on("exit", (code, signal) => {
			if (code === 0) {
				resolve();
				return;
			}
			if (signal) {
				reject(new Error(`codex login was interrupted by ${signal}`));
				return;
			}
			reject(new Error(`codex login exited with code ${code ?? 1}`));
		});
	});
}

async function captureLocalCommand(
	command: string,
	args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("exit", (code) => {
			resolve({ stdout, stderr, exitCode: code });
		});
	});
}

async function installCodexAuth(
	target: SSHTarget,
	authJSON: string,
): Promise<void> {
	const spinner = ora(
		`Installing Codex login on ${chalk.bold(target.handle)}...`,
	).start();
	try {
		const installScript = buildInstallScript(authJSON);
		await runRemoteCommand(target, ["bash", "-s"], installScript);
		spinner.succeed(`Installed Codex login on ${chalk.bold(target.handle)}`);
	} catch (error) {
		spinner.fail(
			error instanceof Error
				? error.message
				: `Failed to install Codex login on ${target.handle}`,
		);
		throw error;
	}
}

async function verifyTargetMachine(
	handle: string,
	target: SSHTarget,
): Promise<VerificationResult> {
	const spinner = ora(
		`Verifying Codex login on ${chalk.bold(handle)}...`,
	).start();
	const result = await verifyStoredCodexAuth(target);
	if (result.status === "verified") {
		spinner.succeed(`Verified Codex login on ${chalk.bold(handle)}`);
		return result;
	}

	spinner.warn(result.detail);
	return result;
}

function buildInstallScript(authJSON: string): string {
	const authMarker = `AUTH_${randomSuffix(12)}`;
	return [
		"set -euo pipefail",
		'command -v codex >/dev/null 2>&1 || { echo "codex is not installed on this computer" >&2; exit 1; }',
		'mkdir -p "$HOME/.codex"',
		'chmod 700 "$HOME/.codex"',
		`cat > "$HOME/.codex/auth.json" <<'${authMarker}'`,
		authJSON.trimEnd(),
		authMarker,
		'chmod 600 "$HOME/.codex/auth.json"',
	].join("\n");
}

async function verifyStoredCodexAuth(
	target: SSHTarget,
): Promise<VerificationResult> {
	try {
		const result = await runRemoteCommand(target, [
			'PATH="$HOME/.local/bin:$PATH" codex login status 2>&1 || true',
		]);
		const payload = parseCodexStatusOutput(result.stdout, result.stderr);
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

function parseCodexStatusOutput(
	stdout: string,
	stderr: string,
): { loggedIn: boolean; detail?: string } {
	const combined = [stdout, stderr]
		.map((value) => value.trim())
		.filter(Boolean)
		.join("\n");
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
			? `could not verify Codex auth from status output: ${firstStatusLine(combined)}`
			: "could not verify Codex auth from empty status output",
	);
}

function firstStatusLine(value: string): string {
	return (
		value
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find(Boolean) ?? "unknown output"
	);
}
