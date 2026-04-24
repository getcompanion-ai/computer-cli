import test from "node:test";
import assert from "node:assert/strict";

import {
	resolveInstallerURL,
	resolveReleaseAssetURL,
	resolveReleaseBaseURL,
} from "../dist/lib/upgrade-version.js";

test("release base url defaults to the website install asset endpoint", () => {
	assert.equal(
		resolveReleaseBaseURL(),
		"https://agentcomputer.ai/install/cli/latest",
	);
});

test("installer url defaults to the website install route", () => {
	assert.equal(
		resolveInstallerURL(),
		"https://agentcomputer.ai/install.sh",
	);
});

test("release asset urls append to the release base url", () => {
	assert.equal(
		resolveReleaseAssetURL("computer-linux-x64", "https://example.com/install/cli/latest/"),
		"https://example.com/install/cli/latest/computer-linux-x64",
	);
});
