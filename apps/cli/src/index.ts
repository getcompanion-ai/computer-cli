#!/usr/bin/env node
import { Command, type Help } from "commander";
import chalk from "chalk";
import { basename } from "node:path";
import { openCommand, portsCommand, sshCommand, sshProxyCommand, syncCommand } from "./commands/access.js";
import { claudeLoginCommand } from "./commands/claude-auth.js";
import {
	createCommand,
	getCommand,
	lsCommand,
	powerOffCommand,
	powerOnCommand,
	removeCommand,
	transferCommand,
} from "./commands/computers.js";
import { completionCommand } from "./commands/completion.js";
import { codexLoginCommand } from "./commands/codex-login.js";
import { imageCommand } from "./commands/images.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { sharesCommand } from "./commands/shares.js";
import { snapshotCommand } from "./commands/snapshots.js";
import { upgradeCommand } from "./commands/upgrade.js";
import { whoamiCommand } from "./commands/whoami.js";
import { padEnd } from "./lib/format.js";

const CLI_VERSION: string = process.env.__CLI_VERSION__ ?? "0.0.0-dev";
const cliName = process.argv[1] ? basename(process.argv[1]) : "agentcomputer";

const program = new Command();
program.enablePositionalOptions();

type HelpEntry = {
	term: string;
	desc: string;
};

function appendTextSection(lines: string[], title: string, values: string[]): void {
	if (values.length === 0) {
		return;
	}
	lines.push(`  ${chalk.dim(title)}`);
	lines.push("");
	for (const value of values) {
		lines.push(`    ${chalk.white(value)}`);
	}
	lines.push("");
}

function appendTableSection(lines: string[], title: string, entries: HelpEntry[]): void {
	if (entries.length === 0) {
		return;
	}
	const width = Math.max(...entries.map((entry) => entry.term.length), 0) + 2;
	lines.push(`  ${chalk.dim(title)}`);
	lines.push("");
	for (const entry of entries) {
		lines.push(`    ${chalk.white(padEnd(entry.term, width))}${chalk.dim(entry.desc)}`);
	}
	lines.push("");
}

function commandPath(cmd: Command): string {
	const parts: string[] = [];
	let current: Command | null = cmd;
	while (current) {
		parts.unshift(current.name());
		current = current.parent ?? null;
	}
	return parts.join(" ");
}

function formatRootHelp(cmd: Command): string {
	const version = CLI_VERSION;
	const lines: string[] = [];
	const groups = [
		["Auth", [] as HelpEntry[]],
		["Computers", [] as HelpEntry[]],
		["Images", [] as HelpEntry[]],
		["Access", [] as HelpEntry[]],
		["Shares", [] as HelpEntry[]],
		["Snapshots", [] as HelpEntry[]],
		["Other", [] as HelpEntry[]],
	] as const;
	const otherGroup = groups.find(([name]) => name === "Other")![1];

	lines.push(`${chalk.bold(cliName)} ${chalk.dim(`v${version}`)}`);
	lines.push("");

	if (cmd.description()) {
		lines.push(`  ${chalk.dim(cmd.description())}`);
		lines.push("");
	}

	appendTextSection(lines, "Usage", [`${cliName} <command> [options]`]);

	for (const sub of cmd.commands) {
		const name = sub.name();
		const entry: HelpEntry = { term: name, desc: sub.description() };

		if (["login", "logout", "whoami", "claude-login", "codex-login"].includes(name)) {
			groups[0][1].push(entry);
		} else if (["create", "ls", "get", "power-on", "power-off", "rm"].includes(name)) {
			groups[1][1].push(entry);
		} else if (name === "image") {
			groups[2][1].push(entry);
		} else if (["open", "ssh", "sync", "ports"].includes(name)) {
			groups[3][1].push(entry);
		} else if (name === "shares") {
			groups[4][1].push(entry);
		} else if (name === "snapshot") {
			groups[5][1].push(entry);
		} else {
			otherGroup.push(entry);
		}
	}

	for (const [groupName, entries] of groups) {
		appendTableSection(
			lines,
			groupName,
			entries,
		);
	}

	appendTableSection(lines, "Options", [
		{ term: "-y, --yes", desc: "Skip confirmation prompts" },
		{ term: "-V, --version", desc: "Show version" },
		{ term: "-h, --help", desc: "Show help" },
	]);

	return `${lines.join("\n").trimEnd()}\n`;
}

function formatSubcommandHelp(cmd: Command, helper: Help): string {
	const lines: string[] = [];
	const description = helper.commandDescription(cmd);
	const argumentsList = helper.visibleArguments(cmd).map((argument) => ({
		term: helper.argumentTerm(argument),
		desc: helper.argumentDescription(argument),
	}));
	const commandList = helper.visibleCommands(cmd).map((subcommand) => ({
		term: helper.subcommandTerm(subcommand),
		desc: helper.subcommandDescription(subcommand),
	}));
	const optionList = helper.visibleOptions(cmd).map((option) => ({
		term: helper.optionTerm(option),
		desc: helper.optionDescription(option),
	}));

	lines.push(chalk.bold(commandPath(cmd)));
	lines.push("");

	if (description) {
		lines.push(`  ${chalk.dim(description)}`);
		lines.push("");
	}

	appendTextSection(lines, "Usage", [helper.commandUsage(cmd)]);
	appendTableSection(lines, "Arguments", argumentsList);
	appendTableSection(lines, "Commands", commandList);
	appendTableSection(lines, "Options", optionList);

	return `${lines.join("\n").trimEnd()}\n`;
}

function applyHelpFormatting(cmd: Command): void {
	cmd.configureHelp({
		formatHelp(current, helper: Help) {
			if (!current.parent) {
				return formatRootHelp(current);
			}
			return formatSubcommandHelp(current, helper);
		},
	});

	for (const subcommand of cmd.commands) {
		applyHelpFormatting(subcommand);
	}
}

program
	.name(cliName)
	.description("Agent Computer CLI")
	.version(CLI_VERSION)
	.option("-y, --yes", "Skip confirmation prompts");

program.addCommand(loginCommand);
program.addCommand(upgradeCommand);
program.addCommand(logoutCommand);
program.addCommand(whoamiCommand);
program.addCommand(claudeLoginCommand);
program.addCommand(codexLoginCommand);
program.addCommand(createCommand);
program.addCommand(lsCommand);
program.addCommand(getCommand);
program.addCommand(powerOnCommand);
program.addCommand(powerOffCommand);
program.addCommand(transferCommand);
program.addCommand(imageCommand);
program.addCommand(openCommand);
program.addCommand(sshCommand);
program.addCommand(sshProxyCommand, { hidden: true });
program.addCommand(syncCommand);
program.addCommand(portsCommand);
program.addCommand(sharesCommand);
program.addCommand(snapshotCommand);
program.addCommand(removeCommand);
program.addCommand(completionCommand);

applyHelpFormatting(program);

program.parse();
