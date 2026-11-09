# Panel VE — Seventh Day Music

App para tablet Android: a la izquierda un panel con las escenas numeradas y a la derecha VideoExpress (app.videoexpress.ai).

## Instalar
1. Entra a **Releases** (en este repositorio) → la versión más nueva → descarga **PanelVE.apk**.
2. Ábrelo en la tablet. Si Android lo pide, permite "instalar apps desconocidas" para tu navegador.
3. Las versiones nuevas se instalan encima, sin perder tu sesión.

## Uso
- **Insertar IMAGEN / VIDEO:** toca la casilla en VideoExpress y luego el botón. Se borra el texto anterior y se pone el nuevo (parpadea en verde).
- **⚙ Configurar voz:** en la ventana de narración (pestaña CloneVoice.ai) pone System → Spanish → Andrés Delgado.
- **Parte 1, 2…:** la narración ya cortada a 120 caracteres o menos. Toca "Enter text" y luego la parte.
- **↶ Deshacer**, **✓ Hecha**, **Siguiente ▶**.
- **⟨** encoge el panel a una barrita (🖼 / 🎬 / ↶ / ▶ siguen funcionando).
- **↻** descarga los prompts nuevos. **⚙** ajustes: ancho del panel, modo escritorio, importar archivo.

## Episodios
`episodios/index.json` lista los episodios; cada uno es un `.json` con `fichas` (personajes y estilo, que se usan con `{{CLAVE}}` dentro de los prompts) y `escenas`.
