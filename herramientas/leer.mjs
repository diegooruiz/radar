#!/usr/bin/env node
// Enseña el radar publicado la última vez, descifrado. El agente lo lee al
// empezar para no repetir noticias y seguir las historias abiertas.
//
//   node herramientas/leer.mjs

import fs from 'node:fs';
import { ANTERIOR, claveRadar, leerAnterior } from './comun.mjs';

const anterior = leerAnterior(claveRadar());
if (!anterior) {
  console.log('Es la primera vez: todavía no hay radar publicado.');
} else {
  fs.mkdirSync('trabajo', { recursive: true });
  fs.writeFileSync(ANTERIOR, JSON.stringify(anterior, null, 2));
  console.log(JSON.stringify(anterior, null, 2));
}
