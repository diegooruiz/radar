// Revisa el borrador que escribe el agente y lo deja limpio para la app.
//
// Lo que no cumple se descarta con un aviso, en vez de tumbar la publicación:
// una noticia mal escrita no debe dejarte sin las otras diez.

import { EFECTOS, CERTEZAS, CLASES, MAX_NOTICIAS, MAX_DIAS, ahoraEnMadrid } from './comun.mjs';

const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const esFecha = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const esDia = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function validar(borrador, ahora = new Date()) {
  const avisos = [];
  const avisa = (m) => avisos.push(m);

  if (!borrador || typeof borrador !== 'object') throw new Error('El borrador no es un objeto JSON.');

  // Las inversiones: sin ellas la app no sabe poner nombre a nada.
  const activos = (Array.isArray(borrador.assets) ? borrador.assets : [])
    .map((a) => ({
      id: texto(a?.id, 12).toUpperCase(),
      name: texto(a?.name, 40),
      kind: CLASES.includes(a?.kind) ? a.kind : 'accion',
      pulse: texto(a?.pulse, 220),
    }))
    .filter((a) => a.id && a.name);
  if (activos.length === 0) throw new Error('El borrador no trae "assets".');
  const ids = new Set(activos.map((a) => a.id));

  // Las noticias.
  const limite = ahora.getTime() - MAX_DIAS * 86_400_000;
  const vistas = new Set();
  const noticias = [];
  for (const [i, n] of (Array.isArray(borrador.items) ? borrador.items : []).entries()) {
    const donde = `noticia ${i + 1} («${texto(n?.title, 50)}»)`;
    const fuentes = (Array.isArray(n?.sources) ? n.sources : [])
      .map((f) => ({ name: texto(f?.name, 40), url: texto(f?.url, 500) }))
      .filter((f) => f.name && /^https:\/\//.test(f.url));
    const activosNoticia = (Array.isArray(n?.assets) ? n.assets : [])
      .map((a) => String(a).toUpperCase())
      .filter((a) => ids.has(a));

    const limpia = {
      id: texto(n?.id, 80),
      title: texto(n?.title, 140),
      summary: texto(n?.summary, 900),
      whyItMatters: texto(n?.whyItMatters, 500),
      assets: [...new Set(activosNoticia)],
      effect: n?.effect,
      certainty: n?.certainty,
      importance: Number(n?.importance),
      publishedAt: n?.publishedAt,
      sources: fuentes,
    };

    if (!limpia.id || !limpia.title || !limpia.summary) { avisa(`${donde}: le falta id, título o resumen.`); continue; }
    if (vistas.has(limpia.id)) { avisa(`${donde}: id repetido.`); continue; }
    if (limpia.assets.length === 0) { avisa(`${donde}: no toca ninguna inversión conocida.`); continue; }
    if (!EFECTOS.includes(limpia.effect)) { avisa(`${donde}: efecto «${limpia.effect}» no válido.`); continue; }
    if (!CERTEZAS.includes(limpia.certainty)) { avisa(`${donde}: certeza «${limpia.certainty}» no válida.`); continue; }
    if (![1, 2, 3].includes(limpia.importance)) { avisa(`${donde}: importancia fuera de 1–3.`); continue; }
    if (!esFecha(limpia.publishedAt)) { avisa(`${donde}: fecha no válida.`); continue; }
    if (Date.parse(limpia.publishedAt) < limite) { avisa(`${donde}: tiene más de ${MAX_DIAS} días.`); continue; }
    // Sin fuente no se publica. Es la regla que sostiene todo lo demás.
    if (fuentes.length === 0) { avisa(`${donde}: sin fuentes con enlace https.`); continue; }

    vistas.add(limpia.id);
    noticias.push(limpia);
  }
  noticias.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  if (noticias.length > MAX_NOTICIAS) {
    avisa(`Había ${noticias.length} noticias; se quedan las ${MAX_NOTICIAS} más recientes.`);
    noticias.length = MAX_NOTICIAS;
  }

  // La agenda: solo lo que aún no ha pasado, por orden.
  const hoy = ahoraEnMadrid(ahora).dia;
  const agenda = (Array.isArray(borrador.agenda) ? borrador.agenda : [])
    .map((e) => ({
      date: e?.date,
      title: texto(e?.title, 120),
      note: texto(e?.note, 200),
      assets: (Array.isArray(e?.assets) ? e.assets : []).map((a) => String(a).toUpperCase()).filter((a) => ids.has(a)),
    }))
    .filter((e) => esDia(e.date) && e.title && e.date >= hoy)
    // La app identifica cada fecha por día y título: no puede haber dos iguales.
    .filter((e, i, todas) => todas.findIndex((o) => o.date === e.date && o.title === e.title) === i)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 12);

  // El aviso que propone el agente. Que se mande o no lo decide publicar.mjs.
  let aviso = null;
  if (borrador.aviso && typeof borrador.aviso === 'object') {
    const a = {
      title: texto(borrador.aviso.title, 60),
      body: texto(borrador.aviso.body, 180),
      item: texto(borrador.aviso.item, 80),
      urgente: borrador.aviso.urgente === true,
    };
    if (a.title && a.body) aviso = a;
    else avisa('El aviso no tiene título o texto: no se manda.');
  }

  return {
    feed: {
      version: 1,
      generatedAt: ahora.toISOString(),
      summary: texto(borrador.summary, 400),
      assets: activos,
      items: noticias,
      agenda,
    },
    aviso,
    avisos,
  };
}
