// chatbot.js
// Clase principal del bot DuoTrivia: manejo de estado conversacional,
// generación de tarjetas de trivia y validación de respuestas.

import { TriviaFetcher } from './trivia-api.js';

export class Chatbot {
    constructor(updateStatsCallback) {
        this.name = 'DuoTrivia';
        this.fetcher = new TriviaFetcher();
        this.isWaitingForAnswer = false;
        this.currentQuestion = null;
        this.score = 0;
        this.streak = 0;
        this.total = 0;
        this.correctTotal = 0;
        this.updateStats = typeof updateStatsCallback === 'function' ? updateStatsCallback : () => { };
    }

    // Procesa mensajes de texto del usuario cuando no está contestando una pregunta.
    async processUserMessage(msg) {
        const t = (msg || '').trim().toLowerCase();
        if (!t) return this._botText('¿Podrías escribir algo?');

        if (this.isWaitingForAnswer) {
            // El usuario intenta escribir mientras hay una pregunta activa.
            return this._botText('Selecciona una opción de la tarjeta o escribe "cancel" para abortar.');
        }

        if (t === 'ayuda' || t === 'help') {
            return this._botText('Comandos: "jugar" para nueva pregunta, "puntaje" para ver estadísticas. Responde pulsando un botón.');
        }

        if (t === 'puntaje' || t === 'score') {
            return this._botText(this._statsLine());
        }

        if (t === 'jugar' || t === 'play' || t === 'pregunta') {
            return await this.generateTriviaCard();
        }

        if (t === 'cancel') {
            if (this.isWaitingForAnswer) {
                this.isWaitingForAnswer = false;
                this.currentQuestion = null;
                return this._botText('Pregunta cancelada. Escribe "jugar" para otra.');
            }
            return this._botText('No hay pregunta activa para cancelar.');
        }

        return this._botText('No reconozco ese comando. Usa "ayuda" para ver opciones.');
    }

    // Obtiene una pregunta y construye el paquete de tarjeta.
    async generateTriviaCard() {
        try {
            const data = await this.fetcher.getQuestion();
            if (!data || !Array.isArray(data.answers) || data.answers.length === 0) {
                return this._botText('No pude obtener una pregunta ahora. Intenta de nuevo.');
            }

            // Asegurar correctIndex a partir del dataset actual (correct como texto)
            const normalize = (s) => String(s).toLowerCase().trim();
            let correctIndex = typeof data.correctIndex === 'number' ? data.correctIndex : -1;
            if (correctIndex < 0) {
                const target = normalize(data.correct);
                correctIndex = Math.max(0, data.answers.findIndex(a => normalize(a) === target));
            }

            const prepared = { ...data, correctIndex };
            this.currentQuestion = prepared;
            this.isWaitingForAnswer = true;
            const cardHTML = this._buildCardHTML(prepared);
            return { type: 'card', html: cardHTML, text: 'Nueva pregunta' };
        } catch (e) {
            console.warn(e);
            return this._botText('No pude obtener una pregunta ahora. Intenta de nuevo.');
        }
    }

    // Construye el HTML de la tarjeta de trivia.
    _buildCardHTML(q) {
        const opts = q.answers.map((ans, i) => {
            return `<button class="option-btn" data-index="${i}" data-answer="${this._escape(ans)}">${this._escape(ans)}</button>`;
        }).join('');
        return `
      <div class="trivia-card" data-active="true" data-correct-index="${q.correctIndex}">
        <div class="trivia-header">
          <div class="trivia-category">${this._escape(q.category)}</div>
          <div class="trivia-question">${this._escape(q.question)}</div>
        </div>
        <div class="options-grid">${opts}</div>
      </div>
    `;
    }

    // Maneja clic en una opción.
    handleAnswer(index) {
        if (!this.isWaitingForAnswer || !this.currentQuestion) {
            return this._botText('No hay pregunta activa. Escribe "jugar" para empezar.');
        }

        this.isWaitingForAnswer = false;
        const q = this.currentQuestion;
        const isCorrect = Number(index) === Number(q.correctIndex);

        this.total++;
        if (isCorrect) {
            this.score += 100;
            this.streak++;
            this.correctTotal++;
        } else {
            this.streak = 0;
        }
        // Reset pregunta actual
        this.currentQuestion = null;

        // Actualizar panel de estadísticas
        this.updateStats({ score: this.score, streak: this.streak, total: this.total, correct: this.correctTotal });

        const base = this._statsLine();
        if (isCorrect) {
            return this._botText(`✅ Correcto: +100 puntos. ${base}`);
        } else {
            const correctText = Array.isArray(q.answers) && q.answers[q.correctIndex] !== undefined
                ? q.answers[q.correctIndex]
                : (q.correct || 'N/A');
            const extra = q.explanation ? ` — ${q.explanation}` : '';
            return this._botText(`❌ Incorrecto. Era: "${correctText}"${extra}. ${base}`);
        }
    }

    // Texto stats rápido.
    _statsLine() {
        const accuracy = this.total > 0 ? Math.round((this.correctTotal / this.total) * 100) : 0;
        return `Puntaje: ${this.score} | Racha: ${this.streak} | Preguntas: ${this.total} | Acierto: ${accuracy}%`;
    }

    _escape(str) {
        return String(str).replace(/[&<>]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[s]));
    }

    _botText(text) {
        return { type: 'text', from: this.name, text };
    }
}
