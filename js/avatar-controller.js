/* AvatarController
   - Carga un GLB público (con o sin animaciones) y lo inserta en una escena THREE.Scene
   - Permite reproducir animaciones por índice (si existen) o aplicar animaciones simples (shake) si no hay clips suficientes
   - Uso: new AvatarController(scene, options)
           await controller.loadFromUrl(url)
           controller.playCorrect(); controller.playIncorrect();
*/
(function (global) {
    class AvatarController {
        constructor(scene, opts = {}) {
            this.scene = scene;
            this.opts = opts;
            this.model = null;
            this.mixer = null;
            this.actions = [];
            this.models = {}; // map state -> model
            this.mixers = {}; // map state -> mixer
            this.actionsMap = {}; // map state -> actions array
            this.clock = new THREE.Clock();
            this.enabled = false;
            // Note: animation updates are performed by calling update(delta) from the main loop.
        }

        // Called from the main render loop (SceneManager.onTick) to update mixers
        update(delta) {
            if (!delta && this.clock) delta = this.clock.getDelta();
            if (this.mixer) try { this.mixer.update(delta); } catch (e) { }
            Object.values(this.mixers || {}).forEach(m => { if (m) try { m.update(delta); } catch (e) { } });
        }

        // Normalize model: compute bounding box, scale to desiredHeight (meters) and center on origin
        _normalizeAndCenterModel(model, desiredHeight = 1.6) {
            try {
                // compute bbox (in model local space)
                const box = new THREE.Box3().setFromObject(model);
                const size = new THREE.Vector3();
                box.getSize(size);

                if (size.y > 0.0001) {
                    const currentHeight = size.y;
                    const scaleFactor = desiredHeight / currentHeight;
                    model.scale.multiplyScalar(scaleFactor);
                }

                // recompute bbox after scaling
                const box2 = new THREE.Box3().setFromObject(model);
                const center = new THREE.Vector3();
                box2.getCenter(center);
                const min = box2.min;

                // shift model so center is at origin and base sits at y=0
                model.position.x -= center.x;
                model.position.z -= center.z;
                model.position.y -= min.y; // put lowest point at y=0
            } catch (e) {
                console.warn('normalize failed', e);
            }
        }

        loadFromUrl(url, options = {}) {
            return new Promise((resolve, reject) => {
                try {
                    const loader = new THREE.GLTFLoader();
                    loader.load(url, gltf => {
                        const model = gltf.scene || gltf.scenes[0];
                        // wrap model in group so we can position the whole avatar while normalizing the inner model
                        const root = new THREE.Group();
                        root.add(model);

                        // normalize/center if requested (options override instance opts)
                        const normalize = (typeof options.normalize !== 'undefined') ? options.normalize : this.opts.normalize;
                        const desired = (typeof options.desiredHeight !== 'undefined') ? options.desiredHeight : (this.opts.desiredHeight || 1.6);
                        if (normalize !== false) {
                            this._normalizeAndCenterModel(model, desired);
                        } else if (this.opts.scale) {
                            model.scale.setScalar(this.opts.scale);
                        }

                        // position avatar group on the left side
                        root.position.set(this.opts.x || -1.8, this.opts.y || 0, this.opts.z || 0);
                        this.scene.add(root);
                        this.model = root;

                        if (gltf.animations && gltf.animations.length > 0) {
                            // create mixer for the inner model (not the wrapper group)
                            this.mixer = new THREE.AnimationMixer(model);
                            this.actions = gltf.animations.map(anim => this.mixer.clipAction(anim));
                            // stop any autoplaying action
                            this.actions.forEach(a => { try { a.stop(); } catch (e) { } });
                            if (this.mixer) try { this.mixer.setTime(0); } catch (e) { }
                        }

                        this.enabled = true;
                        resolve({ model: this.model, animations: gltf.animations || [] });
                    }, undefined, err => reject(err));
                } catch (e) {
                    reject(e);
                }
            });
        }

        // Load a GLB and store it under a named state (e.g. 'correct', 'incorrect')
        loadState(stateName, url, options = {}) {
            return new Promise((resolve, reject) => {
                try {
                    const loader = new THREE.GLTFLoader();
                    loader.load(url, gltf => {
                        const model = gltf.scene || gltf.scenes[0];
                        const root = new THREE.Group();
                        root.add(model);

                        // normalize/center model unless explicitly disabled (options override instance opts)
                        const normalize = (typeof options.normalize !== 'undefined') ? options.normalize : this.opts.normalize;
                        const desired = (typeof options.desiredHeight !== 'undefined') ? options.desiredHeight : (this.opts.desiredHeight || 1.6);
                        if (normalize !== false) {
                            this._normalizeAndCenterModel(model, desired);
                        } else if (this.opts.scale) {
                            model.scale.setScalar(this.opts.scale);
                        }

                        root.position.set(this.opts.x || -1.8, this.opts.y || 0, this.opts.z || 0);
                        root.visible = false; // ocultar hasta que se reproduzca
                        this.scene.add(root);

                        this.models[stateName] = root;
                        if (gltf.animations && gltf.animations.length > 0) {
                            const mixer = new THREE.AnimationMixer(model);
                            const actions = gltf.animations.map(anim => mixer.clipAction(anim));
                            // ensure actions are stopped by default (no autoplay)
                            actions.forEach(a => { try { a.stop(); } catch (e) { } });
                            mixer.setTime(0);
                            this.mixers[stateName] = mixer;
                            this.actionsMap[stateName] = actions;
                        } else {
                            this.mixers[stateName] = null;
                            this.actionsMap[stateName] = [];
                        }

                        resolve({ state: stateName, animations: gltf.animations || [] });
                    }, undefined, err => reject(err));
                } catch (e) {
                    reject(e);
                }
            });
        }

        // Play the GLB associated with a state: shows the model and plays its first animation (if any)
        playState(stateName) {
            // hide other models
            Object.keys(this.models).forEach(k => {
                if (this.models[k]) this.models[k].visible = (k === stateName);
            });

            const model = this.models[stateName];
            const actions = this.actionsMap[stateName] || [];
            const mixer = this.mixers[stateName] || null;

            if (actions && actions.length > 0 && mixer) {
                // stop all actions for that state, then play first
                actions.forEach(a => { try { a.stop(); } catch (e) { } });
                const action = actions[0];
                try {
                    action.reset();
                    action.setEffectiveTimeScale(1);
                    if (typeof action.setEffectiveWeight === 'function') action.setEffectiveWeight(1);
                    action.play();
                } catch (e) {
                    try { action.play(); } catch (ee) { }
                }
                // return a promise that resolves when the clip finishes
                const durationMs = (action._clip && action._clip.duration ? action._clip.duration : 2) * 1000 + 200;
                return new Promise((resolve) => {
                    setTimeout(() => {
                        try { action.stop(); } catch (e) { }
                        resolve(durationMs);
                    }, durationMs);
                });
            }

            // fallback on the model (pulse/shake)
            if (!model) return;
            // simple pulse visual
            const origScale = model.scale.clone();
            let start = performance.now();
            const dur = 500;
            const anim = (t) => {
                const p = (t - start) / dur;
                if (p >= 1) { model.scale.copy(origScale); return; }
                const s = 1 + Math.sin(p * Math.PI) * 0.15;
                model.scale.set(origScale.x * s, origScale.y * s, origScale.z * s);
                requestAnimationFrame(anim);
            };
            requestAnimationFrame(anim);
            // return promise resolved after pulse duration
            return new Promise((resolve) => {
                setTimeout(() => resolve(500), dur);
            });
        }

        // reproduce la animación por índice si existe; si no, aplica 'pulse' visual
        playAnimationIndex(idx) {
            if (!this.enabled) return Promise.resolve();
            if (this.actions && this.actions.length > idx && this.actions[idx]) {
                // crossfade from currently running
                this.actions.forEach(a => { try { a.stop(); } catch (e) { } });
                const action = this.actions[idx];
                try {
                    action.reset();
                    action.setEffectiveTimeScale(1);
                    if (typeof action.setEffectiveWeight === 'function') action.setEffectiveWeight(1);
                    action.play();
                } catch (e) {
                    try { action.play(); } catch (ee) { }
                }
                const durationMs = (action._clip && action._clip.duration ? action._clip.duration : 2) * 1000 + 200;
                return new Promise((resolve) => {
                    setTimeout(() => { try { action.stop(); } catch (e) { }; resolve(durationMs); }, durationMs);
                });
            }

            // fallback simple: pulse/rotate
            if (!this.model) return Promise.resolve();
            const origScale = this.model.scale.clone();
            let start = performance.now();
            const dur = 500;
            const anim = (t) => {
                const p = (t - start) / dur;
                if (p >= 1) { this.model.scale.copy(origScale); return; }
                const s = 1 + Math.sin(p * Math.PI) * 0.15;
                this.model.scale.set(origScale.x * s, origScale.y * s, origScale.z * s);
                requestAnimationFrame(anim);
            };
            requestAnimationFrame(anim);
            return new Promise((resolve) => { setTimeout(() => resolve(500), dur); });
        }

        playCorrect() {
            const correctState = (this.opts && this.opts.states && this.opts.states.correct) ? 'correct' : null;
            if (correctState && this.models['correct']) {
                return this.playState('correct');
            }
            // fallback: use default loaded model (this.model) and animation 0
            return this.playAnimationIndex(0);
        }

        playIncorrect() {
            if (this.models['incorrect']) {
                return this.playState('incorrect');
            }

            // fallback: prefer second animation in current model if exists
            if (this.actions && this.actions.length > 1) {
                return this.playAnimationIndex(1);
            }

            // fallback shake on current single model
            if (!this.model) return Promise.resolve();
            return new Promise((resolve) => {
                const origRot = this.model.rotation.z;
                const dur = 400; let start = performance.now();
                const anim = (t) => {
                    const p = (t - start) / dur;
                    if (p >= 1) { this.model.rotation.z = origRot; resolve(); return; }
                    this.model.rotation.z = origRot + Math.sin(p * Math.PI * 8) * 0.12;
                    requestAnimationFrame(anim);
                };
                requestAnimationFrame(anim);
            });
        }
    }

    global.AvatarController = AvatarController;
})(window);
