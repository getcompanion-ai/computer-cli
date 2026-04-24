import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".computer");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface Config {
	auth?: {
		apiKey: string;
	};
}

export function ensureConfigDir(): void {
	if (!existsSync(CONFIG_DIR)) {
		mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
	}
}

export function readConfig(): Config {
	ensureConfigDir();
	if (!existsSync(CONFIG_FILE)) {
		return {};
	}

	try {
		return JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as Config;
	} catch {
		return {};
	}
}

export function writeConfig(config: Config): void {
	ensureConfigDir();
	const tempFile = `${CONFIG_FILE}.${process.pid}.tmp`;
	writeFileSync(tempFile, JSON.stringify(config, null, 2), { mode: 0o600 });
	renameSync(tempFile, CONFIG_FILE);
}

export function getAPIKey(): string | null {
	const envValue = process.env.COMPUTER_API_KEY ?? process.env.AGENTCOMPUTER_API_KEY;
	if (envValue) {
		return envValue.trim();
	}

	return getStoredAPIKey();
}

export function getStoredAPIKey(): string | null {
	return readConfig().auth?.apiKey?.trim() || null;
}

export function hasEnvAPIKey(): boolean {
	return Boolean(process.env.COMPUTER_API_KEY ?? process.env.AGENTCOMPUTER_API_KEY);
}

export function setAPIKey(apiKey: string): void {
	const config = readConfig();
	config.auth = { apiKey: apiKey.trim() };
	writeConfig(config);
}

export function clearAPIKey(): void {
	const config = readConfig();
	delete config.auth;
	writeConfig(config);
}
