/**
 * SportClub Tucumán — Configuración Central
 * ==========================================
 * ÚNICA fuente de verdad para nombres de hojas, columnas,
 * versión, sedes y endpoints.
 * Para cambiar algo del sistema: editar SOLO este archivo.
 */

export const APP_VERSION = '2.0.0';
export const CACHE_BUST  = '?v=' + APP_VERSION;

// ── Sedes ────────────────────────────────────────────────────────────
export const SEDES = ['VIA 24', 'BARRIO NORTE'];

export const SEDE_PREFIX = {
  'VIA 24':       'SC-V24-',
  'BARRIO NORTE': 'SC-BN-',
};

export const SEDE_SEQ_KEY = {
  'VIA 24':       'sc_seq_v24',
  'BARRIO NORTE': 'sc_seq_bn',
};

// ── Google Apps Script endpoint ──────────────────────────────────────
// Reemplazar con la URL del Web App publicado en Apps Script
export const GAS_URL = ''; // ej: https://script.google.com/macros/s/XXXX/exec

// ── Nombres de hojas en Google Sheets ───────────────────────────────
export const SHEETS = {
  ventas:     'ventas',
  socios:     'socios',
  lockers:    'lockers',
  packsCafe:  'packs_cafe',
  turnos:     'turnos',
  egresos:    'egresos',
  contactos:  'contactos',
  crm:        'crm_notas',
  config:     'config',
};

// ── Rangos de lectura ────────────────────────────────────────────────
export const SHEET_RANGES = {
  ventas:    'ventas!A2:V',
  socios:    'socios!A2:J',
  lockers:   'lockers!A2:M',
  packs:     'packs_cafe!A2:K',
  turnos:    'turnos!A2:K',
  egresos:   'egresos!A2:I',
  contactos: 'contactos!A2:F',
  crm:       'crm_notas!A2:G',
  config:    'config!A1:B20',
};

// ── Encabezados exactos de cada hoja ────────────────────────────────
export const SHEET_HEADERS = {
  ventas: [
    'id','numero','fecha','hora','sede','cliente','concepto',
    'efectivo','transferencia','debito','credito','qr',
    'monto','metodo','obs',
    'anulada','anulacion_quien','anulacion_motivo',
    'timestamp','updatedAt',
  ],
  socios: [
    'nombre','fecha_pago','concepto','vigencia_hasta',
    'sede','estado','telefono','obs','timestamp','updatedAt',
  ],
  lockers: [
    'numero','sexo','socio','telefono','email',
    'vencimiento','tamano','precio','renovacion_auto',
    'fecha_asignado','ultima_renovacion','sede','updatedAt',
  ],
  packs_cafe: [
    'id','cliente','fecha','sede','fichas','fichas_disp',
    'fichas_tragadas','precio','metodo','obs','estado',
  ],
  turnos: [
    'id','fecha','hora_inicio','hora_fin',
    'persona_entra','persona_sale','recaudacion',
    'cant_ventas','sede','obs','cierre',
  ],
  egresos: [
    'id','fecha','descripcion','monto','categoria',
    'sede','quien','obs','updatedAt',
  ],
  contactos: ['nombre','telefono','email','sede','obs','updatedAt'],
  crm_notas: ['nombre','fecha','texto','tipo','quien','id','updatedAt'],
};

// ── LocalStorage keys ────────────────────────────────────────────────
export const KEYS = {
  ventas:      'sc_ventas',
  socios:      'sc_socios',
  lockers_h:   'sc_lockers_h',
  lockers_m:   'sc_lockers_m',
  packsCafe:   'sc_packs_cafe',
  turnos:      'sc_turnos',
  egresos:     'sc_egresos',
  contactos:   'sc_contactos',
  crmNotas:    'sc_crm_notas',
  crmResueltos:'sc_crm_resueltos',
  waLog:       'sc_wa_log',
  productos:   'sc_productos',
  cambios:     'sc_cambios',
  adminPass:   'sc_admin_pass',
  sede:        'sc_sede',
  tema:        'sc_tema',
  lastSync:    'sc_last_sync',
  gasUrl:      'sc_gas_url',      // URL del Apps Script (configurada por admin)
  gasToken:    'sc_gas_token',    // Token de API (hash simple)
  deviceId:    'sc_device_id',
  // Secuencias de numeración
  seqV24:      'sc_seq_v24',
  seqBN:       'sc_seq_bn',
  // Cola offline
  offlineQueue:'sc_offline_queue',
  // Backup auto
  backupAuto:  'sc_backup_auto',
  lastBackup:  'sc_last_backup',
};

// ── Roles y permisos ─────────────────────────────────────────────────
export const ROLES = {
  recepcion: {
    label: 'Recepción',
    secciones: [
      'dash-recepcion','caja','registrar','socios',
      'lockers','pack-cafe','turnos','egresos',
      'wa','calendario','alertas',
    ],
    puede: {
      vender: true, anular: true, editarSocio: true,
      verHistorial: true, verDashboard: false,
      resetSistema: false, editarPrecios: false,
      exportarContador: false, configurarDB: false,
    },
  },
  admin: {
    label: 'Administrador',
    secciones: [
      'dashboard','dash-recepcion','historial','recaudacion',
      'caja','registrar','socios','lockers','pack-cafe','turnos',
      'egresos','deudas','productos','wa','calendario','alertas',
      'db','importar','exportar','retiros',
    ],
    puede: {
      vender: true, anular: true, editarSocio: true,
      verHistorial: true, verDashboard: true,
      resetSistema: true, editarPrecios: true,
      exportarContador: true, configurarDB: true,
    },
  },
};

// ── Timing ───────────────────────────────────────────────────────────
export const TIMING = {
  syncInterval:    15_000,   // chequeo cada 15s
  syncDebounce:    1_200,    // debounce al guardar
  syncCooldown:    10_000,   // skip si sincronizó hace menos de 10s
  backoffMax:      120_000,  // máx backoff en errores = 2 min
  ventaBloqueo:    24 * 60 * 60 * 1000, // 24hs para bloquear edición
};

// ── Duplicados: ventana de detección ────────────────────────────────
export const DUPLICATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutos
