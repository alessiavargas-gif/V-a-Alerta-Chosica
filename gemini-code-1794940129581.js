const API_URL = "http://127.0.0.1:5000/api";
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

const estadoCamara = document.getElementById('estadoCamara');
const textoGesto = document.getElementById('textoGesto');
const porcentajeGesto = document.getElementById('porcentajeGesto');
const barraProgreso = document.getElementById('barraProgreso');

let framesManoAbierta = 0;
const FRAMES_NECESARIOS = 35; // Aprox. 1.5 - 2 segundos manteniendo la mano abierta
let alertaEnviadaRecientemente = false;

// 1. Cargar alertas iniciales desde el Backend en Python
async function cargarAlertas() {
    try {
        const respuesta = await fetch(`${API_URL}/alertas`);
        const alertas = await respuesta.json();
        const contenedor = document.getElementById('listaAlertas');
        contenedor.innerHTML = '';

        alertas.forEach(alerta => {
            let colorBorde = 'border-emerald-500';
            let badgeColor = 'bg-emerald-500/20 text-emerald-400';

            if (alerta.estado === 'BLOQUEADA') {
                colorBorde = 'border-red-500';
                badgeColor = 'bg-red-500/20 text-red-400';
            } else if (alerta.estado === 'PRECAUCIÓN') {
                colorBorde = 'border-amber-500';
                badgeColor = 'bg-amber-500/20 text-amber-400';
            }

            contenedor.innerHTML += `
                <div class="bg-slate-900 p-4 rounded-lg border-l-4 ${colorBorde}">
                    <div class="flex justify-between items-start mb-1">
                        <h3 class="font-bold text-sm text-white">${alerta.zona}</h3>
                        <span class="text-xs px-2 py-0.5 rounded font-semibold ${badgeColor}">${alerta.estado}</span>
                    </div>
                    <p class="text-xs text-slate-300 mb-2">${alerta.mensaje}</p>
                    <span class="text-[11px] text-slate-500">Reportado: ${alerta.hora}</span>
                </div>
            `;
        });
    } catch (error) {
        console.error("Error conectando con Python:", error);
    }
}

// 2. Enviar alerta al Backend cuando se completa el gesto
async function enviarAlertaGestual() {
    if (alertaEnviadaRecientemente) return;
    alertaEnviadaRecientemente = true;

    const zonaSeleccionada = document.getElementById('zonaSelect').value;
    textoGesto.innerText = "¡ENVIANDO ALERTA DE EMERGENCIA A CHOSICA!";
    textoGesto.className = "text-red-400 font-bold";

    try {
        await fetch(`${API_URL}/reportar-gesto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                zona: zonaSeleccionada,
                gesto: "Palma Abierta (Manos Libres)"
            })
        });
        await cargarAlertas();
    } catch (error) {
        console.error("Error al enviar alerta:", error);
    }

    // Pausa de 5 segundos para evitar reportes duplicados seguidos
    setTimeout(() => {
        alertaEnviadaRecientemente = false;
        framesManoAbierta = 0;
        actualizarBarra(0);
        textoGesto.innerText = "Esperando gesto de mano abierta...";
        textoGesto.className = "text-slate-300";
    }, 5000);
}

function actualizarBarra(porcentaje) {
    const val = Math.min(100, Math.round(porcentaje));
    barraProgreso.style.width = `${val}%`;
    porcentajeGesto.innerText = `${val}%`;
}

// 3. Lógica de detección de palma abierta usando puntos de MediaPipe
function esManoAbierta(landmarks) {
    // Verifica si las puntas de los dedos (8, 12, 16, 20) están por encima de sus articulaciones medias (6, 10, 14, 18)
    const indiceAbierto = landmarks[8].y < landmarks[6].y;
    const medioAbierto = landmarks[12].y < landmarks[10].y;
    const anularAbierto = landmarks[16].y < landmarks[14].y;
    const meniqueAbierto = landmarks[20].y < landmarks[18].y;

    return indiceAbierto && medioAbierto && anularAbierto && meniqueAbierto;
}

function onResults(results) {
    estadoCamara.innerText = "Cámara activa • Detección gestual lista";
    
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#fbbf24', lineWidth: 3 });
            drawLandmarks(canvasCtx, landmarks, { color: '#ef4444', lineWidth: 1 });

            if (esManoAbierta(landmarks) && !alertaEnviadaRecientemente) {
                framesManoAbierta++;
                const progreso = (framesManoAbierta / FRAMES_NECESARIOS) * 100;
                actualizarBarra(progreso);
                textoGesto.innerText = "Mantén la mano abierta para confirmar alerta...";

                if (framesManoAbierta >= FRAMES_NECESARIOS) {
                    enviarAlertaGestual();
                }
            } else if (!alertaEnviadaRecientemente) {
                framesManoAbierta = Math.max(0, framesManoAbierta - 2);
                actualizarBarra((framesManoAbierta / FRAMES_NECESARIOS) * 100);
            }
        }
    } else if (!alertaEnviadaRecientemente) {
        framesManoAbierta = 0;
        actualizarBarra(0);
    }
    canvasCtx.restore();
}

// 4. Inicializar MediaPipe Hands y Cámara Web
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
});
hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480
});

camera.start();
cargarAlertas();