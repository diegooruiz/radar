#!/usr/bin/env node
// Cuánto se ha movido cada inversión en sus resultados y en los días de la Fed,
// calculado con precios reales. Es la base de «según su historial» en el radar:
// un dato medido, no una previsión ni una opinión.
//
//   node herramientas/historial.mjs ver                          resumen para leer
//   node herramientas/historial.mjs actualizar                   vuelve a calcular (necesita red)
//   node herramientas/historial.mjs resultados META 2026-10-21 despues
//                                                                añade unos resultados
//   node herramientas/historial.mjs fed 2026-10-28                añade una decisión de la Fed
//
// Todo se guarda cifrado en historial.enc, como el radar: ni la lista de
// inversiones ni las cifras se leen sin la clave. Los cierres vienen de Yahoo
// Finance; las fechas de resultados, de la SEC y de las webs de las empresas.

import fs from 'node:fs';
import { cifrar, claveRadar, descifrar, fallo } from './comun.mjs';

const ARCHIVO = 'historial.enc';
const RESULTADOS_A_MIRAR = 8;
const FED_A_MIRAR = 8;
const DIAS_NORMALES = 60;

// ── Cálculo (puro, para poder probarlo) ─────────────────────────────────────

/// El día en que el mercado reacciona a un evento y cuánto se movió.
/// `cuando`: «antes» (antes de abrir o durante la sesión: reacciona ese día)
/// o «despues» (tras el cierre: reacciona la siguiente sesión).
export function reaccion(barras, fecha, cuando) {
  const i = cuando === 'despues'
    ? barras.findIndex((b) => b.fecha > fecha)
    : barras.findIndex((b) => b.fecha >= fecha);
  if (i < 1) return null;
  const movimiento = (barras[i].cierre / barras[i - 1].cierre - 1) * 100;
  return { fecha, dia: barras[i].fecha, movimiento: Math.round(movimiento * 10) / 10 };
}

export function resumen(reacciones) {
  const m = reacciones.map((r) => r.movimiento);
  if (m.length === 0) return null;
  const media = m.reduce((a, b) => a + Math.abs(b), 0) / m.length;
  return {
    veces: m.length,
    mediaAbsoluta: Math.round(media * 10) / 10,
    subidas: m.filter((x) => x > 0).length,
    bajadas: m.filter((x) => x < 0).length,
    mayorSubida: Math.max(...m),
    mayorBajada: Math.min(...m),
  };
}

/// Cuánto se mueve en un día cualquiera: la vara de medir de todo lo demás.
export function diaNormal(barras, dias = DIAS_NORMALES) {
  const ultimas = barras.slice(-dias - 1);
  const cambios = ultimas.slice(1).map((b, i) => Math.abs(b.cierre / ultimas[i].cierre - 1) * 100);
  if (cambios.length < 10) return null;
  return Math.round((cambios.reduce((a, b) => a + b, 0) / cambios.length) * 10) / 10;
}

// Hora a la que la Fed anuncia (14:00 en Nueva York) frente al cierre de cada
// mercado: en EE. UU. y en cripto reacciona ese día; Tokio ya ha cerrado.
const CUANDO_FED = { eeuu: 'antes', cripto: 'antes', tokio: 'despues' };

// ── Datos ───────────────────────────────────────────────────────────────────

async function cierres(simbolo) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=5y&interval=1d`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`Yahoo Finance respondió ${r.status} para ${simbolo}`);
  const d = (await r.json()).chart.result[0];
  const desfase = d.meta.gmtoffset ?? 0;
  const c = d.indicators.quote[0].close;
  return d.timestamp
    .map((t, i) => ({ fecha: new Date((t + desfase) * 1000).toISOString().slice(0, 10), cierre: c[i] }))
    .filter((b) => typeof b.cierre === 'number');
}

function leer(clave) {
  if (!fs.existsSync(ARCHIVO)) fallo(`No está ${ARCHIVO}.`);
  return JSON.parse(descifrar(fs.readFileSync(ARCHIVO, 'utf8'), clave));
}

function guardar(datos, clave) {
  fs.writeFileSync(ARCHIVO, cifrar(JSON.stringify(datos), clave) + '\n');
}

async function actualizar(config) {
  const salida = { generadoEl: new Date().toISOString(), config, resultados: {}, fed: {}, diaNormal: {}, avisos: [] };
  const fed = [...config.fed].sort().slice(-FED_A_MIRAR);

  for (const activo of config.activos) {
    let barras;
    try {
      barras = await cierres(activo.yahoo);
    } catch (e) {
      salida.avisos.push(`${activo.id}: sin precios (${e.message})`);
      continue;
    }
    salida.diaNormal[activo.id] = diaNormal(barras);

    const eventos = [...(activo.resultados ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(-RESULTADOS_A_MIRAR);
    const reacciones = eventos.map((e) => reaccion(barras, e.fecha, e.cuando)).filter(Boolean);
    if (reacciones.length >= 4) {
      salida.resultados[activo.id] = { reacciones, resumen: resumen(reacciones) };
    } else if (activo.resultados) {
      salida.avisos.push(`${activo.id}: solo ${reacciones.length} resultados con precio; no da para un historial fiable.`);
    }

    const fedReacciones = fed.map((f) => reaccion(barras, f, CUANDO_FED[activo.mercado] ?? 'antes')).filter(Boolean);
    if (fedReacciones.length >= 4) salida.fed[activo.id] = { reacciones: fedReacciones, resumen: resumen(fedReacciones) };
  }
  return salida;
}

// ── Lectura ─────────────────────────────────────────────────────────────────

const signo = (x) => `${x > 0 ? '+' : ''}${x.toLocaleString('es-ES')} %`;

function mostrar(h) {
  console.log(`Historial calculado el ${h.generadoEl} con cierres de Yahoo Finance.\n`);
  for (const a of h.config.activos) {
    const r = h.resultados[a.id];
    const f = h.fed[a.id];
    const normal = h.diaNormal[a.id];
    console.log(`${a.id}  (un día normal: ±${normal?.toLocaleString('es-ES') ?? '?'} %)`);
    if (r) {
      const s = r.resumen;
      console.log(`  resultados, últimos ${s.veces}: media ±${s.mediaAbsoluta.toLocaleString('es-ES')} %, ${s.subidas} subidas y ${s.bajadas} bajadas, entre ${signo(s.mayorBajada)} y ${signo(s.mayorSubida)}`);
      console.log(`    ${r.reacciones.map((x) => `${x.fecha}→${x.dia} ${signo(x.movimiento)}`).join(' · ')}`);
    }
    if (f) {
      const s = f.resumen;
      console.log(`  días de la Fed, últimos ${s.veces}: media ±${s.mediaAbsoluta.toLocaleString('es-ES')} %, entre ${signo(s.mayorBajada)} y ${signo(s.mayorSubida)}`);
    }
  }
  if (h.avisos.length) console.log(`\nAvisos:\n  ${h.avisos.join('\n  ')}`);
  console.log(`\nFuentes para citar: «Cálculo del radar con cierres de Yahoo Finance» (https://finance.yahoo.com/quote/<símbolo>/history/) y las fechas oficiales de cada empresa.`);
}

// ── Órdenes ─────────────────────────────────────────────────────────────────

const esPrincipal = import.meta.url === `file://${process.argv[1]}`;
if (esPrincipal) {
  const [orden, ...args] = process.argv.slice(2);
  const clave = claveRadar();

  if (orden === 'ver') {
    mostrar(leer(clave));
  } else if (orden === 'actualizar') {
    // Con --config, empieza de una configuración nueva (solo la primera vez).
    const i = args.indexOf('--config');
    const config = i >= 0 ? JSON.parse(fs.readFileSync(args[i + 1], 'utf8')) : leer(clave).config;
    const h = await actualizar(config);
    guardar(h, clave);
    mostrar(h);
  } else if (orden === 'resultados') {
    const [id, fecha, cuando] = args;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '') || !['antes', 'despues'].includes(cuando)) {
      fallo('Uso: resultados <ID> <aaaa-mm-dd> <antes|despues>');
    }
    const h = leer(clave);
    const activo = h.config.activos.find((a) => a.id === id);
    if (!activo) fallo(`No conozco ${id}.`);
    activo.resultados = [...(activo.resultados ?? []).filter((e) => e.fecha !== fecha), { fecha, cuando }];
    guardar(h, clave);
    console.log(`✓ ${id}: resultados del ${fecha} (${cuando}). Ahora: node herramientas/historial.mjs actualizar`);
  } else if (orden === 'fed') {
    const [fecha] = args;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '')) fallo('Uso: fed <aaaa-mm-dd>');
    const h = leer(clave);
    h.config.fed = [...new Set([...h.config.fed, fecha])].sort();
    guardar(h, clave);
    console.log(`✓ Decisión de la Fed del ${fecha}. Ahora: node herramientas/historial.mjs actualizar`);
  } else {
    fallo('Órdenes: ver | actualizar | resultados <ID> <fecha> <antes|despues> | fed <fecha>');
  }
}
