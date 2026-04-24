import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";

import {
	createSnapshot,
	deleteSnapshot,
	listSnapshots,
	resolveComputer,
	restoreSnapshot,
	type Snapshot,
} from "../lib/computers.js";
import { padEnd, timeAgo } from "../lib/format.js";
import { ensureDefaultSSHKeyRegistered } from "../lib/ssh-keys.js";

export const snapshotCommand = new Command("snapshot").description(
	"Manage computer snapshots",
);

snapshotCommand
	.command("ls")
	.description("List snapshots for a computer")
	.argument("<id-or-handle>", "Computer id or handle")
	.option("--json", "Print raw JSON")
	.action(async (identifier: string, options: { json?: boolean }) => {
		const spinner = options.json ? null : ora("Fetching snapshots...").start();
		try {
			const computer = await resolveComputer(identifier);
			const snapshots = await listSnapshots(computer.id);
			spinner?.stop();
			if (options.json) {
				console.log(JSON.stringify({ snapshots }, null, 2));
				return;
			}
			printSnapshots(snapshots);
		} catch (error) {
			failWithSpinner(spinner, error, "Failed to fetch snapshots");
		}
	});

snapshotCommand
	.command("create")
	.description("Create a snapshot for a computer")
	.argument("<id-or-handle>", "Computer id or handle")
	.option("--json", "Print raw JSON")
	.action(async (identifier: string, options: { json?: boolean }) => {
		const spinner = options.json ? null : ora("Creating snapshot...").start();
		try {
			const computer = await resolveComputer(identifier);
			const snapshot = await createSnapshot(computer.id);
			if (options.json) {
				console.log(JSON.stringify({ snapshot }, null, 2));
				return;
			}
			spinner?.succeed(`Created snapshot ${chalk.bold(snapshot.id)}`);
			printSnapshot(snapshot);
		} catch (error) {
			failWithSpinner(spinner, error, "Failed to create snapshot");
		}
	});

snapshotCommand
	.command("rm")
	.description("Delete a snapshot")
	.argument("<snapshot-id>", "Snapshot id")
	.option("--json", "Print raw JSON")
	.action(async (snapshotId: string, options: { json?: boolean }) => {
		const spinner = options.json ? null : ora("Deleting snapshot...").start();
		try {
			const snapshot = await deleteSnapshot(snapshotId);
			if (options.json) {
				console.log(JSON.stringify({ snapshot }, null, 2));
				return;
			}
			spinner?.succeed(`Deleted snapshot ${chalk.bold(snapshot.id)}`);
		} catch (error) {
			failWithSpinner(spinner, error, "Failed to delete snapshot");
		}
	});

snapshotCommand
	.command("restore")
	.description("Restore a snapshot into a new computer")
	.argument("<snapshot-id>", "Snapshot id")
	.argument("[handle]", "Optional handle for the restored computer")
	.option("--name <display-name>", "Display name for the restored computer")
	.option("--json", "Print raw JSON")
	.action(
		async (
			snapshotId: string,
			handle: string | undefined,
			options: { name?: string; json?: boolean },
		) => {
			const spinner = options.json ? null : ora("Restoring snapshot...").start();
			try {
				const registered = await ensureDefaultSSHKeyRegistered();
				const computer = await restoreSnapshot(snapshotId, {
					handle: handle?.trim() || undefined,
					display_name: options.name?.trim() || undefined,
					authorized_keys: [registered.key.public_key],
				});
				if (options.json) {
					console.log(JSON.stringify({ computer }, null, 2));
					return;
				}
				spinner?.succeed(`Restored ${chalk.bold(computer.handle)}`);
				console.log();
				console.log(`  ${chalk.dim("ID")}      ${computer.id}`);
				console.log(`  ${chalk.dim("Handle")}  ${computer.handle}`);
				console.log(`  ${chalk.dim("State")}   ${computer.state}`);
				console.log(`  ${chalk.dim("URL")}     ${chalk.cyan(computer.primary_url)}`);
				console.log();
			} catch (error) {
				failWithSpinner(spinner, error, "Failed to restore snapshot");
			}
		},
	);

function printSnapshots(snapshots: Snapshot[]): void {
	if (snapshots.length === 0) {
		console.log();
		console.log(chalk.dim("  No snapshots found."));
		console.log();
		return;
	}

	const idWidth = Math.max(12, ...snapshots.map((snapshot) => snapshot.id.length));
	const stateWidth = Math.max(8, ...snapshots.map((snapshot) => snapshot.state.length));
	const durableWidth = Math.max(8, ...snapshots.map((snapshot) => (snapshot.durable_state || "").length));

	console.log();
	console.log(
		`  ${chalk.dim(padEnd("ID", idWidth + 2))}${chalk.dim(padEnd("State", stateWidth + 2))}${chalk.dim(padEnd("Durable", durableWidth + 2))}${chalk.dim("Created")}`,
	);
	console.log(
		`  ${chalk.dim("-".repeat(idWidth + 2))}${chalk.dim("-".repeat(stateWidth + 2))}${chalk.dim("-".repeat(durableWidth + 2))}${chalk.dim("-".repeat(14))}`,
	);
	for (const snapshot of snapshots) {
		console.log(
			`  ${chalk.white(padEnd(snapshot.id, idWidth + 2))}${padEnd(snapshot.state, stateWidth + 2)}${padEnd(snapshot.durable_state || "", durableWidth + 2)}${timeAgo(snapshot.created_at)}`,
		);
	}
	console.log();
}

function printSnapshot(snapshot: Snapshot): void {
	console.log();
	console.log(`  ${chalk.bold.white(snapshot.id)}  ${snapshot.state}`);
	console.log();
	console.log(`  ${chalk.dim("Computer")}  ${snapshot.computer_id}`);
	console.log(`  ${chalk.dim("Image")}     ${snapshot.image_id}`);
	console.log(`  ${chalk.dim("Durable")}   ${snapshot.durable_state}`);
	console.log(`  ${chalk.dim("Created")}   ${timeAgo(snapshot.created_at)}`);
	if (snapshot.failure_reason) {
		console.log(`  ${chalk.dim("Error")}     ${chalk.red(snapshot.failure_reason)}`);
	}
	if (snapshot.durable_failure_reason) {
		console.log(`  ${chalk.dim("Durable Error")} ${chalk.red(snapshot.durable_failure_reason)}`);
	}
	console.log();
}

function failWithSpinner(
	spinner: ReturnType<typeof ora> | null,
	error: unknown,
	fallback: string,
): never {
	const message = error instanceof Error ? error.message : fallback;
	if (spinner) {
		spinner.fail(message);
	} else {
		console.error(message);
	}
	process.exit(1);
}
