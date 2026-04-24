import { Command } from "commander";

const ROOT_COMMANDS = [
	"login:Authenticate the CLI",
	"upgrade:Update the CLI",
	"logout:Remove stored API key",
	"whoami:Show current user",
	"claude-login:Authenticate Claude Code on a computer",
	"claude-auth:Alias for claude-login",
	"codex-login:Authenticate Codex on a computer",
	"codex-auth:Alias for codex-login",
	"create:Create a computer",
	"ls:List computers",
	"get:Show computer details",
	"power-on:Start a computer",
	"power-off:Stop a computer",
	"image:Inspect computer images",
	"open:Open a computer in your browser",
	"ssh:Open an SSH session to a computer",
	"ports:Manage published app ports",
	"shares:Manage computer shares",
	"snapshot:Manage computer snapshots",
	"rm:Delete a computer",
	"completion:Generate shell completions",
	"help:Display help",
];

const IMAGE_COMMANDS = [
	"ls:List computer images",
	"get:Show one computer image",
];

const PORTS_COMMANDS = [
	"ls:List published ports",
	"publish:Publish an app port",
	"rm:Unpublish an app port",
];

const SHARES_COMMANDS = [
	"ls:List shares",
	"create:Create a share",
	"rm:Delete a share",
];

const SNAPSHOT_COMMANDS = [
	"ls:List snapshots",
	"create:Create a snapshot",
	"rm:Delete a snapshot",
	"restore:Restore a snapshot",
];

const ZSH_SCRIPT = `#compdef computer agentcomputer aicomputer

_computer() {
  local -a commands image_commands ports_commands shares_commands snapshot_commands
  commands=(
    '${ROOT_COMMANDS.join("'\n    '")}'
  )
  image_commands=(
    '${IMAGE_COMMANDS.join("'\n    '")}'
  )
  ports_commands=(
    '${PORTS_COMMANDS.join("'\n    '")}'
  )
  shares_commands=(
    '${SHARES_COMMANDS.join("'\n    '")}'
  )
  snapshot_commands=(
    '${SNAPSHOT_COMMANDS.join("'\n    '")}'
  )

  _arguments -C \\
    '(-h --help)'{-h,--help}'[Display help]' \\
    '(-V --version)'{-V,--version}'[Show version]' \\
    '1:command:->command' \\
    '*::arg:->args'

  case "$state" in
    command)
      _describe -t commands 'computer command' commands
      ;;
    args)
      case "$words[1]" in
        login)
          _arguments \\
            '--api-key[API key]:key:' \\
            '--stdin[Read API key from stdin]' \\
            '(-f --force)'{-f,--force}'[Overwrite existing key]'
          ;;
        whoami)
          _arguments '--json[Print raw JSON]'
          ;;
        claude-auth|claude-login|codex-auth|codex-login)
          _arguments \\
            '--computer[Use a specific computer]:computer:_computer_handles' \\
            '--keep-helper[Keep a temporary helper computer]' \\
            '--verbose[Show step-by-step auth diagnostics]'
          ;;
        create)
          _arguments \\
            '--name[Display name]:name:' \\
            '--interactive[Prompt for supported computer details]' \\
            '1:handle:'
          ;;
        ls)
          _arguments \\
            '--json[Print raw JSON]' \\
            '(-v --verbose)'{-v,--verbose}'[Show all URLs]'
          ;;
        get|power-on|power-off|rm)
          _arguments \\
            '--json[Print raw JSON]' \\
            '1:computer:_computer_handles'
          ;;
        image)
          _arguments -C \\
            '1:command:->image_command' \\
            '*::arg:->image_args'
          case "$state" in
            image_command)
              _describe -t commands 'image command' image_commands
              ;;
            image_args)
              case "$words[2]" in
                ls)
                  _arguments '--json[Print raw JSON]'
                  ;;
                get)
                  _arguments \\
                    '--json[Print raw JSON]' \\
                    '1:image:_computer_image_ids'
                  ;;
              esac
              ;;
          esac
          ;;
        open)
          _arguments \\
            '--vnc[Open VNC desktop]' \\
            '1:computer:_computer_handles'
          ;;
        ssh)
          _arguments \\
            '--setup[Register key and configure a global SSH alias]' \\
            '--tmux[Attach or create a persistent tmux session on connect]' \\
            '--alias[SSH host alias]:alias:' \\
            '--host[SSH gateway host]:host:' \\
            '--port[SSH gateway port]:port:' \\
            '1:computer:_computer_handles' \\
            '*::ssh args:_files'
          ;;
        ports)
          _arguments -C \\
            '1:command:->ports_command' \\
            '*::arg:->ports_args'
          case "$state" in
            ports_command)
              _describe -t commands 'ports command' ports_commands
              ;;
            ports_args)
              case "$words[2]" in
                ls)
                  _arguments '1:computer:_computer_handles'
                  ;;
                publish)
                  _arguments \\
                    '--name[Public name for the published port]:name:' \\
                    '--visibility[Port visibility]:visibility:(public private)' \\
                    '--public[Publish without requiring an access session]' \\
                    '--private[Require an access session for the published URL]' \\
                    '1:computer:_computer_handles' \\
                    '2:port:'
                  ;;
                rm)
                  _arguments \\
                    '1:computer:_computer_handles' \\
                    '2:port:'
                  ;;
              esac
              ;;
          esac
          ;;
        shares)
          _arguments -C \\
            '1:command:->shares_command' \\
            '*::arg:->shares_args'
          case "$state" in
            shares_command)
              _describe -t commands 'shares command' shares_commands
              ;;
            shares_args)
              case "$words[2]" in
                ls)
                  _arguments \\
                    '--json[Print raw JSON]' \\
                    '1:computer:_computer_handles'
                  ;;
                create)
                  _arguments \\
                    '--email[Email recipient]:email:' \\
                    '--vnc[Allow VNC access]' \\
                    '--expires[Expiry duration]:duration:' \\
                    '--json[Print raw JSON]' \\
                    '1:computer:_computer_handles'
                  ;;
                rm)
                  _arguments \\
                    '1:computer:_computer_handles' \\
                    '2:share id:'
                  ;;
              esac
              ;;
          esac
          ;;
        snapshot)
          _arguments -C \\
            '1:command:->snapshot_command' \\
            '*::arg:->snapshot_args'
          case "$state" in
            snapshot_command)
              _describe -t commands 'snapshot command' snapshot_commands
              ;;
            snapshot_args)
              case "$words[2]" in
                ls|create)
                  _arguments \\
                    '--json[Print raw JSON]' \\
                    '1:computer:_computer_handles'
                  ;;
                rm)
                  _arguments \\
                    '--json[Print raw JSON]' \\
                    '1:snapshot id:'
                  ;;
                restore)
                  _arguments \\
                    '--name[Display name]:name:' \\
                    '--json[Print raw JSON]' \\
                    '1:snapshot id:' \\
                    '2:handle:'
                  ;;
              esac
              ;;
          esac
          ;;
        completion)
          _arguments '1:shell:(bash zsh)'
          ;;
      esac
      ;;
  esac
}

_computer_handles() {
  local -a handles
  local cli="\${words[1]:-computer}"
  if handles=(\${(f)"$(\${cli} ls --json 2>/dev/null | grep '"handle"' | sed 's/.*"handle": "\\([^"]*\\)".*/\\1/')"}); then
    _describe -t handles 'computer handle' handles
  fi
}

_computer_image_ids() {
  local -a ids
  local cli="\${words[1]:-computer}"
  if ids=(\${(f)"$(\${cli} image ls --json 2>/dev/null | grep '"id"' | sed 's/.*"id": "\\([^"]*\\)".*/\\1/')"}); then
    _describe -t ids 'computer image' ids
  fi
}

_computer "$@"`;

const BASH_SCRIPT = `_computer() {
  local cur prev words cword
  _init_completion || return

  local commands="login upgrade logout whoami claude-login claude-auth codex-login codex-auth create ls get power-on power-off image open ssh ports shares snapshot rm completion help"
  local image_commands="ls get"
  local ports_commands="ls publish rm"
  local shares_commands="ls create rm"
  local snapshot_commands="ls create rm restore"

  if [[ $cword -eq 1 ]]; then
    COMPREPLY=($(compgen -W "$commands" -- "$cur"))
    return
  fi

  local cmd="\${words[1]}"

  case "$cmd" in
    login)
      COMPREPLY=($(compgen -W "--api-key --stdin --force -f" -- "$cur"))
      ;;
    whoami)
      COMPREPLY=($(compgen -W "--json" -- "$cur"))
      ;;
    claude-auth|claude-login|codex-auth|codex-login)
      COMPREPLY=($(compgen -W "--computer --keep-helper --verbose" -- "$cur"))
      ;;
    create)
      COMPREPLY=($(compgen -W "--name --interactive" -- "$cur"))
      ;;
    ls)
      COMPREPLY=($(compgen -W "--json --verbose -v" -- "$cur"))
      ;;
    get|rm)
      if [[ $cword -eq 2 ]]; then
        local handles cli="\${words[0]:-computer}"
        handles=$(\${cli} ls --json 2>/dev/null | grep '"handle"' | sed 's/.*"handle": "\\([^"]*\\)".*/\\1/')
        COMPREPLY=($(compgen -W "$handles" -- "$cur"))
      else
        case "$cmd" in
          get) COMPREPLY=($(compgen -W "--json" -- "$cur")) ;;
          rm) COMPREPLY=($(compgen -W "--yes -y" -- "$cur")) ;;
        esac
      fi
      ;;
    power-on|power-off)
      if [[ $cword -eq 2 ]]; then
        local handles cli="\${words[0]:-computer}"
        handles=$(\${cli} ls --json 2>/dev/null | grep '"handle"' | sed 's/.*"handle": "\\([^"]*\\)".*/\\1/')
        COMPREPLY=($(compgen -W "$handles" -- "$cur"))
      else
        COMPREPLY=($(compgen -W "--json" -- "$cur"))
      fi
      ;;
    image)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=($(compgen -W "$image_commands" -- "$cur"))
      else
        case "\${words[2]}" in
          ls)
            COMPREPLY=($(compgen -W "--json" -- "$cur"))
            ;;
          get)
            if [[ "$cur" == -* ]]; then
              COMPREPLY=($(compgen -W "--json" -- "$cur"))
            else
              local image_ids cli="\${words[0]:-computer}"
              image_ids=$(\${cli} image ls --json 2>/dev/null | grep '"id"' | sed 's/.*"id": "\\([^"]*\\)".*/\\1/')
              COMPREPLY=($(compgen -W "$image_ids" -- "$cur"))
            fi
            ;;
        esac
      fi
      ;;
    open)
      COMPREPLY=($(compgen -W "--vnc" -- "$cur"))
      ;;
    ssh)
      COMPREPLY=($(compgen -W "--setup --tmux --alias --host --port" -- "$cur"))
      ;;
    ports)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=($(compgen -W "$ports_commands" -- "$cur"))
      elif [[ $cword -eq 3 ]]; then
        local handles cli="\${words[0]:-computer}"
        handles=$(\${cli} ls --json 2>/dev/null | grep '"handle"' | sed 's/.*"handle": "\\([^"]*\\)".*/\\1/')
        COMPREPLY=($(compgen -W "$handles" -- "$cur"))
      else
        case "\${words[2]}" in
          ls)
            COMPREPLY=($(compgen -W "" -- "$cur"))
            ;;
          publish)
            COMPREPLY=($(compgen -W "--name --visibility --public --private" -- "$cur"))
            ;;
          rm)
            COMPREPLY=($(compgen -W "" -- "$cur"))
            ;;
        esac
      fi
      ;;
    shares)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=($(compgen -W "$shares_commands" -- "$cur"))
      elif [[ $cword -eq 3 ]]; then
        local handles cli="\${words[0]:-computer}"
        handles=$(\${cli} ls --json 2>/dev/null | grep '"handle"' | sed 's/.*"handle": "\\([^"]*\\)".*/\\1/')
        COMPREPLY=($(compgen -W "$handles" -- "$cur"))
      else
        case "\${words[2]}" in
          ls)
            COMPREPLY=($(compgen -W "--json" -- "$cur"))
            ;;
          create)
            COMPREPLY=($(compgen -W "--email --vnc --expires --json" -- "$cur"))
            ;;
          rm)
            COMPREPLY=($(compgen -W "" -- "$cur"))
            ;;
        esac
      fi
      ;;
    snapshot)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=($(compgen -W "$snapshot_commands" -- "$cur"))
      elif [[ $cword -eq 3 && ("\${words[2]}" == "ls" || "\${words[2]}" == "create") ]]; then
        local handles cli="\${words[0]:-computer}"
        handles=$(\${cli} ls --json 2>/dev/null | grep '"handle"' | sed 's/.*"handle": "\\([^"]*\\)".*/\\1/')
        COMPREPLY=($(compgen -W "$handles" -- "$cur"))
      else
        case "\${words[2]}" in
          ls|create|rm)
            COMPREPLY=($(compgen -W "--json" -- "$cur"))
            ;;
          restore)
            COMPREPLY=($(compgen -W "--json --name" -- "$cur"))
            ;;
        esac
      fi
      ;;
    completion)
      COMPREPLY=($(compgen -W "bash zsh" -- "$cur"))
      ;;
  esac
}

complete -F _computer computer agentcomputer aicomputer`;

export const completionCommand = new Command("completion")
	.description("Generate shell completions")
	.argument("[shell]", "Shell to generate completions for")
	.action((shell?: string) => {
		const resolvedShell = shell ?? "bash";
		switch (resolvedShell) {
			case "zsh":
				console.log(ZSH_SCRIPT);
				return;
			case "bash":
				console.log(BASH_SCRIPT);
				return;
			default:
				throw new Error(`unsupported shell '${resolvedShell}'`);
		}
	});
