// Script para manejar la pantalla de inicio
document.addEventListener('DOMContentLoaded', function () {
    const startScreen = document.getElementById('start-screen');
    const startButton = document.getElementById('start-button');
    const gameInterface = document.getElementById('game-interface');
    const timerContainer = document.getElementById('timer-container');
    const loader = document.getElementById('loader');

    // Crear partículas de fondo
    createParticles();

    // Manejar el clic en el botón de inicio
    startButton.addEventListener('click', function () {
        // Efecto de transición
        startScreen.style.opacity = '0';
        startScreen.style.transition = 'opacity 0.8s ease';

        setTimeout(() => {
            startScreen.style.display = 'none';

            // Mostrar loader brevemente
            loader.style.display = 'flex';

            setTimeout(() => {
                loader.style.display = 'none';

                // Mostrar interfaz de juego
                gameInterface.classList.remove('hidden');
                timerContainer.classList.remove('hidden');

                // Inicializar el juego
                if (typeof window.app !== 'undefined') {
                    window.app.startSystem();
                } else {
                    // Fallback si App no está disponible
                    console.log('Iniciando juego...');
                }
            }, 1500);

        }, 800);
    });

    // Función para crear partículas animadas
    function createParticles() {
        const container = document.getElementById('particles-container');
        const particleCount = 50;

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';

            // Tamaño aleatorio
            const size = Math.random() * 4 + 1;
            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;

            // Posición aleatoria
            particle.style.left = `${Math.random() * 100}%`;
            particle.style.top = `${Math.random() * 100}%`;

            // Retraso de animación aleatorio
            particle.style.animationDelay = `${Math.random() * 6}s`;

            // Opacidad aleatoria
            particle.style.opacity = Math.random() * 0.7;

            // Color aleatorio (entre azul neón y púrpura)
            const colors = ['#00f3ff', '#bc13fe', '#7c4dff', '#00d2ff'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            particle.style.background = color;

            container.appendChild(particle);
        }
    }
});