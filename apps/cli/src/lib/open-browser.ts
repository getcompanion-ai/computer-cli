import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";

const IMAGE_BROWSER_LAUNCHER = "/usr/local/bin/browser-launcher";
const IMAGE_BROWSER_CANDIDATES = [
	"/usr/local/bin/google-chrome",
	"/usr/local/bin/chromium",
	IMAGE_BROWSER_LAUNCHER,
];

async function isExecutable(path: string): Promise<boolean> {
	try {
		await access(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function hasBrokenChromeBrowserEnv(): boolean {
	const configuredBrowser = process.env.BROWSER?.trim().toLowerCase();
	switch (configuredBrowser) {
		case "chrome":
		case "google-chrome":
		case "google chrome":
		case "browser":
		case "browser-launcher":
			return true;
		default:
			return false;
	}
}

function tryOpenSync(cmd: string, url: string): boolean {
	try {
		execFileSync(cmd, [url], { stdio: "ignore", timeout: 5000 });
		return true;
	} catch {
		return false;
	}
}

export async function openBrowserURL(url: string): Promise<void> {
	if (process.platform === "darwin") {
		if (tryOpenSync("open", url)) return;
		throw new Error("failed to open browser");
	}

	// Some sandbox sessions persist BROWSER=Chrome, which is not a valid binary.
	if (hasBrokenChromeBrowserEnv()) {
		delete process.env.BROWSER;
	}

	for (const browserPath of IMAGE_BROWSER_CANDIDATES) {
		if (!(await isExecutable(browserPath))) continue;
		if (tryOpenSync(browserPath, url)) return;
	}

	if (await isExecutable("/usr/bin/xdg-open")) {
		if (tryOpenSync("xdg-open", url)) return;
	}

	throw new Error("no browser found");
}
