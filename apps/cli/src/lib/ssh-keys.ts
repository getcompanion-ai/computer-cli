import { basename } from "node:path";
import { homedir } from "node:os";
import { readFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import { ApiError, api } from "./api.js";

export interface UserSSHKey {
	id: string;
	user_id: string;
	name: string;
	public_key: string;
	fingerprint: string;
	created_at: string;
}

interface ListSSHKeysResponse {
	ssh_keys: UserSSHKey[];
}

interface SSHKeyEnvelope {
	ssh_key: UserSSHKey;
}

const DEFAULT_PUBLIC_KEY_PATHS = [
	`${homedir()}/.ssh/id_ed25519.pub`,
	`${homedir()}/.ssh/id_ecdsa.pub`,
	`${homedir()}/.ssh/id_rsa.pub`,
];

export async function listSSHKeys(): Promise<UserSSHKey[]> {
	const response = await api<ListSSHKeysResponse>("/v1/ssh-keys");
	return response.ssh_keys;
}

export async function ensureDefaultSSHKeyRegistered(): Promise<{
	key: UserSSHKey;
	publicKeyPath: string;
	privateKeyPath: string;
}> {
	for (const path of DEFAULT_PUBLIC_KEY_PATHS) {
		try {
			const publicKey = (await readFile(path, "utf8")).trim();
			if (!publicKey) {
				continue;
			}

			const key = await upsertSSHKey(basename(path), publicKey);
			return {
				key,
				publicKeyPath: path,
				privateKeyPath: path.replace(/\.pub$/, ""),
			};
		} catch (error) {
			if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
				continue;
			}
			throw error;
		}
	}

	const generated = await generateSSHKey();
	const publicKey = (await readFile(generated.publicKeyPath, "utf8")).trim();
	const key = await upsertSSHKey(basename(generated.publicKeyPath), publicKey);
	return {
		key,
		publicKeyPath: generated.publicKeyPath,
		privateKeyPath: generated.privateKeyPath,
	};
}

async function generateSSHKey(): Promise<{
	publicKeyPath: string;
	privateKeyPath: string;
}> {
	const sshDir = `${homedir()}/.ssh`;
	if (!existsSync(sshDir)) {
		await mkdir(sshDir, { mode: 0o700 });
	}

	const privateKeyPath = `${sshDir}/id_ed25519`;
	const publicKeyPath = `${privateKeyPath}.pub`;

	console.log("No SSH key found — generating one at", publicKeyPath);
	execFileSync("ssh-keygen", ["-t", "ed25519", "-f", privateKeyPath, "-N", ""], {
		stdio: "inherit",
	});

	return { publicKeyPath, privateKeyPath };
}

function normalizePublicKey(raw: string): string {
	const parts = raw.trim().split(/\s+/);
	// A public key line is: <type> <base64> [comment]
	// Compare only type + base64 to ignore comment differences.
	return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0] ?? "";
}

async function upsertSSHKey(name: string, publicKey: string): Promise<UserSSHKey> {
	try {
		const response = await api<SSHKeyEnvelope>("/v1/ssh-keys", {
			method: "POST",
			body: JSON.stringify({
				name,
				public_key: publicKey,
			}),
		});
		return response.ssh_key;
	} catch (error) {
		if (!(error instanceof ApiError) || error.status !== 409) {
			throw error;
		}
		const existing = await listSSHKeys();
		const normalized = normalizePublicKey(publicKey);
		const matched = existing.find((key) => normalizePublicKey(key.public_key) === normalized);
		if (matched) {
			return matched;
		}
		throw error;
	}
}
