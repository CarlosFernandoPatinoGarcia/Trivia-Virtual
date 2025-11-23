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

    async function loadAvatarAssets(basePath = 'assets') {
        const baseUrl = `${basePath}/avatar_base.glb`;
        const animUrl = `${basePath}/t-pose-duo.glb`;
        const result = { base: null, anim: null, mixer: null };
        try {
            const [gBase, gAnim] = await Promise.all([loadGLTF(baseUrl).catch(e => null), loadGLTF(animUrl).catch(e => null)]);
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
