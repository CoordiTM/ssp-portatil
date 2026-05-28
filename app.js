// ==================== CONFIGURACIÓN ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, 
    doc, updateDoc, query, orderBy, serverTimestamp, Timestamp, where, getDocs, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
    if (!timestamp || estado === 'finalizado' || estado === 'rechazado') return '';
    const diff = Math.floor((new Date() - timestamp.toDate()) / 1000);
    if (diff > 1800) return 'alerta-roja';
    if (diff > 900) return 'alerta-amarilla';
    return '';
}

function formatearFecha(timestamp) {
    if (!timestamp) return '-';
    const fecha = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return fecha.toLocaleString('es-PE', { 
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
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
                solicitadoPor: document.getElementById('solicitadoPor').value,
                notas: document.getElementById('notas').value || '',
                fotoSolicitud: fotoUrl,
                estado: 'pendiente',
                timestamps: {
                    creado: serverTimestamp(),
                    enCamino: null,
                    atendiendo: null,
                    finalizado: null,
                    rechazado: null
                },
                tecnologoAsignado: null,
                motivoRechazo: null
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
        
        if (rol === 'tecnologo') {
            const dni = document.getElementById('dni').value;
            // Verificar en Firestore
            const q = query(collection(db, 'tecnologos'), where('dni', '==', dni), where('clave', '==', clave));
            const snapshot = await getDocs(q);
            
            if (!snapshot.empty) {
                const tec = snapshot.docs[0].data();
                localStorage.setItem('tecnologoDNI', dni);
                localStorage.setItem('tecnologoNombre', tec.nombre);
                localStorage.setItem('rol', 'tecnologo');
                window.location.href = 'dashboard.html';
            } else {
                alert('❌ DNI o clave incorrectos');
            }
        } else if (rol === 'admin') {
            if (clave === 'admin2024') {
                localStorage.setItem('rol', 'admin');
                window.location.href = 'admin.html';
            } else {
                alert('❌ Credenciales de admin incorrectas');
            }
        }
    });
}

// ==================== PÁGINA: DASHBOARD ====================

const lista = document.getElementById('listaSolicitudes');
let estadoFiltro = 'todos';

if (lista && document.getElementById('tituloLista')) {
    const nombreTec = localStorage.getItem('tecnologoNombre');
    if (nombreTec) {
        const el = document.getElementById('nombreTecnologo');
        if (el) el.textContent = nombreTec;
    }
    
    window.filtrarEstado = function(estado) {
        estadoFiltro = estado;
        
        document.querySelectorAll('.btn-filtro').forEach(btn => btn.classList.remove('active'));
        document.getElementById('btn-' + estado).classList.add('active');
        
        const titulos = {
            'todos': '📋 Todas las Solicitudes',
            'pendiente': '⏳ Solicitudes Pendientes',
            'en_camino': '🚶 Solicitudes En Camino',
            'atendiendo': '🔬 Solicitudes Atendiendo',
            'rechazado': '❌ Solicitudes No Atendidas',
            'finalizado': '✅ Solicitudes Atendidas'
        };
        document.getElementById('tituloLista').textContent = titulos[estado];
        
        cargarSolicitudes();
    };
    
    function crearCardSolicitud(sol) {
        const id = sol.id;
        const data = sol.data;
        
        const tiempo = tiempoTranscurrido(data.timestamps?.creado);
        const alerta = colorAlerta(data.timestamps?.creado, data.estado);
        
        let botones = '';
        let estadoLabel = '';
        
        if (data.estado === 'pendiente') {
            estadoLabel = '⏳ Pendiente';
            botones = `
                <button onclick="cambiarEstado('${id}', 'en_camino')" class="btn-camino">🚶 En camino</button>
                <button onclick="mostrarRechazo('${id}')" class="btn-rechazar">❌ No atender</button>
            `;
        } else if (data.estado === 'en_camino') {
            estadoLabel = '🚶 En camino';
            botones = `<button onclick="cambiarEstado('${id}', 'atendiendo')" class="btn-atendiendo">🔬 Atendiendo</button>`;
        } else if (data.estado === 'atendiendo') {
            estadoLabel = '🔬 Atendiendo';
            botones = `<button onclick="cambiarEstado('${id}', 'finalizado')" class="btn-finalizar">✅ Finalizar</button>`;
        } else if (data.estado === 'rechazado') {
            estadoLabel = '❌ No atendido';
            botones = `<span class="rechazado-info">Motivo: ${data.motivoRechazo || 'No especificado'}</span>`;
        } else if (data.estado === 'finalizado') {
            estadoLabel = '✅ Atendido';
            botones = `<span class="completado">✅ Completado</span>`;
        }
        
        const urgenciaClass = data.urgencia === 'emergencia' ? 'tag-emergencia' : 
                              data.urgencia === 'urgente' ? 'tag-urgente' : 'tag-normal';
        
        return `
            <div class="solicitud-card ${alerta}" id="card-${id}">
                <div class="solicitud-header">
                    <span class="estado">${estadoLabel}</span>
                    <span class="tiempo">⏱️ ${tiempo}</span>
                </div>
                <div class="solicitud-body">
                    <p><strong>🆔 DNI:</strong> ${data.dniPaciente || '-'}</p>
                    <p><strong>👤 Paciente:</strong> ${data.nombrePaciente || '-'}</p>
                    <p><strong>🙋 Solicita:</strong> ${data.solicitadoPor}</p>
                    ${data.notas ? `<p><strong>📝 Notas:</strong> ${data.notas}</p>` : ''}
                    ${data.tecnologoAsignado ? `<p><strong>🔬 Tecnólogo:</strong> ${data.tecnologoAsignado}</p>` : ''}
                    ${data.fotoSolicitud ? `<a href="${data.fotoSolicitud}" target="_blank" class="btn-foto">📷 Ver solicitud</a>` : ''}
                </div>
                ${data.estado !== 'finalizado' && data.estado !== 'rechazado' ? `
                <div class="solicitud-actions">
                    ${botones}
                </div>
                ` : `<div class="solicitud-actions">${botones}</div>`}
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
    
    window.mostrarRechazo = async function(id) {
        const motivo = prompt('¿Por qué no es posible atender esta solicitud?');
        if (motivo && motivo.trim() !== '') {
            await updateDoc(doc(db, 'solicitudes', id), {
                estado: 'rechazado',
                'timestamps.rechazado': serverTimestamp(),
                motivoRechazo: motivo,
                tecnologoAsignado: localStorage.getItem('tecnologoNombre') || 'Tecnólogo'
            });
        }
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
            let counts = { pendiente: 0, en_camino: 0, atendiendo: 0, rechazado: 0, finalizado: 0 };
            
            snapshot.forEach((doc) => {
                const data = doc.data();
                if (counts[data.estado] !== undefined) counts[data.estado]++;
                html += crearCardSolicitud({ id: doc.id, data });
            });
            
            document.getElementById('countPendiente').textContent = counts.pendiente;
            document.getElementById('countEnCamino').textContent = counts.en_camino;
            document.getElementById('countAtendiendo').textContent = counts.atendiendo;
            document.getElementById('countRechazado').textContent = counts.rechazado;
            document.getElementById('countFinalizado').textContent = counts.finalizado;
            
            lista.innerHTML = html || '<p class="empty">No hay solicitudes en esta categoría</p>';
        });
    }
    
    cargarSolicitudes();
}

// ==================== PÁGINA: ADMIN ====================

const formCrearTecnologo = document.getElementById('formCrearTecnologo');
if (formCrearTecnologo) {
    // Verificar que sea admin
    if (localStorage.getItem('rol') !== 'admin') {
        alert('Acceso denegado');
        window.location.href = 'index.html';
    }
    
    formCrearTecnologo.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const dni = document.getElementById('tecDNI').value;
        const nombre = document.getElementById('tecNombre').value;
        const clave = document.getElementById('tecClave').value;
        
        try {
            await addDoc(collection(db, 'tecnologos'), {
                dni: dni,
                nombre: nombre,
                clave: clave,
                creado: serverTimestamp()
            });
            
            alert('✅ Tecnólogo creado correctamente');
            formCrearTecnologo.reset();
            cargarTecnologos();
            
        } catch (error) {
            alert('❌ Error: ' + error.message);
        }
    });
    
    // Cargar lista de tecnólogos
    function cargarTecnologos() {
        const q = query(collection(db, 'tecnologos'), orderBy('nombre'));
        onSnapshot(q, (snapshot) => {
            let html = '';
            snapshot.forEach((doc) => {
                const t = doc.data();
                html += `
                    <div class="tecnologo-item">
                        <span><strong>${t.nombre}</strong> (DNI: ${t.dni})</span>
                        <button onclick="eliminarTecnologo('${doc.id}')" class="btn-eliminar">🗑️</button>
                    </div>
                `;
            });
            document.getElementById('listaTecnologos').innerHTML = html || '<p class="empty">No hay tecnólogos registrados</p>';
        });
    }
    
    window.eliminarTecnologo = async function(id) {
        if (confirm('¿Eliminar este tecnólogo?')) {
            await deleteDoc(doc(db, 'tecnologos', id));
        }
    };
    
    cargarTecnologos();
}

// ==================== REPORTES ====================

window.generarReporte = async function() {
    const desde = document.getElementById('fechaDesde').value;
    const hasta = document.getElementById('fechaHasta').value;
    const contenedor = document.getElementById('resultadoReporte');
    
    if (!desde || !hasta) {
        alert('Selecciona fechas desde y hasta');
        return;
    }
    
    const fechaDesde = new Date(desde + 'T00:00:00');
    const fechaHasta = new Date(hasta + 'T23:59:59');
    
    const q = query(collection(db, 'solicitudes'), orderBy('timestamps.creado', 'desc'));
    const snapshot = await getDocs(q);
    
    let total = 0, atendidos = 0, rechazados = 0, pendientes = 0;
    let tiemposAtencion = [];
    let porTecnologo = {};
    
    snapshot.forEach((doc) => {
        const d = doc.data();
        const fechaCreado = d.timestamps?.creado?.toDate();
        
        if (fechaCreado && fechaCreado >= fechaDesde && fechaCreado <= fechaHasta) {
            total++;
            
            if (d.estado === 'finalizado') {
                atendidos++;
                const tec = d.tecnologoAsignado || 'Sin asignar';
                porTecnologo[tec] = (porTecnologo[tec] || 0) + 1;
                
                if (d.timestamps.creado && d.timestamps.finalizado) {
                    const diff = (d.timestamps.finalizado.toDate() - d.timestamps.creado.toDate()) / 1000 / 60;
                    tiemposAtencion.push(diff);
                }
            } else if (d.estado === 'rechazado') {
                rechazados++;
            } else {
                pendientes++;
            }
        }
    });
    
    const tiempoPromedio = tiemposAtencion.length > 0 
        ? (tiemposAtencion.reduce((a,b) => a+b, 0) / tiemposAtencion.length).toFixed(1) 
        : 0;
    
    let htmlTec = '';
    for (const [tec, cant] of Object.entries(porTecnologo)) {
        htmlTec += `<li>${tec}: ${cant} atenciones</li>`;
    }
    
    contenedor.innerHTML = `
        <div class="card">
            <h3>📊 Reporte del ${desde} al ${hasta}</h3>
            <div class="stats-reporte">
                <div class="stat-box"><strong>Total solicitudes:</strong> ${total}</div>
                <div class="stat-box"><strong>Atendidas:</strong> ${atendidos}</div>
                <div class="stat-box"><strong>No atendidas:</strong> ${rechazados}</div>
                <div class="stat-box"><strong>Pendientes:</strong> ${pendientes}</div>
                <div class="stat-box"><strong>Tiempo promedio:</strong> ${tiempoPromedio} min</div>
            </div>
            <h4>👥 Por tecnólogo:</h4>
            <ul>${htmlTec || '<li>Sin datos</li>'}</ul>
        </div>
    `;
};
