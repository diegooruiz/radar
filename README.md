# radar

La mitad en la nube del radar de noticias de la app de hábitos.

Una tarea programada de Claude investiga tres veces al día, escribe un resumen
en `trabajo/feed.json` y estas herramientas lo revisan, lo **cifran** en
`feed.enc` y, si toca, mandan un aviso al iPhone. La app descarga `feed.enc` y
lo abre con la misma clave.

`feed.enc` es lo único que se publica, y sin la clave no se puede leer.

## Herramientas

Solo usan lo que trae Node de serie (18 o más).

| Orden | Qué hace |
|---|---|
| `node herramientas/leer.mjs` | Enseña el radar publicado la última vez, descifrado |
| `node herramientas/publicar.mjs --probar` | Revisa el borrador sin escribir ni avisar |
| `node herramientas/publicar.mjs` | Revisa, cifra, escribe `feed.enc` y avisa si toca |
| `node herramientas/probar.mjs` | Pruebas de las herramientas (sin red ni claves) |

## Variables de entorno

| Variable | Para qué |
|---|---|
| `RADAR_KEY` | Clave del cifrado, 32 bytes en base64. Obligatoria |
| `APNS_KEY` | La clave `.p8` de Apple, en base64 en una sola línea |
| `APNS_KEY_ID` | El identificador de esa clave (sale en el nombre del archivo) |
| `APNS_DEVICE` | El código del iPhone, de Ajustes → radar |
| `APNS_TEAM_ID` | El equipo de la cuenta de desarrollador |
| `APNS_HOST` | Opcional. `api.sandbox.push.apple.com` (app instalada por cable, por defecto) o `api.push.apple.com` |

Sin las de Apple el radar se publica igual, solo que sin avisar.

`node herramientas/entorno.mjs` las junta desde `.local/` y la carpeta de
Descargas y las deja en el portapapeles, sin enseñarlas.

## Reglas que aplica `publicar.mjs`

- Una noticia sin al menos una fuente con enlace `https` no se publica.
- Máximo 40 noticias y 14 días de antigüedad.
- Máximo 3 avisos al día (hora de Madrid) y silencio de 23:00 a 8:00 salvo
  los marcados como urgentes.
