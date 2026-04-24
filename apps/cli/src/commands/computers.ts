import { confirm, input as textInput, select } from "@inquirer/prompts";
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";

import {
	createComputer,
	deleteComputer,
	getConnectionInfo,
	listComputers,
	listComputerSizePresets,
	powerOffComputer,
	powerOnComputer,
	resolveComputer,
	transferComputer,
	type Computer,
	webURL,
} from "../lib/computers.js";
import { formatStatus, padEnd, timeAgo } from "../lib/format.js";
import { removeComputerSSHState } from "../lib/ssh-access.js";

type CreateCommandOptions = {
	name?: string;
	size?: string;
	memory?: string;
	storage?: string;
	interactive?: boolean;
};

type ResolvedCreateInput = {
	handle?: string;
	name?: string;
	size_preset?: string;
	requested_memory_mib?: number;
	requested_storage_bytes?: number;
};

function printComputerPanel(computer: Computer): void {
	const memGiB = computer.requested_memory_mib
		? `${(computer.requested_memory_mib / 1024).toFixed(0)} GiB`
		: "-";
	const diskGiB = computer.requested_storage_bytes
		? `${(computer.requested_storage_bytes / (1024 * 1024 * 1024)).toFixed(0)} GiB`
		: "-";
	const sizeLabel = computer.size_preset ?? "-";
	const sshTag = computer.ssh_enabled ? chalk.green("on") : chalk.dim("off");
	const vncTag = computer.vnc_enabled ? chalk.green("on") : chalk.dim("off");
	const uptime = timeAgo(computer.created_at);

	const statusText = formatStatus(computer.status);

	// Visible-length helper (strips ANSI)
	const vis = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "").length;

	// Build content rows (label: value pairs per row)
	const titleRow = `  ${chalk.bold.white(computer.handle)}`;
	const metricsRow = `  RAM ${chalk.white(memGiB)}   Disk ${chalk.white(diskGiB)}   Size ${chalk.white(sizeLabel)}`;
	const servicesRow = `  SSH ${sshTag}   VNC ${vncTag}   Up ${chalk.white(uptime)}`;

	// Calculate box width from the widest content row + status badge
	const titleWithStatus = `${titleRow}    ${statusText}`;
	const contentRows = [titleWithStatus, metricsRow, servicesRow];
	const innerWidth = Math.max(...contentRows.map(vis)) + 2;

	const top    = `  ${chalk.dim("\u250c" + "\u2500".repeat(innerWidth) + "\u2510")}`;
	const bottom = `  ${chalk.dim("\u2514" + "\u2500".repeat(innerWidth) + "\u2518")}`;
	const bar    = chalk.dim("\u2502");

	const padRow = (row: string) => {
		const gap = innerWidth - vis(row);
		return `  ${bar}${row}${" ".repeat(Math.max(0, gap))}${bar}`;
	};

	// Title row: name on left, status on right
	const titleGap = innerWidth - vis(titleRow) - vis(statusText) - 2;
	const titleLine = `  ${bar}${titleRow}${" ".repeat(Math.max(1, titleGap))}${statusText}  ${bar}`;

	console.log();
	console.log(top);
	console.log(titleLine);
	console.log(`  ${bar}${" ".repeat(innerWidth)}${bar}`);
	console.log(padRow(metricsRow));
	console.log(padRow(servicesRow));
	console.log(bottom);
}

function printComputer(computer: Computer): void {
	printComputerPanel(computer);
	console.log();
	console.log(`  ${chalk.dim("ID")}        ${computer.id}`);
	console.log(`  ${chalk.dim("Source")}    ${computer.source_kind}`);
	console.log(`  ${chalk.dim("Image")}     ${computer.image_id}`);
	console.log(`  ${chalk.dim("Primary")}   ${chalk.cyan(webURL(computer))}`);
	console.log(`  ${chalk.dim("VNC")}       ${computer.vnc_enabled && computer.vnc_url ? chalk.cyan(computer.vnc_url) : chalk.dim("unavailable")}`);
	if (computer.last_error) {
		console.log(`  ${chalk.dim("Error")}     ${chalk.red(computer.last_error)}`);
	}
	console.log();
}

function formatMemory(mib?: number): string {
	if (!mib) return "-";
	return `${(mib / 1024).toFixed(0)} GiB`;
}

function formatDisk(bytes?: number): string {
	if (!bytes) return "-";
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(0)} GiB`;
}

function printComputerTable(computers: Computer[]): void {
	const handleWidth = Math.max(6, ...computers.map((c) => c.handle.length));
	const statusWidth = 12;
	const ramWidth = 7;
	const diskWidth = 7;
	const createdWidth = 10;

	console.log();
	console.log(
		`  ${chalk.dim(padEnd("Handle", handleWidth + 2))}${chalk.dim(padEnd("State", statusWidth + 2))}${chalk.dim(padEnd("RAM", ramWidth + 2))}${chalk.dim(padEnd("Disk", diskWidth + 2))}${chalk.dim(padEnd("Created", createdWidth + 2))}${chalk.dim("URL")}`,
	);
	console.log(
		`  ${chalk.dim("-".repeat(handleWidth + 2))}${chalk.dim("-".repeat(statusWidth + 2))}${chalk.dim("-".repeat(ramWidth + 2))}${chalk.dim("-".repeat(diskWidth + 2))}${chalk.dim("-".repeat(createdWidth + 2))}${chalk.dim("-".repeat(20))}`,
	);

	for (const computer of computers) {
		console.log(
			`  ${chalk.white(padEnd(computer.handle, handleWidth + 2))}${padEnd(formatStatus(computer.state), statusWidth + 2)}${padEnd(chalk.dim(formatMemory(computer.requested_memory_mib)), ramWidth + 2)}${padEnd(chalk.dim(formatDisk(computer.requested_storage_bytes)), diskWidth + 2)}${padEnd(chalk.dim(timeAgo(computer.created_at)), createdWidth + 2)}${chalk.cyan(webURL(computer))}`,
		);
	}

	console.log();
}

export const lsCommand = new Command("ls")
	.description("List computers")
	.option("--json", "Print raw JSON")
	.action(async (options) => {
		const spinner = options.json ? null : ora("Fetching computers...").start();
		try {
			const computers = await listComputers();
			spinner?.stop();
			if (options.json) {
				console.log(JSON.stringify({ computers }, null, 2));
				return;
			}
			if (computers.length === 0) {
				console.log();
				console.log(chalk.dim("  No computers found."));
				console.log();
				return;
			}
			printComputerTable(computers);
		} catch (error) {
			if (spinner) {
				spinner.fail(error instanceof Error ? error.message : "Failed to fetch computers");
			} else {
				console.error(error instanceof Error ? error.message : "Failed to fetch computers");
			}
			process.exit(1);
		}
	});

export const getCommand = new Command("get")
	.description("Show computer details")
	.argument("<id-or-handle>", "Computer id or handle")
	.option("--json", "Print raw JSON")
	.action(async (identifier: string, options) => {
		const spinner = options.json ? null : ora("Fetching computer...").start();
		try {
			const computer = await resolveComputer(identifier);
			const { connection } = await getConnectionInfo(computer.id).catch(() => ({
				connection: null,
			}));
			if (connection) {
				computer.vnc_url = connection.vnc_url;
				computer.vnc_enabled = connection.vnc_available;
				computer.ssh_host = connection.ssh_host ?? "";
				computer.ssh_port = connection.ssh_port ?? 0;
				computer.ssh_enabled = connection.ssh_available;
			}
			spinner?.stop();
			if (options.json) {
				console.log(JSON.stringify(computer, null, 2));
				return;
			}
			printComputer(computer);
		} catch (error) {
			if (spinner) {
				spinner.fail(error instanceof Error ? error.message : "Failed to fetch computer");
			} else {
				console.error(error instanceof Error ? error.message : "Failed to fetch computer");
			}
			process.exit(1);
		}
	});

export const createCommand = new Command("create")
	.description("Create a computer")
	.argument("[handle]", "Optional computer handle")
	.option("--name <display-name>", "Display name")
	.option("--interactive", "Prompt for supported computer details")
	.option("--size <preset>", "Size preset: ram-2g, ram-4g, or ram-8g")
	.option("--memory <gib>", "Custom RAM in GiB")
	.option("--storage <gib>", "Custom storage in GiB")
	.action(async (handle: string | undefined, options: CreateCommandOptions) => {
		let spinner: ReturnType<typeof ora> | undefined;
		let timer: ReturnType<typeof setInterval> | undefined;
		let startTime = 0;

		try {
			const input = await resolveCreateOptions(handle, options);
			console.log(chalk.dim("Using the current platform computer image."));
			spinner = ora(createSpinnerText(0)).start();
			startTime = Date.now();
			timer = setInterval(() => {
				const elapsed = (Date.now() - startTime) / 1000;
				if (spinner) {
					spinner.text = createSpinnerText(elapsed);
				}
			}, 100);

			const computer = await createComputer({
				handle: input.handle,
				display_name: input.name,
				size_preset: input.size_preset,
				requested_memory_mib: input.requested_memory_mib,
				requested_storage_bytes: input.requested_storage_bytes,
			});
			if (timer) {
				clearInterval(timer);
			}
			const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
			spinner.succeed(chalk.green(`Created ${chalk.bold(computer.handle)} ${chalk.dim(`[${elapsed}s]`)}`));
			printComputer(computer);
		} catch (error) {
			if (timer) {
				clearInterval(timer);
			}
			const message = error instanceof Error ? error.message : "Failed to create computer";
			if (spinner) {
				const suffix = startTime ? ` ${chalk.dim(`[${((Date.now() - startTime) / 1000).toFixed(1)}s]`)}` : "";
				spinner.fail(`${message}${suffix}`);
			} else {
				console.error(chalk.red(message));
			}
			process.exit(1);
		}
	});

async function resolveCreateOptions(
	handle: string | undefined,
	options: CreateCommandOptions,
): Promise<ResolvedCreateInput> {
	const isTTY = process.stdin.isTTY && process.stdout.isTTY;
	const resolved: ResolvedCreateInput = {
		handle: normalizeOptionalValue(handle),
		name: normalizeOptionalValue(options.name),
		size_preset: normalizeOptionalValue(options.size),
		requested_memory_mib: parseGiBToMiB(options.memory, "memory"),
		requested_storage_bytes: parseGiBToBytes(options.storage, "storage"),
	};
	const hasCustomResources =
		resolved.requested_memory_mib !== undefined ||
		resolved.requested_storage_bytes !== undefined;
	if (hasCustomResources) {
		if (
			resolved.requested_memory_mib === undefined ||
			resolved.requested_storage_bytes === undefined
		) {
			throw new Error("--memory and --storage must be provided together");
		}
		resolved.size_preset = "custom";
	}
	if (options.interactive && isTTY) {
		if (!resolved.handle) {
			resolved.handle = normalizeOptionalValue(await textInput({ message: "Computer handle (optional):" }));
		}
		if (!resolved.name) {
			resolved.name = normalizeOptionalValue(await textInput({ message: "Display name (optional):" }));
		}
	}
	if (!resolved.size_preset && !hasCustomResources && isTTY) {
		let presets: Awaited<ReturnType<typeof listComputerSizePresets>>;
		try {
			presets = await listComputerSizePresets();
		} catch {
			// Fall through to default in createComputer
			return resolved;
		}
		resolved.size_preset = await select({
			message: "Size:",
			choices: [
				...presets.map((p) => ({
					name: `${p.label}  (${(p.memory_mib / 1024).toFixed(0)} GiB RAM, ${(p.storage_bytes / (1024 * 1024 * 1024)).toFixed(0)} GiB disk)`,
					value: p.id,
				})),
				{ name: "Custom", value: "custom" },
			],
			default: "ram-2g",
		});
		if (resolved.size_preset === "custom") {
			resolved.requested_memory_mib = parseGiBToMiB(
				await textInput({ message: "RAM GiB:", default: "2" }),
				"memory",
			);
			resolved.requested_storage_bytes = parseGiBToBytes(
				await textInput({ message: "Storage GiB:", default: "5" }),
				"storage",
			);
		}
	}
	return resolved;
}

export const removeCommand = new Command("rm")
	.description("Delete a computer")
	.argument("<id-or-handle>", "Computer id or handle")
	.option("-y, --yes", "Skip confirmation prompt")
	.action(async (identifier: string, options: { yes?: boolean }, cmd: Command) => {
		const globalYes = cmd.parent?.opts()?.yes;
		const skipConfirm = Boolean(options.yes || globalYes);

		const spinner = ora("Resolving computer...").start();
		try {
			const computer = await resolveComputer(identifier);
			spinner.stop();

			if (!skipConfirm && process.stdin.isTTY) {
				const confirmed = await confirm({
					message: `Delete computer ${chalk.bold(computer.handle)}?`,
					default: false,
				});
				if (!confirmed) {
					console.log(chalk.dim("  Cancelled."));
					return;
				}
			}

			const deleteSpinner = ora("Deleting computer...").start();
			const deleted = await deleteComputer(computer.id, { wait: false });
			await removeComputerSSHState(computer.id);
			deleteSpinner.succeed(chalk.green(`Deleted ${chalk.bold(deleted.handle)}`));
		} catch (error) {
			spinner.fail(error instanceof Error ? error.message : "Failed to delete computer");
			process.exit(1);
		}
	});

export const powerOffCommand = new Command("power-off")
	.description("Stop a computer without deleting its storage")
	.argument("<id-or-handle>", "Computer id or handle")
	.option("--json", "Print raw JSON")
	.action(async (identifier: string, options: { json?: boolean }) => {
		const spinner = options.json ? null : ora("Resolving computer...").start();
		try {
			const computer = await resolveComputer(identifier);
			const poweredOff = await powerOffComputer(computer.id);
			if (options.json) {
				console.log(JSON.stringify(poweredOff, null, 2));
				return;
			}
			spinner?.succeed(chalk.green(`Stopped ${chalk.bold(poweredOff.handle)}`));
			printComputer(poweredOff);
		} catch (error) {
			if (spinner) {
				spinner.fail(error instanceof Error ? error.message : "Failed to stop computer");
			} else {
				console.error(error instanceof Error ? error.message : "Failed to stop computer");
			}
			process.exit(1);
		}
	});

export const transferCommand = new Command("transfer")
	.description("Move a computer to another workspace (org) you belong to")
	.argument("<id-or-handle>", "Computer id or handle")
	.requiredOption("--to <org-id>", "Target Clerk organization id (org_...)")
	.option("--json", "Print raw JSON")
	.action(async (identifier: string, options: { to: string; json?: boolean }) => {
		const spinner = options.json ? null : ora("Transferring computer...").start();
		try {
			const computer = await resolveComputer(identifier);
			const transferred = await transferComputer(computer.id, options.to);
			if (options.json) {
				console.log(JSON.stringify(transferred, null, 2));
				return;
			}
			spinner?.succeed(
				chalk.green(`Moved ${chalk.bold(transferred.handle)} to ${options.to}`),
			);
			printComputer(transferred);
		} catch (error) {
			if (spinner) {
				spinner.fail(error instanceof Error ? error.message : "Failed to transfer computer");
			} else {
				console.error(error instanceof Error ? error.message : "Failed to transfer computer");
			}
			process.exit(1);
		}
	});

export const powerOnCommand = new Command("power-on")
	.description("Start a computer")
	.argument("<id-or-handle>", "Computer id or handle")
	.option("--json", "Print raw JSON")
	.action(async (identifier: string, options: { json?: boolean }) => {
		const spinner = options.json ? null : ora("Resolving computer...").start();
		try {
			const computer = await resolveComputer(identifier);
			const poweredOn = await powerOnComputer(computer.id);
			if (options.json) {
				console.log(JSON.stringify(poweredOn, null, 2));
				return;
			}
			spinner?.succeed(chalk.green(`Started ${chalk.bold(poweredOn.handle)}`));
			printComputer(poweredOn);
		} catch (error) {
			if (spinner) {
				spinner.fail(error instanceof Error ? error.message : "Failed to start computer");
			} else {
				console.error(error instanceof Error ? error.message : "Failed to start computer");
			}
			process.exit(1);
		}
	});

function createSpinnerText(elapsedSeconds: number): string {
	return `Creating computer... ${chalk.dim(`${elapsedSeconds.toFixed(1)}s`)}`;
}

function normalizeOptionalValue(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function parseGiBToMiB(value: string | undefined, label: string): number | undefined {
	if (!normalizeOptionalValue(value)) {
		return undefined;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${label} must be a positive number`);
	}
	return Math.round(parsed * 1024);
}

function parseGiBToBytes(value: string | undefined, label: string): number | undefined {
	if (!normalizeOptionalValue(value)) {
		return undefined;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${label} must be a positive number`);
	}
	return Math.round(parsed * 1024 * 1024 * 1024);
}
