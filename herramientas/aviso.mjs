// El aviso al iPhone, directo a Apple (APNs) y sin intermediarios.
//
// Apple pide HTTP/2 y una firma ES256 con la clave .p8 de la cuenta de
// desarrollador. Node trae las dos cosas de serie.

import crypto from 'node:crypto';
import http2 from 'node:http2';

const TOPIC = 'com.diego.cadena';

const base64url = (b) => Buffer.from(b).toString('base64url');

/// La configuración de avisos, o null si falta algo: sin ella se publica igual,
/// solo que sin avisar.
export function configuracionAvisos() {
  const { APNS_KEY, APNS_KEY_ID, APNS_DEVICE, APNS_TEAM_ID } = process.env;
  if (!APNS_KEY || !APNS_KEY_ID || !APNS_DEVICE || !APNS_TEAM_ID) return null;

  // La clave llega en base64 (una sola línea, más fácil de pegar) o tal cual.
  let pem = APNS_KEY.includes('BEGIN PRIVATE KEY')
    ? APNS_KEY.replace(/\\n/g, '\n')
    : Buffer.from(APNS_KEY.trim(), 'base64').toString('utf8');
  if (!pem.includes('BEGIN PRIVATE KEY')) return { error: 'APNS_KEY no parece una clave .p8.' };

  return {
    clave: crypto.createPrivateKey(pem),
    keyId: APNS_KEY_ID.trim(),
    teamId: APNS_TEAM_ID.trim(),
    dispositivo: APNS_DEVICE.trim().replace(/[\s<>]/g, ''),
    // Una app instalada por cable habla con el servidor de pruebas de Apple.
    host: (process.env.APNS_HOST || 'api.sandbox.push.apple.com').trim(),
  };
}

/// Si el aviso propuesto se manda o no, y por qué. Pura, para poder probarla.
///
/// Tope de avisos al día, y silencio de 23:00 a 8:00 salvo lo urgente.
export function decidir({ aviso, enviadosHoy, hora, config, maxDia }) {
  if (!aviso) return { mandar: false, motivo: 'sin aviso propuesto' };
  if (enviadosHoy >= maxDia) return { mandar: false, motivo: `no se manda: ya van ${enviadosHoy} hoy` };
  if ((hora >= 23 || hora < 8) && !aviso.urgente) return { mandar: false, motivo: 'no se manda: es de noche y no es urgente' };
  if (!config) return { mandar: false, motivo: 'no se manda: faltan las claves de Apple en el entorno' };
  if (config.error) return { mandar: false, motivo: `no se manda: ${config.error}` };
  return { mandar: true, motivo: 'se manda' };
}

export function firmar(config, ahora = Date.now()) {
  const cabecera = base64url(JSON.stringify({ alg: 'ES256', kid: config.keyId }));
  const datos = base64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(ahora / 1000) }));
  const firma = crypto.sign('sha256', Buffer.from(`${cabecera}.${datos}`), {
    key: config.clave,
    dsaEncoding: 'ieee-p1363',
  });
  return `${cabecera}.${datos}.${base64url(firma)}`;
}

export function enviar(config, aviso) {
  const cuerpo = JSON.stringify({
    aps: {
      alert: { title: aviso.title, body: aviso.body },
      sound: 'default',
      'thread-id': 'radar',
    },
    radar: { item: aviso.item || '' },
  });

  return new Promise((resolver) => {
    const cliente = http2.connect(`https://${config.host}`);
    const terminar = (resultado) => { cliente.close(); resolver(resultado); };
    cliente.on('error', (e) => terminar({ ok: false, error: e.message }));

    const peticion = cliente.request({
      ':method': 'POST',
      ':path': `/3/device/${config.dispositivo}`,
      authorization: `bearer ${firmar(config)}`,
      'apns-topic': TOPIC,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      // Si el móvil está apagado seis horas, el aviso ya no tiene sentido.
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 6 * 3600),
      'content-type': 'application/json',
    });

    let estado = 0;
    let respuesta = '';
    peticion.setEncoding('utf8');
    peticion.on('response', (h) => { estado = h[':status']; });
    peticion.on('data', (trozo) => { respuesta += trozo; });
    peticion.on('end', () => terminar({ ok: estado === 200, estado, respuesta }));
    peticion.on('error', (e) => terminar({ ok: false, error: e.message }));
    peticion.setTimeout(15_000, () => { peticion.close(); terminar({ ok: false, error: 'Apple no respondió en 15 s' }); });
    peticion.end(cuerpo);
  });
}
