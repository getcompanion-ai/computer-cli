import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

test("computer ls --json lists visible computers from the current API", async () => {
	await withMockControlPlane(
		{
			"/v1/computers": {
				computers: [
					createMachine("owned-1"),
					createMachine("shared-1"),
				],
			},
		},
		async (baseURL) => {
			const result = await runCLICommand(["ls", "--json"], baseURL);
			assert.equal(result.status, 0, result.stderr);

			const payload = JSON.parse(result.stdout);
			assert.deepEqual(
				payload.computers.map((computer) => computer.id),
				["owned-1", "shared-1"],
			);
		},
	);
});

test("computer ls --json does not require shared-computer fallback routes", async () => {
	await withMockControlPlane(
		{
			"/v1/computers": {
				computers: [createMachine("owned-1")],
			},
		},
		async (baseURL, requests) => {
			const result = await runCLICommand(["ls", "--json"], baseURL);
			assert.equal(result.status, 0, result.stderr);

			const payload = JSON.parse(result.stdout);
			assert.deepEqual(
				payload.computers.map((computer) => computer.id),
				["owned-1"],
			);
			assert.equal(
				requests.every((request) => request.path === "/v1/computers"),
				true,
			);
		},
	);
});

async function withMockControlPlane(payloadByPath, run) {
	const requests = [];
	const server = createServer((request, response) => {
		const path = request.url ?? "/";
		requests.push({
			method: request.method ?? "GET",
			path,
		});

		if (!(path in payloadByPath)) {
			response.writeHead(404, { "Content-Type": "application/json" });
			response.end(JSON.stringify({ error: { code: "not_found", message: "not found" } }));
			return;
		}

		response.writeHead(200, { "Content-Type": "application/json" });
		response.end(JSON.stringify(payloadByPath[path]));
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

function createMachine(handle) {
	const now = new Date().toISOString();
	return {
		id: handle,
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
			role: handle.startsWith("shared-") ? "shared" : "owner",
			allow_browser: true,
			allow_vnc: true,
			allow_ssh: true,
			can_manage: !handle.startsWith("shared-"),
			can_update: !handle.startsWith("shared-"),
			can_delete: !handle.startsWith("shared-"),
			can_manage_shares: !handle.startsWith("shared-"),
			can_manage_ports: !handle.startsWith("shared-"),
			can_issue_ssh_certificates: !handle.startsWith("shared-"),
		},
	};
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
