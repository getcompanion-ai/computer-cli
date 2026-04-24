import {
	PublicApiError,
	createPublicApiClient,
} from "@microagentcomputer/public-api-client";

import { getAPIKey } from "./config.js";

const BASE_URL =
	process.env.COMPUTER_API_URL ??
	process.env.AGENTCOMPUTER_API_URL ??
	"https://api.agentcomputer.ai";
const WEB_URL =
	process.env.COMPUTER_WEB_URL ??
	process.env.AGENTCOMPUTER_WEB_URL ??
	resolveDefaultWebURL(BASE_URL);

export class ApiError extends Error {
	readonly status: number;
	readonly code?: string;
	readonly details?: unknown;

	constructor(status: number, message: string, code?: string, details?: unknown) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
		this.details = details;
	}
}

export function getBaseURL(): string {
	return BASE_URL;
}

export function getWebURL(): string {
	return WEB_URL;
}

export function getPublicApiClient(apiKey = getAPIKey()) {
	if (!apiKey) {
		throw new ApiError(401, "not logged in; run 'computer login' first");
	}

	return createPublicApiClient({
		baseUrl: BASE_URL,
		accessToken: apiKey,
		fetch,
	});
}

export function getPublicApiClientWithKey(apiKey: string) {
	return createPublicApiClient({
		baseUrl: BASE_URL,
		accessToken: apiKey,
		fetch,
	});
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
	try {
		return await getPublicApiClient().request<T>(path, normalizeRequestOptions(options));
	} catch (error) {
		throw toApiError(error);
	}
}

export async function apiWithKey<T>(
	apiKey: string,
	path: string,
	options: RequestInit = {},
): Promise<T> {
	try {
		return await getPublicApiClientWithKey(apiKey).request<T>(
			path,
			normalizeRequestOptions(options),
		);
	} catch (error) {
		throw toApiError(error);
	}
}

export function toApiError(error: unknown): ApiError {
	if (error instanceof ApiError) {
		return error;
	}
	if (error instanceof PublicApiError) {
		return new ApiError(error.status, error.message, error.code, error.details);
	}
	return new ApiError(
		500,
		error instanceof Error ? error.message : "request failed",
	);
}

function resolveDefaultWebURL(apiURL: string): string {
	try {
		const parsed = new URL(apiURL);
		if (parsed.hostname === "api.agentcomputer.ai") {
			return "https://agentcomputer.ai";
		}
		if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
			return `${parsed.protocol}//${parsed.hostname}:3000`;
		}
	} catch {
		return "https://agentcomputer.ai";
	}

	return "https://agentcomputer.ai";
}

function normalizeRequestOptions(options: RequestInit): RequestInit & {
	signal?: AbortSignal;
} {
	return {
		...options,
		signal: options.signal ?? undefined,
	};
}
