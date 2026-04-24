import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";

import {
	createLinkShare,
	deleteShare,
	listShares,
	resolveComputer,
	type ComputerShare,
} from "../lib/computers.js";
import { padEnd } from "../lib/format.js";

export const sharesCommand = new Command("shares").description("Manage computer shares");

sharesCommand
	.command("ls")
	.description("List shares for a computer")
	.argument("<id-or-handle>", "Computer id or handle")
	.option("--json", "Print raw JSON")
	.action(async (identifier: string, options: { json?: boolean }) => {
		const spinner = options.json ? null : ora("Fetching shares...").start();
		try {
			const computer = await resolveComputer(identifier);
			const shares = await listShares(computer.id);
			spinner?.stop();
			if (options.json) {
				console.log(JSON.stringify({ shares }, null, 2));
				return;
			}
			printShares(shares);
		} catch (error) {
			failWithSpinner(spinner, error, "Failed to fetch shares");
		}
	});

sharesCommand
	.command("create")
	.description("Create a share link for a computer")
	.argument("<id-or-handle>", "Computer id or handle")
	.option("--vnc", "Allow VNC desktop access as well")
	.option("--expires <duration>", "Expiry like 1h, 24h, 7d")
	.option("--json", "Print raw JSON")
	.action(
		async (
			identifier: string,
			options: {
				vnc?: boolean;
				expires?: string;
				json?: boolean;
			},
		) => {
			const spinner = options.json ? null : ora("Creating share...").start();
			try {
				const computer = await resolveComputer(identifier);
				const expiresAt = parseExpiryOption(options.expires);
				const share = await createLinkShare(computer.id, {
					allow_browser: true,
					allow_vnc: Boolean(options.vnc),
					expires_at: expiresAt,
				});
				spinner?.stop();
				if (options.json) {
					console.log(JSON.stringify({ share }, null, 2));
					return;
				}
				console.log();
				console.log(`  ${chalk.bold.white(share.id)}  ${share.kind}`);
				if (share.share_url) {
					console.log(`  ${chalk.dim("URL")}       ${chalk.cyan(share.share_url)}`);
				}
				if (share.expires_at) {
					console.log(`  ${chalk.dim("Expires")}   ${share.expires_at}`);
				}
				console.log();
			} catch (error) {
				failWithSpinner(spinner, error, "Failed to create share");
			}
		},
	);

sharesCommand
	.command("rm")
	.description("Delete a share")
	.argument("<id-or-handle>", "Computer id or handle")
	.argument("<share-id>", "Share id")
	.action(async (identifier: string, shareId: string) => {
		const spinner = ora("Deleting share...").start();
		try {
			const computer = await resolveComputer(identifier);
			await deleteShare(computer.id, shareId);
			spinner.succeed(`Removed share ${chalk.bold(shareId)}`);
		} catch (error) {
			failWithSpinner(spinner, error, "Failed to delete share");
		}
	});

function printShares(shares: ComputerShare[]): void {
	if (shares.length === 0) {
		console.log();
		console.log(chalk.dim("  No shares found."));
		console.log();
		return;
	}

	const idWidth = Math.max(8, ...shares.map((share) => share.id.length));
	const kindWidth = Math.max(5, ...shares.map((share) => share.kind.length));

	console.log();
	console.log(
		`  ${chalk.dim(padEnd("ID", idWidth + 2))}${chalk.dim(padEnd("Kind", kindWidth + 2))}${chalk.dim("Target")}`,
	);
	console.log(
		`  ${chalk.dim("-".repeat(idWidth + 2))}${chalk.dim("-".repeat(kindWidth + 2))}${chalk.dim("-".repeat(24))}`,
	);
	for (const share of shares) {
		console.log(
			`  ${chalk.white(padEnd(share.id, idWidth + 2))}${padEnd(share.kind, kindWidth + 2)}${share.share_url || ""}`,
		);
	}
	console.log();
}

function parseExpiryOption(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) {
		return undefined;
	}
	const match = /^(\d+)([smhd])$/i.exec(trimmed);
	if (!match) {
		throw new Error("expiry must look like 30m, 1h, 24h, or 7d");
	}
	const amount = Number.parseInt(match[1] || "0", 10);
	const unit = (match[2] || "h").toLowerCase();
	const multiplier =
		unit === "s"
			? 1000
			: unit === "m"
				? 60_000
				: unit === "d"
					? 24 * 60 * 60_000
					: 60 * 60_000;
	return new Date(Date.now() + amount * multiplier).toISOString();
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
