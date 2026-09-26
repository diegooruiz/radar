#!/usr/bin/env node
// Prepara las variables de entorno de la tarea de la nube y las deja en el
// portapapeles, listas para pegar. No las imprime: solo dice qué ha incluido.
//
//   node herramientas/entorno.mjs
//
// Busca:
//   · la clave del radar en .local/clave-radar.txt
//   · la clave de Apple más reciente en ~/Downloads/AuthKey_XXXXXXXXXX.p8
//     (el identificador de la clave va en el propio nombre del archivo)
//   · el equipo de Apple en .local/equipo.txt
//   · el código del iPhone en .local/iphone.txt

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const lineas = [];
const informe = [];

const leer = (ruta) => (fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8').trim() : '');

const clave = leer('.local/clave-radar.txt');
if (!clave) {
  console.error('✗ No está .local/clave-radar.txt: sin ella no se puede publicar nada.');
  process.exit(1);
}
lineas.push(`RADAR_KEY=${clave}`);
informe.push('clave del radar');

const descargas = path.join(os.homedir(), 'Downloads');
const p8 = fs.existsSync(descargas)
  ? fs.readdirSync(descargas)
      .filter((f) => /^AuthKey_[A-Z0-9]{10}\.p8$/.test(f))
      .map((f) => ({ f, t: fs.statSync(path.join(descargas, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0]?.f
  : undefined;
if (p8) {
  const contenido = fs.readFileSync(path.join(descargas, p8));
  lineas.push(`APNS_KEY=${contenido.toString('base64')}`);
  lineas.push(`APNS_KEY_ID=${p8.slice(8, 18)}`);
  informe.push(`clave de Apple (${p8.slice(8, 18)})`);
} else {
  informe.push('SIN clave de Apple: no hay ningún AuthKey_….p8 en Descargas');
}

const equipo = leer('.local/equipo.txt');
if (equipo) {
  lineas.push(`APNS_TEAM_ID=${equipo}`);
  informe.push('equipo de Apple');
} else {
  informe.push('SIN equipo de Apple (.local/equipo.txt)');
}

const iphone = leer('.local/iphone.txt').replace(/[\s<>]/g, '');
if (/^[0-9a-f]{64,}$/i.test(iphone)) {
  lineas.push(`APNS_DEVICE=${iphone}`);
  informe.push('código del iPhone');
} else {
  informe.push('SIN código del iPhone');
}

execFileSync('pbcopy', { input: lineas.join('\n') + '\n' });
console.log(`✓ Copiado al portapapeles: ${informe.join(', ')}.`);
