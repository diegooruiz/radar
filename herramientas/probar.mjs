#!/usr/bin/env node
// Pruebas de las herramientas. No tocan la red ni necesitan claves reales.
//
//   node herramientas/probar.mjs            pasa las pruebas
//   node herramientas/probar.mjs --vector   imprime un caso cifrado para las
//                                           pruebas de la app (RadarFeedTests)

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { cifrar, descifrar, ahoraEnMadrid } from './comun.mjs';
import { validar } from './validar.mjs';
import { decidir, firmar } from './aviso.mjs';

if (process.argv.includes('--vector')) {
  const clave = crypto.randomBytes(32);
  const texto = JSON.stringify({ hola: 'radar', acento: 'áéíóú ñ €' });
  console.log(JSON.stringify({ key: clave.toString('base64'), plain: texto, sealed: cifrar(texto, clave) }, null, 2));
  process.exit(0);
}

let pasadas = 0;
const prueba = (nombre, fn) => { fn(); pasadas += 1; console.log(`  ✓ ${nombre}`); };

const ahora = new Date('2026-09-26T10:00:00Z');
const noticia = (cambios = {}) => ({
  id: 'n1', title: 'Titular', summary: 'Qué ha pasado.', whyItMatters: 'Por qué importa.',
  assets: ['META'], effect: 'favorable', certainty: 'confirmado', importance: 2,
  publishedAt: '2026-09-25T12:00:00Z', sources: [{ name: 'Reuters', url: 'https://reuters.com/x' }],
  ...cambios,
});
const borrador = (items, extra = {}) => ({
  summary: 'Resumen.', assets: [{ id: 'META', name: 'Meta', kind: 'accion', pulse: 'Bien.' }], items, ...extra,
});

prueba('cifrar y descifrar dan lo mismo, con acentos', () => {
  const clave = crypto.randomBytes(32);
  const texto = '{"a":"ñandú €"}';
  assert.equal(descifrar(cifrar(texto, clave), clave), texto);
});

prueba('con otra clave no se abre', () => {
  const sellado = cifrar('secreto', crypto.randomBytes(32));
  assert.throws(() => descifrar(sellado, crypto.randomBytes(32)));
});

prueba('una noticia correcta pasa entera', () => {
  const { feed, avisos } = validar(borrador([noticia()]), ahora);
  assert.equal(feed.items.length, 1);
  assert.equal(avisos.length, 0);
});

prueba('sin fuentes no se publica', () => {
  const { feed } = validar(borrador([noticia({ sources: [] })]), ahora);
  assert.equal(feed.items.length, 0);
});

prueba('una fuente sin https no cuenta', () => {
  const { feed } = validar(borrador([noticia({ sources: [{ name: 'X', url: 'http://x.com' }] })]), ahora);
  assert.equal(feed.items.length, 0);
});

prueba('una inversión desconocida se cae; si no queda ninguna, la noticia también', () => {
  const { feed } = validar(borrador([noticia({ assets: ['META', 'TSLA'] }), noticia({ id: 'n2', assets: ['TSLA'] })]), ahora);
  assert.deepEqual(feed.items.map((n) => n.id), ['n1']);
  assert.deepEqual(feed.items[0].assets, ['META']);
});

prueba('valores fuera de lo permitido se descartan', () => {
  const { feed } = validar(borrador([
    noticia({ id: 'a', effect: 'buenísimo' }),
    noticia({ id: 'b', certainty: 'segurísimo' }),
    noticia({ id: 'c', importance: 5 }),
  ]), ahora);
  assert.equal(feed.items.length, 0);
});

prueba('lo que tiene más de 14 días se va', () => {
  const { feed } = validar(borrador([noticia({ publishedAt: '2026-09-01T00:00:00Z' })]), ahora);
  assert.equal(feed.items.length, 0);
});

prueba('ids repetidos: se queda la primera', () => {
  const { feed } = validar(borrador([noticia(), noticia({ title: 'Otra' })]), ahora);
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].title, 'Titular');
});

prueba('las noticias salen de la más nueva a la más vieja', () => {
  const { feed } = validar(borrador([
    noticia({ id: 'vieja', publishedAt: '2026-09-20T00:00:00Z' }),
    noticia({ id: 'nueva', publishedAt: '2026-09-26T08:00:00Z' }),
  ]), ahora);
  assert.deepEqual(feed.items.map((n) => n.id), ['nueva', 'vieja']);
});

prueba('la agenda pierde lo pasado y se ordena', () => {
  const { feed } = validar(borrador([noticia()], {
    agenda: [
      { date: '2026-10-28', title: 'Fed', assets: ['META'] },
      { date: '2026-09-01', title: 'Ya pasó' },
      { date: '2026-09-26', title: 'Hoy' },
    ],
  }), ahora);
  assert.deepEqual(feed.agenda.map((e) => e.title), ['Hoy', 'Fed']);
});

prueba('la hora de Madrid cambia con el horario de invierno', () => {
  assert.equal(ahoraEnMadrid(new Date('2026-09-26T21:30:00Z')).hora, 23);
  assert.equal(ahoraEnMadrid(new Date('2026-11-26T21:30:00Z')).hora, 22);
});

const config = { clave: crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey, keyId: 'ABC1234567', teamId: 'ABCDE12345' };
const aviso = { title: 'Meta', body: 'Algo pasa', urgente: false };

prueba('el tope de avisos al día se respeta', () => {
  assert.equal(decidir({ aviso, enviadosHoy: 3, hora: 12, config, maxDia: 3 }).mandar, false);
  assert.equal(decidir({ aviso, enviadosHoy: 2, hora: 12, config, maxDia: 3 }).mandar, true);
});

prueba('de noche solo lo urgente', () => {
  assert.equal(decidir({ aviso, enviadosHoy: 0, hora: 23, config, maxDia: 3 }).mandar, false);
  assert.equal(decidir({ aviso, enviadosHoy: 0, hora: 7, config, maxDia: 3 }).mandar, false);
  assert.equal(decidir({ aviso: { ...aviso, urgente: true }, enviadosHoy: 0, hora: 2, config, maxDia: 3 }).mandar, true);
});

prueba('sin claves de Apple se publica pero no se avisa', () => {
  assert.equal(decidir({ aviso, enviadosHoy: 0, hora: 12, config: null, maxDia: 3 }).mandar, false);
});

prueba('la firma para Apple se verifica con la clave pública', () => {
  const par = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const token = firmar({ ...config, clave: par.privateKey }, ahora.getTime());
  const [cabecera, datos, firma] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(cabecera, 'base64url')), { alg: 'ES256', kid: 'ABC1234567' });
  assert.equal(JSON.parse(Buffer.from(datos, 'base64url')).iss, 'ABCDE12345');
  assert.ok(crypto.verify('sha256', Buffer.from(`${cabecera}.${datos}`),
    { key: par.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(firma, 'base64url')));
});

console.log(`\n${pasadas} pruebas pasadas.`);
