/**
 * SportClub Tucumán — Sincronización
 * ====================================
 * Gestión completa del ciclo sync:
 * - Cola offline con reintentos
 * - Polling adaptativo con backoff exponencial
 * - Merge inteligente (last-write-wins por timestamp)
 * - Status de conectividad en UI
 */

import { state, saveCache, saveOfflineQueue, enqueueOperation } from './store.js';
import {
  apiGet, apiAppend, apiUpsert, apiBulk, apiPing,
  ventaToRow, rowToVenta,
  socioToRow, rowToSocio,
  lockerToRow, rowToLocker,
  packToRow, rowToPack,
  turnoToRow, rowToTurno,
  egresoToRow, rowToEgreso,
  contactoToRow, rowToContacto,
  crmToRows, rowsToCrm,
} from './api.js';
import { TIMING, SHEETS } from './config.js';

// ── Estado interno ────────────────────────────────────────────────────
let _timer       = null;
let _backoffMs   = TIMING.syncInterval;
let _statusEl    = null;   // referencia al badge de status

// ── UI de estado ──────────────────────────────────────────────────────

export function setSyncStatusEl(el) { _statusEl = el; }

export function setSyncStatus(status, msg) {
  if (!_statusEl) {
    _statusEl = document.getElementById('sync-status-badge');
  }
  if (!_statusEl) return;

  const icons = { online:'🟢', saving:'🟡', loading:'🟡', offline:'🔴', error:'🔴' };
  _statusEl.textContent = (icons[status] || '⚪') + ' ' + msg;
  _statusEl.dataset.status = status;
  state.connected = (status === 'online' || status === 'saving' || status === 'loading');
}

// ── Conectividad ──────────────────────────────────────────────────────

export async function testConexion() {
  if (!state.gasUrl) {
    setSyncStatus('offline', 'Sin configurar');
    return false;
  }
  try {
    setSyncStatus('loading', 'Conectando...');
    await apiPing();
    setSyncStatus('online', 'Conectado');
    state.connected  = true;
    state.syncErrors = 0;
    _backoffMs = TIMING.syncInterval;
    return true;
  } catch(e) {
    setSyncStatus('offline', 'Sin conexión');
    state.connected = false;
    return false;
  }
}

// ── Carga inicial ─────────────────────────────────────────────────────

export async function loadFromRemote() {
  if (!state.gasUrl) return false;
  setSyncStatus('loading', 'Cargando datos...');
  try {
    const [
      rowsVentas, rowsSocios, rowsLockers, rowsPacks,
      rowsTurnos, rowsEgresos, rowsContactos, rowsCrm,
    ] = await Promise.all([
      apiGet(SHEETS.ventas).catch(()=>[]),
      apiGet(SHEETS.socios).catch(()=>[]),
      apiGet(SHEETS.lockers).catch(()=>[]),
      apiGet(SHEETS.packsCafe).catch(()=>[]),
      apiGet(SHEETS.turnos).catch(()=>[]),
      apiGet(SHEETS.egresos).catch(()=>[]),
      apiGet(SHEETS.contactos).catch(()=>[]),
      apiGet(SHEETS.crm).catch(()=>[]),
    ]);

    // La fuente remota reemplaza la cache local al iniciar
    if (rowsVentas.length)    state.ventas     = rowsVentas.filter(r=>r[0]).map(rowToVenta);
    if (rowsSocios.length)    state.socios      = rowsSocios.filter(r=>r[0]).map(rowToSocio);
    if (rowsPacks.length)     state.packsCafe   = rowsPacks.filter(r=>r[0]).map(rowToPack);
    if (rowsTurnos.length)    state.turnos      = rowsTurnos.filter(r=>r[0]).map(rowToTurno);
    if (rowsEgresos.length)   state.egresos     = rowsEgresos.filter(r=>r[0]).map(rowToEgreso);
    if (rowsContactos.length) state.contactos   = rowsContactos.filter(r=>r[0]).map(rowToContacto);
    if (rowsCrm.length)       state.crmNotas    = rowsToCrm(rowsCrm.filter(r=>r[0]));

    // Lockers: separar por sexo
    if (rowsLockers.length) {
      const all = rowsLockers.filter(r=>r[0]).map(rowToLocker);
      state.lockersH = all.filter(l => l.sexo === 'H');
      state.lockersM = all.filter(l => l.sexo === 'M');
    }

    saveCache();
    _updateLastSync();
    setSyncStatus('online', 'Sincronizado ' + _hhmm());
    return true;

  } catch(e) {
    _handleSyncError(e, 'loadFromRemote');
    return false;
  }
}

// ── Merge incremental (polling) ───────────────────────────────────────

export async function mergeFromRemote() {
  if(state.syncPending || (state.offlineQueue && state.offlineQueue.length>0)) return;

  if (!state.gasUrl || state.syncing) return;
  // Skip si sincronizó hace menos del cooldown
  if (state.lastSyncTime &&
      Date.now() - state.lastSyncTime < TIMING.syncCooldown) return;

  state.syncing = true;
  try {
    const [
      rowsVentas, rowsSocios, rowsLockers, rowsPacks,
      rowsTurnos, rowsEgresos, rowsContactos,
    ] = await Promise.all([
      apiGet(SHEETS.ventas).catch(()=>[]),
      apiGet(SHEETS.socios).catch(()=>[]),
      apiGet(SHEETS.lockers).catch(()=>[]),
      apiGet(SHEETS.packsCafe).catch(()=>[]),
      apiGet(SHEETS.turnos).catch(()=>[]),
      apiGet(SHEETS.egresos).catch(()=>[]),
      apiGet(SHEETS.contactos).catch(()=>[]),
    ]);

    let changed = false;

    // Ventas: merge por ID, last-write-wins por timestamp
    if (rowsVentas.length) {
      const remoto    = rowsVentas.filter(r=>r[0]).map(rowToVenta);
      const localMap  = new Map(state.ventas.map(v => [String(v.id), v]));
      let   nuevas    = 0;

      remoto.forEach(rv => {
        const lv = localMap.get(String(rv.id));
        if (!lv) {
          // Nueva venta desde otra PC
          state.ventas.push(rv);
          nuevas++;
        } else {
          // Conflicto: gana el más reciente (updatedAt > timestamp)
          const rt = rv.updatedAt || rv.timestamp || 0;
          const lt = lv.updatedAt || lv.timestamp || 0;
          if (rt > lt) {
            // Remoto más nuevo → actualizar local
            Object.assign(lv, rv);
            nuevas++;
          }
        }
      });

      if (nuevas) {
        state.ventas.sort((a,b) => (a.timestamp||0) - (b.timestamp||0));
        changed = true;
      }
    }

    // Socios: reemplazar si remoto tiene datos
    if (rowsSocios.length) {
      state.socios  = rowsSocios.filter(r=>r[0]).map(rowToSocio);
      changed = true;
    }

    // Lockers: reemplazar
    if (rowsLockers.length) {
      const all     = rowsLockers.filter(r=>r[0]).map(rowToLocker);
      state.lockersH = all.filter(l => l.sexo === 'H');
      state.lockersM = all.filter(l => l.sexo === 'M');
      changed = true;
    }

    // PacksCafé: merge por ID
    if (rowsPacks.length) {
      const remPacks  = rowsPacks.filter(r=>r[0]).map(rowToPack);
      const packMap   = new Map(state.packsCafe.map(p => [String(p.id), p]));
      remPacks.forEach(rp => {
        if (!packMap.has(String(rp.id))) state.packsCafe.push(rp);
        else Object.assign(packMap.get(String(rp.id)), rp);
      });
      changed = true;
    }

    // Turnos: merge por ID
    if (rowsTurnos.length) {
      const remTurnos = rowsTurnos.filter(r=>r[0]).map(rowToTurno);
      const tMap      = new Map(state.turnos.map(t => [String(t.id), t]));
      remTurnos.forEach(rt => {
        if (!tMap.has(String(rt.id))) state.turnos.push(rt);
      });
      changed = true;
    }

    // Egresos: merge por ID
    if (rowsEgresos.length) {
      const remEg = rowsEgresos.filter(r=>r[0]).map(rowToEgreso);
      const eMap  = new Map(state.egresos.map(e => [String(e.id), e]));
      remEg.forEach(re => {
        if (!eMap.has(String(re.id))) state.egresos.push(re);
        else Object.assign(eMap.get(String(re.id)), re);
      });
      changed = true;
    }

    if (changed) saveCache();

    _updateLastSync();
    setSyncStatus('online', 'Sincronizado ' + _hhmm());
    state.syncErrors = 0;
    _backoffMs = TIMING.syncInterval;

    return changed;

  } catch(e) {
    _handleSyncError(e, 'mergeFromRemote');
    return false;
  } finally {
    state.syncing = false;
  }
}

// ── Guardar cambios locales → remoto ──────────────────────────────────

let _saveDebounce = null;

/** Disparar sync con debounce */
export function scheduleSave() {
  state.syncPending = true;
  clearTimeout(_saveDebounce);
  _saveDebounce = setTimeout(flushPendingSaves, TIMING.syncDebounce);
}

/** Enviar todos los cambios pendientes */
export async function flushPendingSaves() {
  if (!state.gasUrl || state.syncing) return;
  if (!state.syncPending && state.offlineQueue.length === 0) return;

  state.syncing = true;
  setSyncStatus('saving', 'Guardando...');

  try {
    // 1. Procesar cola offline primero
    if (state.offlineQueue.length > 0) {
      await _processOfflineQueue();
    }

    // 2. Ventas marcadas como _dirty (anuladas/editadas)
    const dirty = state.ventas.filter(v => v._dirty);
    for (const v of dirty) {
      await apiUpsert(SHEETS.ventas, v.id, ventaToRow(v));
      delete v._dirty;
    }

    // 3. Bulk sync para entidades pequeñas (socios, lockers, etc.)
    await Promise.all([
      apiBulk(SHEETS.socios,    state.socios.map(socioToRow)),
      apiBulk(SHEETS.lockers,   [
        ...state.lockersH.map(l => lockerToRow(l, 'H')),
        ...state.lockersM.map(l => lockerToRow(l, 'M')),
      ]),
      apiBulk(SHEETS.packsCafe, state.packsCafe.map(packToRow)),
      apiBulk(SHEETS.turnos,    state.turnos.map(turnoToRow)),
      apiBulk(SHEETS.egresos,   state.egresos.map(egresoToRow)),
      apiBulk(SHEETS.contactos, state.contactos.map(contactoToRow)),
      apiBulk(SHEETS.crm,       crmToRows(state.crmNotas)),
    ]);

    state.syncPending = false;
    _updateLastSync();
    setSyncStatus('online', 'Sincronizado ' + _hhmm());

  } catch(e) {
    _handleSyncError(e, 'flushPendingSaves');
    // Guardar en cola offline si hay error de red
    if (e.message.includes('HTTP') || e.message.includes('fetch') || !navigator.onLine) {
      setSyncStatus('offline', 'Sin conexión — datos en cola');
    }
  } finally {
    state.syncing = false;
  }
}

/** Agregar venta nueva directamente (append inmediato) */
export async function pushNewVenta(v) {
  if (!state.gasUrl) {
    enqueueOperation({ type:'append', sheet: SHEETS.ventas, row: ventaToRow(v) });
    return;
  }
  try {
    await apiAppend(SHEETS.ventas, ventaToRow(v));
  } catch(e) {
    // Encolar para retry
    enqueueOperation({ type:'append', sheet: SHEETS.ventas, row: ventaToRow(v), id: v.id });
    console.warn('pushNewVenta → encolada:', e.message);
  }
}

// ── Cola offline ──────────────────────────────────────────────────────

async function _processOfflineQueue() {
  const queue   = [...state.offlineQueue];
  const success = [];

  for (const op of queue) {
    try {
      if (op.type === 'append') {
        await apiAppend(op.sheet, op.row);
      } else if (op.type === 'upsert') {
        await apiUpsert(op.sheet, op.id, op.row);
      } else if (op.type === 'bulk') {
        await apiBulk(op.sheet, op.rows);
      }
      success.push(op);
    } catch(e) {
      // Dejar en cola para próximo intento
      console.warn('Cola offline: error en op', op.type, op.sheet, e.message);
      break; // parar al primer error (la red sigue caída)
    }
  }

  if (success.length > 0) {
    state.offlineQueue = state.offlineQueue.filter(op => !success.includes(op));
    saveOfflineQueue();
  }
}

// ── Polling adaptativo ────────────────────────────────────────────────

export function startPolling() {
  if (_timer) clearInterval(_timer);

  _timer = setInterval(async () => {
    if (!state.gasUrl) return;

    if (state.syncPending || state.offlineQueue.length > 0) {
      await flushPendingSaves();
    } else {
      await mergeFromRemote();
    }
  }, TIMING.syncInterval);

  // Escuchar reconexión
  window.addEventListener('online',  _onOnline);
  window.addEventListener('offline', _onOffline);
}

export function stopPolling() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  window.removeEventListener('online',  _onOnline);
  window.removeEventListener('offline', _onOffline);
}

function _onOnline() {
  setSyncStatus('loading', 'Reconectando...');
  setTimeout(async () => {
    const ok = await testConexion();
    if (ok) flushPendingSaves();
  }, 1000);
}

function _onOffline() {
  state.connected = false;
  setSyncStatus('offline', 'Sin conexión');
}

// ── Helpers internos ──────────────────────────────────────────────────

function _handleSyncError(e, ctx) {
  state.syncErrors++;
  console.error(`[sync:${ctx}]`, e.message);

  const msg = navigator.onLine
    ? `Error Sheets: ${e.message.slice(0, 40)}`
    : 'Sin conexión';

  setSyncStatus('error', msg);

  // Backoff exponencial
  _backoffMs = Math.min(_backoffMs * 2, TIMING.backoffMax);
}

function _updateLastSync() {
  state.lastSyncTime = Date.now();
  localStorage.setItem('sc_last_sync', _hhmm());
}

function _hhmm() {
  return new Date().toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
}
