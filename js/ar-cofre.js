// Crear partículas de fondo
function createParticles() {
    const particlesContainer = document.getElementById('particles');
    if (!particlesContainer) return;
    const particleCount = 30;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + 'vw';
        particle.style.top = Math.random() * 100 + 'vh';
        particle.style.animationDelay = Math.random() * 5 + 's';
        particle.style.width = Math.random() * 4 + 2 + 'px';
        particle.style.height = particle.style.width;
        particlesContainer.appendChild(particle);
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function () {
    createParticles();

    // Simular botón AR (en un entorno real, esto sería manejado por model-viewer)
    const arButton = document.querySelector('.ar-button');
    if (!arButton) return;

    arButton.addEventListener('click', function () {
        // En un caso real, esto activaría el modo AR
        // Por ahora, solo mostramos un efecto visual
        arButton.style.background = 'linear-gradient(135deg, #bc13fe, #00f3ff)';
        arButton.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 10px;"></i> CARGANDO AR...';

        setTimeout(() => {
            arButton.innerHTML = '<i class="fas fa-check" style="margin-right: 10px;"></i> AR ACTIVADO';
            arButton.style.background = 'linear-gradient(135deg, #10b981, #00f3ff)';
        }, 2000);
    });
});
