// ==================== CONFIGURACIÓN ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, 
    doc, updateDoc, query, orderBy, serverTimestamp, where, getDocs, deleteDoc
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
    if (diff > 3600) return 'alerta-roja';
    if (diff > 1800) return 'alerta-amarilla';
    return '';
}

function formatearFechaHora(timestamp) {
    if (!timestamp) return '-';
    const fecha = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return fecha.toLocaleString('es-PE', { 
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatearFechaInput(timestamp) {
    if (!timestamp) return '';
    const fecha = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return fecha.toISOString().split('T')[0];
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
            const dni = document.getElementById('dniPaciente').value;
            
            await addDoc(collection(db, 'solicitudes'), {
                dniPaciente: dni,
                nombrePaciente: document.getElementById('nombrePaciente').value,
                solicitadoPor: document.getElementById('solicitadoPor').value,
                notas: document.getElementById('notas').value || '',
                fotoSolicitud: fotoUrl,
                estado: 'pendiente',
                timestamps: {
                    creado: serverTimestamp(),
                    enCamino: null,
                    finalizado: null,
                    rechazado: null
                },
                tecnologoAsignado: null,
                motivoRechazo: null,
                notasContingencia: null
            });
            
            formSolicitud.reset();
            alert(`✅ Solicitud registrada correctamente\n\n🆔 CÓDIGO DE SEGUIMIENTO: ${dni}\n\nGuarde este DNI para consultar el estado.`);
            
        } catch (error) {
            console.error(error);
            alert('❌ Error: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = '➕ Registrar Solicitud';
        }
    });
}

// ==================== PÁGINA: CONSULTA ====================

const formConsulta = document.getElementById('formConsulta');
if (formConsulta) {
    formConsulta.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dni = document.getElementById('codigoSeguimiento').value.trim();
        const resultado = document.getElementById('resultadoConsulta');
        
        if (!dni) {
            resultado.innerHTML = '<p class="empty">Ingrese un DNI para consultar</p>';
            return;
        }
        
        try {
            const q = query(collection(db, 'solicitudes'), where('dniPaciente', '==', dni), orderBy('timestamps.creado', 'desc'));
            const snapshot = await getDocs(q);
            
            if (snapshot.empty) {
                resultado.innerHTML = '<p class="empty">❌ No se encontró solicitud con ese DNI</p>';
                return;
            }
            
            let html = '';
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const estadosLabels = {
                    'pendiente': '⏳ Pendiente',
                    'en_camino': '🚶 En camino',
                    'rechazado': '❌ No atendido',
                    'finalizado': '✅ Atendido'
                };
                
                html += `
                    <div class="card">
                        <h3>📋 Solicitud - ${formatearFechaHora(data.timestamps?.creado)}</h3>
                        <p><strong>👤 Paciente:</strong> ${data.nombrePaciente}</p>
                        <p><strong>⚡ Estado:</strong> <span class="estado-${data.estado}">${estadosLabels[data.estado]}</span></p>
                        ${data.tecnologoAsignado ? `<p><strong>🔬 Tecnólogo:</strong> ${data.tecnologoAsignado}</p>` : ''}
                        ${data.motivoRechazo ? `<p><strong>❌ Motivo:</strong> ${data.motivoRechazo}</p>` : ''}
                        ${data.notasContingencia ? `<p><strong>📝 Notas técnicas:</strong> ${data.notasContingencia}</p>` : ''}
                    </div>
                `;
            });
            
            resultado.innerHTML = html;
            
        } catch (error) {
            resultado.innerHTML = `<p class="empty">❌ Error: ${error.message}</p>`;
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
        if (grupoDNI) grupoDNI.style.display = 'none';
    }
    
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const clave = document.getElementById('clave').value;
        
        if (rol === 'tecnologo') {
            const dni = document.getElementById('dni').value;
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

// ==================== PÁGINA: DASHBOARD (CARDS) ====================

const listaCards = document.getElementById('listaSolicitudes');
let estadoFiltro = 'todos';
let fechaFiltro = '';

if (listaCards) {
    const nombreTec = localStorage.getItem('tecnologoNombre');
    if (nombreTec) {
        const el = document.getElementById('nombreTecnologo');
        if (el) el.textContent = nombreTec;
    }
    
    const inputFecha = document.getElementById('fechaFiltro');
    if (inputFecha) {
        inputFecha.addEventListener('change', () => {
            fechaFiltro = inputFecha.value;
            cargarSolicitudes();
        });
    }
    
    window.filtrarEstado = function(estado) {
        estadoFiltro = estado;
        
        document.querySelectorAll('.btn-filtro').forEach(btn => {
            if (btn) btn.classList.remove('active');
        });
        const btnActivo = document.getElementById('btn-' + estado);
        if (btnActivo) btnActivo.classList.add('active');
        
        const titulos = {
            'todos': '📋 Todas',
            'pendiente': '⏳ Pendientes',
            'en_camino': '🚶 En camino',
            'rechazado': '❌ No atendidas',
            'finalizado': '✅ Atendidas'
        };
        const tituloEl = document.getElementById('tituloLista');
        if (tituloEl) tituloEl.textContent = titulos[estado] || '📋 Solicitudes';
        
        cargarSolicitudes();
    };
    
    function crearCardSolicitud(sol) {
        const id = sol.id;
        const data = sol.data;
        
        const fechaHora = formatearFechaHora(data.timestamps?.creado);
        const tiempo = tiempoTranscurrido(data.timestamps?.creado);
        const alerta = colorAlerta(data.timestamps?.creado, data.estado);
        
        let acciones = '';
        let estadoBadge = '';
        
        if (data.estado === 'pendiente') {
            estadoBadge = '<span class="estado-badge pendiente">⏳ PENDIENTE</span>';
            acciones = `
                <button onclick="cambiarEstado('${id}', 'en_camino')" class="btn-action camino">🚶 EN CAMINO</button>
                <button onclick="mostrarRechazo('${id}')" class="btn-action rechazar">❌ NO ATENDER</button>
            `;
        } else if (data.estado === 'en_camino') {
            estadoBadge = '<span class="estado-badge camino">🚶 EN CAMINO</span>';
            acciones = `
                <button onclick="mostrarNotasContingencia('${id}')" class="btn-action notas">📝 NOTAS</button>
                <button onclick="cambiarEstado('${id}', 'finalizado')" class="btn-action finalizar">✅ FINALIZAR</button>
            `;
            if (data.notasContingencia) {
                acciones += `<p class="notas-contingencia">📝 ${data.notasContingencia}</p>`;
            }
        } else if (data.estado === 'rechazado') {
            estadoBadge = '<span class="estado-badge rechazado">❌ NO ATENDIDO</span>';
            acciones = `
                <button onclick="revertirRechazo('${id}')" class="btn-action revertir">↩️ REVERTIR</button>
                <p class="motivo">Motivo: ${data.motivoRechazo || 'No especificado'}</p>
            `;
        } else if (data.estado === 'finalizado') {
            estadoBadge = '<span class="estado-badge finalizado">✅ ATENDIDO</span>';
            acciones = `<span class="completado">Completado</span>`;
            if (data.notasContingencia) {
                acciones += `<p class="notas-contingencia">📝 ${data.notasContingencia}</p>`;
            }
        }
        
        return `
            <div class="solicitud-card-v2 ${alerta}" id="card-${id}">
                <div class="card-header">
                    <div class="card-titulo">
                        <strong>${data.nombrePaciente || '-'}</strong>
                        <span class="dni">DNI: ${data.dniPaciente || '-'}</span>
                    </div>
                    ${estadoBadge}
                </div>
                
                <div class="card-info">
                    <div class="info-row">
                        <span>🕐 ${fechaHora}</span>
                        <span class="tiempo">⏱️ ${tiempo}</span>
                    </div>
                    <div class="info-row">
                        <span>🙋 ${data.solicitadoPor}</span>
                        <span>🔬 ${data.tecnologoAsignado || 'Sin asignar'}</span>
                    </div>
                    ${data.notas ? `<div class="info-row notas">📝 ${data.notas}</div>` : ''}
                </div>
                
                <div class="card-foto">
                    ${data.fotoSolicitud ? `<a href="${data.fotoSolicitud}" target="_blank">📷 Ver solicitud</a>` : ''}
                </div>
                
                <div class="card-actions">
                    ${acciones}
                </div>
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
        if (nuevoEstado === 'finalizado') updates['timestamps.finalizado'] = now;
        
        try {
            await updateDoc(doc(db, 'solicitudes', id), updates);
        } catch (error) {
            console.error('Error:', error);
            alert('❌ Error: ' + error.message);
        }
    };
    
    window.mostrarNotasContingencia = async function(id) {
        const notas = prompt('Ingrese notas de contingencia / observaciones técnicas:');
        if (notas && notas.trim() !== '') {
            try {
                await updateDoc(doc(db, 'solicitudes', id), {
                    notasContingencia: notas
                });
            } catch (error) {
                alert('❌ Error: ' + error.message);
            }
        }
    };
    
    window.mostrarRechazo = async function(id) {
        const motivo = prompt('¿Por qué no es posible atender?');
        if (motivo && motivo.trim() !== '') {
            try {
                await updateDoc(doc(db, 'solicitudes', id), {
                    estado: 'rechazado',
                    'timestamps.rechazado': serverTimestamp(),
                    motivoRechazo: motivo,
                    tecnologoAsignado: localStorage.getItem('tecnologoNombre') || 'Tecnólogo'
                });
            } catch (error) {
                alert('❌ Error: ' + error.message);
            }
        }
    };
    
    window.revertirRechazo = async function(id) {
        if (confirm('¿Revertir a Pendiente?')) {
            try {
                await updateDoc(doc(db, 'solicitudes', id), {
                    estado: 'pendiente',
                    motivoRechazo: null,
                    tecnologoAsignado: null
                });
            } catch (error) {
                alert('❌ Error: ' + error.message);
            }
        }
    };
    
    let unsubscribe = null;
    
    function cargarSolicitudes() {
        if (unsubscribe) unsubscribe();
        
        const q = query(collection(db, 'solicitudes'), orderBy('timestamps.creado', 'desc'));
        
        unsubscribe = onSnapshot(q, (snapshot) => {
            let html = '';
            let counts = { pendiente: 0, en_camino: 0, rechazado: 0, finalizado: 0 };
            
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                
                if (estadoFiltro !== 'todos' && data.estado !== estadoFiltro) return;
                
                if (fechaFiltro && data.timestamps?.creado) {
                    const fechaDoc = data.timestamps.creado.toDate().toISOString().split('T')[0];
                    if (fechaDoc !== fechaFiltro) return;
                }
                
                if (counts[data.estado] !== undefined) counts[data.estado]++;
                html += crearCardSolicitud({ id: docSnap.id, data });
            });
            
            const countPendiente = document.getElementById('countPendiente');
            const countEnCamino = document.getElementById('countEnCamino');
            const countRechazado = document.getElementById('countRechazado');
            const countFinalizado = document.getElementById('countFinalizado');
            
            if (countPendiente) countPendiente.textContent = counts.pendiente;
            if (countEnCamino) countEnCamino.textContent = counts.en_camino;
            if (countRechazado) countRechazado.textContent = counts.rechazado;
            if (countFinalizado) countFinalizado.textContent = counts.finalizado;
            
            listaCards.innerHTML = html || '<p class="empty">No hay solicitudes</p>';
        }, (error) => {
            console.error('Error:', error);
            listaCards.innerHTML = `<p class="empty">❌ Error: ${error.message}</p>`;
        });
    }
    
    cargarSolicitudes();
}

// ==================== PÁGINA: ADMIN ====================

const formCrearTecnologo = document.getElementById('formCrearTecnologo');
if (formCrearTecnologo) {
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
    
    function cargarTecnologos() {
        const q = query(collection(db, 'tecnologos'), orderBy('nombre'));
        onSnapshot(q, (snapshot) => {
            let html = '';
            snapshot.forEach((docSnap) => {
                const t = docSnap.data();
                html += `
                    <div class="tecnologo-item">
                        <span><strong>${t.nombre}</strong> (DNI: ${t.dni})</span>
                        <button onclick="eliminarTecnologo('${docSnap.id}')" class="btn-eliminar">🗑️</button>
                    </div>
                `;
            });
            const lista = document.getElementById('listaTecnologos');
            if (lista) lista.innerHTML = html || '<p class="empty">No hay tecnólogos registrados</p>';
        });
    }
    
    window.eliminarTecnologo = async function(id) {
        if (confirm('¿Eliminar este tecnólogo?')) {
            await deleteDoc(doc(db, 'tecnologos', id));
        }
    };
    
    cargarTecnologos();
}

// ==================== REPORTES CON EXPORTAR A EXCEL ====================

window.generarReporte = async function() {
    const desde = document.getElementById('fechaDesde').value;
    const hasta = document.getElementById('fechaHasta').value;
    const tipoReporte = document.getElementById('tipoReporte')?.value || 'general';
    const tecnologoFiltro = document.getElementById('tecnologoFiltro')?.value || '';
    const contenedor = document.getElementById('resultadoReporte');
    
    if (!desde || !hasta) {
        alert('Selecciona fechas desde y hasta');
        return;
    }
    
    const fechaDesde = new Date(desde + 'T00:00:00');
    const fechaHasta = new Date(hasta + 'T23:59:59');
    
    const q = query(collection(db, 'solicitudes'), orderBy('timestamps.creado', 'desc'));
    const snapshot = await getDocs(q);
    
    let solicitudes = [];
    let total = 0, atendidos = 0, rechazados = 0, pendientes = 0;
    let tiemposAtencion = [];
    let porTecnologo = {};
    
    snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const fechaCreado = d.timestamps?.creado?.toDate();
        
        if (fechaCreado && fechaCreado >= fechaDesde && fechaCreado <= fechaHasta) {
            // Filtro por tecnólogo si es individual
            if (tipoReporte === 'individual' && tecnologoFiltro && d.tecnologoAsignado !== tecnologoFiltro) return;
            
            total++;
            
            // Calcular tiempo de atención
            let tiempoAtencion = '-';
            if (d.timestamps.creado && d.timestamps.finalizado) {
                const diff = (d.timestamps.finalizado.toDate() - d.timestamps.creado.toDate()) / 1000 / 60;
                tiempoAtencion = diff.toFixed(1) + ' min';
                tiemposAtencion.push(diff);
            }
            
            solicitudes.push({
                fechaHora: formatearFechaHora(d.timestamps?.creado),
                dni: d.dniPaciente,
                paciente: d.nombrePaciente,
                solicitadoPor: d.solicitadoPor,
                estado: d.estado,
                tecnologo: d.tecnologoAsignado || 'Sin asignar',
                tiempoAtencion: tiempoAtencion,
                notas: d.notas || '',
                notasContingencia: d.notasContingencia || '',
                motivoRechazo: d.motivoRechazo || ''
            });
            
            if (d.estado === 'finalizado') {
                atendidos++;
                const tec = d.tecnologoAsignado || 'Sin asignar';
                porTecnologo[tec] = (porTecnologo[tec] || 0) + 1;
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
    
    // Generar HTML del reporte
    let htmlTec = '';
    for (const [tec, cant] of Object.entries(porTecnologo)) {
        htmlTec += `<li>${tec}: ${cant} atenciones</li>`;
    }
    
    // Tabla detallada
    let tablaHTML = `
        <table class="tabla-reporte" id="tablaReporte">
            <thead>
                <tr>
                    <th>Fecha/Hora</th>
                    <th>DNI</th>
                    <th>Paciente</th>
                    <th>Solicita</th>
                    <th>Estado</th>
                    <th>Tecnólogo</th>
                    <th>Tiempo Atención</th>
                    <th>Notas</th>
                    <th>Notas Técnicas</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    solicitudes.forEach(s => {
        tablaHTML += `
            <tr>
                <td>${s.fechaHora}</td>
                <td>${s.dni}</td>
                <td>${s.paciente}</td>
                <td>${s.solicitadoPor}</td>
                <td>${s.estado}</td>
                <td>${s.tecnologo}</td>
                <td>${s.tiempoAtencion}</td>
                <td>${s.notas}</td>
                <td>${s.notasContingencia}</td>
            </tr>
        `;
    });
    
    tablaHTML += '</tbody></table>';
    
    contenedor.innerHTML = `
        <div class="card">
            <h3>📊 Reporte ${tipoReporte === 'individual' ? 'Individual' : 'General'} del ${desde} al ${hasta}</h3>
            <div class="stats-reporte">
                <div class="stat-box"><strong>Total:</strong> ${total}</div>
                <div class="stat-box"><strong>Atendidas:</strong> ${atendidos}</div>
                <div class="stat-box"><strong>No atendidas:</strong> ${rechazados}</div>
                <div class="stat-box"><strong>Pendientes:</strong> ${pendientes}</div>
                <div class="stat-box"><strong>Tiempo promedio:</strong> ${tiempoPromedio} min</div>
            </div>
            ${tipoReporte === 'general' ? `<h4>👥 Por tecnólogo:</h4><ul>${htmlTec || '<li>Sin datos</li>'}</ul>` : ''}
            
            <h4>📋 Detalle:</h4>
            ${tablaHTML}
            
            <button onclick="exportarExcel()" class="btn-primary" style="margin-top:15px;">📥 Exportar a Excel</button>
        </div>
    `;
    
    // Guardar datos para exportar
    window.datosReporte = solicitudes;
};

window.exportarExcel = function() {
    if (!window.datosReporte || window.datosReporte.length === 0) {
        alert('No hay datos para exportar');
        return;
    }
    
    // Crear CSV
    let csv = 'Fecha/Hora,DNI,Paciente,Solicita,Estado,Tecnologo,Tiempo Atencion,Notas,Notas Tecnicas\n';
    
    window.datosReporte.forEach(s => {
        csv += `"${s.fechaHora}","${s.dni}","${s.paciente}","${s.solicitadoPor}","${s.estado}","${s.tecnologo}","${s.tiempoAtencion}","${s.notas}","${s.notasContingencia}"\n`;
    });
    
    // Descargar
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_ssp_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
