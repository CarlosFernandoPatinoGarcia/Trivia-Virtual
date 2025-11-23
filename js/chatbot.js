/* Chatbot client modular wrapper
   - Proporciona dos modos:
     1) Remote mode (Botpress): usa API REST de Botpress si se configura `config.remote=true`.
     2) Local fallback: valida respuestas localmente usando los datos de pregunta enviados desde la UI.

   Uso básico:
     const bot = new ChatbotClient({ remote: false });
     bot.sendMessage('Hola').then(r => console.log(r));

   Para la integración con Botpress se necesita configurar `BOTPRESS_URL`, `BOT_ID`, `API_TOKEN`.
*/
(function (global) {
    class ChatbotClient {
        constructor(cfg = {}) {
            this.remote = cfg.remote || false;
            this.url = cfg.url || ''; // e.g. http://localhost:3000
            this.botId = cfg.botId || '';
            this.token = cfg.token || '';
            this.onMessage = cfg.onMessage || (() => { });
        }

        // En modo remoto envía la entrada al bot; en modo local realiza fallback simple
        async sendMessage(text, userId = 'user') {
            if (this.remote && this.url && this.botId) {
                try {
                    const endpoint = `${this.url}/api/v1/bots/${this.botId}/converse/${encodeURIComponent(userId)}`;
                    const res = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
                        },
                        body: JSON.stringify({ type: 'text', text })
                    });
                    const data = await res.json();
                    this.onMessage(data);
                    return data;
                } catch (e) {
                    console.error('Chatbot remote error', e);
                    return { error: e.message };
                }
            }

            // Fallback local: devuelve un eco simple. Se puede reemplazar por lógica local más compleja.
            const reply = { messages: [{ type: 'text', text: `ECO: ${text}` }] };
            this.onMessage(reply);
            return reply;
        }

        // Para validar una respuesta contra la pregunta localmente (modo simple)
        // questionObject debe tener forma: { t, c, o:[], a: index }
        async validateAnswerLocal(questionObject, selectedIndex) {
            const isCorrect = questionObject && (selectedIndex === questionObject.a);
            return { correct: isCorrect, correctAnswer: questionObject.o[questionObject.a] };
        }
    }

    // Exportar
    global.ChatbotClient = ChatbotClient;
})(window);
