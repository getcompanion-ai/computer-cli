import { select } from "@inquirer/prompts";
import chalk from "chalk";

import type { Computer } from "./computers.js";
import { formatStatus, padEnd, timeAgo } from "./format.js";

export async function promptForSSHComputer(
	computers: Computer[],
	message: string,
): Promise<Computer> {
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		throw new Error("computer id or handle is required when not running interactively");
	}

	const available = computers.filter(isSSHSelectable);
	if (available.length === 0) {
		if (computers.length === 0) {
			throw new Error("no computers found");
		}
		throw new Error("no running computers with SSH enabled");
	}

	const handleWidth = Math.max(6, ...available.map((computer) => computer.handle.length));
	const selectedID = await select({
		message,
		pageSize: Math.min(available.length, 10),
		choices: available.map((computer) => ({
			name: `${padEnd(chalk.white(computer.handle), handleWidth + 2)}${padEnd(formatStatus(computer.status), 12)}${chalk.dim(describeSSHChoice(computer))}`,
			value: computer.id,
		})),
	});

	return available.find((computer) => computer.id === selectedID) ?? available[0];
}

export function isSSHSelectable(computer: Computer): boolean {
	return computer.ssh_enabled && computer.status === "running";
}

function describeSSHChoice(computer: Computer): string {
	const displayName = computer.display_name.trim();
	if (displayName && displayName !== computer.handle) {
		return `${displayName}  ${timeAgo(computer.updated_at)}`;
	}
	return `${computer.runtime_family}  ${timeAgo(computer.updated_at)}`;
}
