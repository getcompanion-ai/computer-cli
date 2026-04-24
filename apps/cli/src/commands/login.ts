import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { apiWithKey, getBaseURL } from "../lib/api.js";
import {
  createBrowserLoginAttempt,
  type BrowserLoginMeResponse,
  type BrowserLoginProvider,
  type BrowserLoginResult,
} from "../lib/browser-login.js";
import { getStoredAPIKey, setAPIKey } from "../lib/config.js";
import { openBrowserURL } from "../lib/open-browser.js";
import {
  openSSHConnection,
  prepareSSHConnectionByIdentifier,
} from "../lib/ssh-access.js";
import { runClaudeLogin } from "./claude-auth.js";
import { runCodexLogin } from "./codex-login.js";

export const loginCommand = new Command("login")
  .description("Authenticate the CLI")
  .option("--api-key <key>", "Clerk API key starting with ak_")
  .option("--stdin", "Read the API key from stdin")
  .option("-f, --force", "Overwrite an existing stored API key")
  .action(async (options) => {
    const existingKey = getStoredAPIKey();
    if (existingKey && !options.force) {
      console.log();
      console.log(
        chalk.yellow("  Already logged in. Use --force to overwrite."),
      );
      console.log();
      return;
    }

    const wantsManualLogin = Boolean(options.apiKey || options.stdin);
    const apiKey = await resolveAPIKeyInput(options.apiKey, options.stdin);
    if (!apiKey && wantsManualLogin) {
      console.log();
      console.log(chalk.dim("  Usage: computer login --api-key <ak_...>"));
      console.log(chalk.dim(`  API:   ${getBaseURL()}`));
      console.log();
      process.exit(1);
    }

    if (!apiKey) {
      await runBrowserLogin();
      return;
    }

    if (!apiKey.startsWith("ak_")) {
      console.log();
      console.log(chalk.red("  API key must start with ak_"));
      console.log();
      process.exit(1);
    }

    const spinner = ora("Authenticating...").start();
    try {
      const me = await apiWithKey<BrowserLoginMeResponse>(apiKey, "/v1/me");
      setAPIKey(apiKey);
      spinner.succeed(`Logged in as ${chalk.bold(me.primary_email)}`);
    } catch (error) {
      spinner.fail(
        error instanceof Error ? error.message : "Failed to validate API key",
      );
      process.exit(1);
    }
  });

async function runBrowserLogin(): Promise<void> {
  const spinner = ora("Starting browser login...").start();
  let attempt: Awaited<ReturnType<typeof createBrowserLoginAttempt>> | null =
    null;
  try {
    attempt = await createBrowserLoginAttempt();
    spinner.text = "Opening browser...";
    try {
      await openBrowserURL(attempt.loginURL);
    } catch {
      spinner.stop();
      console.log();
      console.log(
        chalk.yellow("  Browser auto-open failed. Open this URL to continue:"),
      );
      console.log(chalk.dim(`  ${attempt.loginURL}`));
      console.log();
      spinner.start("Waiting for browser login...");
    }

    spinner.text = "Waiting for browser login...";
    const result = await attempt.waitForResult();
    spinner.succeed(`Logged in as ${chalk.bold(result.me.primary_email)}`);
    await continueFirstLoginFlow(result);
  } catch (error) {
    spinner.fail(
      error instanceof Error ? error.message : "Browser login failed",
    );
    process.exit(1);
  } finally {
    await attempt?.close();
  }
}

async function resolveAPIKeyInput(
  flagValue: string | undefined,
  readFromStdin: boolean | undefined,
): Promise<string> {
  if (flagValue?.trim()) {
    return flagValue.trim();
  }

  if (!readFromStdin) {
    return "";
  }

  if (process.stdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8").trim();
}

async function continueFirstLoginFlow(
  result: BrowserLoginResult,
): Promise<void> {
  const computerHandle = result.computerHandle?.trim() ?? result.machineHandle?.trim();
  if (!computerHandle) {
    return;
  }

  console.log();
  console.log(
    chalk.cyan(
      `Continuing first-time setup for ${chalk.bold(computerHandle)}...\n`,
    ),
  );

  try {
    await runSelectedProvider(result.provider, computerHandle);

    if (result.autoSSH === false) {
      printNextStep(computerHandle);
      return;
    }

    const spinner = ora(`Preparing SSH access for ${computerHandle}...`).start();
    try {
      const connection = await prepareSSHConnectionByIdentifier(computerHandle);
      spinner.succeed(`Connecting to ${chalk.bold(computerHandle)}`);
      console.log(chalk.dim(`  ssh ${connection.args.join(" ")}`));
      console.log();
      await openSSHConnection(connection);
    } catch (error) {
      spinner.fail(
        error instanceof Error ? error.message : "Failed to prepare SSH access",
      );
      throw error;
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to finish first-time setup";
    console.error(chalk.red(`\n${message}`));
    console.log();
    if (result.provider === "claude") {
      console.log(
        chalk.dim(`  computer claude-login --computer ${computerHandle}`),
      );
    } else if (result.provider === "codex") {
      console.log(
        chalk.dim(`  computer codex-login --computer ${computerHandle}`),
      );
    }
    console.log(chalk.dim(`  computer ssh ${computerHandle}`));
    console.log();
    process.exit(1);
  }
}

async function runSelectedProvider(
  provider: BrowserLoginProvider | undefined,
  computerHandle: string,
): Promise<void> {
  if (provider === "claude") {
    await runClaudeLogin({ computer: computerHandle });
    return;
  }
  if (provider === "codex") {
    await runCodexLogin({ computer: computerHandle });
    return;
  }

  console.log(chalk.green(`Computer ${chalk.bold(computerHandle)} is ready.`));
  console.log();
}

function printNextStep(computerHandle: string): void {
  console.log(chalk.green(`Computer ${chalk.bold(computerHandle)} is ready.`));
  console.log(chalk.dim(`  computer ssh ${computerHandle}`));
  console.log();
}
