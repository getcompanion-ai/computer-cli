import {
	adaptImportedComputer,
	type AccessSessionResponse,
	type ComputerConnection,
	type ComputerImageResponse,
	type ComputerResponse,
	type OperationResponse,
	type PublishedPortResponse,
	type ShareResponse,
	type SnapshotResponse,
} from "@microagentcomputer/public-api-client";

import { getPublicApiClient } from "./api.js";

export type RuntimeFamily = "managed-worker";
export type SourceKind = "image" | "snapshot";
export type HealthcheckType = "http";
export type FilesystemMode = "isolated";
export type ComputerDesiredPowerState = "on" | "off";
export type OperationStatus = OperationResponse["status"];
export type ComputerState =
	| "provisioning"
	| "starting"
	| "running"
	| "updating"
	| "stopping"
	| "stopped"
	| "failed"
	| "deleting"
	| "deleted";

export interface Operation extends OperationResponse {}

export interface ComputerImage extends ComputerImageResponse {}

export interface Computer {
	id: string;
	handle: string;
	display_name: string;
	state: ComputerState;
	status: ComputerState;
	image_id: string;
	source_kind: SourceKind;
	source_snapshot_id?: string | null;
	primary_url: string;
	vnc_url: string;
	failure_reason?: string | null;
	created_at: string;
	updated_at: string;
	deleted_at?: string | null;
	desired_power_state: ComputerDesiredPowerState;
	runtime_family: RuntimeFamily;
	build_status: "pending" | "ready" | "failed";
	image_family: string;
	resolved_image_ref: string;
	primary_web_host: string;
	primary_path: string;
	healthcheck_type: HealthcheckType;
	ssh_enabled: boolean;
	vnc_enabled: boolean;
	filesystem_mode: FilesystemMode;
	ssh_host: string;
	ssh_port: number;
	last_error?: string;
	size_preset?: string;
	requested_memory_mib?: number;
	requested_storage_bytes?: number;
	viewer_access: ComputerResponse["viewer_access"];
}

export interface PublishedPort {
	id: string;
	computer_id: string;
	port: number;
	name: string;
	visibility: "public" | "private";
	state: "pending" | "ready" | "failed" | "deleting";
	failure_reason?: string | null;
	public_url?: string | null;
	created_at: string;
	updated_at: string;
}

export interface ConnectionInfo {
	handle: string;
	web_url: string;
	vnc_url: string;
	browser_available: boolean;
	vnc_available: boolean;
	ssh_host?: string | null;
	ssh_port?: number | null;
	ssh_user?: string | null;
	ssh_available: boolean;
}

export interface BrowserAccess {
	access_url: string;
	expires_at: string;
}

export interface SSHCertificate {
	authorized_key: string;
	ssh_user: string;
	ssh_host: string;
	ssh_port: number;
	expires_at: string;
}

export interface CreateComputerInput {
	handle?: string;
	display_name?: string;
	size_preset?: string;
	requested_memory_mib?: number;
	requested_storage_bytes?: number;
}

export interface ComputerShare {
	id: string;
	kind: "link";
	allow_browser: boolean;
	allow_vnc: boolean;
	share_url?: string | null;
	expires_at?: string | null;
	created_at: string;
	last_used_at?: string | null;
	revoked_at?: string | null;
}

export interface Snapshot extends SnapshotResponse {}

type AdaptableComputer = Parameters<typeof adaptImportedComputer>[0];

export interface ComputerSizePreset {
	id: string;
	label: string;
	memory_mib: number;
	storage_bytes: number;
}

export async function listComputerSizePresets(): Promise<ComputerSizePreset[]> {
	const response = await getPublicApiClient().listComputerSizePresets();
	return response.presets;
}

export async function listComputerImages(): Promise<ComputerImage[]> {
	const response = await getPublicApiClient().listComputerImages();
	return response.images;
}

export async function getComputerImage(imageId: string): Promise<ComputerImage> {
	const response = await getPublicApiClient().getComputerImage(imageId);
	return response.image;
}

async function resolveDefaultImageID(): Promise<string> {
	const images = await listComputerImages();
	const active = images.find((image) => image.status === "active");
	if (active) {
		return active.id;
	}
	if (images[0]) {
		return images[0].id;
	}
	throw new Error("no computer images are available");
}

export async function listComputers(signal?: AbortSignal): Promise<Computer[]> {
	const response = await getPublicApiClient().listComputers(signal);
	return response.computers.map((computer) => toComputer(computer));
}

export async function getComputerByID(id: string): Promise<Computer> {
	const response = await getPublicApiClient().getComputer(id);
	return toComputer(response.computer);
}

export async function createComputer(input: CreateComputerInput): Promise<Computer> {
	const client = getPublicApiClient();
	const response = await client.createComputer({
		handle: input.handle,
		display_name: input.display_name,
		size_preset: input.size_preset,
		requested_memory_mib: input.requested_memory_mib,
		requested_storage_bytes: input.requested_storage_bytes,
		source: {
			kind: "image",
			image_id: "",
		},
	});
	return toComputer(response.computer);
}

export async function deleteComputer(
	computerID: string,
	options: { wait?: boolean } = {},
): Promise<Computer> {
	const client = getPublicApiClient();
	const response = await client.deleteComputer(computerID);
	if (options.wait !== false) {
		await waitForOperationIfPresent(response.operation);
	}
	return toComputer(response.computer);
}

export async function powerOnComputer(computerID: string): Promise<Computer> {
	const client = getPublicApiClient();
	const response = await client.startComputer(computerID);
	await waitForOperationIfPresent(response.operation);
	const refreshed = await client.getComputer(computerID);
	return toComputer(refreshed.computer);
}

export async function powerOffComputer(computerID: string): Promise<Computer> {
	const client = getPublicApiClient();
	const response = await client.stopComputer(computerID);
	await waitForOperationIfPresent(response.operation);
	const refreshed = await client.getComputer(computerID);
	return toComputer(refreshed.computer);
}

export async function getConnectionInfo(
	computerID: string,
	signal?: AbortSignal,
): Promise<{ connection: ConnectionInfo; ports: PublishedPort[] }> {
	const response = await getPublicApiClient().getComputerConnection(computerID, signal);
	return {
		connection: toConnectionInfo(response.connection),
		ports: response.ports.map((port) =>
			toPublishedPort(port, response.connection.web_url),
		),
	};
}

export async function createBrowserAccess(computerID: string): Promise<BrowserAccess> {
	const response = await getPublicApiClient().createAccessSession(computerID, {
		kind: "browser",
	});
	return toBrowserAccess(response.session);
}

export async function createVNCAccess(computerID: string): Promise<BrowserAccess> {
	const response = await getPublicApiClient().createAccessSession(computerID, {
		kind: "vnc",
	});
	return toBrowserAccess(response.session);
}

export async function createSSHCertificate(
	computerID: string,
	sshKeyID: string,
): Promise<SSHCertificate> {
	return getPublicApiClient().createSSHCertificate(computerID, {
		ssh_key_id: sshKeyID,
	});
}

export type SSHAccessSession = {
	id: string;
	ssh_user: string;
	ssh_host: string;
	ssh_port: number;
	command: string;
	expires_at: string;
};

export async function createSSHAccessSession(computerID: string): Promise<SSHAccessSession> {
	const response = await getPublicApiClient().createAccessSession(computerID, {
		kind: "ssh",
	});
	const session = response.session as unknown as SSHAccessSession;
	return session;
}

export async function listPublishedPorts(computerID: string): Promise<PublishedPort[]> {
	const response = await getPublicApiClient().listPublishedPorts(computerID);
	const connection = await getConnectionInfo(computerID).catch(() => null);
	return response.ports.map((port) =>
		toPublishedPort(port, connection?.connection.web_url),
	);
}

export async function publishPort(
	computerID: string,
	input: { port: number; name?: string; visibility?: "public" | "private" },
): Promise<PublishedPort> {
	const client = getPublicApiClient();
	const response = await client.createPublishedPort(computerID, input);
	await waitForOperationIfPresent(response.operation);
	const ports = await listPublishedPorts(computerID);
	return ports.find((port) => port.port === input.port) ?? toPublishedPort(response.port);
}

export async function deletePublishedPort(
	computerID: string,
	targetPort: number,
): Promise<PublishedPort> {
	const client = getPublicApiClient();
	const response = await client.deletePublishedPort(computerID, targetPort);
	await waitForOperationIfPresent(response.operation);
	return toPublishedPort(response.port);
}

export async function listShares(computerID: string): Promise<ComputerShare[]> {
	const response = await getPublicApiClient().listShares(computerID);
	return response.shares.map(toComputerShare);
}

export async function createLinkShare(
	computerID: string,
	input: {
		expires_at?: string;
		allow_browser?: boolean;
		allow_vnc?: boolean;
	},
): Promise<ComputerShare> {
	const response = await getPublicApiClient().createLinkShare(computerID, input);
	return toComputerShare(response.share);
}

export async function deleteShare(computerID: string, shareID: string): Promise<void> {
	const client = getPublicApiClient();
	await client.deleteLinkShare(computerID, shareID);
}

export async function transferComputer(
	computerID: string,
	targetOrgID: string,
): Promise<Computer> {
	const response = await getPublicApiClient().transferComputer(computerID, {
		target_org_id: targetOrgID,
	});
	await waitForOperationIfPresent(response.operation);
	return toComputer(response.computer);
}

export async function listSnapshots(computerID: string): Promise<Snapshot[]> {
	const response = await getPublicApiClient().listSnapshots(computerID);
	return response.snapshots;
}

export async function createSnapshot(computerID: string): Promise<Snapshot> {
	const client = getPublicApiClient();
	const response = await client.createSnapshot(computerID);
	await waitForOperationIfPresent(response.operation);
	return (await client.getSnapshot(response.snapshot.id)).snapshot;
}

export async function deleteSnapshot(snapshotID: string): Promise<Snapshot> {
	const client = getPublicApiClient();
	const response = await client.deleteSnapshot(snapshotID);
	await waitForOperationIfPresent(response.operation);
	return response.snapshot;
}

export async function restoreSnapshot(
	snapshotID: string,
	input: {
		handle?: string;
		display_name?: string;
		authorized_keys?: string[];
	},
): Promise<Computer> {
	const client = getPublicApiClient();
	const response = await client.restoreSnapshot(snapshotID, {
		handle: input.handle,
		display_name: input.display_name,
		guest:
			input.authorized_keys && input.authorized_keys.length > 0
				? { authorized_keys: input.authorized_keys }
				: undefined,
	});
	await waitForOperationIfPresent(response.operation);
	return toComputer(response.computer);
}

export async function resolveComputer(identifier: string): Promise<Computer> {
	try {
		return await getComputerByID(identifier);
	} catch {
		// Fall through to handle lookup.
	}

	const computers = await listComputers();
	const exact = computers.find(
		(computer) => computer.handle === identifier || computer.id === identifier,
	);
	if (exact) {
		return exact;
	}

	throw new Error(`computer '${identifier}' not found`);
}

export function webURL(computer: Computer): string {
	return computer.primary_url;
}

export function vncURL(computer: Computer): string | null {
	return computer.vnc_url || null;
}

async function waitForOperationIfPresent(operation?: OperationResponse): Promise<void> {
	if (!operation?.id) {
		return;
	}
	await getPublicApiClient().waitForOperation(operation.id);
}

function toComputer(
	computer: ComputerResponse,
	connection?: ComputerConnection | null,
): Computer {
	const base = adaptImportedComputer(computer as AdaptableComputer);
	return {
		id: base.id,
		handle: base.handle,
		display_name: base.display_name,
		state: normalizeComputerState(base.state),
		status: normalizeComputerState(base.status),
		image_id: base.image_id,
		source_kind: normalizeSourceKind(base.source_kind),
		source_snapshot_id: base.source_snapshot_id ?? null,
		primary_url: base.primary_url,
		vnc_url: connection?.vnc_url ?? "",
		failure_reason: computer.failure_reason ?? null,
		created_at: base.created_at,
		updated_at: base.updated_at,
		deleted_at: base.deleted_at ?? null,
		desired_power_state: base.desired_power_state,
		runtime_family: base.runtime_family,
		build_status: base.build_status,
		image_family: base.image_family,
		resolved_image_ref: base.resolved_image_ref,
		primary_web_host: base.primary_web_host,
		primary_path: base.primary_path,
		healthcheck_type: base.healthcheck_type,
		ssh_enabled: connection?.ssh_available ?? base.ssh_enabled,
		vnc_enabled: connection?.vnc_available ?? base.vnc_enabled,
		filesystem_mode: base.filesystem_mode,
		ssh_host: connection?.ssh_host ?? "",
		ssh_port: connection?.ssh_port ?? 0,
		last_error: computer.failure_reason ?? undefined,
		size_preset: (computer as any).size_preset ?? undefined,
		requested_memory_mib: (computer as any).requested_memory_mib ?? undefined,
		requested_storage_bytes: (computer as any).requested_storage_bytes ?? undefined,
		viewer_access: base.viewer_access,
	};
}

function toConnectionInfo(connection: ComputerConnection): ConnectionInfo {
	return {
		handle: connection.handle,
		web_url: connection.web_url,
		vnc_url: connection.vnc_url,
		browser_available: connection.browser_available,
		vnc_available: connection.vnc_available,
		ssh_host: connection.ssh_host ?? null,
		ssh_port: connection.ssh_port ?? null,
		ssh_user: connection.ssh_user ?? null,
		ssh_available: connection.ssh_available,
	};
}

function toPublishedPort(
	port: PublishedPortResponse,
	_webURL?: string,
): PublishedPort {
	return {
		id: port.id,
		computer_id: port.computer_id,
		port: port.port,
		name: port.name,
		visibility: port.visibility ?? "public",
		state: port.state,
		failure_reason: port.failure_reason ?? null,
		public_url: port.public_url ?? null,
		created_at: port.created_at,
		updated_at: port.updated_at,
	};
}

function toBrowserAccess(session: AccessSessionResponse): BrowserAccess {
	return {
		access_url: session.access_url,
		expires_at: session.expires_at,
	};
}

function toComputerShare(share: ShareResponse): ComputerShare {
	return {
		id: share.id,
		kind: "link",
		allow_browser: share.allow_browser,
		allow_vnc: share.allow_vnc,
		share_url: share.share_url ?? null,
		expires_at: share.expires_at ?? null,
		created_at: share.created_at,
		last_used_at: share.last_used_at ?? null,
		revoked_at: share.revoked_at ?? null,
	};
}

function normalizeSourceKind(kind: string): SourceKind {
	return kind === "snapshot" ? "snapshot" : "image";
}

function normalizeComputerState(state: string): ComputerState {
	return state === "pending" ? "provisioning" : (state as ComputerState);
}
