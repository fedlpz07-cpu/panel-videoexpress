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

## VideoExpress 3.5 DOM (inspected 2026-11-15)
- Create Video From Prompt: `#opt_prompt` (image), `#opt_video_prompt` (video), `select[name=select-type]` (human/2d/3d/photorealistic/other), checkboxes `image_creative_mode, auto_enhance_prompt, use_consistent_character, talking_video, narration_video, shared, advanced_mode`; advanced: `enhance_video_prompt, video_only, manual_video_length`, range `#opt_video_duration` (3–10).
- Narration (CloneVoice.ai tab): selects `#tts_voice_category`, `#tts_voice_clone_lang`, `#tts_voice_clone_voice` (wrapped by jQuery `searchableSelect`; set with `$(s).val(v).trigger('change')`), text `textarea[name=tts_voice_clone_text]`. Lists load async after each change.
- Episode/scene `ajustes`: `tipo_imagen, modo_creativo, mejorar_prompt, personaje_consistente, lipsync, narracion, solo_video, duracion, modo_avanzado, mejorar_prompt_video` (scene overrides episode).
- Verified live 2026-11-15: searchableSelect renames native selects to `#tts_voice_clone_lang--native` / `#tts_voice_clone_voice--native` (the plain ids are the search inputs). CloneVoice tab = `a[data-toggle=tab][href="#tab-fourth"]` (Text to Speech tab is default). Buttons: `.button-generate-image-submit`, `.button-generate-talking-video` (narration mode), `.tts_voice_button_import`, `.bbm-modal .button-submit` (Create Narration Video). "Automatically enhance my image prompt" is ON by default and rewrites the prompt.
