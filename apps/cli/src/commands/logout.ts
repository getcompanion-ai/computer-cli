import { Command } from "commander";
import chalk from "chalk";
import { clearAPIKey, getStoredAPIKey, hasEnvAPIKey } from "../lib/config.js";

export const logoutCommand = new Command("logout")
	.description("Remove stored API key")
	.action(() => {
		if (!getStoredAPIKey()) {
			console.log();
			console.log(chalk.dim("  Not logged in."));
			if (hasEnvAPIKey()) {
				console.log(chalk.dim("  Environment API key is still active in this shell."));
			}
			console.log();
			return;
		}

		clearAPIKey();
		console.log();
		console.log(chalk.green("  Logged out."));
		if (hasEnvAPIKey()) {
			console.log(chalk.dim("  Environment API key is still active in this shell."));
		}
		console.log();
	});
