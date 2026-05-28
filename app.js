// ==================== CONFIGURACIÓN ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, 
    doc, updateDoc, query, orderBy, serverTimestamp, Timestamp, where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAT7b1rR6rSxaf2dJzLrDjluOxYBQAd00g",
    authDomain: "ssp-rx-portatil.firebaseapp.com",
    projectId: "ssp-rx-portatil",
    storageBucket: "ssp-rx-portatil.firebasestorage.app",
    messagingSenderId: "592475172989",
    appId: "1:592475172989:web:7dfb1321ed48231f0a8114"
};

const CLOUDINARY_CLOUD_NAME = "dugihbmyc";
const CLOUDINARY_UPLOAD_PRESET = "ssp-portatil";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ==================== UTILIDADES ====================

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

function tiempoTranscurrido(timestamp) {
    if (!timestamp) return '-';
    const ahora = new Date();
    const creado = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diff = Math.floor((ahora - creado) / 1000);
    
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff/60)}m`;
    return `${Math.floor(diff/3600)}h ${Math.floor((diff%3600)/60)}m`;
}

function colorAlerta(timestamp, estado) {
    if (!timestamp || estado === 'finalizado') return '';
    const diff = Math.floor((new Date() - timestamp.toDate()) / 1000);
    if (diff > 1800) return 'alerta-roja';
    if (diff > 900) return 'alerta-amarilla';
    return '';
}

// ==================== PÁGINA: REGISTRAR ====================

const formSolicitud = document.getElementById('formSolicitud');
if (formSolicitud) {
    formSolicitud.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btn = formSolicitud.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = '⏳ Subiendo...';
        
        try {
            const file = document.getElementById('fotoSolicitud').files[0];
            const fotoUrl = await subirFotoCloudinary(file);
            
            await addDoc(collection(db, 'solicitudes'), {
                dniPaciente: document.getElementById('dniPaciente').value,
                nombrePaciente: document.getElementById('nombrePaciente').value,
                habitacion: document.getElementById('habitacion').value,
                tipoEstudio: document.getElementById('tipoEstudio').value,
                urgencia: document.getElementById('urgencia').value,
                solicitadoPor: document.getElementById('solicitadoPor').value,
                notas: document.getElementById('notas').value || '',
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
            
            formSolicitud.reset();
            alert('✅ Solicitud registrada correctamente');
            
        } catch (error) {
            console.error(error);
            alert('❌ Error: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = '➕ Registrar Solicitud';
        }
    });
}

// ==================== PÁGINA: LOGIN ====================

const formLogin = document.getElementById('formLogin');
if (formLogin) {
    // Detectar rol desde URL
    const params = new URLSearchParams(window.location.search);
    const rol = params.get('rol') || 'tecnologo';
    
    const tituloLogin = document.getElementById('tituloLogin');
    const grupoDNI = document.getElementById('grupoDNI');
    
    if (rol === 'admin') {
        tituloLogin.textContent = '⚙️ Acceso Administrador';
        grupoDNI.style.display = 'none';
    }
    
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const clave = document.getElementById('clave').value;
        
        // Validación simple (en producción usar Firebase Auth real)
        if (rol === 'tecnologo') {
            const dni = document.getElementById('dni').value;
            if (dni.length >= 6 && clave.length >= 4) {
                localStorage.setItem('tecnologoDNI', dni);
                localStorage.setItem('tecnologoNombre', 'Tecnólogo ' + dni);
                window.location.href = 'dashboard.html';
            } else {
                alert('DNI o clave incorrectos');
            }
        } else if (rol === 'admin') {
            if (clave === 'admin2024') { // Cambia esta contraseña
                localStorage.setItem('rol', 'admin');
                window.location.href = 'dashboard.html';
            } else {
                alert('Credenciales de admin incorrectas');
            }
        }
    });
}

// ==================== PÁGINA: DASHBOARD ====================

const lista = document.getElementById('listaSolicitudes');
let estadoFiltro = 'todos';

if (lista) {
    // Mostrar nombre del tecnólogo
    const nombreTec = localStorage.getItem('tecnologoNombre');
    if (nombreTec) {
        const el = document.getElementById('nombreTecnologo');
        if (el) el.textContent = nombreTec;
    }
    
    // Filtrar por estado
    window.filtrarEstado = function(estado) {
        estadoFiltro = estado;
        
        // Actualizar botones activos
        document.querySelectorAll('.btn-filtro').forEach(btn => btn.classList.remove('active'));
        document.getElementById('btn-' + estado).classList.add('active');
        
        // Actualizar título
        const titulos = {
            'todos': '📋 Todas las Solicitudes',
            'pendiente': '⏳ Solicitudes Pendientes',
            'en_camino': '🚶 Solicitudes En Camino',
            'atendiendo': '🔬 Solicitudes Atendiendo',
            'finalizado': '✅ Solicitudes Atendidas'
        };
        document.getElementById('tituloLista').textContent = titulos[estado];
        
        // Recargar listener
        cargarSolicitudes();
    };
    
    function crearCardSolicitud(sol) {
        const id = sol.id;
        const data = sol.data;
        
        const tiempo = tiempoTranscurrido(data.timestamps?.creado);
        const alerta = colorAlerta(data.timestamps?.creado, data.estado);
        
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
            'finalizado': '✅ Atendido'
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
                    <p><strong>🆔 DNI:</strong> ${data.dniPaciente || '-'}</p>
                    <p><strong>👤 Paciente:</strong> ${data.nombrePaciente || '-'}</p>
                    <p><strong>🏥 Habitación:</strong> ${data.habitacion}</p>
                    <p><strong>📋 Estudio:</strong> ${data.tipoEstudio}</p>
                    <p><strong>🙋 Solicita:</strong> ${data.solicitadoPor}</p>
                    ${data.notas ? `<p><strong>📝 Notas:</strong> ${data.notas}</p>` : ''}
                    ${data.fotoSolicitud ? `<a href="${data.fotoSolicitud}" target="_blank" class="btn-foto">📷 Ver solicitud</a>` : ''}
                </div>
                ${data.estado !== 'finalizado' ? `
                <div class="solicitud-actions">
                    ${botones}
                </div>
                ` : `<div class="solicitud-actions"><span class="completado">✅ Completado</span></div>`}
            </div>
        `;
    }
    
    window.cambiarEstado = async function(id, nuevoEstado) {
        const updates = { estado: nuevoEstado };
        const now = serverTimestamp();
        const tecnologo = localStorage.getItem('tecnologoNombre') || 'Tecnólogo';
        
        if (nuevoEstado === 'en_camino') {
            updates['timestamps.enCamino'] = now;
            updates['tecnologoAsignado'] = tecnologo;
        }
        if (nuevoEstado === 'atendiendo') updates['timestamps.atendiendo'] = now;
        if (nuevoEstado === 'finalizado') updates['timestamps.finalizado'] = now;
        
        await updateDoc(doc(db, 'solicitudes', id), updates);
    };
    
    let unsubscribe = null;
    
    function cargarSolicitudes() {
        if (unsubscribe) unsubscribe();
        
        let q;
        if (estadoFiltro === 'todos') {
            q = query(collection(db, 'solicitudes'), orderBy('timestamps.creado', 'desc'));
        } else {
            q = query(
                collection(db, 'solicitudes'), 
                where('estado', '==', estadoFiltro),
                orderBy('timestamps.creado', 'desc')
            );
        }
        
        unsubscribe = onSnapshot(q, (snapshot) => {
            let html = '';
            let counts = { pendiente: 0, en_camino: 0, atendiendo: 0, finalizado: 0 };
            
            snapshot.forEach((doc) => {
                const data = doc.data();
                if (counts[data.estado] !== undefined) counts[data.estado]++;
                html += crearCardSolicitud({ id: doc.id, data });
            });
            
            // Actualizar contadores
            document.getElementById('countPendiente').textContent = counts.pendiente;
            document.getElementById('countEnCamino').textContent = counts.en_camino;
            document.getElementById('countAtendiendo').textContent = counts.atendiendo;
            document.getElementById('countFinalizado').textContent = counts.finalizado;
            
            // Actualizar lista
            lista.innerHTML = html || '<p class="empty">No hay solicitudes en esta categoría</p>';
        });
    }
    
    cargarSolicitudes();
}
