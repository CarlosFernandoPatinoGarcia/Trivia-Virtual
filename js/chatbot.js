/**
 * js/chatbot.js
 * Sistema de Chatbot XR-IA "Ultimate".
 * INCLUYE:
 * 1. Contexto de Juego (Score, Waves, Items).
 * 2. Modo Híbrido (Simulación / API Real).
 * 3. Ejecución de Comandos 3D.
 * 4. VOZ BIDIRECCIONAL (Speech-to-Text y Text-to-Speech).
 */

class ChatbotSystem {
    constructor(appInstance) {
        this.app = appInstance;
        
        // --- CONFIGURACIÓN ---
        // 1. API KEY: Pon tu llave de OpenAI aquí para inteligencia real.
        // Si lo dejas vacío "", usa el modo Simulación (Gratis).
        this.apiKey = ""; 
        this.apiUrl = "https://api.openai.com/v1/chat/completions"; 
        
        this.useRealAI = this.apiKey.length > 10; 

        // Configuración de Voz
        this.voiceEnabled = true; // ¿El bot habla?
        this.recognition = null;  // STT (Escuchar)
        this.synth = window.speechSynthesis; // TTS (Hablar)

        // --- REFERENCIAS DOM ---
        this.dom = {
            input: document.getElementById('chat-input-field'),
            btn: document.getElementById('chat-send-btn'),
            mic: document.getElementById('chat-mic-btn'), // ¡Asegúrate de tener este botón en HTML!
            msgs: document.getElementById('chat-messages-area')
        };

        // Inicialización
        if(this.dom.input && this.dom.btn && this.dom.msgs) {
            this.initListeners();
            this.initVoiceRecognition();

            // Mensaje de bienvenida
            setTimeout(() => {
                const welcomeMsg = `Sistema de voz en línea. Tienes ${this.app.state.score} créditos.`;
                this.renderMessage('AI', welcomeMsg);
                this.speak(welcomeMsg); // El bot te saluda hablando
            }, 1000);

            console.log(`Chatbot Module: Cargado. Voz: ${'webkitSpeechRecognition' in window ? 'Soportada' : 'No soportada'}.`);
        } else {
            console.warn("Chatbot Module: Faltan elementos UI (Revisa el ID del botón micrófono).");
        }
    }

    // ==========================================
    //       1. SISTEMA DE VOZ (STT / TTS)
    // ==========================================

    initVoiceRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'es-ES'; // Español
            this.recognition.continuous = false;
            this.recognition.interimResults = false;

            // Eventos del micrófono
            this.recognition.onstart = () => {
                // Efecto visual: Botón rojo palpitando
                if(this.dom.mic) {
                    this.dom.mic.classList.remove('bg-gray-700');
                    this.dom.mic.classList.add('bg-red-600', 'animate-pulse');
                }
                this.dom.input.placeholder = "Escuchando...";
            };

            this.recognition.onend = () => {
                if(this.dom.mic) {
                    this.dom.mic.classList.add('bg-gray-700');
                    this.dom.mic.classList.remove('bg-red-600', 'animate-pulse');
                }
                this.dom.input.placeholder = "Escribe o habla...";
            };

            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                this.dom.input.value = transcript;
                // Enviar automáticamente lo que escuchó
                this.handleInput(); 
            };

        } else {
            console.warn("Navegador no soporta Web Speech API.");
            if(this.dom.mic) this.dom.mic.style.display = 'none'; // Ocultar botón si no soporta
        }
    }

    speak(text) {
        if (!this.voiceEnabled || !this.synth) return;

        // Cancelar habla anterior
        this.synth.cancel();

        // Limpiar el texto de comandos ocultos {{TAGS}} para que no los lea
        // Ej: "Hola {{DANCE}}" -> "Hola"
        const cleanText = text.replace(/\{\{.*?\}\}/g, ''); 

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'es-ES';
        utterance.rate = 1.1; // Velocidad
        utterance.pitch = 1.0; // Tono

        // Buscar voz en español
        const voices = this.synth.getVoices();
        const esVoice = voices.find(v => v.lang.includes('es') || v.lang.includes('Spanish'));
        if (esVoice) utterance.voice = esVoice;

        this.synth.speak(utterance);
    }

    // ==========================================
    //       2. MANEJO DE INPUTS
    // ==========================================

    initListeners() {
        // Enviar con click
        this.dom.btn.addEventListener('click', () => this.handleInput());

        // Enviar con Enter
        this.dom.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleInput();
        });

        // Activar Micrófono
        if (this.dom.mic && this.recognition) {
            this.dom.mic.addEventListener('click', () => {
                try {
                    this.recognition.start();
                } catch (e) {
                    this.recognition.stop();
                }
            });
        }
    }

    async handleInput() {
        const text = this.dom.input.value.trim();
        if (!text) return;

        // 1. Renderizar mensaje Usuario
        this.renderMessage('USER', text);
        this.dom.input.value = ''; // Limpiar

        // 2. Loading
        const loadingId = this.renderLoading();

        try {
            if (this.useRealAI) {
                await this.callRealAI(text, loadingId);
            } else {
                // Simulación (con delay para realismo)
                setTimeout(() => this.simulateAI(text, loadingId), 600);
            }
        } catch (error) {
            console.error(error);
            this.removeLoading(loadingId);
            const errText = "Error de conexión con el servidor.";
            this.renderMessage('AI', errText);
            this.speak(errText);
        }
    }

    // ==========================================
    //       3. LÓGICA DE IA (REAL vs SIM)
    // ==========================================

    async callRealAI(userText, loadingId) {
        // Prompt del Sistema con Contexto del Juego
        const gameContext = `
            ERES LA IA DEL JUEGO "TRIVIA XR".
            ESTADO ACTUAL:
            - Créditos: ${this.app.state.score}
            - Pistas: ${this.app.state.hints}
            - Ola: ${this.app.waveCount}
            - Items Congelar: ${this.app.state.inventory.freeze}
            
            TU SALIDA DEBE INCLUIR COMANDOS AL FINAL SI ES NECESARIO:
            {{START_WAVE}}, {{BUY_HINT}} (300cr), {{BUY_FREEZE}} (500cr), {{USE_HINT}}, {{USE_FREEZE}}, {{DANCE}}.

            REGLA: Respuestas cortas, útiles y habladas naturalmente.
        `;

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-3.5-turbo",
                    messages: [
                        { role: "system", content: gameContext },
                        { role: "user", content: userText }
                    ],
                    temperature: 0.7,
                    max_tokens: 100
                })
            });

            const data = await response.json();
            const aiText = data.choices[0].message.content;

            this.removeLoading(loadingId);
            this.processResponse(aiText);

        } catch (e) {
            throw e; 
        }
    }

    simulateAI(text, loadingId) {
        this.removeLoading(loadingId);
        const lower = text.toLowerCase();
        let response = "";

        // Lógica simple de palabras clave
        if (lower.includes('comprar') || lower.includes('dame')) {
            if (lower.includes('pista')) {
                if (this.app.state.score >= 300) response = "Comprando pistas. {{BUY_HINT}}";
                else response = "No tienes créditos suficientes para pistas.";
            } 
            else if (lower.includes('congelar')) {
                if (this.app.state.score >= 500) response = "Comprando congelador temporal. {{BUY_FREEZE}}";
                else response = "Te faltan créditos para el congelador.";
            } else {
                response = "Puedo venderte Pistas (300) o Congeladores (500).";
            }
        }
        else if (lower.includes('iniciar') || lower.includes('empezar')) {
             if (this.app.ui.hub.style.display !== 'none' || this.app.currentQIndex === 0) {
                response = "Iniciando la siguiente ola. ¡Suerte! {{START_WAVE}}";
             } else {
                response = "Ya estamos jugando. Concéntrate en la pregunta.";
             }
        }
        else if (lower.includes('usar pista') || lower.includes('ayuda')) {
            if (this.app.state.hints > 0) response = "Escaneando sonrisa para pista. {{USE_HINT}}";
            else response = "No tienes pistas disponibles.";
        }
        else if (lower.includes('parar') || lower.includes('tiempo')) {
             if (this.app.state.inventory.freeze > 0) response = "Deteniendo el tiempo. {{USE_FREEZE}}";
             else response = "No tienes items de congelación.";
        }
        else if (lower.includes('baila') || lower.includes('fiesta')) {
            response = "¡Modo fiesta activado! {{DANCE}}";
        }
        else if (lower.includes('hola') || lower.includes('estado')) {
            response = `Hola. Estás en la ola ${this.app.waveCount} y tienes ${this.app.state.score} créditos.`;
        }
        else {
            const randoms = [
                "No entendí ese comando.",
                "Intenta decir: 'Comprar pista' o 'Iniciar juego'.",
                "Estoy procesando datos de la trivia.",
                "Comando no reconocido."
            ];
            response = randoms[Math.floor(Math.random() * randoms.length)];
        }
        
        this.processResponse(response);
    }

    // ==========================================
    //       4. PROCESADOR DE RESPUESTA
    // ==========================================

    processResponse(fullText) {
        let displayText = fullText;
        let command = null;

        // Extraer comando {{TAG}}
        const match = fullText.match(/\{\{([A-Z_]+)\}\}/);
        if (match) {
            command = match[1]; 
            displayText = fullText.replace(match[0], '').trim();
        }

        // 1. Mostrar Texto
        this.renderMessage('AI', displayText);

        // 2. Hablar Texto (TTS)
        this.speak(displayText);

        // 3. Ejecutar Comando (con pequeño delay para sincronizar)
        if (command) {
            console.log(`[IA] Comando: ${command}`);
            setTimeout(() => this.executeGameAction(command), 500);
        }
    }

    executeGameAction(cmd) {
        switch(cmd) {
            case 'START_WAVE':
                this.app.startWave();
                break;
            case 'BUY_HINT':
                if (this.app.state.buyItem('hints', 300)) {
                    this.app.scene.spawnItem('hints');
                    if(this.app.audio) this.app.audio.play('click');
                }
                break;
            case 'BUY_FREEZE':
                if (this.app.state.buyItem('freeze', 500)) {
                    this.app.scene.spawnItem('freeze');
                    if(this.app.audio) this.app.audio.play('click');
                }
                break;
            case 'USE_HINT':
                this.app.activateHintLogic();
                break;
            case 'USE_FREEZE':
                this.app.freezeTime();
                break;
            case 'DANCE':
                this.triggerDanceEffect();
                break;
        }
    }

    triggerDanceEffect() {
        // Avatar Baila
        if(this.app.avatarController) {
            this.app.avatarController.playState('correct').catch(() => {});
        }
        // Núcleo Baila
        if(this.app.scene && this.app.scene.core) {
            const core = this.app.scene.core;
            const originalColor = core.material.emissive.getHex();
            
            let c = 0;
            const interval = setInterval(() => {
                c++;
                core.material.emissive.setHex(Math.random() * 0xffffff);
                core.scale.setScalar(1 + Math.sin(c * 0.5) * 0.3);
                core.rotation.y += 0.2;
                
                if (c > 40) {
                    clearInterval(interval);
                    core.material.emissive.setHex(originalColor);
                    core.scale.setScalar(1);
                }
            }, 50);
        }
    }

    // ==========================================
    //       5. UI HELPERS
    // ==========================================

    renderMessage(type, text) {
        if (!text) return;
        const div = document.createElement('div');
        
        if (type === 'AI') {
            div.className = "bg-blue-900/60 border-l-2 border-blue-400 p-2 rounded text-xs text-blue-100 mb-2 shadow animate-pulse";
            div.innerHTML = `<i class="fas fa-robot mr-1 text-blue-400"></i> ${text}`;
        } else {
            div.className = "bg-green-900/30 border-r-2 border-green-400 p-2 rounded text-xs text-right text-green-100 mb-2 ml-auto w-3/4";
            div.textContent = text;
        }

        this.dom.msgs.appendChild(div);
        this.dom.msgs.scrollTop = this.dom.msgs.scrollHeight;
    }

    renderLoading() {
        const id = 'loading-' + Date.now();
        const div = document.createElement('div');
        div.id = id;
        div.className = "text-xs text-gray-400 ml-4 mb-2 italic";
        div.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Procesando...`;
        this.dom.msgs.appendChild(div);
        this.dom.msgs.scrollTop = this.dom.msgs.scrollHeight;
        return id;
    }

    removeLoading(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }
}