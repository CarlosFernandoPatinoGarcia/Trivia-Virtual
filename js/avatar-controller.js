(function (global) {
    // Minimal AvatarController: mantiene solo lo que la app usa hoy.
    class AvatarController {
        constructor(scene, opts = {}) {
            this.scene = scene;
            this.opts = opts;
            this.models = {};     // stateName -> THREE.Group
            this.mixers = {};     // stateName -> THREE.AnimationMixer
            this.actionsMap = {}; // stateName -> [THREE.AnimationAction]
            // Auto-rotate settings: enabled by default per user's request
            this.autoRotate = { enabled: false, speed: 0.5 }; // speed in radians/sec
        }

        // Actualizar mixers y aplicar auto-rotación (si está habilitada): llamar desde el bucle principal con delta
        update(delta) {
            if (!delta) return;
            // actualizar animaciones
            Object.values(this.mixers).forEach(m => { if (m) try { m.update(delta); } catch (e) { } });

            // auto-rotación: aplicar a las raíces visibles (o a todas si así lo prefieres)
            try {
                if (this.autoRotate && this.autoRotate.enabled) {
                    const speed = Number(this.autoRotate.speed) || 0; // radianes por segundo
                    if (speed !== 0) {
                        const roots = Object.values(this.models || {});
                        roots.forEach(root => {
                            if (!root) return;
                            // Solo rotar modelos visibles para no afectar estados ocultos
                            if (typeof root.visible !== 'undefined' && root.visible === false) return;
                            root.rotation.y += speed * delta;
                        });
                    }
                }
            } catch (e) {
                console.warn('autoRotate failed', e);
            }
        }

        _normalizeAndCenterModel(model, desiredHeight = 1.6) {
            try {
                const box = new THREE.Box3().setFromObject(model);
                const size = new THREE.Vector3();
                box.getSize(size);
                if (size.y > 0.0001) model.scale.multiplyScalar(desiredHeight / size.y);
                const box2 = new THREE.Box3().setFromObject(model);
                const center = new THREE.Vector3();
                box2.getCenter(center);
                const min = box2.min;
                model.position.x -= center.x; model.position.z -= center.z; model.position.y -= min.y;
            } catch (e) { console.warn('normalize failed', e); }
        }

        // Carga un GLB en un estado (ej: 'neutral', 'correct')
        loadState(stateName, url, options = {}) {
            return new Promise((resolve, reject) => {
                try {
                    const loader = new THREE.GLTFLoader();
                    loader.load(url, gltf => {
                        const model = gltf.scene || gltf.scenes[0];
                        const root = new THREE.Group();
                        root.add(model);

                        const normalize = (typeof options.normalize !== 'undefined') ? options.normalize : this.opts.normalize;
                        const desired = (typeof options.desiredHeight !== 'undefined') ? options.desiredHeight : (this.opts.desiredHeight || 1.6);
                        if (normalize !== false) this._normalizeAndCenterModel(model, desired);
                        else if (this.opts.scale) model.scale.setScalar(this.opts.scale);

                        root.position.set(this.opts.x || -2, this.opts.y || 0, this.opts.z || 2);
                        // Apply initial rotation if provided (options.rotation = { x, y, z } in radians)
                        const rot = options.rotation || this.opts.rotation;
                        if (rot) {
                            try { root.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0); } catch (e) { }
                        }
                        root.visible = false;
                        this.scene.add(root);

                        this.models[stateName] = root;

                        if (gltf.animations && gltf.animations.length > 0) {
                            const mixer = new THREE.AnimationMixer(model);
                            const actions = gltf.animations.map(anim => mixer.clipAction(anim));
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
                } catch (e) { reject(e); }
            });
        }

        // Mostrar el estado y reproducir su primera animación si existe; si no, aplicar un pulso visual
        playState(stateName) {
            Object.keys(this.models).forEach(k => { if (this.models[k]) this.models[k].visible = (k === stateName); });
            const root = this.models[stateName];
            const actions = this.actionsMap[stateName] || [];
            if (actions && actions.length > 0 && this.mixers[stateName]) {
                actions.forEach(a => { try { a.stop(); } catch (e) { } });
                const action = actions[0];
                try { action.reset(); action.setEffectiveTimeScale(1); if (typeof action.setEffectiveWeight === 'function') action.setEffectiveWeight(1); action.play(); } catch (e) { try { action.play(); } catch (ee) { } }
                const durationMs = (action._clip && action._clip.duration ? action._clip.duration : 2) * 1000 + 200;
                return new Promise((res) => setTimeout(() => { try { action.stop(); } catch (e) { } res(durationMs); }, durationMs));
            }
            if (!root) return Promise.resolve();
            return this._pulseModel(root, 500);
        }

        _pulseModel(root, duration = 500) {
            const orig = root.scale.clone();
            const start = performance.now();
            const dur = duration;
            const frame = (t) => {
                const p = (t - start) / dur;
                if (p >= 1) { root.scale.copy(orig); return; }
                const s = 1 + Math.sin(p * Math.PI) * 0.12;
                root.scale.set(orig.x * s, orig.y * s, orig.z * s);
                requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
            return new Promise((res) => setTimeout(() => res(duration), duration));
        }

        playCorrect() {
            if (this.models['correct']) return this.playState('correct');
            if (this.models['neutral']) return this._pulseModel(this.models['neutral'], 500);
            return Promise.resolve();
        }

        playIncorrect() {
            if (this.models['incorrect']) return this.playState('incorrect');
            if (this.models['neutral']) return this._pulseModel(this.models['neutral'], 400);
            const any = Object.values(this.models)[0];
            if (any) return this._pulseModel(any, 400);
            return Promise.resolve();
        }

        // Utilities to set position/rotation at runtime
        _getRootFor(stateName) {
            if (stateName && this.models[stateName]) return this.models[stateName];
            if (this.models['neutral']) return this.models['neutral'];
            return Object.values(this.models)[0] || null;
        }

        setPosition(x, y, z, stateName) {
            const root = this._getRootFor(stateName);
            if (!root) return false;
            root.position.set(x, y, z);
            return true;
        }

        setRotation(x, y, z, stateName) {
            // If a specific stateName was provided, try to set that model's rotation.
            if (stateName) {
                const root = this._getRootFor(stateName);
                if (!root) {
                    // No model loaded yet for that state: store default rotation for future loads
                    this.opts.rotation = { x: x || 0, y: y || 0, z: z || 0 };
                    // disable auto-rotation when a manual rotation is set
                    if (this.autoRotate) this.autoRotate.enabled = false;
                    return true;
                }
                root.rotation.set(x, y, z);
                if (this.autoRotate) this.autoRotate.enabled = false;
                return true;
            }

            // No stateName: apply rotation to all loaded roots (or store as default if none loaded)
            const roots = Object.values(this.models || {});
            if (!roots || roots.length === 0) {
                this.opts.rotation = { x: x || 0, y: y || 0, z: z || 0 };
                if (this.autoRotate) this.autoRotate.enabled = false;
                return true;
            }

            roots.forEach(r => { if (r) r.rotation.set(x || 0, y || 0, z || 0); });
            this.opts.rotation = { x: x || 0, y: y || 0, z: z || 0 };
            if (this.autoRotate) this.autoRotate.enabled = false;
            return true;
        }

        // Convenience: set rotation for all states (immediate if loaded, or default for future loads)
        setRotationAll(x, y, z) {
            return this.setRotation(x, y, z);
        }

        // Rotate around Y by delta radians
        rotateY(deltaRad, stateName) {
            const root = this._getRootFor(stateName);
            if (!root) return false;
            root.rotation.y += deltaRad;
            return true;
        }

        // Auto-rotate control helpers
        enableAutoRotate(enabled = true) {
            this.autoRotate = this.autoRotate || { enabled: false, speed: 0.5 };
            this.autoRotate.enabled = !!enabled;
        }

        setAutoRotateSpeed(radPerSec) {
            this.autoRotate = this.autoRotate || { enabled: false, speed: 0.5 };
            this.autoRotate.speed = Number(radPerSec) || 0;
        }

        // Make the avatar root face a specific THREE.Vector3 position (or object with .position)
        // Calling this will disable autoRotate so the avatar stays static facing the target.
        lookAtTarget(target) {
            // Accept either a Vector3 or an object with .position (like a Camera)
            if (!target) return false;
            const vec = (target.position && target.position.isVector3) ? target.position : (target.isVector3 ? target : null);
            if (!vec) {
                // Try to coerce an object with x,y,z
                if (typeof target.x === 'number' && typeof target.y === 'number' && typeof target.z === 'number') {
                    vec = new THREE.Vector3(target.x, target.y, target.z);
                } else return false;
            }

            // Choose primary root (neutral or first available)
            const root = this._getRootFor('neutral');
            if (!root) return false;

            // Compute lookAt on world space: convert target to root's parent space if necessary
            try {
                // Use lookAt to orient the root toward the target position
                root.lookAt(vec);
                // Disable auto-rotation so orientation remains static
                if (this.autoRotate) this.autoRotate.enabled = false;
                return true;
            } catch (e) {
                console.warn('lookAtTarget failed', e);
                return false;
            }
        }

        // Convenience: pass a THREE.Camera to make avatar face the camera
        lookAtCamera(camera) {
            if (!camera || !camera.position) return false;
            return this.lookAtTarget(camera.position);
        }
    }

    global.AvatarController = AvatarController;
})(window);
