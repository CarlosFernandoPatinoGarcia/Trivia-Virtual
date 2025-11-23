/**
 * js/chatbot.js
 * Sistema de Chatbot XR-IA con GOOGLE GEMINI
 * MIGRACIÓN COMPLETA DESDE OPENAI
 */

class ChatbotSystem {
    constructor(appInstance) {
        this.app = appInstance;
        
        // --- CONFIGURACIÓN GOOGLE GEMINI ---
        this.geminiApiKey = "AIzaSyDpKEzTVuXdBk2DYzKziHzRHbV-haaZWSw"; // <-- PEGA TU API KEY AQUÍ
        this.useRealAI = this.geminiApiKey && this.geminiApiKey.length > 20;
        this.geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${this.geminiApiKey}`;

        // Configuración de Voz
        this.voiceEnabled = true;
        this.recognition = null;
        this.synth = window.speechSynthesis;
        this.isListening = false;

        // --- SISTEMA DE LOGROS ---
        this.achievementSystem = {
            achievements: {
                primera_compra: { unlocked: false, name: "Primera Compra", reward: 50 },
                iniciador: { unlocked: false, name: "Iniciador", reward: 30 },
                buscador_ayuda: { unlocked: false, name: "Buscador de Ayuda", reward: 40 },
                bailarin: { unlocked: false, name: "Bailarín", reward: 60 },
                saludador: { unlocked: false, name: "Saludador", reward: 20 },
                educado: { unlocked: false, name: "Educado", reward: 25 },
                veterano: { unlocked: false, name: "Veterano", reward: 100 }
            },
            unlock: (achievementKey) => {
                if (this.achievementSystem.achievements[achievementKey] && 
                    !this.achievementSystem.achievements[achievementKey].unlocked) {
                    
                    this.achievementSystem.achievements[achievementKey].unlocked = true;
                    const achievement = this.achievementSystem.achievements[achievementKey];
                    this.app.state.update('score', achievement.reward);
                    this.renderMessage('AI', `🎉 ¡Logro desbloqueado: ${achievement.name}! +${achievement.reward} CR`);
                    return true;
                }
                return false;
            }
        };

        // --- REFERENCIAS DOM ---
        this.dom = {
            input: document.getElementById('chat-input-field'),
            btn: document.getElementById('chat-send-btn'),
            mic: document.getElementById('chat-mic-btn'),
            msgs: document.getElementById('chat-messages-area')
        };

        // Inicialización
        if(this.dom.input && this.dom.btn && this.dom.msgs && this.dom.mic) {
            this.initListeners();
            this.initVoiceRecognition();

            // Mensaje de bienvenida
            setTimeout(() => {
                const status = this.useRealAI ? "con Google Gemini" : "en modo simulación";
                const welcomeMsg = `Sistema de voz ${status}. Tienes ${this.app.state.score} créditos. Di "hola" para empezar.`;
                this.renderMessage('AI', welcomeMsg);
                this.speak(welcomeMsg);
            }, 1000);

            console.log(`Chatbot Module: Cargado. Gemini: ${this.useRealAI}. Voz: ${'webkitSpeechRecognition' in window ? 'Sí' : 'No'}`);
        } else {
            console.warn("Chatbot Module: Faltan elementos UI", this.dom);
        }
    }

    // ==========================================
    //       1. SISTEMA DE VOZ (STT / TTS)
    // ==========================================

    initVoiceRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'es-ES';
            this.recognition.continuous = false;
            this.recognition.interimResults = false;

            this.recognition.onstart = () => {
                this.isListening = true;
                this.updateMicButton(true);
                this.dom.input.placeholder = "🎤 Escuchando...";
            };

            this.recognition.onend = () => {
                this.isListening = false;
                this.updateMicButton(false);
                this.dom.input.placeholder = "Escribe o habla...";
            };

            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                this.dom.input.value = transcript;
                this.handleInput();
            };

            this.recognition.onerror = (event) => {
                console.error("Error de reconocimiento:", event.error);
                this.isListening = false;
                this.updateMicButton(false);
                this.dom.input.placeholder = "Escribe o habla...";
                
                if (event.error === 'not-allowed') {
                    this.renderMessage('AI', '🎤 Permiso de micrófono denegado. Haz clic en el ícono de micrófono en la barra de direcciones.');
                }
            };

        } else {
            console.warn("Navegador no soporta Web Speech API.");
            this.dom.mic.style.display = 'none';
        }
    }

    updateMicButton(listening) {
        if (listening) {
            this.dom.mic.classList.remove('bg-gray-700', 'hover:bg-red-600');
            this.dom.mic.classList.add('bg-red-600', 'animate-pulse');
        } else {
            this.dom.mic.classList.remove('bg-red-600', 'animate-pulse');
            this.dom.mic.classList.add('bg-gray-700', 'hover:bg-red-600');
        }
    }

    toggleSpeechRecognition() {
        if (!this.recognition) return;
        
        if (this.isListening) {
            this.recognition.stop();
        } else {
            try {
                this.recognition.start();
            } catch (e) {
                console.log("El reconocimiento ya está activo");
            }
        }
    }

    speak(text) {
        if (!this.voiceEnabled || !this.synth) return;

        this.synth.cancel();
        const cleanText = text.replace(/\{\{.*?\}\}/g, '').trim();
        if (!cleanText) return;

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'es-ES';
        utterance.rate = 1.1;
        utterance.pitch = 1.0;

        const voices = this.synth.getVoices();
        const esVoice = voices.find(v => v.lang.includes('es') || v.lang.includes('Spanish'));
        if (esVoice) utterance.voice = esVoice;

        utterance.onerror = (e) => {
            console.warn('Error en TTS:', e);
        };

        this.synth.speak(utterance);
    }

    // ==========================================
    //       2. MANEJO DE INPUTS
    // ==========================================

    initListeners() {
        this.dom.btn.addEventListener('click', () => this.handleInput());
        this.dom.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleInput();
        });
        this.dom.mic.addEventListener('click', () => {
            this.toggleSpeechRecognition();
        });
    }

    async handleInput() {
        const text = this.dom.input.value.trim();
        if (!text) return;

        this.renderMessage('USER', text);
        this.dom.input.value = '';

        const loadingId = this.renderLoading();

        try {
            if (this.useRealAI) {
                await this.callGeminiAI(text, loadingId);
            } else {
                setTimeout(() => this.simulateAI(text, loadingId), 600);
            }
        } catch (error) {
            console.error('Error en AI:', error);
            this.removeLoading(loadingId);
            this.renderMessage('AI', '🔄 Usando modo simulación...');
            setTimeout(() => this.simulateAI(text, null), 300);
        }
    }

    // ==========================================
    //       3. GOOGLE GEMINI AI (NUEVO)
    // ==========================================

    async callGeminiAI(userText, loadingId) {
    // Validar API key
    if (!this.geminiApiKey || this.geminiApiKey.includes("AIzaSyDpKEzTVuXdBk2DYzKziHzRHbV-haaZWSw")) {
        this.removeLoading(loadingId);
        this.renderMessage('AI', '🔑 Configura tu API Key de Google AI Studio en chatbot.js');
        setTimeout(() => this.simulateAI(userText, null), 300);
        return;
    }

    const gameContext = `
ERES "Core AI", el asistente inteligente de TRIVIA XR. 
Responde en ESPAÑOL de forma BREVE y ÚTIL.

--- CONTEXTO DEL JUEGO ---
Créditos: ${this.app.state.score}
Pistas: ${this.app.state.hints}  
Ola actual: ${this.app.waveCount}
Congeladores: ${this.app.state.inventory.freeze}

--- FORMATO DE RESPUESTA OBLIGATORIO ---
SI el usuario solicita una ACCIÓN del juego, DEBES incluir EXACTAMENTE UNO de estos comandos al FINAL de tu respuesta:

{{START_WAVE}} - Si pide iniciar/empezar/comenzar juego
{{BUY_HINT}} - Si pide comprar pistas/sugerencias/ayudas
{{BUY_FREEZE}} - Si pide comprar congelador/tiempo/pausa
{{USE_HINT}} - Si pide usar pista/ayuda/sugerencia
{{USE_FREEZE}} - Si pide usar congelador/parar tiempo
{{DANCE}} - Si pide bailar/fiesta/celebrar/efecto
{{CHANGE_COLORS}} - Si pide cambiar colores/luces
{{TOGGLE_MUSIC}} - Si pide música/sonido/audio
{{SPECIAL_EFFECTS}} - Si pide efectos especiales/magia

--- EJEMPLOS CORRECTOS ---
Usuario: "quiero jugar" → Tú: "¡Perfecto! Iniciando nueva ola. {{START_WAVE}}"
Usuario: "comprar pistas" → Tú: "Comprando pack de pistas. {{BUY_HINT}}"
Usuario: "usar una pista" → Tú: "Activando modo pista. {{USE_HINT}}"
Usuario: "hola" → Tú: "¡Hola! ¿Listo para la trivia?"
Usuario: "bailar" → Tú: "¡Modo baile activado! {{DANCE}}"

--- REGLAS IMPORTANTES ---
1. SOLO usa comandos {{...}} para ACCIONES del juego
2. Responde de forma natural y conversacional
3. Sé breve (máximo 2 frases)
4. Siempre en español

Ahora responde al usuario:

Usuario: "${userText}"
IA:`;

    try {
        const response = await fetch(this.geminiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: gameContext
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 120,
                    topP: 0.8,
                }
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const aiText = data.candidates[0].content.parts[0].text.trim();
            this.removeLoading(loadingId);
            this.processResponse(aiText);
        } else {
            throw new Error('Respuesta vacía de Gemini');
        }

    } catch (error) {
        this.removeLoading(loadingId);
        console.warn('Error Gemini:', error);
        this.renderMessage('AI', '🔄 Usando modo local...');
        setTimeout(() => this.simulateAI(userText, null), 300);
    }
}

    // ==========================================
    //       4. MODO SIMULACIÓN (FALLBACK)
    // ==========================================

    simulateAI(text, loadingId) {
        if (loadingId) this.removeLoading(loadingId);
        
        const lower = text.toLowerCase();
        let response = "";

        // 1. COMPRAS Y TIENDA
        if (lower.includes('comprar') || lower.includes('tienda') || lower.includes('compra') || lower.includes('shop')) {
            if (lower.includes('pista') || lower.includes('hint')) {
                if (this.app.state.score >= 300) {
                    response = "🛒 Comprando pack de 3 pistas. {{BUY_HINT}}";
                    this.achievementSystem.unlock("primera_compra");
                } else {
                    response = `❌ Necesitas 300 créditos. Tienes ${this.app.state.score}.`;
                }
            } 
            else if (lower.includes('congelar') || lower.includes('freeze') || lower.includes('tiempo')) {
                if (this.app.state.score >= 500) {
                    response = "🛒 Comprando congelador temporal. {{BUY_FREEZE}}";
                } else {
                    response = `❌ Necesitas 500 créditos. Tienes ${this.app.state.score}.`;
                }
            }
            else {
                response = "🛒 Tienda: Pistas (300cr) | Congeladores (500cr)";
            }
        }
        
        // 2. CONTROL DE JUEGO
        else if (lower.includes('iniciar') || lower.includes('empezar') || lower.includes('comenzar') || lower.includes('start') || lower.includes('jugar')) {
            if (this.app.ui.hub.style.display !== 'none' || this.app.currentQIndex === 0) {
                response = "🎮 Iniciando nueva ola. ¡Buena suerte! {{START_WAVE}}";
                this.achievementSystem.unlock("iniciador");
            } else {
                response = "⏳ Ya estás en una partida. Termina esta ola primero.";
            }
        }
        
        // 3. SISTEMA DE AYUDA
        else if (lower.includes('usar pista') || lower.includes('pista') || lower.includes('ayuda') || lower.includes('help')) {
            if (this.app.state.hints > 0) {
                response = "🎭 Activando escaneo de sonrisa para pista. {{USE_HINT}}";
                this.achievementSystem.unlock("buscador_ayuda");
            } else {
                response = "❌ No tienes pistas disponibles. Cómpralas en la tienda.";
            }
        }
        else if (lower.includes('congelar') || lower.includes('parar tiempo') || lower.includes('freeze') || lower.includes('detener')) {
            if (this.app.state.inventory.freeze > 0) {
                response = "⏸️ Congelando el tiempo. {{USE_FREEZE}}";
            } else {
                response = "❌ No tienes congeladores. Cómpralos en la tienda.";
            }
        }
        
        // 4. EFECTOS ESPECIALES
        else if (lower.includes('baila') || lower.includes('fiesta') || lower.includes('dance') || lower.includes('celebrar')) {
            response = "🎉 ¡Modo fiesta activado! {{DANCE}}";
            this.achievementSystem.unlock("bailarin");
        }
        else if (lower.includes('luces') || lower.includes('colores') || lower.includes('cambiar color')) {
            response = "🌈 Cambiando esquema de colores. {{CHANGE_COLORS}}";
        }
        else if (lower.includes('música') || lower.includes('sonido') || lower.includes('audio')) {
            response = "🎵 Alternando música de fondo. {{TOGGLE_MUSIC}}";
        }
        else if (lower.includes('efecto') || lower.includes('especial') || lower.includes('magia')) {
            response = "✨ Activando efectos especiales. {{SPECIAL_EFFECTS}}";
        }
        
        // 5. INFORMACIÓN Y ESTADO
        else if (lower.includes('hola') || lower.includes('hi') || lower.includes('hey') || lower.includes('buenas')) {
            response = `¡Hola! Ola ${this.app.waveCount} - ${this.app.state.score} créditos. ¿Listo para la trivia?`;
            this.achievementSystem.unlock("saludador");
        }
        else if (lower.includes('estado') || lower.includes('score') || lower.includes('créditos') || lower.includes('stats')) {
            response = `📊 Ola: ${this.app.waveCount} | Créditos: ${this.app.state.score} | Pistas: ${this.app.state.hints} | Congeladores: ${this.app.state.inventory.freeze}`;
        }
        
        // 6. INTERACCIÓN SOCIAL
        else if (lower.includes('gracias') || lower.includes('thanks')) {
            response = "😊 ¡De nada! A seguir conquistando trivias.";
            this.achievementSystem.unlock("educado");
        }
        else if (lower.includes('nombre') || lower.includes('cómo te llamas')) {
            response = "🤖 Soy Core AI, tu asistente de trivia XR. ¡Encantado!";
        }
        
        // 7. AYUDA GENERAL
        else if (lower.includes('qué puedo hacer') || lower.includes('comandos') || lower.includes('ayuda')) {
            response = `🎮 COMANDOS:
• "Iniciar juego" - Nueva ola
• "Comprar pista" - 300 CR
• "Usar pista" - Escanear sonrisa  
• "Mi estado" - Ver progreso
• "Bailar" - Efecto especial
• "Congelar tiempo" - Pausar reloj`;
        }
        
        // RESPUESTA POR DEFECTO
        else {
            const randomResponses = [
                "¿Podrías reformular? Prueba: 'iniciar', 'comprar pista', o 'mi estado'.",
                "No entendí eso. Comandos: 'iniciar juego', 'comprar items', 'usar pista'.",
                "Estoy aquí para ayudarte con la trivia XR. Di 'ayuda' para ver opciones."
            ];
            response = randomResponses[Math.floor(Math.random() * randomResponses.length)];
        }
        
        this.processResponse(response);
    }

    // ==========================================
    //       5. PROCESADOR DE RESPUESTA
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

        // 3. Ejecutar Comando
        if (command) {
            console.log(`[Gemini] Ejecutando: ${command}`);
            setTimeout(() => this.executeGameAction(command), 800);
        }
    }

    executeGameAction(cmd) {
        switch(cmd) {
            case 'START_WAVE':
                if (this.app.startWave) this.app.startWave();
                break;
            case 'BUY_HINT':
                if (this.app.state?.buyItem?.('hints', 300)) {
                    if(this.app.scene?.spawnItem) this.app.scene.spawnItem('hints');
                    if(this.app.audio) this.app.audio.play('click');
                }
                break;
            case 'BUY_FREEZE':
                if (this.app.state?.buyItem?.('freeze', 500)) {
                    if(this.app.scene?.spawnItem) this.app.scene.spawnItem('freeze');
                    if(this.app.audio) this.app.audio.play('click');
                }
                break;
            case 'USE_HINT':
                if (this.app.activateHintLogic) this.app.activateHintLogic();
                break;
            case 'USE_FREEZE':
                if (this.app.freezeTime) this.app.freezeTime();
                break;
            case 'DANCE':
                this.triggerDanceEffect();
                break;
            case 'CHANGE_COLORS':
                this.changeColorScheme();
                break;
            case 'TOGGLE_MUSIC':
                this.toggleBackgroundMusic();
                break;
            case 'SPECIAL_EFFECTS':
                this.activateSpecialEffects();
                break;
        }
    }

    // ==========================================
    //       6. FUNCIONES DE EFECTOS ESPECIALES
    // ==========================================

    triggerDanceEffect() {
        // Avatar Baila
        if(this.app.avatarController?.playState) {
            this.app.avatarController.playState('correct').catch(() => {});
        }
        
        // Efectos visuales en el núcleo
        if(this.app.scene?.core) {
            const core = this.app.scene.core;
            const originalColor = core.material.emissive.getHex();
            
            let counter = 0;
            const interval = setInterval(() => {
                counter++;
                core.material.emissive.setHex(Math.random() * 0xffffff);
                core.scale.setScalar(1 + Math.sin(counter * 0.5) * 0.3);
                core.rotation.y += 0.1;
                
                if (counter > 30) {
                    clearInterval(interval);
                    core.material.emissive.setHex(originalColor);
                    core.scale.setScalar(1);
                }
            }, 100);
        }
        
        if(this.app.audio) this.app.audio.play('correct');
    }

    changeColorScheme() {
        if (this.app.scene?.core) {
            const colors = [0x00ff00, 0xff00ff, 0xffff00, 0x00ffff, 0xffaa00];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            this.app.scene.core.material.emissive.setHex(randomColor);
            this.renderMessage('AI', '🎨 Colores actualizados');
        }
    }

    toggleBackgroundMusic() {
        if (this.app.audio?.toggleMusic) {
            this.app.audio.toggleMusic();
            this.renderMessage('AI', this.app.audio.musicEnabled ? '🎵 Música activada' : '🔇 Música desactivada');
        }
    }

    activateSpecialEffects() {
        if (this.app.scene?.core) {
            const core = this.app.scene.core;
            core.scale.set(1.5, 1.5, 1.5);
            setTimeout(() => core.scale.set(1, 1, 1), 500);
            this.renderMessage('AI', '✨ Efectos especiales activados');
        }
    }

    // ==========================================
    //       7. UI HELPERS
    // ==========================================

    renderMessage(type, text) {
        if (!text) return;
        
        const div = document.createElement('div');
        
        if (type === 'AI') {
            div.className = "chat-bubble-ai";
            div.innerHTML = `<i class="fas fa-robot mr-2 text-blue-400"></i>${this.escapeHtml(text)}`;
        } else {
            div.className = "chat-bubble-user";
            div.textContent = text;
        }

        this.dom.msgs.appendChild(div);
        this.dom.msgs.scrollTop = this.dom.msgs.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    renderLoading() {
        const id = 'loading-' + Date.now();
        const div = document.createElement('div');
        div.id = id;
        div.className = "chat-bubble-ai text-gray-400 italic";
        div.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-2"></i>Procesando...`;
        this.dom.msgs.appendChild(div);
        this.dom.msgs.scrollTop = this.dom.msgs.scrollHeight;
        return id;
    }

    removeLoading(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }
}