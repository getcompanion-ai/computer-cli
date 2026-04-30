import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";

import {
	createFuseMount,
	deleteFuseMount,
	listFuseMounts,
	resolveComputer,
	type FuseMount,
} from "../lib/computers.js";
import { padEnd } from "../lib/format.js";

export const mountCommand = new Command("mount").description("Manage FUSE mounts on a computer");

mountCommand
	.command("ls")
	.description("List FUSE mounts for a computer")
	.argument("<id-or-handle>", "Computer id or handle")
	.option("--json", "Print raw JSON")
	.action(async (identifier: string, options: { json?: boolean }) => {
		const spinner = options.json ? null : ora("Fetching mounts...").start();
		try {
			const computer = await resolveComputer(identifier);
			const mounts = await listFuseMounts(computer.id);
			spinner?.stop();
			if (options.json) {
				console.log(JSON.stringify({ mounts }, null, 2));
				return;
			}
			printMounts(mounts);
		} catch (error) {
			failWithSpinner(spinner, error, "Failed to fetch mounts");
		}
	});

mountCommand
	.command("attach")
	.description("Attach a FUSE mount to a computer")
	.argument("<id-or-handle>", "Computer id or handle")
	.requiredOption("--bucket <bucket>", "Bucket name or WebDAV remote path")
	.requiredOption("--access-key <key>", "Access key ID or WebDAV username")
	.requiredOption("--secret-key <key>", "Secret access key or WebDAV password")
	.option("--kind <kind>", "Mount kind: r2, s3, gcs, webdav", "r2")
	.option("--path <path>", "Mount target path inside the VM", "/home/node/mnt")
	.option("--endpoint <url>", "Storage endpoint URL; required for WebDAV")
	.option("--region <region>", "Storage region")
	.option("--read-only", "Mount as read-only")
	.option("--vfs-cache-mode <mode>", "rclone VFS cache mode", "writes")
	.option("--json", "Print raw JSON")
	.action(
		async (
			identifier: string,
			options: {
				bucket: string;
				accessKey: string;
				secretKey: string;
				kind?: string;
				path?: string;
				endpoint?: string;
				region?: string;
				readOnly?: boolean;
				vfsCacheMode?: string;
				json?: boolean;
			},
		) => {
			const spinner = options.json ? null : ora("Attaching mount...").start();
			try {
				const computer = await resolveComputer(identifier);
				const mount = await createFuseMount(computer.id, {
					kind: (options.kind ?? "r2") as "r2" | "s3" | "gcs" | "webdav",
					target_path: options.path ?? "/home/node/mnt",
					bucket: options.bucket,
					access_key_id: options.accessKey,
					secret_access_key: options.secretKey,
					endpoint: options.endpoint,
					region: options.region,
					read_only: options.readOnly,
					vfs_cache_mode: options.vfsCacheMode,
				});
				spinner?.stop();
				if (options.json) {
					console.log(JSON.stringify({ mount }, null, 2));
					return;
				}
				console.log();
				console.log(`  ${chalk.bold.white(mount.id)}  ${mount.kind}`);
				console.log(`  ${chalk.dim("Bucket")}    ${mount.bucket}`);
				console.log(`  ${chalk.dim("Path")}      ${mount.target_path}`);
				console.log(`  ${chalk.dim("State")}     ${formatMountState(mount.state)}`);
				console.log();
			} catch (error) {
				failWithSpinner(spinner, error, "Failed to attach mount");
			}
		},
	);

mountCommand
	.command("detach")
	.description("Detach a FUSE mount from a computer")
	.argument("<id-or-handle>", "Computer id or handle")
	.argument("<mount-id>", "Mount id")
	.action(async (identifier: string, mountId: string) => {
		const spinner = ora("Detaching mount...").start();
		try {
			const computer = await resolveComputer(identifier);
			await deleteFuseMount(computer.id, mountId);
			spinner.succeed(`Detached mount ${chalk.bold(mountId)}`);
		} catch (error) {
			failWithSpinner(spinner, error, "Failed to detach mount");
		}
	});

function printMounts(mounts: FuseMount[]): void {
	if (mounts.length === 0) {
		console.log();
		console.log(chalk.dim("  No mounts found."));
		console.log();
		return;
	}

	const idWidth = Math.max(8, ...mounts.map((m) => m.id.length));
	const kindWidth = Math.max(5, ...mounts.map((m) => m.kind.length));
	const pathWidth = Math.max(5, ...mounts.map((m) => m.target_path.length));

	console.log();
	console.log(
		`  ${chalk.dim(padEnd("ID", idWidth + 2))}${chalk.dim(padEnd("Kind", kindWidth + 2))}${chalk.dim(padEnd("Path", pathWidth + 2))}${chalk.dim(padEnd("Bucket", 24))}${chalk.dim("State")}`,
	);
	console.log(
		`  ${chalk.dim("-".repeat(idWidth + 2))}${chalk.dim("-".repeat(kindWidth + 2))}${chalk.dim("-".repeat(pathWidth + 2))}${chalk.dim("-".repeat(24))}${chalk.dim("-".repeat(10))}`,
	);
	for (const mount of mounts) {
		console.log(
			`  ${chalk.white(padEnd(mount.id, idWidth + 2))}${padEnd(mount.kind, kindWidth + 2)}${padEnd(mount.target_path, pathWidth + 2)}${padEnd(mount.bucket, 24)}${formatMountState(mount.state)}`,
		);
	}
	console.log();
}

function formatMountState(state: string): string {
	switch (state) {
		case "mounted":
			return chalk.green(state);
		case "mounting":
		case "pending":
			return chalk.yellow(state);
		case "failed":
		case "deleting":
			return chalk.red(state);
		default:
			return state;
	}
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
