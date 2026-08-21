# PowerZoid Color Picker — GNOME Shell Extension

Extensión para GNOME Shell que permite capturar el color de cualquier píxel de la pantalla y muestra su código HTML (HEX y RGB) directamente en la barra superior.

```
■ #3F8CFF
```

## Características

- **Cuadrado de color en la barra**: refleja siempre el último color capturado
- **Cuentagotas real**: clic izquierdo → el cursor se convierte en una cruz y el siguiente clic en cualquier parte de la pantalla captura ese color exacto (usa la misma API que el propio selector de color de GNOME)
- **Escape cancela** la captura en curso
- **Código HTML**: HEX (`#RRGGBB`) y RGB (`rgb(r, g, b)`), con un clic para copiar al portapapeles
- **Historial** de los últimos 8 colores capturados en la sesión, también copiables con un clic
- **Posición en la barra**: izquierda / centro / derecha, desde el menú (clic derecho)
- **Tamaño de letra ajustable**: A+ / A− / restablecer, igual que el resto de extensiones PowerZoid

## Requisitos

- GNOME Shell 45–50 (probado en GNOME Shell 50 / Fedora 44)
- Sin dependencias adicionales

## Instalación

```bash
git clone https://github.com/ChristianLeal1978/powerzoid-color-picker.git
cd powerzoid-color-picker
bash install.sh
gnome-session-quit --logout
```

Al iniciar sesión de nuevo, el selector de color aparecerá automáticamente en la barra superior.

## Uso

| Acción | Resultado |
|---|---|
| Clic izquierdo en el cuadrado | Activa el cuentagotas (cursor en cruz) |
| Clic en cualquier parte de la pantalla | Captura el color bajo el cursor |
| `Esc` durante la captura | Cancela sin cambiar el color actual |
| Clic derecho | Abre el menú (historial, posición, tamaño de letra) |
| Clic en un HEX/RGB del menú | Copia ese código al portapapeles |

## Desinstalar

```bash
bash uninstall.sh
```

o manualmente:

```bash
gnome-extensions disable powerzoid-color-picker@cleal.cl
rm -rf ~/.local/share/gnome-shell/extensions/powerzoid-color-picker@cleal.cl
```

## Cómo funciona

La captura usa `Shell.Screenshot.pick_color()`, la misma API nativa que utiliza la herramienta de capturas de pantalla de GNOME Shell para su propio cuentagotas. El overlay de captura (cursor en cruz, grab modal de teclado/mouse, cancelación con Escape) usa `GrabHelper`, el mismo mecanismo interno que usa GNOME Shell para sus propios diálogos modales.

La preferencia de posición y el tamaño de letra se guardan en `~/.config/powerzoid-color-picker/`.

## Compatibilidad

| GNOME Shell | Fedora  | Estado |
|-------------|---------|--------|
| 50          | 44      | ✅ Probado |
| 48          | 42–43   | ✅ Compatible |
| 45–47       | 39–41   | ✅ Compatible |

## Licencia

GPL-2.0 — ver [LICENSE](LICENSE)
