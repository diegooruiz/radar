// Piezas compartidas por las herramientas del radar. Solo usa lo que trae
// Node de serie: el entorno de la nube no tiene por qué dejar instalar nada.

import crypto from 'node:crypto';
import fs from 'node:fs';

export const FEED_CIFRADO = 'feed.enc';
export const BORRADOR = 'trabajo/feed.json';
export const ANTERIOR = 'trabajo/anterior.json';

/// Los valores que acepta la app. Si cambian aquí, cambian en RadarFeed.swift.
export const EFECTOS = ['favorable', 'desfavorable', 'mixto', 'neutral'];
export const CERTEZAS = ['confirmado', 'fuentes', 'prevision', 'rumor'];
export const CLASES = ['accion', 'cripto', 'protocolo'];

export const MAX_NOTICIAS = 40;
export const MAX_DIAS = 14;
export const MAX_AVISOS_DIA = 3;

export function fallo(mensaje) {
  console.error(`✗ ${mensaje}`);
  process.exit(1);
}

/// La clave del cifrado: 32 bytes en base64, en la variable RADAR_KEY.
export function claveRadar() {
  const texto = process.env.RADAR_KEY;
  if (!texto) fallo('Falta RADAR_KEY en el entorno.');
  const clave = Buffer.from(texto.trim(), 'base64');
  if (clave.length !== 32) fallo(`RADAR_KEY tiene que ser de 32 bytes y tiene ${clave.length}.`);
  return clave;
}

/// AES-256-GCM. El resultado es nonce (12) + cifrado + etiqueta (16), en
/// base64: exactamente lo que `AES.GCM.SealedBox(combined:)` abre en el iPhone.
export function cifrar(texto, clave) {
  const nonce = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv('aes-256-gcm', clave, nonce);
  const cuerpo = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  return Buffer.concat([nonce, cuerpo, cifrador.getAuthTag()]).toString('base64');
}

export function descifrar(base64, clave) {
  const todo = Buffer.from(base64.trim(), 'base64');
  const nonce = todo.subarray(0, 12);
  const etiqueta = todo.subarray(todo.length - 16);
  const cuerpo = todo.subarray(12, todo.length - 16);
  const descifrador = crypto.createDecipheriv('aes-256-gcm', clave, nonce);
  descifrador.setAuthTag(etiqueta);
  return Buffer.concat([descifrador.update(cuerpo), descifrador.final()]).toString('utf8');
}

/// El radar publicado la vez anterior, o null si es la primera.
export function leerAnterior(clave) {
  if (!fs.existsSync(FEED_CIFRADO)) return null;
  try {
    return JSON.parse(descifrar(fs.readFileSync(FEED_CIFRADO, 'utf8'), clave));
  } catch (e) {
    fallo(`No se puede abrir ${FEED_CIFRADO} con esta RADAR_KEY (${e.message}).`);
  }
}

/// La fecha y la hora en Madrid, que es donde vive quien lee.
export function ahoraEnMadrid(fecha = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(fecha).map((p) => [p.type, p.value]),
  );
  return {
    dia: `${partes.year}-${partes.month}-${partes.day}`,
    hora: Number(partes.hour),
    minuto: Number(partes.minute),
  };
}
