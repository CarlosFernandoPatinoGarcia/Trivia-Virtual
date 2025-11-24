// --- CONFIG ---
const WAVE_SIZE = 3;
const QUESTION_TIME = 10; // segundos

// --- 1. STATE MANAGER ---
class StateManager {
    constructor(uiCallback) {
        this.score = 0; // Créditos
        this.hints = 3; // Pistas disponibles
        this.inventory = {
            freeze: 0
        };
        this.stats = {
            correctAnswersInWave: 0,
            totalItems: 0
        };
        this.uiCallback = uiCallback;
    }

    update(key, value) {
        if (key === 'score') this.score += value;
        if (key === 'hints') this.hints += value;

        this.uiCallback(key, this[key] !== undefined ? this[key] : value);
    }

    buyItem(item, cost) {
        if (this.score >= cost) {
            this.score -= cost;
            if (item === 'hints') this.hints += 3;
            if (item === 'freeze') {
                this.inventory.freeze++;
                this.stats.totalItems++;
            }
            this.uiCallback('score', this.score);
            this.uiCallback('hints', this.hints);
            return true;
        }
        return false;
    }

    resetWaveStats() {
        this.stats.correctAnswersInWave = 0;
    }
}

// --- 2. VISION SYSTEM (Hands + Face) ---
class VisionSystem {
    constructor(videoElement, cursorElement, callbacks) {
        this.video = videoElement;
        this.cursor = cursorElement;
        this.callbacks = callbacks; // { onMove, onClick, onSmile }
        this.isActive = false;
        this.mode = 'HANDS'; // 'HANDS' or 'FACE_HINT'

        // Config Hands
        this.hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
        this.hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.9 });
        this.hands.onResults(this.onHandResults.bind(this));

        // Config Face Mesh (Solo se carga, se usa bajo demanda)
        this.faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
        this.faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.7 });
        this.faceMesh.onResults(this.onFaceResults.bind(this));
    }

    async start() {
        try {
            this.camera = new Camera(this.video, {
                onFrame: async () => {
                    if (this.mode === 'HANDS') await this.hands.send({ image: this.video });
                    if (this.mode === 'FACE_HINT') await this.faceMesh.send({ image: this.video });
                },
                width: 640, height: 480
            });
            await this.camera.start();
            this.isActive = true;
            this.cursor.style.display = 'block';
            if (this.callbacks && typeof this.callbacks.onCameraStart === 'function') {
                try { this.callbacks.onCameraStart(); } catch (e) { }
            }
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    async stop() {
        try {
            if (this.camera && typeof this.camera.stop === 'function') {
                await this.camera.stop();
            }
            this.isActive = false;
            this.cursor.style.display = 'none';
            if (this.callbacks && typeof this.callbacks.onCameraStop === 'function') {
                try { this.callbacks.onCameraStop(); } catch (e) { }
            }
            return true;
        } catch (e) {
            console.warn('VisionSystem.stop error', e);
            return false;
        }
    }

    setMode(mode) {
        this.mode = mode;
        if (mode === 'HANDS') this.cursor.style.display = 'block';
        else this.cursor.style.display = 'none';
    }

    onHandResults(results) {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const lm = results.multiHandLandmarks[0];
            const indexTip = lm[8];
            const thumbTip = lm[4];

            // Cursor
            const x = 1 - indexTip.x; const y = indexTip.y;
            this.cursor.style.left = `${x * 100}%`; this.cursor.style.top = `${y * 100}%`;
            this.callbacks.onMove({ x: (x * 2) - 1, y: -(y * 2) + 1 });

            // Click (Pinza)
            const dist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
            if (dist < 0.05) {
                if (!this.lastPinch) { this.cursor.classList.add('clicking'); this.callbacks.onClick(); }
                this.lastPinch = true;
            } else {
                this.cursor.classList.remove('clicking');
                this.lastPinch = false;
            }
        }
    }

    onFaceResults(results) {
        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const lm = results.multiFaceLandmarks[0];
            // Indices para labios: 13 (arriba), 14 (abajo), 61 (izq), 291 (der)
            const left = lm[61]; const right = lm[291];
            const mouthWidth = Math.hypot(left.x - right.x, left.y - right.y);

            // Umbral simple de sonrisa: anchura de boca
            // Valor empírico, puede variar según distancia
            if (mouthWidth > 0.15) { // Si sonríe amplio
                this.callbacks.onSmile();
            }
        }
    }
}

// --- 3. SCENE MANAGER (3D Visuals) ---
class SceneManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050505);
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 1.5, 5);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        // XR disabled until a session is requested by the WebXR manager
        this.renderer.xr.enabled = false;
        this.container.appendChild(this.renderer.domElement);

        // Clock for animation updates and hook for external update callbacks
        this.clock = new THREE.Clock();
        this.onTick = null; // external callback: function(delta)

        this.itemsGroup = new THREE.Group();
        this.scene.add(this.itemsGroup);

        // Audio-reactive analyser (can be attached later)
        this.audioAnalyser = null;
        this.analyserData = null;
        this._audioVisualSmooth = 0.0;

        this.initWorld();
        this.animate();
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    initWorld() {
        const grid = new THREE.GridHelper(50, 50, 0x00d2ff, 0x111111);
        this.scene.add(grid);

        const ambient = new THREE.AmbientLight(0x404040);
        const dir = new THREE.DirectionalLight(0xffffff, 1);
        dir.position.set(5, 10, 7);
        this.scene.add(ambient, dir);

        // Núcleo
        const geo = new THREE.IcosahedronGeometry(1, 1);
        const mat = new THREE.MeshPhongMaterial({ color: 0x00d2ff, wireframe: true, emissive: 0x001133 });
        this.core = new THREE.Mesh(geo, mat);
        this.core.position.y = 1.5;
        this.scene.add(this.core);
    }

    // Attach an AnalyserNode to make visuals react to audio
    setAudioAnalyser(analyser) {
        try {
            this.audioAnalyser = analyser;
            this.analyserData = new Uint8Array(analyser.frequencyBinCount);
        } catch (e) {
            console.warn('Failed to set audio analyser', e);
            this.audioAnalyser = null;
            this.analyserData = null;
        }
    }

    spawnItem(type) {
        // Genera item visual en el "Hub" (alrededor del núcleo)
        const geo = type === 'hints' ? new THREE.ConeGeometry(0.3, 0.6, 8) : new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const color = type === 'hints' ? 0xffff00 : 0x00ffff;
        const mat = new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.5 });
        const mesh = new THREE.Mesh(geo, mat);

        const angle = Math.random() * Math.PI * 2;
        const rad = 3 + Math.random();
        mesh.position.set(Math.cos(angle) * rad, 1 + Math.random(), Math.sin(angle) * rad);

        this.itemsGroup.add(mesh);
    }

    animate() {
        // Use Three.js XR-friendly loop. External systems can subscribe via onTick(delta).
        this.renderer.setAnimationLoop(() => {
            const delta = this.clock.getDelta();
            // Audio-reactive visual: read analyser and modulate core scale/emissive
            if (this.audioAnalyser && this.analyserData) {
                try {
                    this.audioAnalyser.getByteFrequencyData(this.analyserData);
                    // Compute average energy
                    let sum = 0;
                    for (let i = 0; i < this.analyserData.length; i++) sum += this.analyserData[i];
                    const avg = sum / this.analyserData.length; // 0-255
                    const norm = avg / 255; // 0-1
                    // smooth the value
                    this._audioVisualSmooth = this._audioVisualSmooth * 0.85 + norm * 0.15;
                    const scale = 1 + this._audioVisualSmooth * 2.99; // scale range 1 - 3
                    this.core.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.6);
                    // emissive color lerp between dark and bright
                    if (this.core.material && this.core.material.emissive) {
                        const base = new THREE.Color(0x001133);
                        const bright = new THREE.Color(0x00d2ff);
                        this.core.material.emissive.lerpColors(base, bright, this._audioVisualSmooth);
                    }
                } catch (e) {
                    // If analyser reading fails, fallback to gentle idle rotation
                    this.core.rotation.y += 0.005;
                    this.core.rotation.x += 0.002;
                }

                // audio UI wiring removed from render loop (moved to App.bindEvents)
            } else {
                this.core.rotation.y += 0.005;
                this.core.rotation.x += 0.002;
            }

            // Rotar items comprados
            this.itemsGroup.children.forEach(item => {
                item.rotation.y += 0.02;
                item.position.y += Math.sin(Date.now() * 0.002) * 0.005;
            });

            // Call external per-frame updates (e.g., avatar mixers)
            try {
                if (typeof this.onTick === 'function') this.onTick(delta);
            } catch (e) { console.warn('onTick error', e); }

            this.renderer.render(this.scene, this.camera);
        });
    }
}

// --- 4. APP LOGIC ---
class App {
    constructor() {
        this.scene = new SceneManager('canvas-container');
        this.state = new StateManager(this.updateUI.bind(this));
        this.vision = new VisionSystem(
            document.getElementById('input-video'),
            document.getElementById('hand-cursor'),
            {
                onMove: (pos) => {/* Raycast logic can go here if needed */ },
                onClick: () => this.simulateClick(),
                onSmile: () => this.unlockHint(),
                onCameraStart: () => {
                    // Slow down time while camera is active during a wave
                    if (this.isPlaying) this.setTimeMultiplier(0.6);
                },
                onCameraStop: () => {
                    // Restore normal time when camera stops
                    this.resetTimeMultiplier();
                    // If a hint preview video was shown, clear it
                    try { if (this.stopHintPreview) this.stopHintPreview(); } catch (e) { }
                }
            }
        );

        // Avatar controller: carga un avatar de prueba (GLB público) y permite reproducir animaciones
        // Fuente de ejemplo: Fox (incluye animaciones). Puedes cambiar por tus GLBs en /assets.
        this.avatarController = null;
        // const sampleAvatarUrl = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Fox/glTF-Binary/Fox.glb';

        try {
            // Configuración: indica aquí los GLB locales que has subido en `assets/3Dmodels/`.
            // Cada archivo puede contener su propio modelo + animaciones.
            // Ejemplo: { neutral: 'assets/3Dmodels/avatar_base.glb', incorrect: 'assets/3Dmodels/avatar_anim.glb', correct: 'assets/3Dmodels/avatar_correct.glb' }
            // Per-state avatar entries can be a string (src) or an object { src, desiredHeight, normalize }
            const AVATAR_STATE_FILES = {
                neutral: { src: 'assets/3Dmodels/idle_duo.glb', desiredHeight: 0.010 },
                correct: { src: 'assets/3Dmodels/Victory_duo.glb', desiredHeight: 0.010 },
                incorrect: { src: 'assets/3Dmodels/Defeated_duo.glb', desiredHeight: 0.010 }
            };

            this.avatarController = new AvatarController(this.scene.scene, { scale: 1.5, states: AVATAR_STATE_FILES });

            // Cargar solo el estado neutral al inicio y mostrarlo automáticamente.
            if (AVATAR_STATE_FILES.neutral) {
                const entry = AVATAR_STATE_FILES.neutral;
                const src = (typeof entry === 'string') ? entry : entry.src;
                const opts = (typeof entry === 'object') ? { desiredHeight: entry.desiredHeight, normalize: entry.normalize } : {};
                this.avatarController.loadState('neutral', src, opts).then(info => {
                    // mostrar neutral (sin reproducir animación obligatoria)
                    if (this.avatarController.models['neutral']) {
                        this.avatarController.models['neutral'].visible = true;
                        // Aplicar rotación inicial a todos los modelos (90° a la izquierda)
                        try {
                            this.avatarController.setRotationAll(0, Math.PI / 4.8, 0);
                            // this.avatarController.lookAtCamera(this.scene.camera);
                        } catch (e) { console.warn('No se pudo aplicar rotación inicial:', e); }
                    }
                    this.addChat('AI', `Avatar neutral cargado (${info.animations.length} anim).`);
                }).catch(err => console.warn('No se pudo cargar avatar neutral:', err));
            }

            // Guardar mapping de URLs en el controlador para uso bajo demanda
            this.avatarController.opts = this.avatarController.opts || {};
            this.avatarController.opts.states = AVATAR_STATE_FILES;

            // Optionally use <model-viewer> based loader if available (HTML-first, modular)
            let modelViewerManager = null;
            if (window.ModelViewerManager) {
                try {
                    modelViewerManager = new ModelViewerManager({ container: document.getElementById('canvas-container') });
                    // Load neutral into model-viewer if provided (supports object or string entries)
                    if (AVATAR_STATE_FILES.neutral) {
                        const entry = AVATAR_STATE_FILES.neutral;
                        const src = (typeof entry === 'string') ? entry : entry.src;
                        modelViewerManager.loadState('neutral', src).then(() => {
                            this.addChat('AI', 'Model-viewer neutral cargado.');
                        }).catch(err => console.warn('No se pudo cargar model-viewer neutral:', err));
                    }
                } catch (e) { console.warn('ModelViewerManager init failed', e); }
            }

            // Audio manager (tones). Puedes pasar un mapping de eventName -> ruta en `assets/`.
            // Ejemplo: new AudioManager({ correct: 'assets/sfx_correct.wav' })
            try {
                // No pasamos SFX en el mapping: se usarán los tonos internos de AudioManager.
                // Solo indicamos la ruta de la música de fondo si quieres usar un MP3.
                const AUDIO_MAP = {
                    background: 'assets/audio/background-futurista.mp3'
                };

                this.audio = new AudioManager(AUDIO_MAP);

                // Música de fondo opcional: intentar autoplay de forma compatible con políticas
                // Strategy: 1) intentar reproducir en modo `muted` (los navegadores suelen permitirlo)
                //           2) crear AudioContext y AnalyserNode (para visuals)
                //           3) en el primer gesto del usuario, reanudar AudioContext, desmutear y hacer fade-in
                if (this.audio.mapping && this.audio.mapping.background) {
                    try {
                        this._bgMusic = new Audio(this.audio.mapping.background);
                        this._bgMusic.loop = true;
                        // Arrancamos muted para maximizar la probabilidad de autoplay
                        this._bgMusic.muted = false;
                        // Inicial volume low (se irá subiendo al desmutear)
                        this._bgMusic.volume = 0.001;

                        // Estrategia: intentar reproducción silenciosa inmediata
                        const playPromise = this._bgMusic.play();

                        if (playPromise !== undefined) {
                            playPromise.then(() => {
                                console.log('✅ Música de fondo iniciada (volumen bajo)');
                                // Una vez que está reproduciendo, podemos ajustar el volumen
                                setTimeout(() => {
                                    this._bgMusic.volume = 0.05; // Volumen normal después de iniciar
                                }, 100);
                            }).catch(error => {
                                console.warn('Autoplay bloqueado, esperando interacción:', error);
                                this._setupAutoplayRetry();
                            });
                        }

                        // Setup WebAudio analyser to feed visuals. It's fine to create the context now.
                        try {
                            const AudioContext = window.AudioContext || window.webkitAudioContext;
                            this.audioCtx = new AudioContext();
                            // createMediaElementSource must be called once per element
                            try {
                                this._bgSource = this.audioCtx.createMediaElementSource(this._bgMusic);
                                this._analyser = this.audioCtx.createAnalyser();
                                this._analyser.fftSize = 256;
                                this._bgSource.connect(this._analyser);
                                this._analyser.connect(this.audioCtx.destination);
                                if (this.scene && typeof this.scene.setAudioAnalyser === 'function') {
                                    this.scene.setAudioAnalyser(this._analyser);
                                }
                            } catch (e) {
                                console.warn('Could not create media element source for background music', e);
                            }
                        } catch (e) {
                            console.warn('AudioContext setup failed', e);
                        }

                        // Ensure there's a desired volume value we can reference from the UI
                        this._desiredVolume = (typeof this._desiredVolume === 'number') ? this._desiredVolume : 0.05;
                        this._pendingMuted = false;

                        // On first user gesture: resume AudioContext (if suspended), unmute and fade-in the music.
                        const onFirstGesture = async () => {
                            try {
                                // Resume AudioContext if needed
                                if (this.audioCtx && this.audioCtx.state === 'suspended') {
                                    try { await this.audioCtx.resume(); } catch (e) { console.warn('AudioContext resume failed', e); }
                                }

                                // Ensure element is playing (some browsers require play() after resume)
                                try { await this._bgMusic.play(); } catch (e) { /* ignore */ }

                                // Unmute and fade in volume smoothly
                                const targetVol = (typeof this._desiredVolume === 'number') ? this._desiredVolume : 0.05;
                                this._bgMusic.muted = false;
                                // start from 0 volume if not set
                                try { this._bgMusic.volume = 0.0; } catch (e) { }
                                const fadeMs = 700;
                                const steps = 14;
                                let step = 0;
                                const iv = setInterval(() => {
                                    step++;
                                    try { this._bgMusic.volume = Math.min(targetVol, (step / steps) * targetVol); } catch (e) { }
                                    if (step >= steps) clearInterval(iv);
                                }, Math.max(10, Math.round(fadeMs / steps)));

                                console.log('Background music unmuted after user gesture');
                            } catch (e) {
                                console.warn('Error during background music activation on gesture', e);
                            } finally {
                                try { document.removeEventListener('click', onFirstGesture, true); } catch (e) { }
                            }
                        };

                        // Register once (capture) to catch the earliest gesture
                        document.addEventListener('click', onFirstGesture, { once: true, capture: true });

                    } catch (e) { console.warn('Could not init background music', e); }
                }
            } catch (e) { console.warn('AudioManager init failed', e); }


            // Helper: carga y reproduce un estado (por ejemplo 'correct' o 'incorrect').
            // REEMPLAZA tu método playAvatarState actual con este:
            this.playAvatarState = async (stateName) => {
                try {
                    // 1. Primero cargar y reproducir el estado solicitado
                    const urls = (this.avatarController && this.avatarController.opts && this.avatarController.opts.states) || {};

                    if (this.avatarController.models[stateName]) {
                        await this.avatarController.playState(stateName);
                    } else if (urls[stateName]) {
                        const entry = urls[stateName];
                        const src = (typeof entry === 'string') ? entry : entry.src;
                        const loadOpts = (typeof entry === 'object') ? {
                            desiredHeight: entry.desiredHeight,
                            normalize: entry.normalize
                        } : {};

                        await this.avatarController.loadState(stateName, src, loadOpts);
                        await this.avatarController.playState(stateName);
                    } else {
                        // Fallback a métodos básicos
                        if (stateName === 'correct') await this.avatarController.playCorrect();
                        else if (stateName === 'incorrect') await this.avatarController.playIncorrect();
                    }

                    // 2. SOLUCIÓN CLAVE: Solo volver a neutral si NO es neutral
                    if (stateName !== 'neutral' && this.avatarController.models['neutral']) {
                        // Esperar a que termine la animación actual + pequeño delay
                        const animationDuration = 0; // Duración estimada de animaciones

                        setTimeout(() => {
                            try {
                                // Hacer visible solo neutral
                                Object.keys(this.avatarController.models).forEach(k => {
                                    if (this.avatarController.models[k]) {
                                        this.avatarController.models[k].visible = (k === 'neutral');
                                    }
                                });

                                // 🔥 FORZAR reproducción en loop del neutral
                                const neutralMixer = this.avatarController.mixers['neutral'];
                                const neutralActions = this.avatarController.actionsMap['neutral'] || [];

                                if (neutralMixer && neutralActions.length > 0) {
                                    // Detener cualquier animación previa
                                    neutralActions.forEach(action => {
                                        try {
                                            action.stop();
                                            action.reset();
                                        } catch (e) { }
                                    });

                                    // Configurar y reproducir en loop
                                    const mainAction = neutralActions[0];
                                    mainAction.setLoop(THREE.LoopRepeat, Infinity);
                                    mainAction.reset();
                                    mainAction.play();

                                    console.log('✅ Animación neutral restaurada en loop');
                                }
                            } catch (e) {
                                console.warn('Error restaurando animación neutral:', e);
                            }
                        }, animationDuration);
                    }

                } catch (err) {
                    console.warn('playAvatarState error', err);
                }
            };

            // Hook avatar update into the scene animation loop
            this.scene.onTick = (delta) => {
                try {
                    if (this.avatarController && typeof this.avatarController.update === 'function') this.avatarController.update(delta);
                } catch (e) { console.warn('Avatar update error', e); }
            };

            // Add WebXR entry/exit button to the page (if supported)
            if (window.WebXRManager) {
                try {
                    const xrBtn = WebXRManager.createXRButton(this.scene.renderer);
                    document.body.appendChild(xrBtn);
                } catch (e) { console.warn('Error creating XR button', e); }
            }
        } catch (e) {
            console.warn('AvatarController no disponible', e);
        }

        // Variables de Juego
        this.questions = this.shuffleArray(this.generateQuestions());
        this.currentQIndex = 0;
        this.waveCount = 1;
        this.maxWaves = 3; // Número de oleadas por partida (configurable)
        // Número de preguntas por oleada (inicializado desde la constante WAVE_SIZE)
        this.questionsPerWave = WAVE_SIZE;
        // Contador global de aciertos (para calcular porcentaje al final)
        this.totalCorrectAnswers = 0;
        // Indica si el usuario ya configuró manualmente las opciones de juego
        this.userConfigSet = false;
        // Indica si hay una oleada activa en curso (respondiendo preguntas)
        this.isPlaying = false;
        this.gameOver = false; // cuando true no se mostrarán más preguntas hasta reinicio
        this.timer = null;
        this.timeLeft = QUESTION_TIME;
        this.timeMultiplier = 1; // 1 = normal speed, <1 = slower time
        this.isFrozen = false;
        this.isHintActive = false;

        this.ui = {
            score: document.getElementById('score-display'),
            hints: document.getElementById('hints-display'),
            wave: document.getElementById('wave-display'),
            timerBar: document.getElementById('timer-bar'),
            qPanel: document.getElementById('question-panel'),
            qText: document.getElementById('q-text'),
            qCat: document.getElementById('q-category'),
            answers: document.getElementById('answers-grid'),
            //chat: document.getElementById('chat-container'),
            hub: document.getElementById('hub-overlay'),
            hintOverlay: document.getElementById('hint-overlay'),
            btnFreeze: document.getElementById('btn-freeze')
        };

        this.bindEvents();

        // 5. --- INTEGRACIÓN DEL CHATBOT MODULAR (AQUÍ ES EL CAMBIO) ---
        // Verificamos que la clase ChatbotSystem exista (cargada desde chatbot.js)
        if (typeof ChatbotSystem !== 'undefined') {
            // Le pasamos 'this' (la instancia de App) para que el bot pueda controlar el juego
            this.chatbot = new ChatbotSystem(this);
        } else {
            console.warn("El archivo js/chatbot.js no se ha cargado o la clase no existe.");
        }

        // this.startSystem();
    }

    // Fisher-Yates shuffle helper
    shuffleArray(arr) {
        const a = Array.isArray(arr) ? arr.slice() : [];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    generateQuestions() {
        // Mock Data expandido
        const base = [
            { t: "¿Planeta Rojo?", c: "Astronomía", o: ["Venus", "Marte", "Júpiter", "Saturno"], a: 1, h: "Es el cuarto planeta desde el Sol." },
            { t: "Símbolo del Oro", c: "Química", o: ["Ag", "Au", "Fe", "Cu"], a: 1, h: "Viene del latín Aurum." },
            { t: "E = mc^2 es de...", c: "Física", o: ["Newton", "Einstein", "Tesla", "Bohr"], a: 1, h: "Famoso por su teoría de la relatividad." },
            { t: "Capital de Japón", c: "Geografía", o: ["Seúl", "Tokio", "Pekín", "Bangkok"], a: 1, h: "Ciudad famosa por el cruce de Shibuya." },
            { t: "¿Hueso más largo?", c: "Anatomía", o: ["Fémur", "Tibia", "Húmero", "Radio"], a: 0, h: "Está en el muslo." },
            { t: "Padre de la computación", c: "Historia", o: ["Turing", "Gates", "Jobs", "Babbage"], a: 0, h: "Descifró el código Enigma." },
            { t: "Velocidad de la luz", c: "Física", o: ["300.000 km/s", "150.000 km/s", "1.000 km/s", "3.000 km/s"], a: 0, h: "Es lo más rápido del universo." },
            { t: "Pintó la Mona Lisa", c: "Arte", o: ["Van Gogh", "Da Vinci", "Picasso", "Monet"], a: 1, h: "Renacentista italiano." },
            { t: "Raíz cuadrada de 64", c: "Matemáticas", o: ["6", "8", "10", "4"], a: 1, h: "8 por 8." },
            { t: "Creador de Facebook", c: "Tecnología", o: ["Musk", "Zuckerberg", "Bezos", "Page"], a: 1, h: "Empezó en Harvard." },

            // Nuevas (30 adicionales)
            { t: "¿Autor del Quijote?", c: "Literatura", o: ["Lope de Vega", "Cervantes", "Góngora", "Quevedo"], a: 1, h: "El manco de Lepanto." },
            { t: "Elemento 'O'", c: "Química", o: ["Oro", "Osmio", "Oxígeno", "Oganesón"], a: 2, h: "Vital para la respiración humana." },
            { t: "¿Dónde está la Torre Eiffel?", c: "Geografía", o: ["Londres", "Berlín", "Roma", "París"], a: 3, h: "Capital de Francia." },
            { t: "Año llegada a la Luna", c: "Historia", o: ["1969", "1975", "1960", "1980"], a: 0, h: "Un pequeño paso para el hombre." },
            { t: "Animal más rápido (tierra)", c: "Biología", o: ["León", "Guepardo", "Gacela", "Caballo"], a: 1, h: "Felino africano con manchas." },
            { t: "Fundador de Microsoft", c: "Tecnología", o: ["Steve Jobs", "Bill Gates", "Jeff Bezos", "Tim Cook"], a: 1, h: "Amigo de Paul Allen." },
            { t: "¿Cuántos lados tiene un hexágono?", c: "Matemáticas", o: ["5", "6", "7", "8"], a: 1, h: "Piensa en un panal de abejas." },
            { t: "Pintó 'La Noche Estrellada'", c: "Arte", o: ["Dalí", "Van Gogh", "Rembrandt", "Matisse"], a: 1, h: "Se cortó una oreja." },
            { t: "Moneda del Reino Unido", c: "Economía", o: ["Euro", "Dólar", "Libra", "Franco"], a: 2, h: "Esterlina." },
            { t: "¿Qué es el 'HTML'?", c: "Tecnología", o: ["Hardware", "Lenguaje Web", "Base de datos", "Sistema Operativo"], a: 1, h: "Estructura las páginas de internet." },
            { t: "Diosa griega de la sabiduría", c: "Mitología", o: ["Afrodita", "Hera", "Atenea", "Artemisa"], a: 2, h: "Nació de la cabeza de Zeus." },
            { t: "Continente más grande", c: "Geografía", o: ["América", "África", "Asia", "Europa"], a: 2, h: "Contiene a China y la India." },
            { t: "Fórmula del agua", c: "Química", o: ["HO", "H2O", "H2O2", "OH"], a: 1, h: "Dos de hidrógeno, uno de oxígeno." },
            { t: "Primer presidente de EE.UU.", c: "Historia", o: ["Lincoln", "Washington", "Jefferson", "Franklin"], a: 1, h: "Aparece en el billete de 1 dólar." },
            { t: "¿Qué estudia la botánica?", c: "Ciencia", o: ["Animales", "Rocas", "Plantas", "Estrellas"], a: 2, h: "Reino Plantae." },
            { t: "Valor aproximado de Pi", c: "Matemáticas", o: ["3.14", "3.41", "3.12", "3.16"], a: 0, h: "Relación circunferencia-diámetro." },
            { t: "Instrumento para ver estrellas", c: "Astronomía", o: ["Microscopio", "Telescopio", "Periscopio", "Estetoscopio"], a: 1, h: "Galileo lo perfeccionó." },
            { t: "Capital de Alemania", c: "Geografía", o: ["Múnich", "Hamburgo", "Berlín", "Frankfurt"], a: 2, h: "Tuvo un muro famoso." },
            { t: "¿Quién es '007'?", c: "Cine", o: ["James Bond", "Indiana Jones", "Ethan Hunt", "Jason Bourne"], a: 0, h: "Al servicio de su Majestad." },
            { t: "Planeta con anillos visibles", c: "Astronomía", o: ["Marte", "Saturno", "Mercurio", "Neptuno"], a: 1, h: "Sexto planeta del sistema solar." },
            { t: "Idioma más hablado (nativo)", c: "Demografía", o: ["Inglés", "Español", "Chino Mandarín", "Hindi"], a: 2, h: "Principalmente en China." },
            { t: "Metal líquido a temperatura ambiente", c: "Química", o: ["Hierro", "Mercurio", "Plomo", "Aluminio"], a: 1, h: "Usado en termómetros antiguos." },
            { t: "Rey de los dioses nórdicos", c: "Mitología", o: ["Thor", "Loki", "Odin", "Baldur"], a: 2, h: "Padre de todo, tiene un solo ojo." },
            { t: "Creador de Mickey Mouse", c: "Entretenimiento", o: ["Walt Disney", "Stan Lee", "Hanna-Barbera", "Matt Groening"], a: 0, h: "Fundó un imperio de animación." },
            { t: "Órgano que bombea sangre", c: "Anatomía", o: ["Hígado", "Corazón", "Pulmón", "Cerebro"], a: 1, h: "Late constantemente." },
            { t: "¿Qué es la 'RAM'?", c: "Tecnología", o: ["Disco Duro", "Memoria Volátil", "Procesador", "Tarjeta Gráfica"], a: 1, h: "Se borra al apagar la PC." },
            { t: "País del Sol Naciente", c: "Geografía", o: ["China", "Corea", "Japón", "Tailandia"], a: 2, h: "Su bandera es un círculo rojo." },
            { t: "Resultado de 7 x 8", c: "Matemáticas", o: ["54", "56", "48", "64"], a: 1, h: "Cincuenta y..." },
            { t: "Autor de Harry Potter", c: "Literatura", o: ["Tolkien", "J.K. Rowling", "George R.R. Martin", "Stephen King"], a: 1, h: "Escritora británica." },
            { t: "¿Qué gas respiramos?", c: "Biología", o: ["Helio", "Metano", "Oxígeno", "Dióxido de Carbono"], a: 2, h: "O2." }
        ];
        // Duplicar para tener suficientes para el demo
        return [...base, ...base, ...base];
    }

    startSystem() {
        // Este método ahora será llamado desde la pantalla de inicio
        // Mostrar pantalla inicial y pedir al usuario que configure mediante el chatbot
        setTimeout(() => {
            document.getElementById('loader').style.display = 'none';
            this.addChat("AI", "Sistema Inicializado. Bienvenido.");
            // Indicaciones para configurar por chatbot
            this.addChat('AI', 'Para configurar escribe: "oleadas: <totalOleadas>" ó "preguntas: <totalPreguntas>".');
            this.addChat('AI', 'Cuando quieras empezar escribe: "iniciar". Si no configuras nada, se usarán los valores por defecto.');
        }, 1500);
    }

    // Si el usuario no configuró las opciones, preguntar mediante prompt (se puede omitir)
    askGameConfigIfNeeded() {
        if (this.userConfigSet) return;
        try {
            const qPer = window.prompt(`Preguntas por oleada (por defecto ${this.questionsPerWave}):`, this.questionsPerWave);
            const waves = window.prompt(`Número de oleadas (por defecto ${this.maxWaves}):`, this.maxWaves);
            const qn = parseInt(qPer, 10);
            const wn = parseInt(waves, 10);
            if (!isNaN(qn) && qn > 0) this.questionsPerWave = Math.min(Math.max(qn, 1), 50);
            if (!isNaN(wn) && wn > 0) this.maxWaves = Math.min(Math.max(wn, 1), 20);
            // Rebarajar preguntas y reset de contadores relevantes
            this.questions = this.shuffleArray(this.generateQuestions());
            this.totalCorrectAnswers = 0;
            this.userConfigSet = true;
            this.addChat('AI', `Configuración: ${this.questionsPerWave} preguntas/oleada, ${this.maxWaves} oleadas.`);
        } catch (e) {
            console.warn('askGameConfigIfNeeded error', e);
        }
    }

    // Permite al chatbot (u otra parte) establecer la configuración programáticamente
    setGameConfig(numWaves, questionsPerWave) {
        if (typeof numWaves === 'number' && numWaves > 0) this.maxWaves = Math.min(Math.max(Math.floor(numWaves), 1), 50);
        if (typeof questionsPerWave === 'number' && questionsPerWave > 0) this.questionsPerWave = Math.min(Math.max(Math.floor(questionsPerWave), 1), 100);
        this.questions = this.shuffleArray(this.generateQuestions());
        this.totalCorrectAnswers = 0;
        this.userConfigSet = true;
        // Actualizar UI del contador de oleadas si está presente
        try { if (this.ui && this.ui.wave) this.ui.wave.textContent = `Wave ${this.waveCount}/${this.maxWaves}`; } catch (e) { }
        this.addChat('AI', `Configuración establecida: ${this.questionsPerWave} preguntas/oleada, ${this.maxWaves} oleadas.`);
    }

    // Permite que el Chatbot (o cualquier UI) envíe comandos de texto para configurar/iniciar
    processChatCommand(text) {
        if (!text || typeof text !== 'string') return;
        const t = text.trim().toLowerCase();

        // Pre-parse config commands so we can block them if a wave is active
        const pre_m1 = t.match(/^(?:oleadas)\s*[:\s]+(\d+)$/i);
        const pre_m2 = t.match(/^(?:preguntas)\s*[:\s]+(\d+)$/i);
        if (this.isPlaying && (pre_m1 || pre_m2)) {
            this.addChat('AI', 'No puedes cambiar las oleadas o preguntas mientras una oleada está en curso. Espera a que termine la oleada o reinicia la partida.');
            return true;
        }

        // oleadas: <n>
        const m1 = t.match(/^(?:oleadas)\s*[:\s]+(\d+)$/i);
        if (m1) {
            const n = parseInt(m1[1], 10);
            if (!isNaN(n) && n > 0) {
                this.maxWaves = Math.min(Math.max(n, 1), 50);
                this.userConfigSet = true;
                this.addChat('AI', `Se estableció número de oleadas: ${this.maxWaves}. Ejemplo: escribe "preguntas: 5" si también quieres cambiar preguntas por oleada.`);
                try { if (this.ui && this.ui.wave) this.ui.wave.textContent = `Wave ${this.waveCount}/${this.maxWaves}`; } catch (e) { }
                return true;
            }
        }

        // preguntas: <n>
        const m2 = t.match(/^(?:preguntas)\s*[:\s]+(\d+)$/i);
        if (m2) {
            const n = parseInt(m2[1], 10);
            if (!isNaN(n) && n > 0) {
                this.questionsPerWave = Math.min(Math.max(n, 1), 100);
                this.userConfigSet = true;
                this.addChat('AI', `Se estableció preguntas por oleada: ${this.questionsPerWave}. Ejemplo: escribe "oleadas: 3" para cambiar el número de oleadas.`);
                try { if (this.ui && this.ui.wave) this.ui.wave.textContent = `Wave ${this.waveCount}/${this.maxWaves} - 0/${this.questionsPerWave}`; } catch (e) { }
                return true;
            }
        }

        // iniciar -> comenzar la primera ola
        if (t === 'iniciar' || t === 'start') {
            if (this.isPlaying) {
                this.addChat('AI', 'Ya hay una oleada en curso. No puedes iniciar otra hasta terminar la actual.');
                return true;
            }
            // Rebarajar preguntas cuando se inicia con nueva configuración
            this.questions = this.shuffleArray(this.generateQuestions());
            this.totalCorrectAnswers = 0;
            this.waveCount = 1;
            this.currentQIndex = 0;
            this.gameOver = false;
            this.addChat('AI', 'Iniciando la primera oleada... ¡buena suerte!');
            this.startWave();
            return true;
        }

        // Si no coincide con nada, informar al usuario
        this.addChat('AI', 'Comando no reconocido. Usa "oleadas: <n>", "preguntas: <n>" o "iniciar". Ejemplo: "oleadas: 3" y luego "preguntas: 5", luego escribe "iniciar".');
        return false;
    }

    startWave() {
        if (this.gameOver) {
            console.log('Partida finalizada. Reinicia para jugar de nuevo.');
            return;
        }
        this.state.resetWaveStats();
        this.currentQIndex = 0;
        // Marcar que la oleada está activa
        this.isPlaying = true;
        this.ui.hub.style.display = 'none';
        this.ui.wave.textContent = `Wave ${this.waveCount}/${this.maxWaves}`;
        // Ensure neutral avatar is visible (load if needed)
        try {
            const urls = (this.avatarController && this.avatarController.opts && this.avatarController.opts.states) || {};
            if (this.avatarController && this.avatarController.models && this.avatarController.models['neutral']) {
                // make sure neutral is visible
                Object.keys(this.avatarController.models).forEach(k => { this.avatarController.models[k].visible = (k === 'neutral'); });
            } else if (urls['neutral'] && this.avatarController) {
                this.avatarController.loadState('neutral', urls['neutral']).then(async info => {
                    try {
                        if (this.avatarController.models['neutral']) {
                            this.avatarController.models['neutral'].visible = true;
                            // ensure neutral animation is playing
                            if (typeof this.avatarController.playState === 'function') await this.avatarController.playState('neutral');
                        }
                    } catch (e) { console.warn('Error playing neutral after load in startWave', e); }
                }).catch(e => console.warn('No se pudo cargar neutral en startWave', e));
            }
        } catch (e) { console.warn(e); }

        this.nextQuestion();
    }

    nextQuestion() {
        if (this.gameOver) return; // no mostrar preguntas si ya ganó
        if (this.currentQIndex >= this.questionsPerWave) {
            this.endWave();
            return;
        }

        // Calcular índice global de pregunta: (oleadaActual-1) * preguntasPorOleada + índiceDentroDeOleada
        const globalIndex = ((this.waveCount - 1) * this.questionsPerWave + this.currentQIndex) % this.questions.length;
        const q = this.questions[globalIndex];
        this.currentQ = q;

        // UI Update
        this.ui.qText.textContent = q.t;
        this.ui.qCat.textContent = q.c;
        this.ui.wave.textContent = `Wave ${this.waveCount}/${this.maxWaves} - ${this.currentQIndex + 1}/${this.questionsPerWave}`;
        this.ui.answers.innerHTML = '';

        // Shuffle options so answer positions vary each time
        const opts = q.o.map((opt, i) => ({ opt, idx: i }));
        const shuffled = this.shuffleArray(opts);
        // Store mapping for validation
        this.currentOptions = shuffled.map(s => s.opt);
        this.correctOptionIndex = shuffled.findIndex(s => s.idx === q.a);

        this.currentOptions.forEach((opt, i) => {
            const btn = document.createElement('button');
            btn.className = "bg-blue-900/50 hover:bg-blue-600 border border-blue-500/30 text-white p-3 rounded transition answer-btn";
            btn.textContent = opt;
            btn.onclick = () => { if (this.audio) this.audio.play('click'); this.answer(i); };
            this.ui.answers.appendChild(btn);
        });

        // Reset estados
        this.ui.qPanel.classList.remove('scale-0', 'opacity-0');
        this.ui.qPanel.classList.add('scale-100', 'opacity-100');
        this.ui.btnFreeze.style.display = this.state.inventory.freeze > 0 ? 'flex' : 'none';

        this.startTimer();
    }

    startTimer() {
        this.timeLeft = QUESTION_TIME;
        this.isFrozen = false;
        this.ui.timerBar.style.width = '100%';
        this.ui.timerBar.className = ''; // reset colors

        if (this.timer) clearInterval(this.timer);

        this.timer = setInterval(() => {
            if (this.isFrozen) return;

            // Decrement time by the multiplier (allows slowing down when camera is active)
            this.timeLeft -= (this.timeMultiplier || 1);
            const pct = (this.timeLeft / QUESTION_TIME) * 100;
            this.ui.timerBar.style.width = `${Math.max(0, pct)}%`;

            // Visual + audio warning when time is low
            if (this.timeLeft <= 5 && this.timeLeft > 0) {
                this.ui.timerBar.classList.add('timer-critical');
                try { if (this.audio) this.audio.play('time_tick'); } catch (e) { }
            }

            // Extra urgent pattern for the last 3 seconds
            if (this.timeLeft <= 3 && this.timeLeft > 0) {
                try { if (this.audio) this.audio.play('time_last'); } catch (e) { }
            }

            if (this.timeLeft <= 0) {
                clearInterval(this.timer);
                try { if (this.audio) this.audio.play('time_warning'); } catch (e) { }
                this.answer(-1); // Time out
            }
        }, 1000);
    }

    answer(index) {
        clearInterval(this.timer);
        // Animación salida
        this.ui.qPanel.classList.remove('scale-100', 'opacity-100');
        this.ui.qPanel.classList.add('scale-0', 'opacity-0');

        // Validar
        let msg = "";
        if (index === -1) {
            msg = "Tiempo agotado.";
            try { if (this.playAvatarState) this.playAvatarState('incorrect'); else this.avatarController && this.avatarController.playIncorrect(); } catch (e) { }
            if (this.audio) this.audio.play('incorrect');
        } else if (index === this.correctOptionIndex) {
            msg = "Correcto. +100 CR";
            this.state.update('score', 100);
            // Visual feedback: flash the score/credits display
            try { this.flashScore(); } catch (e) { }
            this.state.stats.correctAnswersInWave++;
            this.totalCorrectAnswers++;
            try { if (this.playAvatarState) this.playAvatarState('correct'); else this.avatarController && this.avatarController.playCorrect(); } catch (e) { }
            if (this.audio) { this.audio.play('correct'); setTimeout(() => { this.audio.play('points'); }, 120); }
        } else {
            const correctText = (this.currentQ && this.currentQ.o && typeof this.currentQ.a === 'number') ? this.currentQ.o[this.currentQ.a] : 'N/A';
            msg = `Incorrecto. Era: ${correctText}`;
            try { if (this.playAvatarState) this.playAvatarState('incorrect'); else this.avatarController && this.avatarController.playIncorrect(); } catch (e) { }
            if (this.audio) this.audio.play('incorrect');
        }
        this.addChat("AI", msg);

        this.currentQIndex++;
        setTimeout(() => this.nextQuestion(), 1500);
    }

    // --- FUNCIONES DE AYUDA Y PODERES ---
    activateHintLogic() {
        if (this.state.hints <= 0) {
            this.addChat("AI", "No tienes pistas. Cómpralas en el Hub.");
            return;
        }

        // Activar modo Face Mesh
        this.isHintActive = true;
        this.vision.setMode('FACE_HINT');
        this.ui.hintOverlay.classList.remove('hidden');
        // Mostrar vista previa espejo de la cámara dentro del overlay
        try { this.startHintPreview(); } catch (e) { }
        // Slow time while the facial scan is active so user has more time to respond
        if (this.isPlaying) this.setTimeMultiplier(0.6);
        this.addChat("AI", "Escaneando rostro... ¡Sonríe para desbloquear!");
    }

    unlockHint() {
        if (!this.isHintActive) return;

        this.isHintActive = false;
        this.vision.setMode('HANDS'); // Volver a manos
        this.ui.hintOverlay.classList.add('hidden');
        // Limpiar vista previa
        try { this.stopHintPreview(); } catch (e) { }

        // Gasta pista
        this.state.update('hints', -1);

        // Mostrar Pista visualmente (elimina 1 opción incorrecta o muestra texto)
        const hintText = document.createElement('div');
        hintText.className = "bg-yellow-600 text-white p-2 rounded mt-2 animate-bounce";
        hintText.innerHTML = `<i class="fas fa-info-circle"></i> Pista: ${this.currentQ.h}`;
        this.ui.answers.appendChild(hintText);

        this.addChat("AI", "Pista desbloqueada por gesto facial.");
        // Restaurar tiempo a la normalidad
        this.resetTimeMultiplier();
    }

    freezeTime() {
        if (this.state.inventory.freeze > 0 && !this.isFrozen) {
            this.isFrozen = true;
            this.state.inventory.freeze--;
            this.ui.timerBar.classList.add('timer-frozen');
            this.ui.btnFreeze.style.display = 'none'; // Gastado
            this.addChat("AI", "Tiempo congelado temporalmente.");
        }
    }

    // --- HUB & SHOP ---
    endWave() {
        // Si ya llegamos al número máximo de oleadas, declarar victoria
        if (this.waveCount >= this.maxWaves) {
            this.gameOver = true;
            // La oleada ha terminado, marcar que no hay juego activo
            this.isPlaying = false;
            // Restaurar tiempo en caso de que se haya ralentizado por la cámara
            this.resetTimeMultiplier();
            this.ui.hub.style.display = 'flex';

            document.getElementById('hub-score').textContent = this.state.stats.correctAnswersInWave;
            document.getElementById('hub-credits').textContent = this.state.score;
            document.getElementById('hub-items').textContent = this.state.stats.totalItems;

            // Calcular porcentaje total de aciertos en la partida
            const totalQuestions = this.maxWaves * this.questionsPerWave;
            const percent = totalQuestions > 0 ? Math.round((this.totalCorrectAnswers / totalQuestions) * 100) : 0;
            this.addChat('AI', `🏆 Has completado las ${this.maxWaves} oleadas. Aciertos: ${this.totalCorrectAnswers}/${totalQuestions} (${percent}%).`);

            // Aplicar regla del 70%: si >=70% mantiene/créditos, si <70% pierde los créditos acumulados
            if (percent >= 70) {
                this.addChat('AI', `🎉 Excelente — superaste el 70% (${percent}%). Mantienes tus créditos: ${this.state.score} CR.`);
            } else {
                const lost = this.state.score;
                this.state.score = 0;
                // Actualizar UI del score inmediatamente
                this.updateUI('score', this.state.score);
                this.addChat('AI', `😕 No alcanzaste el 70% (${percent}%). Perdiste tus créditos acumulados (${lost} CR).`);
            }

            // Cambiar el botón para reiniciar la partida (preservando créditos)
            const btnNext = document.getElementById('btn-next-wave');
            if (btnNext) {
                btnNext.textContent = 'REINICIAR JUEGO';
                btnNext.onclick = () => { this.resetGame(); };
            }
            this.currentQIndex = 0; // Se resetea el índice de preguntas para evitar errores con el chatbot
            return;
        }

        // Si aún quedan oleadas, preparar la siguiente
        this.waveCount++;
        // La oleada finalizó: momento de hub, no hay juego activo hasta iniciar siguiente ola
        this.isPlaying = false;
        // Restaurar tiempo en caso de que se haya ralentizado por la cámara
        this.resetTimeMultiplier();
        this.ui.hub.style.display = 'flex';

        // Actualizar Stats del Hub
        document.getElementById('hub-score').textContent = this.state.stats.correctAnswersInWave;
        document.getElementById('hub-credits').textContent = this.state.score;
        document.getElementById('hub-items').textContent = this.state.stats.totalItems;
    }

    // Reinicia la partida para jugar otra vez, preservando créditos acumulados
    resetGame() {
        this.gameOver = false;
        this.waveCount = 1;
        this.state.resetWaveStats();
        // Permitir reconfiguración al reiniciar
        this.userConfigSet = false;
        this.totalCorrectAnswers = 0;
        this.isPlaying = false;
        this.resetTimeMultiplier();
        this.questions = this.shuffleArray(this.generateQuestions());
        // Restaurar botón de siguiente ola
        const btnNext = document.getElementById('btn-next-wave');
        if (btnNext) {
            btnNext.textContent = 'INICIAR SIGUIENTE OLA';
            btnNext.onclick = () => { if (this.audio) this.audio.play('click'); this.startWave(); };
        }
        // Repetir indicaciones de configuración via chatbot
        this.addChat('AI', 'Si deseas, configura las opciones con: "oleadas: <n>" y "preguntas: <n>". Cuando estés listo escribe "iniciar".');
        // Ocultar hub y volver a la pantalla de inicio del juego
        if (this.ui && this.ui.hub) this.ui.hub.style.display = 'none';
        this.addChat('AI', '✅ Partida reiniciada. Cuando quieras, inicia la primera ola.');
    }

    // --- UTILS ---
    bindEvents() {
        // Safe DOM lookups: verify elements exist before assigning handlers.
        const btnCamera = document.getElementById('btn-camera');
        if (btnCamera) {
            btnCamera.onclick = () => {
                if (this.audio) this.audio.play('click');
                if (!this.vision || !this.vision.isActive) {
                    this.vision.start().then(ok => {
                        if (ok) this.addChat("AI", "Cámara activa.");
                    });
                } else {
                    this.vision.stop().then(ok => {
                        if (ok) this.addChat("AI", "Cámara detenida.");
                    });
                }
            };
        }

        // Eventos In-Game
        const btnUseHint = document.getElementById('btn-use-hint');
        if (btnUseHint) {
            btnUseHint.onclick = () => {
                if (this.audio) this.audio.play('click');
                // Antes de activar la lógica de pista (FaceMesh) nos aseguramos de solicitar permisos
                // y arrancar la cámara. Si no se consigue, avisamos al usuario.
                this.vision.start().then(ok => {
                    if (ok) {
                        this.activateHintLogic();
                    } else {
                        this.addChat('AI', 'No se pudo activar la cámara para la pista. Revisa permisos.');
                    }
                }).catch(err => {
                    console.warn('Camera start error for hint', err);
                    this.addChat('AI', 'Error al iniciar la cámara.');
                });
            };
        }

        const btnFreeze = document.getElementById('btn-freeze');
        if (btnFreeze) btnFreeze.onclick = () => { if (this.audio) this.audio.play('click'); this.freezeTime(); };

        // Cancel hint scan button
        const btnCancelHint = document.getElementById('btn-cancel-hint');
        if (btnCancelHint) btnCancelHint.onclick = () => {
            if (!this.isHintActive) return;
            this.isHintActive = false;
            this.vision.setMode('HANDS');
            this.ui.hintOverlay.classList.add('hidden');
            try { this.stopHintPreview(); } catch (e) { }
            if (this.audio) this.audio.play('cancel');
            this.addChat('AI', 'Escaneo cancelado.');
            // Restaurar tiempo si estaba ralentizado
            this.resetTimeMultiplier();
        };

        // Eventos Hub (safe)
        const btnNextWave = document.getElementById('btn-next-wave');
        if (btnNextWave) btnNextWave.onclick = () => { if (this.audio) this.audio.play('click'); this.startWave(); };

        const shopHint = document.getElementById('shop-hint');
        if (shopHint) {
            shopHint.onclick = () => {
                if (this.audio) this.audio.play('click');
                if (this.state.buyItem('hints', 300)) {
                    this.addChat("AI", "Pistas recargadas.");
                    this.scene.spawnItem('hints');
                    const hubCredits = document.getElementById('hub-credits');
                    if (hubCredits) hubCredits.textContent = this.state.score; // Actualizar visual
                } else this.addChat("AI", "Créditos insuficientes.");
            };
        }

        const shopFreeze = document.getElementById('shop-freeze');
        if (shopFreeze) {
            shopFreeze.onclick = () => {
                if (this.audio) this.audio.play('click');
                if (this.state.buyItem('freeze', 500)) {
                    this.addChat("AI", "Congelador adquirido.");
                    this.scene.spawnItem('freeze');
                    const hubCredits = document.getElementById('hub-credits');
                    if (hubCredits) hubCredits.textContent = this.state.score;
                } else this.addChat("AI", "Créditos insuficientes.");
            };
        }

        // Audio controls wiring (mute button + volume slider) - operate on App._bgMusic
        try {
            const audioToggle = document.getElementById('btn-audio-toggle');
            const audioVolume = document.getElementById('audio-volume');

            const setToggleIcon = (muted, btn) => {
                if (!btn) return;
                btn.innerHTML = muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
            };

            if (typeof this._desiredVolume !== 'number') this._desiredVolume = 0.05;

            if (audioToggle) {
                // reflect initial state (bg starts muted by default)
                const initialMuted = this._bgMusic ? !!this._bgMusic.muted : true;
                setToggleIcon(initialMuted, audioToggle);
                audioToggle.onclick = () => {
                    if (this._bgMusic) {
                        this._bgMusic.muted = !this._bgMusic.muted;
                        setToggleIcon(this._bgMusic.muted, audioToggle);
                    } else {
                        // store pending state until bgMusic exists
                        this._pendingMuted = !this._pendingMuted;
                        setToggleIcon(this._pendingMuted, audioToggle);
                    }
                };
            }

            if (audioVolume) {
                const currentVol = this._bgMusic ? (this._bgMusic.volume || this._desiredVolume) : this._desiredVolume;
                audioVolume.value = Math.round(Math.max(0, Math.min(1, currentVol)) * 100);
                audioVolume.oninput = (e) => {
                    const v = Number(e.target.value) / 100;
                    this._desiredVolume = v;
                    if (this._bgMusic) {
                        try { this._bgMusic.volume = v; } catch (e) { }
                    }
                };
            }
        } catch (e) { console.warn('Audio UI wiring failed', e); }
    }

    // Método para reintentar cuando haya interacción
    _setupAutoplayRetry() {
        const retryPlay = async () => {
            try {
                await this._bgMusic.play();
                console.log('✅ Música iniciada después de interacción');
                this._bgMusic.volume = 0.05; // Volumen normal
            } catch (e) {
                console.warn('Falló el reintento de música:', e);
            }
            // Remover listeners después del primer éxito
            document.removeEventListener('click', retryPlay);
            document.removeEventListener('keydown', retryPlay);
            document.removeEventListener('touchstart', retryPlay);
        };

        // Múltiples eventos de interacción
        document.addEventListener('click', retryPlay, { once: true });
        document.addEventListener('keydown', retryPlay, { once: true });
        document.addEventListener('touchstart', retryPlay, { once: true });
    }

    // Control de la velocidad del tiempo de preguntas
    setTimeMultiplier(factor) {
        try {
            const f = Number(factor) || 1;
            this.timeMultiplier = Math.max(0.2, Math.min(f, 2));
            this.addChat('AI', 'Tiempo ralentizado temporalmente para ayudar con el tracking.');
        } catch (e) { }
    }

    resetTimeMultiplier() {
        this.timeMultiplier = 1;
        this.addChat('AI', 'Velocidad de tiempo restaurada a la normalidad.');
    }

    // Inicia la vista previa de la cámara dentro del overlay de pista (no detiene la cámara)
    startHintPreview() {
        try {
            const hintVid = document.getElementById('hint-video');
            const inputVid = document.getElementById('input-video');
            if (!hintVid) return;
            // Preferir el stream ya disponible en el elemento de entrada (gestión por Mediapipe Camera)
            if (inputVid && inputVid.srcObject) {
                try {
                    hintVid.srcObject = inputVid.srcObject;
                } catch (e) {
                    // Some browsers may not allow direct assignment; try captureStream fallback
                    try { hintVid.srcObject = inputVid.captureStream(); } catch (ee) { }
                }
            }
            hintVid.muted = true;
            hintVid.playsInline = true;
            hintVid.style.display = '';
            const p = hintVid.play(); if (p && p.catch) p.catch(() => { });
        } catch (e) { console.warn('startHintPreview error', e); }
    }

    // Limpia la vista previa sin detener la cámara compartida
    stopHintPreview() {
        try {
            const hintVid = document.getElementById('hint-video');
            if (!hintVid) return;
            try { hintVid.pause(); } catch (e) { }
            try { hintVid.srcObject = null; } catch (e) { hintVid.removeAttribute('src'); }
            hintVid.style.display = 'none';
        } catch (e) { console.warn('stopHintPreview error', e); }
    }

    addChat(who, text) {
        // Si el módulo del chatbot existe, le pedimos a él que pinte el mensaje
        if (this.chatbot) {
            this.chatbot.renderMessage(who, text);
        } else {
            // Por si acaso el archivo JS falló al cargar, lo vemos en consola
            console.log(`[${who}]: ${text}`);
        }
    }

    simulateClick() {
        // Simulación click para manos
        const cursor = document.getElementById('hand-cursor');
        const rect = cursor.getBoundingClientRect();
        const el = document.elementFromPoint(rect.left, rect.top);
        if (el && el.click) el.click();
    }

    updateUI(key, val) {
        if (key === 'score') this.ui.score.textContent = `${val} CR`;
        if (key === 'hints') this.ui.hints.textContent = val;
    }

    flashScore() {
        try {
            const el = this.ui.score;
            if (el) {
                el.classList.add('score-flash');
                setTimeout(() => el.classList.remove('score-flash'), 350);
            }

            const hubCredits = document.getElementById('hub-credits');
            if (hubCredits) {
                hubCredits.classList.add('score-flash');
                setTimeout(() => hubCredits.classList.remove('score-flash'), 500);
            }
        } catch (e) { /* silent */ }
    }
}

window.onload = () => { window.app = new App(); };
