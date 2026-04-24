import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { resolveInstallerURL } from "../lib/upgrade-version.js";

const CLI_VERSION: string = process.env.__CLI_VERSION__ ?? "0.0.0-dev";
const DEFAULT_INSTALLER_URL = resolveInstallerURL();

async function downloadInstaller(installerURL: string): Promise<string> {
	const response = await fetch(installerURL);
	if (!response.ok) {
		throw new Error(`Failed to download installer (${response.status})`);
	}

	const tempDir = mkdtempSync(join(tmpdir(), "computer-upgrade-"));
	const installerPath = join(tempDir, "install.sh");
	writeFileSync(installerPath, await response.text(), { mode: 0o755 });
	return installerPath;
}

export const upgradeCommand = new Command("upgrade")
	.description("Update the CLI to the latest version")
	.action(async () => {
		const currentVersion = CLI_VERSION;
		if (process.platform === "win32") {
			console.error(
				chalk.red(
					"`computer upgrade` currently supports the curl/bash installer path on macOS and Linux only.",
				),
			);
			process.exit(1);
			return;
		}

		const spinner = ora("Downloading the latest CLI installer...").start();
		let installerPath: string;
		try {
			installerPath = await downloadInstaller(DEFAULT_INSTALLER_URL);
		} catch (error) {
			spinner.fail(
				error instanceof Error ? error.message : "Failed to download the installer",
			);
			process.exit(1);
			return;
		}

		spinner.stop();
		console.log();
		console.log(chalk.dim(`  Reinstalling the latest release over ${chalk.bold(`v${currentVersion}`)}`));
		console.log(chalk.dim(`  ${DEFAULT_INSTALLER_URL}`));
		console.log();

		const result = spawnSync("bash", [installerPath], {
			stdio: "inherit",
		});
		rmSync(dirname(installerPath), { force: true, recursive: true });

		if (result.status === 0) {
			console.log();
			console.log(chalk.green("  Updated the CLI from the latest website installer release."));
			console.log();
			return;
		}

		process.exit(result.status ?? 1);
	});
