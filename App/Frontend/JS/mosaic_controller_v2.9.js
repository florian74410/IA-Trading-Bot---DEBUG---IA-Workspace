/* IA-TB v2.9 - Mosaïque controller
 * Declarative layout only: no arbitrary HTML/CSS/JS may be supplied by the AI.
 */
(function (global) {
  'use strict';

  const ALLOWED_COMMANDS = new Set([
    'mosaic.move',
    'mosaic.resize',
    'mosaic.show',
    'mosaic.hide',
    'mosaic.swap',
    'mosaic.apply',
    'mosaic.reset'
  ]);

  function integer(value, min, max, name) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(name + ' invalide.');
    return n;
  }

  class IATBMosaicController {
    constructor(options) {
      const o = options || {};
      this.container = o.container;
      this.onChange = typeof o.onChange === 'function' ? o.onChange : null;
      this.defaultLayout = JSON.parse(JSON.stringify(o.defaultLayout || {}));
      this.layout = JSON.parse(JSON.stringify(o.layout || o.defaultLayout || {}));
      this.modules = new Map();
      if (!this.container) throw new Error('Conteneur Mosaïque manquant.');
      this.scan();
      this.apply(this.layout, false);
    }

    scan() {
      this.modules.clear();
      this.container.querySelectorAll('[data-mosaic-id]').forEach((el) => {
        const id = String(el.getAttribute('data-mosaic-id') || '').trim();
        if (id) this.modules.set(id, el);
      });
    }

    assertModule(id) {
      const safe = String(id || '').trim();
      if (!safe || !this.modules.has(safe)) throw new Error('Module Mosaïque inconnu: ' + safe);
      return safe;
    }

    normalizeItem(id, item) {
      this.assertModule(id);
      const src = item || {};
      return {
        col: integer(src.col == null ? 1 : src.col, 1, 12, 'col'),
        row: integer(src.row == null ? 1 : src.row, 1, 100, 'row'),
        w: integer(src.w == null ? 4 : src.w, 1, 12, 'w'),
        h: integer(src.h == null ? 4 : src.h, 1, 40, 'h'),
        visible: src.visible !== false,
        order: integer(src.order == null ? 0 : src.order, -100, 100, 'order')
      };
    }

    normalizeLayout(layout) {
      if (!layout || typeof layout !== 'object' || Array.isArray(layout)) throw new Error('Layout invalide.');
      const out = {};
      for (const id of Object.keys(layout).slice(0, 40)) {
        if (!this.modules.has(id)) continue;
        out[id] = this.normalizeItem(id, layout[id]);
      }
      return out;
    }

    render() {
      for (const [id, el] of this.modules.entries()) {
        const item = this.layout[id];
        if (!item) continue;
        el.hidden = item.visible === false;
        el.style.setProperty('--mosaic-col', String(item.col));
        el.style.setProperty('--mosaic-row', String(item.row));
        el.style.setProperty('--mosaic-w', String(item.w));
        el.style.setProperty('--mosaic-h', String(item.h));
        el.style.order = String(item.order || 0);
      }
    }

    persist() {
      if (this.onChange) this.onChange(JSON.parse(JSON.stringify(this.layout)));
      this.container.dispatchEvent(new CustomEvent('ia-tb:mosaic-change', {
        detail: { layout: JSON.parse(JSON.stringify(this.layout)) }
      }));
    }

    apply(layout, persist) {
      this.layout = this.normalizeLayout(layout);
      this.render();
      if (persist !== false) this.persist();
    }

    patch(id, changes) {
      const safeId = this.assertModule(id);
      const current = this.layout[safeId] || { col: 1, row: 1, w: 4, h: 4, visible: true, order: 0 };
      this.layout[safeId] = this.normalizeItem(safeId, Object.assign({}, current, changes || {}));
      this.render();
      this.persist();
    }

    swap(a, b) {
      const idA = this.assertModule(a);
      const idB = this.assertModule(b);
      const A = this.layout[idA];
      const B = this.layout[idB];
      if (!A || !B) throw new Error('Layout incomplet pour swap.');
      this.layout[idA] = Object.assign({}, A, { col: B.col, row: B.row, w: B.w, h: B.h, order: B.order });
      this.layout[idB] = Object.assign({}, B, { col: A.col, row: A.row, w: A.w, h: A.h, order: A.order });
      this.render();
      this.persist();
    }

    handleCommand(command) {
      if (!command || typeof command !== 'object') throw new Error('Commande Mosaïque invalide.');
      const type = String(command.type || '');
      if (!ALLOWED_COMMANDS.has(type)) throw new Error('Commande Mosaïque refusee: ' + type);

      switch (type) {
        case 'mosaic.move':
          this.patch(command.module, { col: command.col, row: command.row, order: command.order == null ? 0 : command.order });
          break;
        case 'mosaic.resize':
          this.patch(command.module, { w: command.w, h: command.h });
          break;
        case 'mosaic.show':
          this.patch(command.module, { visible: true });
          break;
        case 'mosaic.hide':
          this.patch(command.module, { visible: false });
          break;
        case 'mosaic.swap':
          this.swap(command.a, command.b);
          break;
        case 'mosaic.apply':
          this.apply(command.layout, true);
          break;
        case 'mosaic.reset':
          this.apply(this.defaultLayout, true);
          break;
        default:
          throw new Error('Commande Mosaïque non prise en charge.');
      }
      return { ok: true, layout: JSON.parse(JSON.stringify(this.layout)) };
    }
  }

  global.IATBMosaicController = IATBMosaicController;
})(window);
