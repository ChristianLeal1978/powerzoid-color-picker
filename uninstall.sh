#!/usr/bin/env bash
# ══════════════════════════════════════════════════════
#  PowerZoid Color Picker — Desinstalador
#  Uso: bash uninstall.sh
# ══════════════════════════════════════════════════════
set -euo pipefail

UUID="powerzoid-color-picker@cleal.cl"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

echo -e "\n${BOLD}=== PowerZoid Color Picker — Desinstalador ===${NC}\n"

gnome-extensions disable "$UUID" 2>/dev/null || true
rm -rf "$DEST"

echo -e "  ✓  Extensión eliminada de $DEST"
echo ""
echo -e "${DIM}Conservado (elimínalo manualmente si quieres):${NC}"
echo -e "${DIM}  ~/.config/powerzoid-color-picker/${NC}"
echo ""
