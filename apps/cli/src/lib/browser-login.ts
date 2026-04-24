import { randomBytes } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

import { apiWithKey, getWebURL } from "./api.js";
import { setAPIKey } from "./config.js";

const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/callback";
const LOGIN_TIMEOUT_MS = 15 * 60 * 1000;

export type BrowserLoginProvider = "claude" | "codex" | "skip";

export interface BrowserLoginMeResponse {
  id: string;
  clerk_user_id: string;
  primary_email: string;
  display_name: string;
  auth_method: string;
  clerk_api_key_id?: string | null;
}

export interface BrowserLoginResult {
  apiKey: string;
  callbackURL: string;
  loginURL: string;
  me: BrowserLoginMeResponse;
  computerHandle?: string;
  machineHandle?: string;
  provider?: BrowserLoginProvider;
  autoSSH?: boolean;
}

export interface BrowserLoginAttempt {
  callbackURL: string;
  loginURL: string;
  close(): Promise<void>;
  waitForResult(timeoutMs?: number): Promise<BrowserLoginResult>;
}

type Deferred<T> = {
  promise: Promise<T>;
  reject(error: Error): void;
  resolve(value: T): void;
};

export async function createBrowserLoginAttempt(): Promise<BrowserLoginAttempt> {
  const state = randomBytes(16).toString("hex");
  const deferred = createDeferred<BrowserLoginResult>();
  let callbackURL = "";
  let closed = false;
  let settled = false;

  const server = createServer((request, response) => {
    void handleRequest({
      callbackURL,
      deferred,
      request,
      response,
      state,
      settledRef: {
        get current() {
          return settled;
        },
        set current(value: boolean) {
          settled = value;
        },
      },
    });
  });

  await listen(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Failed to allocate a loopback callback port");
  }

  callbackURL = `http://${CALLBACK_HOST}:${address.port}${CALLBACK_PATH}`;
  const loginURL = buildBrowserLoginURL(callbackURL, state);

  return {
    callbackURL,
    loginURL,
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      await closeServer(server);
    },
    async waitForResult(timeoutMs = LOGIN_TIMEOUT_MS) {
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        deferred.reject(new Error("Timed out waiting for browser login"));
      }, timeoutMs);

      try {
        return await deferred.promise;
      } finally {
        clearTimeout(timeout);
        if (!closed) {
          closed = true;
          await closeServer(server);
        }
      }
    },
  };
}

function buildBrowserLoginURL(callbackURL: string, state: string): string {
  const url = new URL("/api/cli/auth", getWebURL());
  url.searchParams.set("callback_url", callbackURL);
  url.searchParams.set("state", state);
  return url.toString();
}

async function handleRequest(input: {
  callbackURL: string;
  deferred: Deferred<BrowserLoginResult>;
  request: IncomingMessage;
  response: ServerResponse;
  state: string;
  settledRef: {
    current: boolean;
  };
}): Promise<void> {
  const { callbackURL, deferred, request, response, state, settledRef } = input;
  if (!request.url || request.method !== "GET") {
    writeHTML(response, 404, renderErrorPage("Login page not found."));
    return;
  }

  const url = new URL(request.url, callbackURL || `http://${CALLBACK_HOST}`);
  if (url.pathname !== CALLBACK_PATH) {
    writeHTML(response, 404, renderErrorPage("Login page not found."));
    return;
  }

  if (settledRef.current) {
    writeHTML(
      response,
      409,
      renderErrorPage("This login link has already been used."),
    );
    return;
  }

  const returnedState = url.searchParams.get("state")?.trim();
  if (!returnedState || returnedState !== state) {
    settledRef.current = true;
    const error = new Error("Received an invalid browser login state");
    deferred.reject(error);
    writeHTML(response, 400, renderErrorPage(error.message));
    return;
  }

  const returnedError = url.searchParams.get("error")?.trim();
  if (returnedError) {
    settledRef.current = true;
    const error = new Error(returnedError);
    deferred.reject(error);
    writeHTML(response, 400, renderErrorPage(returnedError));
    return;
  }

  const apiKey = url.searchParams.get("api_key")?.trim();
  if (!apiKey) {
    settledRef.current = true;
    const error = new Error("Browser login did not return an API key");
    deferred.reject(error);
    writeHTML(response, 400, renderErrorPage(error.message));
    return;
  }

  const computerHandle =
    url.searchParams.get("computer_handle")?.trim() ||
    url.searchParams.get("machine_handle")?.trim() ||
    undefined;
  const provider = parseProvider(url.searchParams.get("provider"));
  const autoSSH = parseAutoSSH(url.searchParams.get("auto_ssh"));

  try {
    const me = await apiWithKey<BrowserLoginMeResponse>(apiKey, "/v1/me");
    setAPIKey(apiKey);
    settledRef.current = true;
    deferred.resolve({
      apiKey,
      callbackURL,
      loginURL: buildBrowserLoginURL(callbackURL, state),
      me,
      computerHandle,
      machineHandle: computerHandle,
      provider,
      autoSSH,
    });
    writeHTML(
      response,
      200,
      renderSuccessPage({
        autoSSH,
        email: me.primary_email,
        machineHandle: computerHandle,
        provider,
      }),
    );
  } catch (error) {
    settledRef.current = true;
    const message =
      error instanceof Error
        ? error.message
        : "Failed to validate browser login";
    deferred.reject(new Error(message));
    writeHTML(response, 401, renderErrorPage(message));
  }
}

function parseProvider(
  rawValue: string | null,
): BrowserLoginProvider | undefined {
  switch (rawValue?.trim()) {
    case "claude":
    case "codex":
    case "skip":
      return rawValue.trim() as BrowserLoginProvider;
    default:
      return undefined;
  }
}

function parseAutoSSH(rawValue: string | null): boolean | undefined {
  if (rawValue === null) {
    return undefined;
  }
  return !(rawValue === "0" || rawValue === "false");
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

function listen(server: Server): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, CALLBACK_HOST, () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to allocate a loopback callback port"));
        return;
      }
      resolve(address);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function writeHTML(
  response: ServerResponse,
  statusCode: number,
  body: string,
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(body);
}

function renderSuccessPage(input: {
  email: string;
  machineHandle?: string;
  provider?: BrowserLoginProvider;
  autoSSH?: boolean;
}): string {
  const providerMessage =
    input.provider && input.provider !== "skip"
      ? ` The CLI will continue with ${escapeHTML(input.provider)} setup.`
      : "";
  const machineMessage = input.machineHandle
    ? ` Your new sandbox <code>${escapeHTML(input.machineHandle)}</code> is ready.${providerMessage} Return to the terminal to finish setup.`
    : " You can close this tab.";

  return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>Computer CLI login complete</title>
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<style>
			body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0b1220; color: #e2e8f0; display: grid; min-height: 100vh; place-items: center; margin: 0; }
			main { width: min(32rem, calc(100vw - 2rem)); background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 1.5rem; box-shadow: 0 20px 45px rgba(0, 0, 0, 0.35); }
			h1 { margin: 0 0 0.75rem; font-size: 1.5rem; }
			p { margin: 0; line-height: 1.5; color: #cbd5e1; }
			code { color: #f8fafc; }
		</style>
	</head>
	<body>
		<main>
			<h1>Computer CLI login complete</h1>
			<p>Signed in as <code>${escapeHTML(input.email)}</code>.${machineMessage}</p>
		</main>
		<script>
			window.setTimeout(() => window.close(), 150);
		</script>
	</body>
</html>`;
}

function renderErrorPage(message: string): string {
  return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>Computer CLI login failed</title>
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<style>
			body { font-family: ui-sans-serif, system-ui, sans-serif; background: #180c0d; color: #fee2e2; display: grid; min-height: 100vh; place-items: center; margin: 0; }
			main { width: min(32rem, calc(100vw - 2rem)); background: #2b1114; border: 1px solid #7f1d1d; border-radius: 16px; padding: 1.5rem; box-shadow: 0 20px 45px rgba(0, 0, 0, 0.35); }
			h1 { margin: 0 0 0.75rem; font-size: 1.5rem; }
			p { margin: 0; line-height: 1.5; color: #fecaca; }
		</style>
	</head>
	<body>
		<main>
			<h1>Computer CLI login failed</h1>
			<p>${escapeHTML(message)}</p>
		</main>
	</body>
</html>`;
}

function escapeHTML(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
