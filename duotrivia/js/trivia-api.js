export class TriviaFetcher {
    constructor() {
        // Resolve JSON relative to this module to work from any entry page
        this.apiUrl = new URL('./cultura2.json', import.meta.url).toString();
        this.questionsCache = null;
    }

    async getQuestion() {
        try {
            // 1. Cargar el JSON si no está en memoria
            if (!this.questionsCache) {
                const response = await fetch(this.apiUrl);
                const data = await response.json();

                // Verificación de seguridad: ¿Existe la propiedad questions?
                if (data.questions) {
                    this.questionsCache = data.questions;
                } else {
                    console.error("Estructura del JSON incorrecta. Se esperaba { questions: [...] }");
                    return null;
                }
            }

            // 2. Elegir pregunta al azar
            if (!this.questionsCache || this.questionsCache.length === 0) {
                console.error("El array de preguntas está vacío");
                return null;
            }

            const randomIndex = Math.floor(Math.random() * this.questionsCache.length);
            const rawQuestion = this.questionsCache[randomIndex];

            // 3. Formatear para el chatbot
            return this.formatData(rawQuestion);

        } catch (error) {
            console.error("Error cargando preguntas:", error);
            return null;
        }
    }

    formatData(rawQuestion) {
        // --- AQUÍ ESTABA EL ERROR ---
        // Verificamos en consola qué estamos recibiendo
        console.log("Procesando pregunta:", rawQuestion);

        const index = rawQuestion.correct_answer;
        const options = rawQuestion.options;

        // Validamos que existan las opciones y el índice sea válido
        if (!options || typeof index === 'undefined' || index < 0 || index >= options.length) {
            console.error("ERROR: El índice de respuesta no coincide con las opciones.", rawQuestion);
            return {
                category: "Error",
                difficulty: "Error",
                question: "Error en el formato de esta pregunta (revisar JSON)",
                answers: ["Error"],
                correct: "Error"
            };
        }

        // Convertimos el número (2) en texto ("Yen")
        const correctText = options[index];

        return {
            category: rawQuestion.category || "General",
            difficulty: rawQuestion.difficulty || "Normal",
            question: rawQuestion.question,
            answers: options,
            correct: correctText, // IMPORTANTE: Esto ahora es texto, no un número
            explanation: rawQuestion.explanation
        };
    }
}