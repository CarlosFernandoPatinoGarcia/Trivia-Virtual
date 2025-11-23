// Simple WebXR manager: creates an Enter VR button and wires a WebXR session
// to a Three.js renderer. This avoids depending on three.js example modules
// and works when the browser exposes navigator.xr.

(function (global) {
    function createXRButton(renderer, options = {}) {
        const button = document.createElement('button');
        button.style.position = 'absolute';
        button.style.bottom = '20px';
        button.style.right = '20px';
        button.style.padding = '10px 14px';
        button.style.background = '#1b1b1bcc';
        button.style.color = '#fff';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.zIndex = 9999;
        button.id = 'enter-vr-button';

        let currentSession = null;

        function showNotSupported() {
            button.textContent = 'WebXR no soportado';
            button.disabled = true;
            button.style.opacity = '0.6';
        }

        async function onButtonClick() {
            if (!navigator.xr) {
                console.warn('WebXR no disponible en este navegador.');
                return;
            }

            if (currentSession === null) {
                try {
                    const sessionInit = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };
                    const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
                    currentSession = session;
                    // three.js renderer exposes xr API
                    if (renderer && renderer.xr) {
                        renderer.xr.enabled = true;
                        renderer.xr.setSession(session);
                    }
                    button.textContent = 'Salir VR';

                    session.addEventListener('end', () => {
                        currentSession = null;
                        button.textContent = 'Entrar VR';
                        if (renderer && renderer.xr) renderer.xr.setSession(null);
                    });
                } catch (err) {
                    console.error('No se pudo iniciar la sesión WebXR:', err);
                }
            } else {
                await currentSession.end();
            }
        }

        // Feature-detect: prefer navigator.xr
        if (typeof navigator !== 'undefined' && navigator.xr) {
            button.textContent = 'Entrar VR';
            button.addEventListener('click', onButtonClick);
        } else {
            showNotSupported();
        }

        return button;
    }

    // Export
    global.WebXRManager = {
        createXRButton,
    };
})(window);
