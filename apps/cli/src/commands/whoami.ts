import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";

import { getBaseURL, getPublicApiClient } from "../lib/api.js";

export const whoamiCommand = new Command("whoami")
	.description("Show current user")
	.option("--json", "Print raw JSON")
	.action(async (options) => {
		const spinner = options.json ? null : ora("Loading user...").start();
		try {
			const client = getPublicApiClient();
			const [me, usageEnvelope] = await Promise.all([
				client.getMe(),
				client.getUsage(),
			]);
			spinner?.stop();

			if (options.json) {
				console.log(JSON.stringify({ me, usage: usageEnvelope.usage }, null, 2));
				return;
			}

			console.log();
			console.log(`  ${chalk.bold.white(me.display_name || me.primary_email)}`);
			if (me.display_name && me.display_name !== me.primary_email) {
				console.log(`  ${chalk.dim(me.primary_email)}`);
			}
			console.log(`  ${chalk.dim("Auth:")}     ${me.auth_method}`);
			if (me.clerk_api_key_id) {
				console.log(`  ${chalk.dim("Key ID:")}   ${me.clerk_api_key_id}`);
			}
			console.log(`  ${chalk.dim("Runtime:")}  ${formatRuntimeHours(usageEnvelope.usage.runtime_seconds)} used`);
			console.log(`  ${chalk.dim("Storage:")}  ${formatBytes(usageEnvelope.usage.storage_bytes)}`);
			console.log(`  ${chalk.dim("Snapshots:")} ${formatBytes(usageEnvelope.usage.snapshot_storage_bytes)}`);
			console.log(`  ${chalk.dim("Updated:")}  ${new Date(usageEnvelope.usage.updated_at).toLocaleString()}`);
			console.log(`  ${chalk.dim("API:")}      ${chalk.dim(getBaseURL())}`);
			console.log();
		} catch (error) {
			if (spinner) {
				spinner.fail(error instanceof Error ? error.message : "Failed to load user");
			} else {
				console.error(error instanceof Error ? error.message : "Failed to load user");
			}
			process.exit(1);
		}
	});

function formatRuntimeHours(seconds: number): string {
	const hours = Math.max(seconds, 0) / 3600;
	if (hours >= 10) {
		return `${Math.round(hours)}h`;
	}
	return `${hours.toFixed(1)}h`;
}

function formatBytes(bytes: number): string {
	const value = Math.max(bytes, 0);
	if (value < 1024) {
		return `${value} B`;
	}
	const units = ["KiB", "MiB", "GiB", "TiB"];
	let next = value;
	let unit = "B";
	for (const candidate of units) {
		next /= 1024;
		unit = candidate;
		if (next < 1024) {
			break;
		}
	}
	return `${next.toFixed(next >= 10 ? 0 : 1)} ${unit}`;
}
