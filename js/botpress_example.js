/* Ejemplo mínimo de integración con Botpress usando ChatbotClient
   - Muestra cómo construir el cliente remoto y enviar mensajes.
   - No envía tokens desde frontend en producción; esto es solo ejemplo.
*/
(function (global) {
    async function createRemoteBotpressClient() {
        // Cambia estas variables según tu despliegue de Botpress
        const BOTPRESS_URL = 'http://localhost:3000';
        const BOT_ID = 'my-bot-id';
        const TOKEN = ''; // si aplica

        const client = new ChatbotClient({ remote: true, url: BOTPRESS_URL, botId: BOT_ID, token: TOKEN, onMessage: (m) => console.log('Botpress->', m) });
        return client;
    }

    // Ejemplo de uso: validar respuesta en remoto (requiere una acción en Botpress que acepte payload)
    async function validateAnswerRemote(client, question, selectedIndex, userId = 'user') {
        // payload que podrías enviar a una acción en Botpress para validar
        const payload = { type: 'validate_answer', question, selectedIndex };
        // Nota: dependiendo de la configuración de tu bot, podrías necesitar un endpoint custom
        return client.sendMessage(JSON.stringify(payload), userId);
    }

    global.BotpressExample = { createRemoteBotpressClient, validateAnswerRemote };
})(window);
