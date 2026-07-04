#compdef TaiAi TaiAi-backup TaiAi-calendar TaiAi-contacts TaiAi-cookbook TaiAi-docs TaiAi-gallery TaiAi-mail TaiAi-mcp TaiAi-memory TaiAi-notes TaiAi-personal TaiAi-preset TaiAi-research TaiAi-sessions TaiAi-signature TaiAi-skills TaiAi-tasks TaiAi-theme TaiAi-webhook
# Zsh tab-completion for the TaiAi umbrella + sub-CLIs.
#
# Drop in any directory on $fpath, e.g.:
#     fpath=(/path/to/TaiAi-ui/scripts/_completion $fpath)
#     autoload -U compinit; compinit
#
# Then `TaiAi <tab>` completes subcommands; `TaiAi mail <tab>`
# completes mail subcommands; `TaiAi-mail <tab>` works the same.

_TaiAi_scripts_dir() {
    local self="${(%):-%x}"
    while [[ -L "$self" ]]; do self="$(readlink "$self")"; done
    cd "${self:h}/.." && pwd
}

typeset -gA _TaiAi_subs

_TaiAi_refresh() {
    _TaiAi_subs=()
    local dir="$(_TaiAi_scripts_dir)"
    local py="$dir/../venv/bin/python"
    [[ -x "$py" ]] || py="$(command -v python3)"
    local f sub help_out commands
    for f in "$dir"/TaiAi-*; do
        [[ -x "$f" ]] || continue
        case "$f" in
            *.bak|*.pyc|*.pre-*) continue ;;
        esac
        sub="${${f:t}#TaiAi-}"
        help_out=$("$py" "$f" --help 2>/dev/null) || continue
        commands=$(echo "$help_out" | grep -oE '\{[a-z0-9_,-]+\}' | head -1 \
            | tr -d '{}' | tr ',' ' ')
        _TaiAi_subs[$sub]="$commands"
    done
}

_TaiAi() {
    [[ ${#_TaiAi_subs} -eq 0 ]] && _TaiAi_refresh

    local cmd="${words[1]}"

    if [[ "$cmd" == "TaiAi" ]]; then
        if (( CURRENT == 2 )); then
            local -a subs=(${(k)_TaiAi_subs} help)
            _describe 'subcommand' subs
            return
        fi
        local sub="${words[2]}"
        if [[ "$sub" == "help" ]] && (( CURRENT == 3 )); then
            local -a subs=(${(k)_TaiAi_subs})
            _describe 'subcommand' subs
            return
        fi
        if (( CURRENT == 3 )); then
            local -a sc=(${(s/ /)_TaiAi_subs[$sub]})
            _describe 'command' sc
            return
        fi
        return
    fi

    # TaiAi-foo <tab>
    local sub="${cmd#TaiAi-}"
    if (( CURRENT == 2 )); then
        local -a sc=(${(s/ /)_TaiAi_subs[$sub]})
        _describe 'command' sc
        return
    fi
}

_TaiAi "$@"
