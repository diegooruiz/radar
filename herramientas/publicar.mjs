#!/usr/bin/env node
// Publica el radar: revisa el borrador, lo cifra y, si toca, avisa al iPhone.
//
//   node herramientas/publicar.mjs            publica trabajo/feed.json
//   node herramientas/publicar.mjs --probar   lo revisa todo, pero no escribe ni avisa
//
// Variables de entorno: RADAR_KEY (obligatoria) y, para los avisos,
// APNS_KEY, APNS_KEY_ID y APNS_DEVICE. Ver README.md.

import fs from 'node:fs';
import {
  BORRADOR, FEED_CIFRADO, MAX_AVISOS_DIA,
  ahoraEnMadrid, cifrar, claveRadar, fallo, leerAnterior,
} from './comun.mjs';
import { validar } from './validar.mjs';
import { configuracionAvisos, decidir, enviar } from './aviso.mjs';

const probando = process.argv.includes('--probar');
const clave = claveRadar();
const anterior = leerAnterior(clave);

if (!fs.existsSync(BORRADOR)) fallo(`No está ${BORRADOR}. El agente tiene que escribirlo antes.`);
let borrador;
try {
  borrador = JSON.parse(fs.readFileSync(BORRADOR, 'utf8'));
} catch (e) {
  fallo(`${BORRADOR} no es JSON válido: ${e.message}`);
}

let resultado;
try {
  resultado = validar(borrador);
} catch (e) {
  fallo(e.message);
}
const { feed, aviso, avisos } = resultado;
for (const a of avisos) console.log(`  · descartado: ${a}`);
if (feed.items.length === 0) fallo('No queda ninguna noticia válida: no se publica nada.');

// El registro de avisos viaja dentro del propio radar cifrado: así cada
// ejecución sabe cuántos se han mandado hoy sin guardar nada más.
const ahora = new Date();
const madrid = ahoraEnMadrid(ahora);
const registro = (anterior?.notifications ?? []).filter(
  (n) => Date.parse(n.at) > ahora.getTime() - 7 * 86_400_000,
);
const enviadosHoy = registro.filter((n) => n.sent && ahoraEnMadrid(new Date(n.at)).dia === madrid.dia).length;

const paso = decidir({
  aviso, enviadosHoy, hora: madrid.hora, config: configuracionAvisos(), maxDia: MAX_AVISOS_DIA,
});
let decision = paso.motivo;
if (paso.mandar && probando) decision = 'se mandaría (modo prueba)';
else if (paso.mandar) {
  const r = await enviar(configuracionAvisos(), aviso);
  decision = r.ok ? 'mandado' : `Apple lo rechazó: ${r.estado ?? ''} ${r.respuesta || r.error || ''}`.trim();
  registro.push({ at: ahora.toISOString(), title: aviso.title, body: aviso.body, sent: r.ok });
}
feed.notifications = registro.slice(-30);

if (!probando) fs.writeFileSync(FEED_CIFRADO, cifrar(JSON.stringify(feed), clave) + '\n');

console.log(`✓ ${feed.items.length} noticias, ${feed.agenda.length} fechas en la agenda.`);
console.log(`  aviso: ${decision}`);
if (probando) console.log('  (modo prueba: no se ha escrito nada)');
