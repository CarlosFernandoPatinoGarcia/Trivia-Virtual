// Función para generar el QR con el nombre de usuario
function generateQRCode(username) {
    // URL codificada que lleva directamente al modelo AR en modo vista
    const arChestUrl = `https://${username}.github.io/Trivia-Virtual/ar-cofre.html?mode=view`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(arChestUrl)}`;

    // Actualizar la imagen del QR
    const qrElement = document.getElementById('hub-qr');
    if (qrElement) {
        qrElement.src = qrUrl;
    }

    return qrUrl;
}

// Use a fixed GitHub username for the QR URL
const DEFAULT_QR_USER = 'CarlosFernandoPatinoGarcia';

// Generar el QR cuando se carga la página
document.addEventListener('DOMContentLoaded', function () {
    generateQRCode(DEFAULT_QR_USER);

    // También puedes exponer la función globalmente para usarla desde otros scripts
    window.updateQRCode = function (newUsername) {
        return generateQRCode(newUsername || DEFAULT_QR_USER);

        // Generar el QR cuando se carga la página
        document.addEventListener('DOMContentLoaded', function () {
            generateQRCode(DEFAULT_QR_USER);
            // También puedes exponer la función globalmente para usarla desde otros scripts
            window.updateQRCode = function (newUsername) {
                return generateQRCode(newUsername);
            };
        });
    };
});