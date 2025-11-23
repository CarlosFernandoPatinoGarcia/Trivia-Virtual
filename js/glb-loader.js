/* GLB Loader helper usando THREE.GLTFLoader
   - Busca los archivos en `assets/` por convención: `avatar_base.glb` y `avatar_anim.glb`
   - Devuelve promesas con los objetos cargados y un AnimationMixer para reproducir la animación.
*/
(function (global) {
    function loadGLTF(url) {
        return new Promise((resolve, reject) => {
            if (!THREE || !THREE.GLTFLoader) return reject(new Error('THREE o GLTFLoader no disponibles'));
            const loader = new THREE.GLTFLoader();
            loader.load(url, gltf => resolve(gltf), undefined, err => reject(err));
        });
    }

    async function loadAvatarAssets(basePath = 'assets/3Dmodels') {
        // Por compatibilidad, permitimos pasar 'assets' u otra ruta.
        // Por defecto asumimos que los GLB se encuentran en `assets/3Dmodels`.
        const baseUrl = `${basePath}/avatar_base.glb`;
        const candidateAnims = ['Victory_duo.glb', 'Victory-duo.glb', 'avatar_anim.glb', 'avatar_correct.glb', 'duo_incorrect.glb'];
        const result = { base: null, anim: null, mixer: null };

        async function tryLoadAny(names) {
            for (const n of names) {
                try {
                    const g = await loadGLTF(`${basePath}/${n}`).catch(e => null);
                    if (g) return g;
                } catch (e) { /* ignore and try next */ }
            }
            return null;
        }

        try {
            const gBase = await loadGLTF(baseUrl).catch(e => null);
            let gAnim = null;

            // Intentar cargar alguna animación candidata en orden
            gAnim = await tryLoadAny(candidateAnims);

            if (gBase) result.base = gBase.scene || gBase.scenes[0];
            if (gAnim) {
                result.anim = gAnim.animations || [];
                // preparar mixer si hay animaciones y un objeto base
                if (result.base && result.anim.length > 0) {
                    result.mixer = new THREE.AnimationMixer(result.base);
                    result.anim.forEach(clip => result.mixer.clipAction(clip).play());
                }
            }
        } catch (e) {
            console.warn('Error cargando assets GLB', e);
        }
        return result;
    }

    global.GLBLoaderHelper = { loadAvatarAssets };
})(window);
