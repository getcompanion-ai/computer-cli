const DEFAULT_RELEASE_BASE_URL =
	"https://agentcomputer.ai/install/cli/latest";
const DEFAULT_INSTALLER_URL = "https://agentcomputer.ai/install.sh";

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

export function resolveReleaseBaseURL(override?: string): string {
	const candidate =
		override?.trim() ||
		process.env.COMPUTER_RELEASE_BASE_URL?.trim() ||
		DEFAULT_RELEASE_BASE_URL;
	return trimTrailingSlash(candidate);
}

export function resolveInstallerURL(override?: string): string {
	return override?.trim() || process.env.COMPUTER_INSTALL_URL?.trim() || DEFAULT_INSTALLER_URL;
}

export function resolveReleaseAssetURL(assetName: string, override?: string): string {
	return `${resolveReleaseBaseURL(override)}/${assetName}`;
}
