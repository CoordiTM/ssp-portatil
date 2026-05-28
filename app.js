// ==================== CONFIGURACIÓN ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, 
    doc, updateDoc, query, orderBy, serverTimestamp, Timestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 🔥 TU CONFIGURACIÓN FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyAT7b1rR6rSxaf2dJzLrDjluOxYBQAd00g",
    authDomain: "ssp-rx-portatil.firebaseapp.com",
    projectId: "ssp-rx-portatil",
    storageBucket: "ssp-rx-portatil.firebasestorage.app",
    messagingSenderId: "592475172989",
    appId: "1:592475172989:web:7dfb1321ed48231f0a8114"
};

// ☁️ CLOUDINARY CONFIG
const CLOUDINARY_CLOUD_NAME = "dugihbmyc";
const CLOUDINARY_UPLOAD_PRESET = "ssp-portatil"; // Lo crearemos ahora

// ==================== INICIALIZAR ====================
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Auth anónimo
signInAnonymously(auth).catch(console.error);

// ==================== VARIABLES ====================
const form = document.getElementById('formSolicitud');
const lista = document.getElementById('listaSolicitudes');

// ==================== FUNCIONES ====================

// Subir foto a Cloudinary
async function subirFotoCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    
    const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: 'POST', body: formData }
    );
    const data = await response.json();
    return data.secure_url;
}

// Formatear tiempo transcurrido
function tiempoTranscurrido(timestamp) {
    if (!timestamp) return '-';
    const ahora = new Date();
    const creado = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diff = Math.floor((ahora - creado) / 1000); // segundos
    
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff/60)}m`;
    return `${Math.floor(diff/3600)}h ${Math.floor((diff%3600)/60)}m`;
}

// Color según tiempo de espera
function colorAlerta(timestamp) {
    if (!timestamp) return '';
    const diff = Math.floor((new Date() - timestamp.toDate()) / 1000);
    if (diff > 1800) return 'alerta-roja';      // > 30 min
    if (diff > 900) return 'alerta-amarilla';   // > 15 min
    return '';
}

// Crear HTML de solicitud
function crearCardSolicitud(sol) {
    const id = sol.id;
    const data = sol.data;
    
    const tiempo = tiempoTranscurrido(data.timestamps?.creado);
    const alerta = colorAlerta(data.timestamps?.creado);
    
    let botones = '';
    if (data.estado === 'pendiente') {
        botones = `<button onclick="cambiarEstado('${id}', 'en_camino')" class="btn-camino">🚶 En camino</button>`;
    } else if (data.estado === 'en_camino') {
        botones = `<button onclick="cambiarEstado('${id}', 'atendiendo')" class="btn-atendiendo">🔬 Atendiendo</button>`;
    } else if (data.estado === 'atendiendo') {
        botones = `<button onclick="cambiarEstado('${id}', 'finalizado')" class="btn-finalizar">✅ Finalizar</button>`;
    }
    
    const estadosLabels = {
        'pendiente': '⏳ Pendiente',
        'en_camino': '🚶 En camino',
        'atendiendo': '🔬 Atendiendo',
        'finalizado': '✅ Finalizado'
    };
    
    const urgenciaClass = data.urgencia === 'emergencia' ? 'tag-emergencia' : 
                          data.urgencia === 'urgente' ? 'tag-urgente' : 'tag-normal';
    
    return `
        <div class="solicitud-card ${alerta}" id="card-${id}">
            <div class="solicitud-header">
                <span class="tag ${urgenciaClass}">${data.urgencia.toUpperCase()}</span>
                <span class="estado">${estadosLabels[data.estado]}</span>
                <span class="tiempo">⏱️ ${tiempo}</span>
            </div>
            <div class="solicitud-body">
                <p><strong>🏥 Habitación:</strong> ${data.habitacion}</p>
                <p><strong>👤 Paciente:</strong> ${data.paciente}</p>
                <p><strong>📋 Estudio:</strong> ${data.tipoEstudio}</p>
                <p><strong>🙋 Solicita:</strong> ${data.solicitadoPor}</p>
                ${data.fotoSolicitud ? `<a href="${data.fotoSolicitud}" target="_blank" class="btn-foto">📷 Ver solicitud</a>` : ''}
            </div>
            <div class="solicitud-actions">
                ${botones}
            </div>
        </div>
    `;
}

// ==================== EVENTOS ====================

// Enviar nueva solicitud
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = '⏳ Subiendo...';
    
    try {
        // Subir foto
        const file = document.getElementById('fotoSolicitud').files[0];
        const fotoUrl = await subirFotoCloudinary(file);
        
        // Guardar en Firestore
        await addDoc(collection(db, 'solicitudes'), {
            habitacion: document.getElementById('habitacion').value,
            paciente: document.getElementById('paciente').value,
            tipoEstudio: document.getElementById('tipoEstudio').value,
            urgencia: document.getElementById('urgencia').value,
            solicitadoPor: document.getElementById('solicitadoPor').value,
            fotoSolicitud: fotoUrl,
            estado: 'pendiente',
            timestamps: {
                creado: serverTimestamp(),
                enCamino: null,
                atendiendo: null,
                finalizado: null
            },
            tecnologoAsignado: null
        });
        
        form.reset();
        alert('✅ Solicitud registrada correctamente');
        
    } catch (error) {
        console.error(error);
        alert('❌ Error: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '➕ Registrar Solicitud';
    }
});

// Cambiar estado (exponer a window para onclick)
window.cambiarEstado = async function(id, nuevoEstado) {
    const updates = { estado: nuevoEstado };
    const now = serverTimestamp();
    
    if (nuevoEstado === 'en_camino') updates['timestamps.enCamino'] = now;
    if (nuevoEstado === 'atendiendo') updates['timestamps.atendiendo'] = now;
    if (nuevoEstado === 'finalizado') updates['timestamps.finalizado'] = now;
    
    await updateDoc(doc(db, 'solicitudes', id), updates);
};

// ==================== LISTENER EN TIEMPO REAL ====================

const q = query(collection(db, 'solicitudes'), orderBy('timestamps.creado', 'desc'));

onSnapshot(q, (snapshot) => {
    let html = '';
    let counts = { pendiente: 0, en_camino: 0, atendiendo: 0 };
    
    snapshot.forEach((doc) => {
        const data = doc.data();
        if (counts[data.estado] !== undefined) counts[data.estado]++;
        
        // Solo mostrar no finalizadas en el dashboard principal
        if (data.estado !== 'finalizado') {
            html += crearCardSolicitud({ id: doc.id, data });
        }
    });
    
    // Actualizar contadores
    document.getElementById('countPendiente').textContent = counts.pendiente;
    document.getElementById('countEnCamino').textContent = counts.en_camino;
    document.getElementById('countAtendiendo').textContent = counts.atendiendo;
    
    // Actualizar lista
    lista.innerHTML = html || '<p class="empty">No hay solicitudes activas</p>';
});
