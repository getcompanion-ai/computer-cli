import chalk from "chalk";

export function padEnd(str: string, len: number): string {
	const visible = str.replace(/\u001b\[[0-9;]*m/g, "");
	return str + " ".repeat(Math.max(0, len - visible.length));
}

export function timeAgo(dateStr: string): string {
	const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export function minuteSecondAgo(dateStr: string): string {
	const timestamp = new Date(dateStr).getTime();
	if (!Number.isFinite(timestamp)) {
		return "unknown";
	}

	const totalSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
	const totalMinutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${totalMinutes}:${String(seconds).padStart(2, "0")} ago`;
}

export function formatStatus(status: string): string {
	switch (status) {
		case "running":
			return chalk.green(status);
		case "pending":
		case "provisioning":
		case "starting":
			return chalk.yellow(status);
		case "stopping":
		case "stopped":
		case "deleted":
			return chalk.gray(status);
		case "failed":
		case "error":
			return chalk.red(status);
		default:
			return status;
	}
}
