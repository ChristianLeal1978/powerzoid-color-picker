#!/usr/bin/env bash
# ══════════════════════════════════════════════════════
#  PowerZoid Color Picker — Instalador para Fedora / GNOME 45-50
#  Uso: bash install.sh
# ══════════════════════════════════════════════════════
set -euo pipefail

UUID="powerzoid-color-picker@cleal.cl"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

G='\033[0;32m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

echo -e "\n${BOLD}=== PowerZoid Color Picker — Instalador ===${NC}\n"

mkdir -p "$DEST"
cp "$DIR/extension/metadata.json"  "$DEST/"
cp "$DIR/extension/extension.js"   "$DEST/"
cp "$DIR/extension/stylesheet.css" "$DEST/"
echo -e "  ${G}✓${NC}  Archivos instalados en $DEST"

echo ""
echo -e "${BOLD}Cierra sesión y vuelve a entrar${NC} para que GNOME la detecte."
echo -e "${DIM}(necesario la primera vez: el shell no descubre UUIDs nuevos en caliente)${NC}"
echo ""
echo -e "Después, habilítala:"
echo -e "  gnome-extensions enable $UUID"
echo ""
echo -e "Verifica:  gnome-extensions info $UUID"
echo ""
