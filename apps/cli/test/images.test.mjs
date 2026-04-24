import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

test("computer image help documents current computer image wording", () => {
	const result = spawnSync(
		process.execPath,
		["apps/cli/dist/index.js", "image", "--help"],
		{
			cwd: repoRoot,
			encoding: "utf8",
		},
	);

	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Inspect computer images/);
	assert.match(result.stdout, /List computer images/);
	assert.match(result.stdout, /Show one computer image/);
});

test("computer image shell completions reflect the active image commands", () => {
	const result = spawnSync(
		process.execPath,
		["apps/cli/dist/index.js", "completion", "zsh"],
		{
			cwd: repoRoot,
			encoding: "utf8",
		},
	);

	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /List computer images/);
	assert.match(result.stdout, /Show one computer image/);
	assert.doesNotMatch(result.stdout, /\bagent\b/);
	assert.doesNotMatch(result.stdout, /\bmount\b/);
	assert.match(result.stdout, /claude-login/);
	assert.match(result.stdout, /codex-login/);
});

test("computer image ls lists the active computer images", async () => {
	await withMockControlPlane(async (baseURL) => {
		const result = await runCLICommand(["image", "ls"], baseURL);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /Platform Image/);
		assert.match(result.stdout, /active/);
	});
});

test("computer image get prints one computer image", async () => {
	await withMockControlPlane(async (baseURL) => {
		const result = await runCLICommand(["image", "get", "image-1"], baseURL);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /Platform Image/);
		assert.match(result.stdout, /image-1/);
	});
});

async function withMockControlPlane(run) {
	const server = createServer(async (request, response) => {
		const path = request.url ?? "/";
		switch (`${request.method} ${path}`) {
			case "GET /v1/computer-images":
				writeJSON(response, {
					images: [
						{
							id: "image-1",
							display_name: "Platform Image",
							description: "Default computer image",
							status: "active",
							created_at: new Date().toISOString(),
						},
					],
				});
				return;
			case "GET /v1/computer-images/image-1":
				writeJSON(response, {
					image: {
						id: "image-1",
						display_name: "Platform Image",
						description: "Default computer image",
						status: "active",
						created_at: new Date().toISOString(),
					},
				});
				return;
			default:
				response.writeHead(404, { "Content-Type": "application/json" });
				response.end(JSON.stringify({ error: { code: "not_found", message: "not found" } }));
		}
	});

	server.listen(0, "127.0.0.1");
	await once(server, "listening");

	try {
		const address = server.address();
		if (!address || typeof address === "string") {
			throw new Error("mock control-plane did not provide a TCP address");
		}
		await run(`http://127.0.0.1:${address.port}`);
	} finally {
		server.close();
		await once(server, "close");
	}
}

function runCLICommand(args, baseURL) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ["apps/cli/dist/index.js", ...args], {
			cwd: repoRoot,
			env: {
				...process.env,
				COMPUTER_API_URL: baseURL,
				COMPUTER_API_KEY: "ak_test",
			},
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("exit", (code, signal) => {
			resolve({
				status: code,
				signal,
				stdout,
				stderr,
			});
		});
	});
}

function writeJSON(response, payload, status = 200) {
	response.writeHead(status, { "Content-Type": "application/json" });
	response.end(JSON.stringify(payload));
}
