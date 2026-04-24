import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

test("computer create help only documents supported flags", () => {
	const result = spawnSync(
		process.execPath,
		["apps/cli/dist/index.js", "create", "--help"],
		{
			cwd: repoRoot,
			encoding: "utf8",
		},
	);

	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /--name/);
	assert.match(result.stdout, /--interactive/);
	for (const flag of [
		"--runtime-family",
		"--source-kind",
		"--image-family",
		"--image-ref",
		"--use-platform-default",
		"--primary-port",
		"--primary-path",
		"--healthcheck-type",
		"--healthcheck-value",
		"--ssh-enabled",
		"--ssh-disabled",
		"--vnc-enabled",
		"--vnc-disabled",
	]) {
		assert.doesNotMatch(result.stdout, new RegExp(escapeRegExp(flag)));
	}
});

test("computer help exposes only the active command tree", () => {
	const result = spawnSync(
		process.execPath,
		["apps/cli/dist/index.js", "--help"],
		{
			cwd: repoRoot,
			encoding: "utf8",
		},
	);

	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /login/);
	assert.match(result.stdout, /claude-login/);
	assert.match(result.stdout, /codex-login/);
	assert.match(result.stdout, /create/);
	assert.match(result.stdout, /image/);
	assert.match(result.stdout, /ports/);
	for (const command of ["agent", "acp", "mount"]) {
		assert.doesNotMatch(result.stdout, new RegExp(`\\b${escapeRegExp(command)}\\b`));
	}
});

test("computer create shell completions omit removed runtime override flags", () => {
	for (const shell of ["bash", "zsh"]) {
		const result = spawnSync(
			process.execPath,
			["apps/cli/dist/index.js", "completion", shell],
			{
				cwd: repoRoot,
				encoding: "utf8",
			},
		);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /--interactive/);
		assert.doesNotMatch(result.stdout, /--runtime-family/);
		assert.doesNotMatch(result.stdout, /--use-platform-default/);
		assert.doesNotMatch(result.stdout, /--vnc-disabled/);
		assert.match(result.stdout, /login/);
		assert.match(result.stdout, /claude-login/);
		assert.match(result.stdout, /codex-login/);
		assert.match(result.stdout, /create/);
		assert.match(result.stdout, /image/);
		assert.match(result.stdout, /ports/);
	}
});

test("codex-login helper creation uses the current computer image payload", async () => {
	const tempHome = mkdtempSync(join(tmpdir(), "ac-cli-codex-home-"));
	const emptyPathDir = mkdtempSync(join(tmpdir(), "ac-cli-codex-path-"));

	try {
		await withMockControlPlane(async ({ baseURL, requests }) => {
			const result = await runCLICommand(["codex-login", "--keep-helper"], {
				COMPUTER_API_URL: baseURL,
				COMPUTER_API_KEY: "ak_test",
				HOME: tempHome,
				XDG_CONFIG_HOME: join(tempHome, ".config"),
				PATH: emptyPathDir,
			});

			assert.notEqual(result.status, 0);

			const createRequest = requests.find(
				(request) => request.method === "POST" && request.path === "/v1/computers",
			);
			assert.ok(createRequest, "expected helper creation request");

			const payload = JSON.parse(createRequest.body);
			assert.deepEqual(Object.keys(payload).sort(), ["display_name", "handle", "source"]);
			assert.equal(payload.display_name, "Codex Login Helper");
			assert.match(payload.handle, /^codex-login-[a-f0-9]{6}$/);
			assert.deepEqual(payload.source, {
				kind: "image",
				image_id: "",
			});

			assert.equal(
				requests.some(
					(request) =>
						request.method === "DELETE" && request.path.startsWith("/v1/computers/"),
				),
				false,
			);
		});
	} finally {
		rmSync(tempHome, { recursive: true, force: true });
		rmSync(emptyPathDir, { recursive: true, force: true });
	}
});

test("computer create uses the current computer image payload", async () => {
	const tempHome = mkdtempSync(join(tmpdir(), "ac-cli-create-home-"));

	try {
		await withMockControlPlane(async ({ baseURL, requests }) => {
			const result = await runCLICommand(["create", "demo-machine", "--name", "Demo Machine"], {
				COMPUTER_API_URL: baseURL,
				COMPUTER_API_KEY: "ak_test",
				HOME: tempHome,
				XDG_CONFIG_HOME: join(tempHome, ".config"),
			});

			assert.equal(result.status, 0, result.stderr);
			assert.match(result.stdout, /demo-machine/);
			assert.match(result.stdout, /provisioning/);
			const createRequest = requests.find(
				(request) => request.method === "POST" && request.path === "/v1/computers",
			);
			assert.ok(createRequest, "expected computer create request");

			const payload = JSON.parse(createRequest.body);
			assert.deepEqual(Object.keys(payload).sort(), ["display_name", "handle", "source"]);
			assert.equal(payload.handle, "demo-machine");
			assert.equal(payload.display_name, "Demo Machine");
			assert.deepEqual(payload.source, {
				kind: "image",
				image_id: "",
			});
		});
	} finally {
		rmSync(tempHome, { recursive: true, force: true });
	}
});

async function withMockControlPlane(run) {
	const requests = [];
	const computer = {
		id: "machine-1",
		handle: "demo-machine",
		display_name: "Demo Machine",
		image_id: "image-1",
		source_kind: "image",
		state: "provisioning",
		primary_url: "https://demo-machine.example.com",
		vnc_url: "https://vnc.example.com",
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		viewer_access: {
			role: "owner",
			allow_browser: true,
			allow_vnc: true,
			allow_ssh: true,
			can_manage: true,
			can_update: true,
			can_delete: true,
			can_manage_shares: true,
			can_manage_ports: true,
			can_issue_ssh_certificates: true,
		},
	};
	const helperComputer = {
		id: "helper-1",
		handle: "helper-1",
		display_name: "Codex Login Helper",
		image_id: "image-1",
		source_kind: "image",
		state: "running",
		primary_url: "https://helper.example.com",
		vnc_url: "https://helper-vnc.example.com",
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		viewer_access: {
			role: "owner",
			allow_browser: true,
			allow_vnc: true,
			allow_ssh: true,
			can_manage: true,
			can_update: true,
			can_delete: true,
			can_manage_shares: true,
			can_manage_ports: true,
			can_issue_ssh_certificates: true,
		},
	};

	const server = createServer(async (request, response) => {
		const path = request.url ?? "/";
		const body = await readRequestBody(request);
		requests.push({
			method: request.method ?? "GET",
			path,
			body,
		});

		switch (`${request.method} ${path}`) {
			case "GET /v1/computers":
				writeJSON(response, { computers: [] });
				return;
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
			case "POST /v1/computers":
				if (JSON.parse(body).display_name === "Codex Login Helper") {
					writeJSON(response, { computer: helperComputer }, 202);
					return;
				}
				writeJSON(response, { computer }, 202);
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
		await run({
			baseURL: `http://127.0.0.1:${address.port}`,
			requests,
		});
	} finally {
		server.close();
		await once(server, "close");
	}
}

async function readRequestBody(request) {
	const chunks = [];
	for await (const chunk of request) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString("utf8");
}

function writeJSON(response, payload, status = 200) {
	response.writeHead(status, { "Content-Type": "application/json" });
	response.end(JSON.stringify(payload));
}

function runCLICommand(args, env = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ["apps/cli/dist/index.js", ...args], {
			cwd: repoRoot,
			env: {
				...process.env,
				...env,
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

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
