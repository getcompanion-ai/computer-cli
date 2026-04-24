import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";

import { getComputerImage, listComputerImages, type ComputerImage } from "../lib/computers.js";
import { padEnd, timeAgo } from "../lib/format.js";

export const imageCommand = new Command("image").description("Inspect computer images");

imageCommand
	.command("ls")
	.description("List computer images")
	.option("--json", "Print raw JSON")
	.action(async (options: { json?: boolean }) => {
		const spinner = options.json ? null : ora("Fetching computer images...").start();
		try {
			const images = await listComputerImages();
			spinner?.stop();
			if (options.json) {
				console.log(JSON.stringify({ images }, null, 2));
				return;
			}
			printComputerImages(images);
		} catch (error) {
			if (spinner) {
				spinner.fail(error instanceof Error ? error.message : "Failed to fetch computer images");
			} else {
				console.error(error instanceof Error ? error.message : "Failed to fetch computer images");
			}
			process.exit(1);
		}
	});

imageCommand
	.command("get")
	.description("Show one computer image")
	.argument("<image-id>", "Computer image id")
	.option("--json", "Print raw JSON")
	.action(async (imageID: string, options: { json?: boolean }) => {
		const spinner = options.json ? null : ora("Fetching computer image...").start();
		try {
			const image = await getComputerImage(imageID);
			spinner?.stop();
			if (options.json) {
				console.log(JSON.stringify({ image }, null, 2));
				return;
			}
			printComputerImage(image);
		} catch (error) {
			if (spinner) {
				spinner.fail(error instanceof Error ? error.message : "Failed to fetch computer image");
			} else {
				console.error(error instanceof Error ? error.message : "Failed to fetch computer image");
			}
			process.exit(1);
		}
	});

function printComputerImages(images: ComputerImage[]): void {
	if (images.length === 0) {
		console.log();
		console.log(chalk.dim("  No computer images found."));
		console.log();
		return;
	}

	const idWidth = Math.max(10, ...images.map((image) => image.id.length));
	const statusWidth = Math.max(8, ...images.map((image) => image.status.length));

	console.log();
	console.log(
		`  ${chalk.dim(padEnd("ID", idWidth + 2))}${chalk.dim(padEnd("Status", statusWidth + 2))}${chalk.dim("Name")}`,
	);
	console.log(
		`  ${chalk.dim("-".repeat(idWidth + 2))}${chalk.dim("-".repeat(statusWidth + 2))}${chalk.dim("-".repeat(24))}`,
	);

	for (const image of images) {
		console.log(
			`  ${chalk.white(padEnd(image.id, idWidth + 2))}${padEnd(image.status, statusWidth + 2)}${image.display_name}`,
		);
		if (image.description) {
			console.log(`  ${chalk.dim(image.description)}`);
		}
	}
	console.log();
}

function printComputerImage(image: ComputerImage): void {
	console.log();
	console.log(`  ${chalk.bold.white(image.display_name)}  ${image.status}`);
	console.log();
	console.log(`  ${chalk.dim("ID")}        ${image.id}`);
	console.log(`  ${chalk.dim("Created")}   ${timeAgo(image.created_at)}`);
	if (image.description) {
		console.log(`  ${chalk.dim("About")}     ${image.description}`);
	}
	console.log();
}
