# Panel VE — notas para Claude

Android app (Java, no AndroidX deps) built by GitHub Actions (`.github/workflows/build.yml`) into a Release with `PanelVE.apk`. Cannot build locally (Google Maven/SDK blocked); test JS with node/jsdom.

- `app/src/main/assets/panel.html` — the side panel UI (all JS inline).
- `app/src/main/assets/helper.js` — injected into VideoExpress; `window.__pve.insert/undo/insertSelect/configVoice`.
- `MainActivity.java` — split WebViews, bridges `Android` (panel) and `PVE` (VideoExpress page).

## Episode format (`episodios/<id>.json`, listed in `episodios/index.json`)
- `voz`: `{tipo:"System", idioma:"Spanish|Español", nombre:"Andrés Delgado|Andres Delgado"}` (`|` = alternatives).
- `fichas`: reusable blocks (ESTILO, PADRE, CRISTO, ANGELES, …) referenced as `{{KEY}}` in prompts.
- `escenas[]`: `n`, `titulo`, `descripcion` (Spanish), `referencias[]`, `camara`, `prompt_imagen`, `prompt_video` (English), `narracion` (Spanish; app splits to ≤120 chars), optional `dialogos[] {personaje, voz, texto}`, `notas`.

## Prompt rules the user asked for
Describe every character fully (angels: masculine, enormous feathered wings, never female/small wings/elf/theater look); describe setting; professional camera moves (orbit 180°, aerial, dolly, crane, push-in); nobody looks at camera; few characters per shot. Prompts in English, narration in Spanish.

When the user asks to fix "escena N", edit that scene's JSON and push to main; the app pulls it with ↻.
