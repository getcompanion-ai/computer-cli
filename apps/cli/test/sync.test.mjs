import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import {
	chmod,
	mkdtemp,
	mkdir,
	rm,
	writeFile,
	readFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

test("computer sync uploads a relative file path into /home/node", async () => {
	await withMockControlPlane(async (baseURL, requests) => {
		const sourceDir = await mkdtemp(join(repoRoot, ".sync-file-"));
		const toolDir = await mkdtemp(join(tmpdir(), "computer-sync-tool-"));
		const homeDir = await mkdtemp(join(tmpdir(), "computer-sync-home-"));
		const capturePath = join(toolDir, "scp-args.txt");
		const fakeScpPath = join(toolDir, "fake-scp.sh");
		const relativeSource = join(sourceDir.replace(`${repoRoot}/`, ""), "notes.txt");

		try {
			await writeFile(join(sourceDir, "notes.txt"), "hello sync\n", "utf8");
			await writeFile(
				fakeScpPath,
				"#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$COMPUTER_SYNC_CAPTURE\"\nprintf 'copying\\n' >&2\n",
				"utf8",
			);
			await chmod(fakeScpPath, 0o755);

			const result = await runCLICommand(
				["sync", relativeSource, "--computer", "my-box"],
				baseURL,
				{
					COMPUTER_SCP_BINARY: fakeScpPath,
					COMPUTER_SYNC_CAPTURE: capturePath,
					AGENTCOMPUTER_CONFIG_DIR: homeDir,
				},
			);

			assert.equal(result.status, 0, result.stderr);
			assert.match(result.stdout, /Transferred .*notes\.txt.*my-box.*:\/home\/node\/notes\.txt/);

			const capturedArgs = (await readFile(capturePath, "utf8"))
				.trim()
				.split("\n");
			// New edge-based SCP args: -O (legacy proto), -F <per-computer config>,
			// then `-- <source> <user>@<host>:<remotePath>`. We assert on the
			// stable bits (flags + source + destination), not the absolute
			// config path (which lives in the temp home dir).
			assert.equal(capturedArgs[0], "-O");
			assert.equal(capturedArgs[1], "-F");
			assert.ok(
				capturedArgs[2].startsWith(homeDir),
				`expected config path under ${homeDir}, got ${capturedArgs[2]}`,
			);
			assert.equal(capturedArgs[3], "--");
			assert.equal(capturedArgs[4], join(sourceDir, "notes.txt"));
			assert.equal(capturedArgs[5], "sync-token@machine-1:/home/node/");

			assert.deepEqual(
				requests.map((request) => `${request.method} ${request.path}`),
				[
					"GET /v1/computers/my-box",
					"GET /v1/computers",
					"POST /v1/computers/machine-1/ssh-credentials",
				],
			);
		} finally {
			await rm(sourceDir, { recursive: true, force: true });
			await rm(toolDir, { recursive: true, force: true });
			await rm(homeDir, { recursive: true, force: true });
		}
	});
});

test("computer sync uploads directories recursively", async () => {
	await withMockControlPlane(async (baseURL) => {
		const sourceDir = await mkdtemp(join(repoRoot, ".sync-dir-"));
		const projectDir = join(sourceDir, "project");
		const toolDir = await mkdtemp(join(tmpdir(), "computer-sync-tool-"));
		const homeDir = await mkdtemp(join(tmpdir(), "computer-sync-home-"));
		const capturePath = join(toolDir, "scp-args.txt");
		const fakeScpPath = join(toolDir, "fake-scp.sh");
		const relativeSource = join(sourceDir.replace(`${repoRoot}/`, ""), "project");

		try {
			await mkdir(projectDir, { recursive: true });
			await writeFile(join(projectDir, "README.md"), "nested\n", "utf8");
			await writeFile(
				fakeScpPath,
				"#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$COMPUTER_SYNC_CAPTURE\"\n",
				"utf8",
			);
			await chmod(fakeScpPath, 0o755);

			const result = await runCLICommand(
				["sync", relativeSource, "--computer", "my-box"],
				baseURL,
				{
					COMPUTER_SCP_BINARY: fakeScpPath,
					COMPUTER_SYNC_CAPTURE: capturePath,
					AGENTCOMPUTER_CONFIG_DIR: homeDir,
				},
			);

			assert.equal(result.status, 0, result.stderr);

			const capturedArgs = (await readFile(capturePath, "utf8"))
				.trim()
				.split("\n");
			assert.equal(capturedArgs.includes("-r"), true);
			assert.equal(capturedArgs.at(-2), projectDir);
			assert.equal(capturedArgs.at(-1), "sync-token@machine-1:/home/node/");
		} finally {
			await rm(sourceDir, { recursive: true, force: true });
			await rm(toolDir, { recursive: true, force: true });
			await rm(homeDir, { recursive: true, force: true });
		}
	});
});

async function withMockControlPlane(run) {
	const requests = [];
	const server = createServer(async (request, response) => {
		const path = request.url ?? "/";
		requests.push({ method: request.method ?? "GET", path });

		if (request.method === "GET" && path === "/v1/computers") {
			return respondJSON(response, {
				computers: [createMachine("machine-1", "my-box")],
			});
		}

		if (request.method === "GET" && path === "/v1/computers/my-box") {
			response.writeHead(404, { "Content-Type": "application/json" });
			response.end(
				JSON.stringify({ error: { code: "not_found", message: "not found" } }),
			);
			return;
		}

		if (
			request.method === "POST" &&
			path === "/v1/computers/machine-1/ssh-credentials"
		) {
			return respondJSON(response, makeCredentials(), 201);
		}

		response.writeHead(404, { "Content-Type": "application/json" });
		response.end(
			JSON.stringify({ error: { code: "not_found", message: "not found" } }),
		);
	});

	server.listen(0, "127.0.0.1");
	await once(server, "listening");

	try {
		const address = server.address();
		if (!address || typeof address === "string") {
			throw new Error("mock control-plane did not provide a TCP address");
		}
		const baseURL = `http://127.0.0.1:${address.port}`;
		await run(baseURL, requests);
	} finally {
		server.close();
		await once(server, "close");
	}
}

function createMachine(id, handle) {
	const now = new Date().toISOString();
	return {
		id,
		handle,
		display_name: handle,
		image_id: "image-1",
		source_kind: "image",
		state: "running",
		primary_url: `https://${handle}.example.com`,
		vnc_url: `https://vnc.example.com/${handle}`,
		created_at: now,
		updated_at: now,
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
}

// makeCredentials mirrors apps/api/internal/httpapi/connectivity.go
// sshCredentialsResponse. The private key / cert don't need to be real
// because the fake scp script never actually reads them.
function makeCredentials() {
	const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
	return {
		computer_id: "machine-1",
		computer_handle: "my-box",
		ssh_user: "sync-token",
		edge_host: "ssh.example.test",
		edge_port: 443,
		sni: "machine-1.ssh.example.test",
		client_private_key:
			"-----BEGIN OPENSSH PRIVATE KEY-----\nfake\n-----END OPENSSH PRIVATE KEY-----\n",
		client_public_key: "ssh-ed25519 AAAAfake test@example\n",
		client_certificate:
			"ssh-ed25519-cert-v01@openssh.com AAAAfakecert test@example\n",
		guest_host_public_key: "ssh-ed25519 AAAAguesthost\n",
		expires_at: expiresAt,
	};
}

function respondJSON(response, payload, status = 200) {
	response.writeHead(status, { "Content-Type": "application/json" });
	response.end(JSON.stringify(payload));
}

function runCLICommand(args, baseURL, extraEnv = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ["apps/cli/dist/index.js", ...args], {
			cwd: repoRoot,
			env: {
				...process.env,
				COMPUTER_API_URL: baseURL,
				COMPUTER_API_KEY: "ak_test",
				...extraEnv,
			},
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
		child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
		child.on("error", reject);
		child.on("exit", (code, signal) => {
			resolve({ status: code, signal, stdout, stderr });
		});
	});
}
