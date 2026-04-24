import type { components } from "./generated/schema.js";

export type PublicApiSchemas = components["schemas"];

export type MeResponse = PublicApiSchemas["MeResponse"];
export type UsageEnvelope = PublicApiSchemas["UsageEnvelope"];
export type AutoReloadResponse = PublicApiSchemas["AutoReloadResponse"];
export type BillingPreferencesResponse = PublicApiSchemas["BillingPreferencesResponse"];
export type ComputerSizePresetResponse = PublicApiSchemas["ComputerSizePresetResponse"];
export type ListComputerSizePresetsResponse = PublicApiSchemas["ListComputerSizePresetsResponse"];
export type ComputerCapacityCheckRequest = PublicApiSchemas["ComputerCapacityCheckRequest"];
export type ComputerCapacityCheckResponse = PublicApiSchemas["ComputerCapacityCheckResponse"];
export type ComputerImageResponse = PublicApiSchemas["ComputerImageResponse"];
export type ListComputerImagesResponse = PublicApiSchemas["ListComputerImagesResponse"];
export type ComputerResponse = PublicApiSchemas["ComputerResponse"];
export type ComputerMutationResponse = PublicApiSchemas["ComputerMutationResponse"];
export type ComputerConnection = PublicApiSchemas["ComputerConnection"];
export type ComputerConnectionResponse = PublicApiSchemas["ComputerConnectionResponse"];
export type OperationResponse = PublicApiSchemas["OperationResponse"];
export type AccessSessionResponse = PublicApiSchemas["AccessSessionResponse"];
export type AccessSessionEnvelope = PublicApiSchemas["AccessSessionEnvelope"];
export type SSHKeyResponse = PublicApiSchemas["SSHKeyResponse"];
export type SSHKeyEnvelope = PublicApiSchemas["SSHKeyEnvelope"];
export type ListSSHKeysResponse = PublicApiSchemas["ListSSHKeysResponse"];
export type SSHCertificateResponse = PublicApiSchemas["SSHCertificateResponse"];
export type ShareResponse = PublicApiSchemas["ShareResponse"];
export type ShareEnvelope = PublicApiSchemas["ShareEnvelope"];
export type ListSharesResponse = PublicApiSchemas["ListSharesResponse"];
export type ResolveShareResponse = PublicApiSchemas["ResolveShareResponse"];
export type SnapshotResponse = PublicApiSchemas["SnapshotResponse"];
export type SnapshotEnvelope = PublicApiSchemas["SnapshotEnvelope"];
export type ListSnapshotsResponse = PublicApiSchemas["ListSnapshotsResponse"];
export type SnapshotMutationResponse = PublicApiSchemas["SnapshotMutationResponse"];
export type PublishedPortResponse = PublicApiSchemas["PublishedPortResponse"];
export type ListPublishedPortsResponse = PublicApiSchemas["ListPublishedPortsResponse"];
export type PublishedPortMutationResponse = PublicApiSchemas["PublishedPortMutationResponse"];
export type ExecCommandRequest = PublicApiSchemas["ExecCommandRequest"];
export type ExecCommandResponse = PublicApiSchemas["ExecCommandResponse"];
export type CreateComputerRequest = PublicApiSchemas["CreateComputerRequest"];
export type UpdateBillingPreferencesRequest = PublicApiSchemas["UpdateBillingPreferencesRequest"];
export type UpdateComputerRequest = PublicApiSchemas["UpdateComputerRequest"];
export type ResizeComputerRequest = PublicApiSchemas["ResizeComputerRequest"];
export type CreateAccessSessionRequest = PublicApiSchemas["CreateAccessSessionRequest"];
export type CreateSSHKeyRequest = PublicApiSchemas["CreateSSHKeyRequest"];
export type CreateSSHCertificateRequest = PublicApiSchemas["CreateSSHCertificateRequest"];
export type CreateLinkShareRequest = PublicApiSchemas["CreateLinkShareRequest"];
export type TransferComputerRequest = PublicApiSchemas["TransferComputerRequest"];
export type RestoreSnapshotRequest = PublicApiSchemas["RestoreSnapshotRequest"];
export type CreatePublishedPortRequest = PublicApiSchemas["CreatePublishedPortRequest"];

export type ComputerFileEntry = {
  path: string;
  name: string;
  type: "file" | "directory";
  size_bytes?: number;
  mode?: number;
};

export type ComputerFileStat = {
  path: string;
  type: "file" | "directory";
  size_bytes?: number;
  mode?: number;
};

export type ComputerFileGrepMatch = {
  path: string;
  line: number;
  match: string;
};

export type ComputerFileOperationRequest = {
  operation:
    | "read_text"
    | "read_bytes"
    | "write_text"
    | "write_bytes"
    | "remove"
    | "list"
    | "stat"
    | "exists"
    | "patch"
    | "read_range"
    | "write_range"
    | "mkdir"
    | "move"
    | "grep";
  path?: string;
  to?: string;
  content?: string;
  content_base64?: string;
  mode?: number;
  recursive?: boolean;
  offset?: number;
  length?: number;
  edits?: Array<{ find: string; replace: string }>;
  set_contents?: string;
  pattern?: string;
  regex?: boolean;
  case_insensitive?: boolean;
  max_matches?: number;
};

export type ComputerFileOperationResponse = {
  content?: string;
  content_base64?: string;
  entries?: ComputerFileEntry[];
  stat?: ComputerFileStat;
  exists?: boolean;
  version?: number;
  matches?: ComputerFileGrepMatch[];
};

export type ComputerUsageResponse = {
  runtime_seconds: number;
  cpu_hours: number;
  ram_gib_hours: number;
  hot_storage_bytes: number;
  cold_storage_bytes: number;
  updated_at: string;
};

export type ComputerUsageEnvelope = {
  usage: ComputerUsageResponse;
};

export class PublicApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "PublicApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type AccessTokenProvider =
  | string
  | undefined
  | null
  | (() => string | undefined | null | Promise<string | undefined | null>);

export type PublicApiClientOptions = {
  baseUrl: string;
  accessToken?: AccessTokenProvider;
  fetch?: typeof fetch;
};

export type WaitForOperationOptions = {
  pollIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

type RequestOptions = RequestInit & {
  signal?: AbortSignal;
};

type ImportedComputerLike = {
  id: string;
  handle: string;
  display_name: string;
  image_id: string;
  source_kind: string;
  source_snapshot_id?: string | null;
  size_preset: string;
  requested_memory_mib: number;
  requested_storage_bytes: number;
  state: string;
  clerk_org_id?: string;
  primary_url: string;
  vnc_url: string;
  failure_reason?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  viewer_access: {
    role: "owner" | "admin" | "shared";
    allow_browser: boolean;
    allow_vnc: boolean;
    allow_ssh: boolean;
    can_manage: boolean;
    can_update: boolean;
    can_delete: boolean;
    can_manage_shares: boolean;
    can_manage_ports: boolean;
    can_issue_ssh_certificates: boolean;
  };
};

export type ImportedComputerSummary = {
  id: string;
  handle: string;
  display_name: string;
  state: string;
  status: string;
  image_id: string;
  source_kind: string;
  source_snapshot_id?: string | null;
  size_preset: string;
  requested_memory_mib: number;
  requested_storage_bytes: number;
  primary_url: string;
  vnc_url: string;
  failure_reason?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  desired_power_state: "on" | "off";
  runtime_family: "managed-worker";
  build_status: "pending" | "ready" | "failed";
  image_family: string;
  resolved_image_ref: string;
  primary_web_host: string;
  primary_path: string;
  healthcheck_type: "http";
  ssh_enabled: boolean;
  vnc_enabled: boolean;
  filesystem_mode: "isolated";
  ssh_host: string;
  ssh_port: number;
  last_error?: string;
  viewer_access: ImportedComputerLike["viewer_access"];
};

export function adaptImportedComputer(computer: ImportedComputerLike): ImportedComputerSummary {
  const primaryUrl = new URL(computer.primary_url);
  return {
    id: computer.id,
    handle: computer.handle,
    display_name: computer.display_name,
    state: computer.state,
    status: computer.state,
    image_id: computer.image_id,
    source_kind: computer.source_kind,
    source_snapshot_id: computer.source_snapshot_id ?? null,
    size_preset: computer.size_preset,
    requested_memory_mib: computer.requested_memory_mib,
    requested_storage_bytes: computer.requested_storage_bytes,
    primary_url: computer.primary_url,
    vnc_url: computer.vnc_url,
    failure_reason: computer.failure_reason ?? null,
    created_at: computer.created_at,
    updated_at: computer.updated_at,
    deleted_at: computer.deleted_at ?? null,
    desired_power_state:
      computer.state === "stopped" || computer.state === "stopping" ? "off" : "on",
    runtime_family: "managed-worker",
    build_status:
      computer.state === "failed"
        ? "failed"
        : computer.state === "running" || computer.state === "stopped"
          ? "ready"
          : "pending",
    image_family: computer.image_id,
    resolved_image_ref: computer.image_id,
    primary_web_host: primaryUrl.host,
    primary_path: primaryUrl.pathname || "/",
    healthcheck_type: "http",
    ssh_enabled: computer.viewer_access.allow_ssh && computer.state === "running",
    vnc_enabled: computer.viewer_access.allow_vnc && computer.state === "running",
    filesystem_mode: "isolated",
    ssh_host: "",
    ssh_port: 0,
    last_error: computer.failure_reason ?? undefined,
    viewer_access: computer.viewer_access,
  };
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
    }
  });
}

export function createPublicApiClient(options: PublicApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch;

  if (!fetchImpl) {
    throw new Error("fetch is required");
  }

  const getAccessToken = async (): Promise<string | undefined> => {
    if (typeof options.accessToken === "function") {
      const token = await options.accessToken();
      return token?.trim() || undefined;
    }
    return options.accessToken?.trim() || undefined;
  };

  const request = async <T>(path: string, init: RequestOptions = {}): Promise<T> => {
    const headers = new Headers(init.headers);
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    if (init.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const token = await getAccessToken();
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }

    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      throw await toPublicApiError(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  };

  const requestNoAuth = async <T>(path: string, init: RequestOptions = {}): Promise<T> => {
    const headers = new Headers(init.headers);
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    if (init.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      throw await toPublicApiError(response);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  };

  const client = {
    request,
    requestNoAuth,
    async getMe(signal?: AbortSignal): Promise<MeResponse> {
      return request<MeResponse>("/v1/me", { signal });
    },
    async getUsage(signal?: AbortSignal): Promise<UsageEnvelope> {
      return request<UsageEnvelope>("/v1/usage", { signal });
    },
    async updateBillingPreferences(body: UpdateBillingPreferencesRequest, signal?: AbortSignal): Promise<BillingPreferencesResponse> {
      return request<BillingPreferencesResponse>("/v1/billing/preferences", {
        method: "PATCH",
        body: JSON.stringify(body),
        signal,
      });
    },
    async listComputerSizePresets(signal?: AbortSignal): Promise<ListComputerSizePresetsResponse> {
      return requestNoAuth<ListComputerSizePresetsResponse>("/v1/computer-size-presets", { signal });
    },
    async checkComputerCapacity(body: ComputerCapacityCheckRequest, signal?: AbortSignal): Promise<ComputerCapacityCheckResponse> {
      return request<ComputerCapacityCheckResponse>("/v1/computer-capacity/check", {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });
    },
    async listComputerImages(signal?: AbortSignal): Promise<ListComputerImagesResponse> {
      return request<ListComputerImagesResponse>("/v1/computer-images", { signal });
    },
    async getComputerImage(imageId: string, signal?: AbortSignal): Promise<{ image: ComputerImageResponse }> {
      return request<{ image: ComputerImageResponse }>(`/v1/computer-images/${encodeURIComponent(imageId)}`, { signal });
    },
    async listComputers(signal?: AbortSignal): Promise<{ computers: ComputerResponse[] }> {
      return request<{ computers: ComputerResponse[] }>("/v1/computers", { signal });
    },
    async getComputer(computerId: string, signal?: AbortSignal): Promise<ComputerMutationResponse> {
      return request<ComputerMutationResponse>(`/v1/computers/${encodeURIComponent(computerId)}`, { signal });
    },
    async createComputer(body: CreateComputerRequest, signal?: AbortSignal): Promise<ComputerMutationResponse> {
      return request<ComputerMutationResponse>("/v1/computers", {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });
    },
    async updateComputer(computerId: string, body: UpdateComputerRequest, signal?: AbortSignal): Promise<ComputerMutationResponse> {
      return request<ComputerMutationResponse>(`/v1/computers/${encodeURIComponent(computerId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        signal,
      });
    },
    async deleteComputer(computerId: string, signal?: AbortSignal): Promise<ComputerMutationResponse> {
      return request<ComputerMutationResponse>(`/v1/computers/${encodeURIComponent(computerId)}`, {
        method: "DELETE",
        signal,
      });
    },
    async startComputer(computerId: string, signal?: AbortSignal): Promise<ComputerMutationResponse> {
      return request<ComputerMutationResponse>(`/v1/computers/${encodeURIComponent(computerId)}/actions/start`, {
        method: "POST",
        signal,
      });
    },
    async stopComputer(computerId: string, signal?: AbortSignal): Promise<ComputerMutationResponse> {
      return request<ComputerMutationResponse>(`/v1/computers/${encodeURIComponent(computerId)}/actions/stop`, {
        method: "POST",
        signal,
      });
    },
    async resizeComputer(computerId: string, body: ResizeComputerRequest, signal?: AbortSignal): Promise<ComputerMutationResponse> {
      return request<ComputerMutationResponse>(`/v1/computers/${encodeURIComponent(computerId)}/actions/resize`, {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });
    },
    async transferComputer(computerId: string, body: TransferComputerRequest, signal?: AbortSignal): Promise<ComputerMutationResponse> {
      return request<ComputerMutationResponse>(`/v1/computers/${encodeURIComponent(computerId)}/actions/transfer`, {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });
    },
    async getComputerConnection(computerId: string, signal?: AbortSignal): Promise<ComputerConnectionResponse> {
      return request<ComputerConnectionResponse>(`/v1/computers/${encodeURIComponent(computerId)}/connection`, { signal });
    },
    async execCommand(computerId: string, body: ExecCommandRequest, signal?: AbortSignal): Promise<ExecCommandResponse> {
      return request<ExecCommandResponse>(`/v1/computers/${encodeURIComponent(computerId)}/exec`, {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });
    },
    async operateComputerFiles(computerId: string, body: ComputerFileOperationRequest, signal?: AbortSignal): Promise<ComputerFileOperationResponse> {
      return request<ComputerFileOperationResponse>(`/v1/computers/${encodeURIComponent(computerId)}/files/ops`, {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });
    },
    async getComputerUsage(computerId: string, signal?: AbortSignal): Promise<ComputerUsageEnvelope> {
      return request<ComputerUsageEnvelope>(`/v1/computers/${encodeURIComponent(computerId)}/usage`, { signal });
    },
    async ensureReadyComputer(computerId: string, signal?: AbortSignal): Promise<ComputerMutationResponse> {
      return request<ComputerMutationResponse>(`/v1/computers/${encodeURIComponent(computerId)}/actions/ensure-ready`, {
        method: "POST",
        signal,
      });
    },
    async getOperation(operationId: string, signal?: AbortSignal): Promise<{ operation: OperationResponse }> {
      return request<{ operation: OperationResponse }>(`/v1/operations/${encodeURIComponent(operationId)}`, { signal });
    },
    async waitForOperation(operationId: string, options: WaitForOperationOptions = {}): Promise<OperationResponse> {
      const pollIntervalMs = options.pollIntervalMs ?? 1500;
      const timeoutMs = options.timeoutMs ?? 2 * 60_000;
      const startedAt = Date.now();
      while (true) {
        const { operation } = await client.getOperation(operationId, options.signal);
        if (operation.status === "succeeded") {
          return operation;
        }
        if (operation.status === "failed") {
          throw new PublicApiError(409, operation.error_message || "operation failed", "operation_failed", operation);
        }
        if (Date.now() - startedAt > timeoutMs) {
          throw new PublicApiError(408, "operation timed out", "operation_timeout", operation);
        }
        await delay(pollIntervalMs, options.signal);
      }
    },
    async createAccessSession(computerId: string, body: Partial<CreateAccessSessionRequest>, signal?: AbortSignal): Promise<AccessSessionEnvelope> {
      return request<AccessSessionEnvelope>(`/v1/computers/${encodeURIComponent(computerId)}/access-sessions`, {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });
    },
    async getAccessSession(computerId: string, sessionId: string, signal?: AbortSignal): Promise<AccessSessionEnvelope> {
      return request<AccessSessionEnvelope>(`/v1/computers/${encodeURIComponent(computerId)}/access-sessions/${encodeURIComponent(sessionId)}`, { signal });
    },
    async deleteAccessSession(computerId: string, sessionId: string, signal?: AbortSignal): Promise<void> {
      return request<void>(`/v1/computers/${encodeURIComponent(computerId)}/access-sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        signal,
      });
    },
    async listSSHKeys(signal?: AbortSignal): Promise<ListSSHKeysResponse> {
      return request<ListSSHKeysResponse>("/v1/ssh-keys", { signal });
    },
    async createSSHKey(body: CreateSSHKeyRequest, signal?: AbortSignal): Promise<SSHKeyEnvelope> {
      return request<SSHKeyEnvelope>("/v1/ssh-keys", {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });
    },
    async deleteSSHKey(sshKeyId: string, signal?: AbortSignal): Promise<void> {
      return request<void>(`/v1/ssh-keys/${encodeURIComponent(sshKeyId)}`, {
        method: "DELETE",
        signal,
      });
    },
    async createSSHCertificate(computerId: string, body: CreateSSHCertificateRequest, signal?: AbortSignal): Promise<SSHCertificateResponse> {
      return request<SSHCertificateResponse>(`/v1/computers/${encodeURIComponent(computerId)}/ssh/certificates`, {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });
    },
    async listShares(computerId: string, signal?: AbortSignal): Promise<ListSharesResponse> {
      return request<ListSharesResponse>(`/v1/computers/${encodeURIComponent(computerId)}/shares`, { signal });
    },
    async createLinkShare(computerId: string, body: CreateLinkShareRequest, signal?: AbortSignal): Promise<ShareEnvelope> {
      return request<ShareEnvelope>(`/v1/computers/${encodeURIComponent(computerId)}/shares/links`, {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });
    },
    async deleteLinkShare(computerId: string, shareId: string, signal?: AbortSignal): Promise<void> {
      return request<void>(`/v1/computers/${encodeURIComponent(computerId)}/shares/links/${encodeURIComponent(shareId)}`, {
        method: "DELETE",
        signal,
      });
    },
    async resolveShare(shareToken: string, signal?: AbortSignal): Promise<ResolveShareResponse> {
      return requestNoAuth<ResolveShareResponse>(`/v1/shares/${encodeURIComponent(shareToken)}`, { signal });
    },
    async redeemShare(shareToken: string, body?: Partial<CreateAccessSessionRequest>, signal?: AbortSignal): Promise<AccessSessionEnvelope> {
      return requestNoAuth<AccessSessionEnvelope>(`/v1/shares/${encodeURIComponent(shareToken)}/access-sessions`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });
    },
    async listSnapshots(computerId: string, signal?: AbortSignal): Promise<ListSnapshotsResponse> {
      return request<ListSnapshotsResponse>(`/v1/computers/${encodeURIComponent(computerId)}/snapshots`, { signal });
    },
    async getSnapshot(snapshotId: string, signal?: AbortSignal): Promise<SnapshotEnvelope> {
      return request<SnapshotEnvelope>(`/v1/snapshots/${encodeURIComponent(snapshotId)}`, { signal });
    },
    async createSnapshot(computerId: string, signal?: AbortSignal): Promise<SnapshotMutationResponse> {
      return request<SnapshotMutationResponse>(`/v1/computers/${encodeURIComponent(computerId)}/snapshots`, {
        method: "POST",
        signal,
      });
    },
    async deleteSnapshot(snapshotId: string, signal?: AbortSignal): Promise<SnapshotMutationResponse> {
      return request<SnapshotMutationResponse>(`/v1/snapshots/${encodeURIComponent(snapshotId)}`, {
        method: "DELETE",
        signal,
      });
    },
    async restoreSnapshot(snapshotId: string, body: RestoreSnapshotRequest, signal?: AbortSignal): Promise<ComputerMutationResponse> {
      return request<ComputerMutationResponse>(`/v1/snapshots/${encodeURIComponent(snapshotId)}/restore`, {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });
    },
    async listPublishedPorts(computerId: string, signal?: AbortSignal): Promise<ListPublishedPortsResponse> {
      return request<ListPublishedPortsResponse>(`/v1/computers/${encodeURIComponent(computerId)}/ports`, { signal });
    },
    async createPublishedPort(computerId: string, body: CreatePublishedPortRequest, signal?: AbortSignal): Promise<PublishedPortMutationResponse> {
      return request<PublishedPortMutationResponse>(`/v1/computers/${encodeURIComponent(computerId)}/ports`, {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });
    },
    async deletePublishedPort(computerId: string, port: number, signal?: AbortSignal): Promise<PublishedPortMutationResponse> {
      return request<PublishedPortMutationResponse>(`/v1/computers/${encodeURIComponent(computerId)}/ports/${encodeURIComponent(String(port))}`, {
        method: "DELETE",
        signal,
      });
    },
  };

  return client;
}

async function toPublicApiError(response: Response): Promise<PublicApiError> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as { error?: { code?: string; message?: string } } | unknown;
      const code =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof (payload as { error?: unknown }).error === "object" &&
        (payload as { error?: { code?: string } }).error?.code
          ? (payload as { error?: { code?: string } }).error?.code
          : undefined;
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof (payload as { error?: unknown }).error === "object" &&
        (payload as { error?: { message?: string } }).error?.message
          ? (payload as { error?: { message?: string } }).error?.message
          : JSON.stringify(payload);
      return new PublicApiError(response.status, message || response.statusText || "request failed", code, payload);
    } catch (error) {
      return new PublicApiError(response.status, response.statusText || "request failed", undefined, error);
    }
  }

  const body = await response.text().catch(() => "");
  return new PublicApiError(response.status, body || response.statusText || "request failed");
}
