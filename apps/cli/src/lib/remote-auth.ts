import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

import ora from "ora";

import {
	createComputer,
	getComputerByID,
	listComputers,
	resolveComputer,
	type Computer,
} from "./computers.js";
import { isSSHSelectable, promptForSSHComputer } from "./computer-picker.js";
import { prepareSSHConnection } from "./ssh-access.js";

const readyPollIntervalMs = 2_000;
const readyPollTimeoutMs = 180_000;

export type RemoteAuthOptions = {
	computer?: string;
	machine?: string;
	keepHelper?: boolean;
	verbose?: boolean;
};

export type PreparedTarget = {
	computer: Computer;
	helperCreated: boolean;
	detail: string;
};

export type SSHTarget = {
	handle: string;
	user: string;
	/** Host alias used in the per-computer ssh_config (the computer id). */
	host: string;
	/** Absolute path to the per-computer ssh_config fragment. */
	configPath: string;
};

export type VerificationResult = {
	status: "verified" | "inconclusive" | "failed";
	detail: string;
};

type PrepareAuthTargetConfig = {
	helperPrefix: string;
	helperDisplayName: string;
	promptMessage: string;
};

export async function prepareAuthTarget(
	options: RemoteAuthOptions,
	config: PrepareAuthTargetConfig,
): Promise<PreparedTarget> {
	const requestedComputer = options.computer?.trim() || options.machine?.trim();
	if (requestedComputer) {
		const computer = await resolveComputer(requestedComputer);
		assertSSHAuthTarget(computer);
		return {
			computer,
			helperCreated: false,
			detail: describeTarget(computer, false),
		};
	}

	const computers = await listComputers();
	if (computers.some(isSSHSelectable)) {
		const computer = await promptForSSHComputer(computers, config.promptMessage);
		return {
			computer,
			helperCreated: false,
			detail: describeTarget(computer, false),
		};
	}

	if (!options.keepHelper) {
		if (computers.length === 0) {
			throw new Error(
				"no computers found; create a computer first or rerun with --keep-helper to create a new helper",
			);
		}
		throw new Error(
			"no running computers with SSH enabled; start a computer first or rerun with --keep-helper to create a new helper",
		);
	}

	const spinner = ora(`Creating temporary ${config.helperPrefix} helper...`).start();
	try {
		const helper = await createComputer({
			handle: `${config.helperPrefix}-${randomSuffix(6)}`,
			display_name: config.helperDisplayName,
		});
		spinner.succeed(`Created temporary helper ${helper.handle}`);
		return {
			computer: helper,
			helperCreated: true,
			detail: describeTarget(helper, true),
		};
	} catch (error) {
		spinner.fail(
			error instanceof Error ? error.message : "Failed to create temporary helper",
		);
		throw error;
	}
}

export async function waitForRunning(initial: Computer): Promise<Computer> {
	if (initial.status === "running") {
		return initial;
	}

	const spinner = ora(`Waiting for ${initial.handle} to be ready...`).start();
	const deadline = Date.now() + readyPollTimeoutMs;
	let lastStatus = initial.status;

	while (Date.now() < deadline) {
		const current = await getComputerByID(initial.id);
		if (current.status === "running") {
			spinner.succeed(`${current.handle} is ready`);
			return current;
		}
		if (current.status !== lastStatus) {
			lastStatus = current.status;
			spinner.text = `Waiting for ${current.handle}... ${current.status}`;
		}
		if (
			current.status === "failed" ||
			current.status === "deleted" ||
			current.status === "stopped"
		) {
			spinner.fail(`${current.handle} entered ${current.status}`);
			throw new Error(current.last_error || `${current.handle} entered ${current.status}`);
		}
		await delay(readyPollIntervalMs);
	}

	spinner.fail(`Timed out waiting for ${initial.handle}`);
	throw new Error(`timed out waiting for ${initial.handle} to be ready`);
}

export async function resolveSSHTarget(computer: Computer): Promise<SSHTarget> {
	assertSSHAuthTarget(computer);

	// Reuse the same credential-bundle + ssh_config flow the interactive
	// `ssh` command uses so remote-auth piggy-backs on ControlMaster and
	// the edge direct path. No separate auth surface.
	const connection = await prepareSSHConnection(computer);
	return {
		handle: computer.handle,
		host: connection.credentials.computer_id,
		user: connection.credentials.ssh_user,
		configPath: connection.configPath,
	};
}

export async function runRemoteCommand(
	target: SSHTarget,
	remoteArgs: string[],
	script?: string,
): Promise<{ stdout: string; stderr: string }> {
	const args = [
		"-F", target.configPath,
		"-T",
		`${target.user}@${target.host}`,
		...remoteArgs,
	];

	return new Promise((resolve, reject) => {
		const child = spawn("ssh", args, {
			stdio: ["pipe", "pipe", "pipe"],
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
			if (code === 0) {
				resolve({ stdout, stderr });
				return;
			}
			const message = stderr.trim() || stdout.trim() || `ssh exited with code ${code ?? 1}`;
			reject(new Error(message));
		});

		if (script !== undefined) {
			child.stdin.end(script);
			return;
		}
		child.stdin.end();
	});
}

export function assertSSHAuthTarget(computer: Computer): void {
	if (!computer.viewer_access.allow_ssh) {
		throw new Error(`${computer.handle} does not have SSH enabled`);
	}
}

export function randomSuffix(length: number): string {
	return randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
}

function describeTarget(computer: Computer, helperCreated: boolean): string {
	if (helperCreated) {
		return `created temporary helper ${computer.handle}`;
	}
	return `using ${computer.handle}`;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
