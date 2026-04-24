import { Command, Option } from "commander";
import chalk from "chalk";
import ora from "ora";
import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

import {
	createBrowserAccess,
	createVNCAccess,
	deletePublishedPort,
	listComputers,
	listPublishedPorts,
	publishPort,
	resolveComputer,
} from "../lib/computers.js";
import { promptForSSHComputer } from "../lib/computer-picker.js";
import {
	openSCPTransfer,
	openSSHConnection,
	prepareSCPTransfer,
	prepareSSHConnection,
	runSSHProxy,
} from "../lib/ssh-access.js";
import { padEnd } from "../lib/format.js";
import { openBrowserURL } from "../lib/open-browser.js";

export const openCommand = new Command("open")
	.description("Open a computer in your browser")
	.argument("<id-or-handle>", "Computer id or handle")
	.option("--vnc", "Open VNC desktop instead of the primary web surface")
	.action(async (identifier: string, options) => {
		const spinner = ora("Preparing access...").start();
		try {
			const computer = await resolveComputer(identifier);
			if (options.vnc) {
				const access = await createVNCAccess(computer.id);
				spinner.succeed(`Opening VNC for ${chalk.bold(computer.handle)}`);
				await openBrowserURL(access.access_url);
				console.log(chalk.dim(`  ${access.access_url}`));
				return;
			}

			const access = await createBrowserAccess(computer.id);
			spinner.succeed(`Opening ${chalk.bold(computer.handle)}`);
			await openBrowserURL(access.access_url);
			console.log(chalk.dim(`  ${access.access_url}`));
		} catch (error) {
			spinner.fail(error instanceof Error ? error.message : "Failed to open computer");
			process.exit(1);
		}
	});

export const sshCommand = new Command("ssh")
	.description(
		"Open an SSH session to a computer.\n\n" +
			"Usage:\n" +
			"  agentcomputer ssh <id-or-handle> [ssh-flags...] [-- remote-command...]\n\n" +
			"Everything before `--` is passed as OpenSSH client flags (e.g. -v, -L).\n" +
			"Everything after `--` is run as a command on the remote VM, so pipes work:\n" +
			"  agentcomputer ssh mybox -- ls -la\n" +
			"  agentcomputer ssh mybox -- 'tail -n 50 /var/log/syslog' | grep error",
	)
	.allowUnknownOption(true)
	.passThroughOptions(true)
	.argument("[id-or-handle]", "Computer id or handle")
	.argument("[ssh-args...]", "SSH flags (before `--`) and remote command (after `--`)")
	.option("--tmux", "Attach or create a persistent tmux session on connect")
	.option("--cmd <command>", "Remote command to run on the VM (alternative to trailing `-- cmd`)")
	.action(
		async (
			identifier: string | undefined,
			sshArgs: string[] | undefined,
			options: { tmux?: boolean; cmd?: string },
		) => {
			const spinner = ora(identifier ? "Preparing SSH access..." : "Fetching computers...").start();
			try {
				// passThroughOptions(true) makes commander forward `--cmd` and
				// `--tmux` straight through to sshArgs instead of consuming
				// them as this subcommand's own options, so we extract them
				// out of the tail manually.
				const { cmd, tmux, rest } = extractOwnOptions(sshArgs ?? [], options);
				const { extraSSHFlags, remoteCommand } = splitSSHArgs(rest, cmd);
				const computer = await resolveSSHComputer(identifier, spinner);
				const connection = await prepareSSHConnection(computer, {
					extraSSHFlags,
					remoteCommand,
					tmux,
				});
				spinner.succeed(`Connecting to ${chalk.bold(computer.handle)}`);

				await openSSHConnection(connection);
			} catch (error) {
				spinner.fail(error instanceof Error ? error.message : "Failed to prepare SSH access");
				process.exit(1);
			}
	},
	);

// splitSSHArgs splits the positional tail into local ssh flags vs a remote
// command. Three inputs are supported, in this order:
//   1. an explicit `--cmd "..."` option (parsed by the shell into one arg);
//   2. everything after a literal `--` token;
//   3. everything before `--` is treated as ssh client flags.
// If neither `--cmd` nor `--` is present, we pass all args as ssh flags,
// matching the old behaviour for non-piped cases.
// extractOwnOptions pulls `--tmux` and `--cmd <value>` / `--cmd=<value>` out
// of the ssh arg tail. commander's passThroughOptions(true) means its own
// .option() registrations do NOT consume these when the first positional
// argument is present, so we handle them ourselves and keep the remaining
// tokens (real ssh flags + remote command) untouched.
function extractOwnOptions(
	rawArgs: string[],
	commanderOpts: { tmux?: boolean; cmd?: string },
): { cmd: string | undefined; tmux: boolean; rest: string[] } {
	let cmd = commanderOpts.cmd;
	let tmux = commanderOpts.tmux === true;
	const rest: string[] = [];
	for (let i = 0; i < rawArgs.length; i++) {
		const arg = rawArgs[i];
		if (arg === "--") {
			rest.push(...rawArgs.slice(i));
			break;
		}
		if (arg === "--tmux") {
			tmux = true;
			continue;
		}
		if (arg === "--cmd") {
			cmd = rawArgs[i + 1];
			i++;
			continue;
		}
		if (arg.startsWith("--cmd=")) {
			cmd = arg.slice("--cmd=".length);
			continue;
		}
		rest.push(arg);
	}
	return { cmd, tmux, rest };
}

function splitSSHArgs(
	rawArgs: string[],
	cmdOption: string | undefined,
): { extraSSHFlags: string[]; remoteCommand: string[] } {
	const separatorIndex = rawArgs.indexOf("--");
	if (separatorIndex >= 0) {
		return {
			extraSSHFlags: rawArgs.slice(0, separatorIndex),
			remoteCommand: rawArgs.slice(separatorIndex + 1),
		};
	}
	if (cmdOption && cmdOption.trim() !== "") {
		// `--cmd` lets users pass a one-shot command without worrying
		// about `--` quoting in their shell. We run it through `sh -c`
		// on the remote so pipes/redirects work.
		return { extraSSHFlags: rawArgs, remoteCommand: ["sh", "-lc", cmdOption] };
	}
	return { extraSSHFlags: rawArgs, remoteCommand: [] };
}

export const syncCommand = new Command("sync")
	.description("Copy a local file or directory into /home/node on a computer over SCP")
	.argument("<path>", "Local file or directory path")
	.addOption(new Option("-c, --computer <id-or-handle>", "Computer id or handle (skips the picker)"))
	.addOption(new Option("-m, --machine <id-or-handle>").hideHelp())
	.action(
		async (inputPath: string, options: { computer?: string; machine?: string }) => {
			const selectedComputer = options.computer ?? options.machine;
			const spinner = ora(selectedComputer ? "Preparing file transfer..." : "Fetching computers...").start();
			try {
				const source = await resolveSyncSource(inputPath);
				const computer = await resolveSSHComputer(
					selectedComputer,
					spinner,
					"Select a computer to sync to",
					"Preparing file transfer...",
				);
				const connection = await prepareSSHConnection(computer);
				const transfer = prepareSCPTransfer(connection, source.absolutePath, {
					recursive: source.isDirectory,
				});
				const remoteDisplayPath = `/home/node/${source.name}`;

				spinner.succeed(
					`Transferring ${chalk.bold(source.name)} to ${chalk.bold(computer.handle)}`,
				);
				console.log(
					chalk.dim(`  ${source.absolutePath} -> ${computer.handle}:${remoteDisplayPath}`),
				);

				await openSCPTransfer(transfer);
				console.log(
					chalk.green(
						`Transferred ${chalk.bold(source.name)} to ${chalk.bold(computer.handle)}:${remoteDisplayPath}`,
					),
				);
			} catch (error) {
				spinner.fail(error instanceof Error ? error.message : "Failed to sync path");
				process.exit(1);
			}
		},
	);

// Hidden subcommand that OpenSSH invokes as ProxyCommand. It opens a TLS
// connection to the ssh-edge with the right SNI and splices stdin<->socket.
// Never run this directly; it's wired from the generated per-computer
// ssh_config written by `prepareSSHConnection`.
export const sshProxyCommand = new Command("ssh-proxy")
	.description("Internal: TLS+SNI ProxyCommand helper for OpenSSH (do not run directly)")
	.argument("<computer-id>", "Computer id whose cached credentials to use")
	.action(async (computerID: string) => {
		try {
			await runSSHProxy(computerID);
		} catch (error) {
			process.stderr.write(
				`agentcomputer ssh-proxy: ${error instanceof Error ? error.message : String(error)}\n`,
			);
			process.exit(1);
		}
	});

export const portsCommand = new Command("ports").description("Manage published app ports");

portsCommand
	.command("ls")
	.description("List published ports for a computer")
	.argument("<id-or-handle>", "Computer id or handle")
	.action(async (identifier: string) => {
		const spinner = ora("Fetching ports...").start();
		try {
			const computer = await resolveComputer(identifier);
			const ports = await listPublishedPorts(computer.id);
			spinner.stop();

			if (ports.length === 0) {
				console.log();
				console.log(chalk.dim("  No published ports."));
				console.log();
				return;
			}

			const nameWidth = Math.max(10, ...ports.map((port) => port.name.length));
			const visibilityWidth = Math.max(
				10,
				...ports.map((port) => port.visibility.length),
			);

			console.log();
			console.log(
				`  ${chalk.dim(padEnd("Name", nameWidth + 2))}${chalk.dim(padEnd("Port", 8))}${chalk.dim(padEnd("Visibility", visibilityWidth + 2))}${chalk.dim("State")}`,
			);
			console.log(
				`  ${chalk.dim("-".repeat(nameWidth + 2))}${chalk.dim("-".repeat(8))}${chalk.dim("-".repeat(visibilityWidth + 2))}${chalk.dim("-".repeat(10))}`,
			);

			for (const port of ports) {
				console.log(
					`  ${padEnd(port.name, nameWidth + 2)}${padEnd(String(port.port), 8)}${padEnd(port.visibility, visibilityWidth + 2)}${port.state}`,
				);
				if (port.public_url) {
					console.log(`  ${chalk.dim(port.public_url)}`);
				}
			}
			console.log();
		} catch (error) {
			spinner.fail(error instanceof Error ? error.message : "Failed to fetch ports");
			process.exit(1);
		}
	});

portsCommand
	.command("publish")
	.description("Publish an app port")
	.argument("<id-or-handle>", "Computer id or handle")
	.argument("<port>", "Target port")
	.option("--name <value>", "Public name for the published port")
	.option("--visibility <value>", "Port visibility: public or private", "public")
	.option("--public", "Publish without requiring an access session")
	.option("--private", "Require an access session for the published URL")
	.action(async (identifier: string, port: string, options) => {
		const spinner = ora("Publishing port...").start();
		try {
			const targetPort = Number.parseInt(port, 10);
			if (!Number.isFinite(targetPort)) {
				throw new Error("port must be an integer");
			}
			const visibility = resolvePortVisibility(options);

			const computer = await resolveComputer(identifier);
			const published = await publishPort(computer.id, {
				port: targetPort,
				name: options.name?.trim() || undefined,
				visibility,
			});

			spinner.succeed(`Published port ${chalk.bold(String(published.port))}`);
			if (published.public_url) {
				console.log(chalk.dim(`  ${published.public_url}`));
			}
			console.log(chalk.dim(`  visibility=${published.visibility}`));
			console.log(chalk.dim(`  state=${published.state}`));
		} catch (error) {
			spinner.fail(error instanceof Error ? error.message : "Failed to publish port");
			process.exit(1);
		}
	});

portsCommand
	.command("rm")
	.description("Unpublish an app port")
	.argument("<id-or-handle>", "Computer id or handle")
	.argument("<port>", "Target port")
	.action(async (identifier: string, port: string) => {
		const spinner = ora("Removing port...").start();
		try {
			const targetPort = Number.parseInt(port, 10);
			if (!Number.isFinite(targetPort)) {
				throw new Error("port must be an integer");
			}

			const computer = await resolveComputer(identifier);
			await deletePublishedPort(computer.id, targetPort);
			spinner.succeed(`Removed port ${chalk.bold(String(targetPort))}`);
		} catch (error) {
			spinner.fail(error instanceof Error ? error.message : "Failed to remove port");
			process.exit(1);
		}
	});

function resolvePortVisibility(options: {
	visibility?: string;
	public?: boolean;
	private?: boolean;
}): "public" | "private" {
	if (options.public && options.private) {
		throw new Error("--public and --private cannot be used together");
	}
	if (options.private) {
		return "private";
	}
	if (options.public) {
		return "public";
	}
	const value = (options.visibility || "public").trim().toLowerCase();
	if (value !== "public" && value !== "private") {
		throw new Error("--visibility must be public or private");
	}
	return value;
}

async function resolveSSHComputer(
	identifier: string | undefined,
	spinner: ReturnType<typeof ora>,
	message = "Select a computer to SSH into",
	resumeText = "Preparing SSH access...",
) {
	const trimmed = identifier?.trim();
	if (trimmed) {
		return resolveComputer(trimmed);
	}

	const computers = await listComputers();
	spinner.stop();
	try {
		return await promptForSSHComputer(computers, message);
	} finally {
		spinner.start(resumeText);
	}
}

type SyncSource = {
	absolutePath: string;
	name: string;
	isDirectory: boolean;
};

async function resolveSyncSource(inputPath: string): Promise<SyncSource> {
	const trimmed = inputPath.trim();
	if (!trimmed) {
		throw new Error("path is required");
	}

	const absolutePath = resolve(trimmed);
	let sourceStat;
	try {
		sourceStat = await stat(absolutePath);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			throw new Error(`path '${inputPath}' does not exist`);
		}
		throw error;
	}

	if (!sourceStat.isFile() && !sourceStat.isDirectory()) {
		throw new Error("path must point to a file or directory");
	}

	return {
		absolutePath,
		name: basename(absolutePath.replace(/[\\/]+$/, "")) || "source",
		isDirectory: sourceStat.isDirectory(),
	};
}
