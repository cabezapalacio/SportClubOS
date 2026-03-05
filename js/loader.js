/**
 * SportClub Tucumán — loader.js
 * ==============================
 * Carga los módulos ES6 y los expone en window.SC
 * para que app.js (script clásico) pueda acceder a ellos.
 *
 * Orden de carga garantizado:
 *   config → utils → store → api → sync → window.SC ready
 */

import * as Config from './modules/config.js';
import * as Utils  from './modules/utils.js';
import * as Store  from './modules/store.js';
import * as Api    from './modules/api.js';
import * as Sync   from './modules/sync.js';

// Exponer todo en window.SC
window.SC = {
  config: Config,
  utils:  Utils,
  store:  Store,
  api:    Api,
  sync:   Sync,
  state:  Store.state,   // acceso directo al estado
  version: Config.APP_VERSION,
};

// Marcar como listo
window.SC_READY = true;
document.dispatchEvent(new CustomEvent('sc:ready'));

console.log(`[SportClub] v${Config.APP_VERSION} — módulos cargados`);
