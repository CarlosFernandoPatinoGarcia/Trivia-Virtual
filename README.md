# Trivia Virtual

Breve descripción
------------------

`Trivia Virtual` es un proyecto inicial de una aplicación web de trivia. Actualmente el repositorio contiene únicamente la página principal estática.

Estado actual
------------

- Elementos presentes:
  - `index.html` — interfaz principal (archivo estático).

Requisitos
---------

- Navegador web moderno (Chrome, Edge, Firefox).
- Opcional: servidor HTTP local para servir archivos (recomendado durante el desarrollo).

Cómo ejecutar (rápido)
----------------------

- Método simple: abrir `index.html` en tu navegador.
- Servidor local con Python (recomendado para evitar restricciones de CORS si agregas peticiones):

```
python -m http.server 8000
```

Luego abrir `http://localhost:8000` en el navegador.

Qué sigue / Ideas de desarrollo
------------------------------

- Separar lógica de JavaScript en un archivo `app.js` o similar.
- Añadir un archivo JSON con preguntas o integrar un backend para obtener preguntas dinámicamente.
- Implementar estilos en `styles.css` y mejorar la accesibilidad.
- Añadir pruebas básicas y una guía para contribuir.

Contribuir
----------

- Haz fork del repositorio y crea una rama con un nombre descriptivo (`feature/nueva-pregunta`, `fix/estilos`).
- Abre un Pull Request con una descripción clara de los cambios.

Licencia
--------

Licencia: pendiente (añadir licencia apropiada, p. ej. MIT, Apache-2.0).

Contacto
--------

- Repositorio: `Trivia-Virtual` (propietario: `CarlosFernandoPatinoGarcia`).

Última actualización
--------------------

2025-11-20 — Documentación inicial basada en el contenido actual del repositorio.

Cambios añadidos (2025-11-22)
-----------------------------

- **Carpeta assets:** añadida `assets/README_assets.txt` (explica nombres esperados para GLB: `avatar_base.glb`, `avatar_anim.glb`).
- **Módulos JS:** añadidos `js/chatbot.js` (cliente modular con fallback local) y `js/glb-loader.js` (ayudante para cargar GLB usando `THREE.GLTFLoader`).
- **Instrucciones chatbot:** añadido `chatbot_instructions.txt` describiendo cómo conectar Botpress y el modo local.

Cómo usar lo nuevo
------------------

- Para pruebas rápidas sin servicios externos, la app ahora puede usar el `ChatbotClient` en modo local (fallback). No requiere cambios en `index.html` para funcionar.
- Para usar GLB (avatar + animación): coloca tus archivos `avatar_base.glb` y `avatar_anim.glb` dentro de `assets/`. El helper `GLBLoaderHelper.loadAvatarAssets()` buscará esos nombres por convención.

Pruebas y ejemplo de avatar
---------------------------

- He añadido `js/avatar-controller.js` que carga un GLB (público o local) y reproduce animaciones.
- Para pruebas de humo abre `tests/avatar_test.html` en el navegador (sirviendo el proyecto con `python -m http.server 8000`). El test carga un GLB público (Fox) y ejecuta `playCorrect()` y `playIncorrect()` automáticamente.

WebXR
-----

- Se añadió soporte básico para WebXR mediante `js/webxr-manager.js` y cambios en la gestión de la escena (`SceneManager`) para usar `renderer.setAnimationLoop`. Esto permite entrar en modo VR en dispositivos compatibles.
- Comportamiento: si el navegador y dispositivo soportan WebXR, aparecerá un botón `Entrar VR` en la esquina inferior derecha. Al entrar, la sesión VR será administrada por el navegador y la app seguirá actualizando la escena y las animaciones (incluido el `AvatarController`).
- Requisitos y notas:
  - WebXR requiere un contexto seguro (HTTPS) o `localhost` durante desarrollo.
  - Navegadores compatibles: Chrome/Edge con soporte WebXR en plataformas compatibles; en escritorio puede ser necesario usar emuladores o el WebXR API Emulator extension para pruebas.
  - Para pruebas locales usa:

```powershell
python -m http.server 8000
# abrir http://localhost:8000 en Chrome/Edge compatible
```

 - Si no ves el botón `Entrar VR`, tu navegador no expone `navigator.xr` o el dispositivo no soporta sesiones `immersive-vr`.


Ejemplo de ejecución local (PowerShell):

```powershell
python -m http.server 8000
# luego abrir http://localhost:8000/tests/avatar_test.html
```

Integración Botpress (ejemplo)
-----------------------------

- Se añadió `js/botpress_example.js` con un ejemplo simple de cómo crear un `ChatbotClient` remoto y enviar un payload para validación.
- Revisa `chatbot_instructions.txt` para la guía de despliegue de Botpress.


