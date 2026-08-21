/**
 * PowerZoid Color Picker — GNOME Shell Extension
 * UUID: powerzoid-color-picker@cleal.cl
 *
 * Clic izquierdo  → activa el cuentagotas (el cursor se vuelve una cruz;
 *                   el siguiente clic en pantalla captura ese color)
 * Clic derecho    → menú (historial, alineación, tamaño de letra)
 * Escape          → cancela la captura en curso
 */

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as GrabHelper from 'resource:///org/gnome/shell/ui/grabHelper.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

Gio._promisify(Shell.Screenshot.prototype, 'pick_color');

const VALID_ALIGNS = ['left', 'center', 'right'];

const DEFAULT_FONT_SIZE = 13;
const MIN_FONT_SIZE     = 8;
const MAX_FONT_SIZE     = 20;

const HISTORY_MAX = 8;

const CONFIG_DIR      = `${GLib.get_home_dir()}/.config/powerzoid-color-picker`;
const POSITION_PATH   = `${CONFIG_DIR}/panel-position`;
const FONT_SIZE_PATH  = `${CONFIG_DIR}/font-size`;


// ─────────────────────────────────────────────────────────────────────────────
// Color: Cogl.Color (componentes 0-255) → notación HTML
// ─────────────────────────────────────────────────────────────────────────────

function clampByte(v) {
    return Math.max(0, Math.min(255, Math.round(v)));
}

function colorToHex(color) {
    const bytes = [color.red, color.green, color.blue].map(clampByte);
    return '#' + bytes.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function colorToRgb(color) {
    const [r, g, b] = [color.red, color.green, color.blue].map(clampByte);
    return `rgb(${r}, ${g}, ${b})`;
}


// ─────────────────────────────────────────────────────────────────────────────
// Overlay de captura: cubre toda la pantalla, cursor en cruz, un clic capta
// el color bajo el puntero. Basado en el mismo patrón que usa la propia UI
// de capturas de GNOME Shell (js/ui/screenshot.js, clase PickPixel/SelectArea):
// Shell.Screenshot.pick_color() + GrabHelper para el grab modal de teclado/
// mouse (Escape cancela automáticamente).
// ─────────────────────────────────────────────────────────────────────────────

const ColorPickOverlay = GObject.registerClass(
class ColorPickOverlay extends St.Widget {

    _init() {
        super._init({ visible: false, reactive: true, x: 0, y: 0 });
        Main.uiGroup.add_child(this);

        this.add_constraint(new Clutter.BindConstraint({
            source: global.stage,
            coordinate: Clutter.BindCoordinate.ALL,
        }));

        this._screenshot = new Shell.Screenshot();
        this._grabHelper = new GrabHelper.GrabHelper(this);
        this._result     = null;

        const clickGesture = new Clutter.ClickGesture();
        clickGesture.connect('recognize', async () => {
            const { x, y } = clickGesture.get_coords_abs();
            await this._pickColor(x, y);
            this._grabHelper.ungrab();
        });
        this.add_action(clickGesture);

        this.set_cursor_type(Clutter.CursorType.CROSSHAIR);
    }

    async _pickColor(x, y) {
        try {
            const [color] = await this._screenshot.pick_color(x, y);
            this._result = color ?? null;
        } catch (_e) {
            this._result = null;
        }
    }

    async pickAsync() {
        Main.uiGroup.set_child_above_sibling(this, null);
        this.show();

        try {
            await this._grabHelper.grabAsync({ actor: this });
        } finally {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this.destroy();
                return GLib.SOURCE_REMOVE;
            });
        }

        return this._result;
    }

    // Cancela una captura en curso (usado al deshabilitar la extensión).
    cancel() {
        this._grabHelper.ungrab();
    }
});


// ─────────────────────────────────────────────────────────────────────────────
// Indicador en el panel
// ─────────────────────────────────────────────────────────────────────────────

const ColorPickerIndicator = GObject.registerClass(
class ColorPickerIndicator extends PanelMenu.Button {

    _init(extension, initialAlign = 'left', initialFontSize = DEFAULT_FONT_SIZE) {
        super._init(0.5, 'PowerZoid Color Picker');

        this._ext          = extension;
        this._currentAlign = initialAlign;
        this._fontSize     = initialFontSize;
        this._lastColor    = null;   // { hex, rgb }
        this._history      = [];     // [{ hex, rgb }, ...] más reciente primero
        this._picking      = false;
        this._activeOverlay = null;

        // ── Panel: cuadrado de color + código HEX ──
        const box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });

        this._swatch = new St.Widget({
            style_class: 'powerzoid-color-picker-swatch',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._label = new St.Label({
            text:    ' Color',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'powerzoid-color-picker-label',
        });

        box.add_child(this._swatch);
        box.add_child(this._label);
        this.add_child(box);

        this._applyFontSize();

        // ── Clic izquierdo → capturar color · clic derecho → menú ──
        // PanelMenu.Button trae un único Clutter.ClickGesture que abre el
        // menú con cualquier botón; lo desactivamos y usamos dos gestos
        // propios, uno por botón (mismo patrón que Powerzoid Memory).
        this._clickGesture?.set_enabled(false);

        this._leftClickGesture = new Clutter.ClickGesture();
        this._leftClickGesture.set_required_button(Clutter.BUTTON_PRIMARY);
        this._leftClickGesture.set_recognize_on_press(true);
        this._leftClickGesture.connect('recognize', () => this._startPicking());
        this.add_action(this._leftClickGesture);

        this._rightClickGesture = new Clutter.ClickGesture();
        this._rightClickGesture.set_required_button(Clutter.BUTTON_SECONDARY);
        this._rightClickGesture.set_recognize_on_press(true);
        this._rightClickGesture.connect('recognize', () => {
            if (!this.menu.isOpen) this.menu.open();
        });
        this.add_action(this._rightClickGesture);

        this._buildMenu();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Captura de color
    // ─────────────────────────────────────────────────────────────────────

    async _startPicking() {
        if (this._picking) return;
        if (this.menu.isOpen) this.menu.close();

        this._picking = true;
        const overlay = new ColorPickOverlay();
        this._activeOverlay = overlay;

        const color = await overlay.pickAsync();

        this._activeOverlay = null;
        this._picking = false;

        if (color) this._applyColor(color);
    }

    _applyColor(color) {
        const hex = colorToHex(color);
        const rgb = colorToRgb(color);

        this._lastColor = { hex, rgb };
        this._history.unshift({ hex, rgb });
        if (this._history.length > HISTORY_MAX) this._history.length = HISTORY_MAX;

        this._swatch.set_style(`background-color: ${hex};`);
        this._label.set_text(` ${hex}`);

        // Pequeño parpadeo como confirmación visual de la captura.
        this._swatch.ease({
            opacity: 90, duration: 80, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this._swatch.ease({ opacity: 255, duration: 150 }),
        });

        this._updateColorSection();
        this._updateHistorySection();
    }

    _copyToClipboard(text) {
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Construcción del menú
    // ─────────────────────────────────────────────────────────────────────

    _buildMenu() {
        const titleItem = new PopupMenu.PopupMenuItem('PowerZoid Color Picker', { reactive: false });
        titleItem.label.set_style('font-weight: bold;');
        this.menu.addMenuItem(titleItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const pickItem = new PopupMenu.PopupMenuItem('◎  Elegir color');
        pickItem.connect('activate', () => this._startPicking());
        this.menu.addMenuItem(pickItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ── Último color capturado (clic en HEX/RGB para copiar) ──
        this._colorSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._colorSection);
        this._updateColorSection();

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ── Historial ──
        this._historyTitleItem = new PopupMenu.PopupMenuItem('  Historial', { reactive: false });
        this._historyTitleItem.label.set_style('font-weight: bold; color: #aaa;');
        this._historyTitleItem.visible = false;
        this.menu.addMenuItem(this._historyTitleItem);

        this._historySection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._historySection);
        this._updateHistorySection();

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ── Posición en la barra ──
        this._posSubMenu = new PopupMenu.PopupSubMenuMenuItem('Posición en barra');
        this.menu.addMenuItem(this._posSubMenu);

        this._alignItems = {};
        [
            ['← Alinear a la izquierda', 'left'],
            ['↔ Alinear al centro',       'center'],
            ['→ Alinear a la derecha',    'right'],
        ].forEach(([label, align]) => {
            const item = new PopupMenu.PopupMenuItem(label);
            this._alignItems[align] = item;
            item.connect('activate', () => this._setAlignment(align));
            this._posSubMenu.menu.addMenuItem(item);
        });
        this._updateAlignMarks(this._currentAlign);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ── Tamaño de letra ──
        this._fontSizeItem = new PopupMenu.PopupMenuItem(
            this._fontSizeLabel(), { reactive: false }
        );
        this._fontSizeItem.label.set_style('color: #aaa; font-style: italic;');
        this.menu.addMenuItem(this._fontSizeItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const increaseItem = new PopupMenu.PopupMenuItem('A+   Aumentar letra');
        increaseItem.connect('activate', () => this._changeFontSize(1));
        this.menu.addMenuItem(increaseItem);

        const decreaseItem = new PopupMenu.PopupMenuItem('A−   Reducir letra');
        decreaseItem.connect('activate', () => this._changeFontSize(-1));
        this.menu.addMenuItem(decreaseItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const resetItem = new PopupMenu.PopupMenuItem('↺    Restablecer');
        resetItem.connect('activate', () => {
            this._fontSize = DEFAULT_FONT_SIZE;
            this._applyFontSize();
            this._ext.saveFontSize(this._fontSize);
        });
        this.menu.addMenuItem(resetItem);
    }

    _updateColorSection() {
        this._colorSection.removeAll();

        if (!this._lastColor) {
            this._colorSection.addMenuItem(
                new PopupMenu.PopupMenuItem('  Aún no has elegido ningún color', { reactive: false }));
            return;
        }

        const { hex, rgb } = this._lastColor;

        const hexItem = new PopupMenu.PopupMenuItem(`  HEX   ${hex}`);
        hexItem.connect('activate', () => this._copyToClipboard(hex));
        this._colorSection.addMenuItem(hexItem);

        const rgbItem = new PopupMenu.PopupMenuItem(`  RGB   ${rgb}`);
        rgbItem.connect('activate', () => this._copyToClipboard(rgb));
        this._colorSection.addMenuItem(rgbItem);

        const hintItem = new PopupMenu.PopupMenuItem('  (clic para copiar)', { reactive: false });
        hintItem.label.set_style('color: #888; font-style: italic;');
        this._colorSection.addMenuItem(hintItem);
    }

    _updateHistorySection() {
        this._historySection.removeAll();
        this._historyTitleItem.visible = this._history.length > 0;

        for (const { hex } of this._history) {
            const item = new PopupMenu.PopupBaseMenuItem();

            const swatch = new St.Widget({
                style_class: 'powerzoid-color-picker-history-swatch',
                style:       `background-color: ${hex}; width: 14px; height: 14px;`,
                y_align:     Clutter.ActorAlign.CENTER,
            });
            const label = new St.Label({
                text:    `  ${hex}`,
                y_align: Clutter.ActorAlign.CENTER,
            });

            item.add_child(swatch);
            item.add_child(label);
            item.connect('activate', () => this._copyToClipboard(hex));
            this._historySection.addMenuItem(item);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Tamaño de letra
    // ─────────────────────────────────────────────────────────────────────

    _fontSizeLabel() {
        return `Tamaño: ${this._fontSize} px`;
    }

    _changeFontSize(delta) {
        this._fontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, this._fontSize + delta));
        this._applyFontSize();
        this._ext.saveFontSize(this._fontSize);
    }

    _applyFontSize() {
        this._label.set_style(`font-size: ${this._fontSize}px;`);
        const side = Math.round(this._fontSize * 0.9);
        this._swatch.set_size(side, side);
        this._fontSizeItem?.label.set_text(this._fontSizeLabel());
    }

    // ─────────────────────────────────────────────────────────────────────
    // Alineación
    // ─────────────────────────────────────────────────────────────────────

    _setAlignment(align) {
        if (align === this._currentAlign) return;
        this._ext.savePanelPosition(align);

        // Reinicio completo de la extensión: evita un bug de rendering de
        // GNOME Shell al reubicar actores directamente entre boxes del panel.
        const uuid = this._ext.uuid;
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            Main.extensionManager.disableExtension(uuid);
            Main.extensionManager.enableExtension(uuid);
            return GLib.SOURCE_REMOVE;
        });
    }

    _updateAlignMarks(activeAlign) {
        Object.entries(this._alignItems).forEach(([align, item]) => {
            item.setOrnament(
                align === activeAlign
                    ? PopupMenu.Ornament.DOT
                    : PopupMenu.Ornament.NONE
            );
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // Limpieza
    // ─────────────────────────────────────────────────────────────────────

    destroy() {
        this._activeOverlay?.cancel();
        this._activeOverlay = null;
        super.destroy();
    }
});


// ─────────────────────────────────────────────────────────────────────────────
// Extensión
// ─────────────────────────────────────────────────────────────────────────────

export default class PowerZoidColorPickerExtension extends Extension {

    enable() {
        const align    = this._loadPanelPosition();
        const fontSize = this._loadFontSize();
        this._indicator = new ColorPickerIndicator(this, align, fontSize);
        Main.panel.addToStatusArea(this.uuid, this._indicator, -1, align);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }

    _ensureConfigDir() {
        try {
            const dir = Gio.File.new_for_path(CONFIG_DIR);
            dir.make_directory_with_parents(null);
        } catch (_e) {}
    }

    _loadPanelPosition() {
        try {
            const file = Gio.File.new_for_path(POSITION_PATH);
            const [, bytes] = file.load_contents(null);
            const val = new TextDecoder().decode(bytes).trim();
            return VALID_ALIGNS.includes(val) ? val : 'left';
        } catch (_e) {}
        return 'left';
    }

    savePanelPosition(align) {
        this._ensureConfigDir();
        try {
            const file = Gio.File.new_for_path(POSITION_PATH);
            file.replace_contents(
                new TextEncoder().encode(align),
                null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
        } catch (_e) {}
    }

    _loadFontSize() {
        try {
            const file = Gio.File.new_for_path(FONT_SIZE_PATH);
            const [, bytes] = file.load_contents(null);
            const val = parseInt(new TextDecoder().decode(bytes).trim(), 10);
            if (Number.isInteger(val))
                return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, val));
        } catch (_e) {}
        return DEFAULT_FONT_SIZE;
    }

    saveFontSize(size) {
        this._ensureConfigDir();
        try {
            const file = Gio.File.new_for_path(FONT_SIZE_PATH);
            file.replace_contents(
                new TextEncoder().encode(String(size)),
                null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
        } catch (_e) {}
    }
}
