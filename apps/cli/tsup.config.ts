import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
	version: string;
};

const entry = [
	"src/index.ts",
	"src/lib/ssh-access.ts",
	"src/lib/upgrade-version.ts",
];

export default defineConfig({
	entry,
	format: ["esm"],
	dts: true,
	target: "es2022",
	platform: "node",
	splitting: true,
	noExternal: [/.*/],
	banner: {
		js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
	},
	env: {
		__CLI_VERSION__: pkg.version,
	},
});
