{
  fetchPnpmDeps,
  lib,
  nodejs_22,
  openssh,
  pnpmConfigHook,
  pnpm_10,
  stdenvNoCC,
}:

let
  package = builtins.fromJSON (builtins.readFile ./package.json);
  src = lib.fileset.toSource {
    root = ../..;
    fileset = lib.fileset.unions [
      ../../package.json
      ../../pnpm-lock.yaml
      ../../pnpm-workspace.yaml
      ../../tsconfig.base.json
      ../../packages/public-api-client
      ./.
    ];
  };
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = package.name;
  version = package.version;
  inherit src;

  pnpmWorkspaces = [
    "aicomputer"
    "@microagentcomputer/public-api-client"
  ];

  nativeBuildInputs = [
    nodejs_22
    pnpmConfigHook
    pnpm_10
  ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src pnpmWorkspaces;
    pnpm = pnpm_10;
    fetcherVersion = 3;
    hash = "sha256-NtBbn6TZVZSv/1x2ZImAqOSuskmTzv+2qeLGKLykOJc=";
  };

  buildPhase = ''
    runHook preBuild
    pnpm --filter aicomputer build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    install -d "$out/lib/node_modules/aicomputer"
    cp -R apps/cli/dist "$out/lib/node_modules/aicomputer/dist"
    cp -R apps/cli/scripts "$out/lib/node_modules/aicomputer/scripts"
    install -m644 apps/cli/package.json "$out/lib/node_modules/aicomputer/package.json"
    install -m644 apps/cli/README.md "$out/lib/node_modules/aicomputer/README.md"

    install -d "$out/bin"
    for bin in aicomputer agentcomputer computer; do
      cat > "$out/bin/$bin" <<EOF
#!${nodejs_22}/bin/node
process.env.PATH = '${lib.makeBinPath [ openssh ]}:' + (process.env.PATH ?? "");
await import('$out/lib/node_modules/aicomputer/dist/index.js');
EOF
      chmod +x "$out/bin/$bin"
    done

    runHook postInstall
  '';

  meta = {
    description = package.description;
    homepage = package.homepage;
    mainProgram = "computer";
    platforms = lib.platforms.all;
  };
})
