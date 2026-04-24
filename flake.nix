{
  description = "Agent Computer CLI";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      perSystem =
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          cli = pkgs.callPackage ./apps/cli/package.nix { };
          cliApp = program: {
            type = "app";
            inherit program;
          };
        in
        {
          packages = {
            default = cli;
            aicomputer = cli;
            agentcomputer = cli;
            computer = cli;
          };

          apps = {
            default = cliApp "${cli}/bin/computer";
            aicomputer = cliApp "${cli}/bin/aicomputer";
            agentcomputer = cliApp "${cli}/bin/agentcomputer";
            computer = cliApp "${cli}/bin/computer";
          };
        };
    in
    {
      packages = forAllSystems (system: (perSystem system).packages);
      apps = forAllSystems (system: (perSystem system).apps);
    };
}
