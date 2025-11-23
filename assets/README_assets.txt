
Assets folder
=================

Esta carpeta contiene los recursos estáticos que usa la aplicación: modelos GLB, audios y otros binarios.

Modelos (GLB)
- Coloca los GLB en la carpeta `assets/3Dmodels/`.
- Nombres sugeridos (ajusta en el código si usas otros nombres):
	- `avatar_base.glb`    -> modelo base del avatar (sin animación)
	- `avatar_anim.glb`    -> GLB con animaciones para usar cuando el jugador acierta

Audio (SFX / Música de fondo)
- Coloca los efectos y música en `assets/audio/`.
- Usa rutas relativas desde la app, por ejemplo `assets/audio/sfx_click.wav` o `assets/music_bg.mp3`.
- Ejemplo de mapping que el proyecto acepta (usa en `index.html`):

		const AUDIO_MAP = {
		click: 'assets/audio/sfx_click.wav',
		correct: 'assets/audio/sfx_correct.wav',
		incorrect: 'assets/audio/sfx_incorrect.wav',
		points: 'assets/audio/sfx_points.wav',
		time_tick: 'assets/audio/sfx_tick.wav',
		time_last: 'assets/audio/sfx_last.wav',
		time_warning: 'assets/audio/sfx_warning.wav',
		background: 'assets/audio/music_bg.mp3' // música de fondo (loop)
	};

- Notas sobre la música de fondo: la reproducción automática está bloqueada por la mayoría de navegadores
	hasta que el usuario realice una interacción (clic, toque). El código del proyecto intenta reproducir
	`background` tras la primera interacción del usuario y también funciona si el usuario pulsa los botones
	que arranquen la cámara (p. ej. `Tracking` o `Usar Pista`).

Instrucciones rápidas:
- Coloca tus GLB y audios dentro de esta carpeta.
- Desde el código usan rutas como: `assets/nombre_de_archivo.ext`.

Nota: por limitaciones del repositorio no se incluyen los binarios aquí. Añade tus archivos exportados desde
Blender, Audacity, o descargados de plataformas que permitan la redistribución.
