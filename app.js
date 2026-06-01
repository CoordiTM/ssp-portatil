// ==================== CONFIGURACION ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, 
    doc, updateDoc, query, orderBy, serverTimestamp, Timestamp, where, getDocs, deleteDoc, getDoc
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

// ==================== NOTIFICACIONES DE VOZ ====================

function hablar(texto) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(texto);
        utterance.lang = 'es-ES';
        utterance.rate = 1;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
    }
}

// ==================== COMPRESION DE IMAGENES ====================

function comprimirImagen(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function(event) {
            const img = new Image();
            img.src = event.target.result;
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const scale = maxWidth / img.width;
                canvas.width = maxWidth;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(function(blob) {
                    const compressedFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                }, 'image/jpeg', quality);
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

// ==================== SUBIR ARCHIVO A CLOUDINARY ====================

async function subirArchivoCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    const response = await fetch(
        'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/auto/upload',
        { method: 'POST', body: formData }
    );
    const data = await response.json();
    return data.secure_url;
}

// ==================== UTILIDADES ====================

function tiempoTranscurrido(timestamp, horaProgramada, estado, timestampFinalizado, timestampRechazado) {
    if (estado === 'finalizado' && timestampFinalizado) {
        const inicio = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const fin = timestampFinalizado.toDate ? timestampFinalizado.toDate() : new Date(timestampFinalizado);
        const diff = Math.floor((fin - inicio) / 1000);
        if (diff < 60) return '✅ ' + diff + 's total';
        if (diff < 3600) return '✅ ' + Math.floor(diff/60) + 'm total';
        return '✅ ' + Math.floor(diff/3600) + 'h ' + Math.floor((diff%3600)/60) + 'm total';
    }
    if (estado === 'rechazado' && timestampRechazado) {
        const inicio = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const fin = timestampRechazado.toDate ? timestampRechazado.toDate() : new Date(timestampRechazado);
        const diff = Math.floor((fin - inicio) / 1000);
        if (diff < 60) return '❌ ' + diff + 's total';
        if (diff < 3600) return '❌ ' + Math.floor(diff/60) + 'm total';
        return '❌ ' + Math.floor(diff/3600) + 'h ' + Math.floor((diff%3600)/60) + 'm total';
    }
    if (!timestamp) return '-';
    const ahora = new Date();
    let creado;
    if (horaProgramada) {
        const fechaProgramada = horaProgramada.toDate ? horaProgramada.toDate() : new Date(horaProgramada);
        if (fechaProgramada > ahora) {
            const diffFuturo = Math.floor((fechaProgramada - ahora) / 1000);
            if (diffFuturo < 3600) return '⏰ En ' + Math.floor(diffFuturo/60) + 'm';
            return '⏰ En ' + Math.floor(diffFuturo/3600) + 'h ' + Math.floor((diffFuturo%3600)/60) + 'm';
        }
        creado = fechaProgramada;
    } else {
        creado = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    }
    const diff = Math.floor((ahora - creado) / 1000);
    if (diff < 60) return diff + 's';
    if (diff < 3600) return Math.floor(diff/60) + 'm';
    return Math.floor(diff/3600) + 'h ' + Math.floor((diff%3600)/60) + 'm';
}

function colorAlerta(data) {
    if (!data.timestamps || !data.timestamps.creado || data.estado === 'finalizado' || data.estado === 'rechazado') return '';
    const ahora = new Date();
    let inicio;
    if (data.horaProgramada) {
        const fechaProgramada = data.horaProgramada.toDate ? data.horaProgramada.toDate() : new Date(data.horaProgramada);
        inicio = fechaProgramada;
    } else {
        inicio = data.timestamps.creado.toDate();
    }
    if (data.esProgramado && inicio > ahora) return 'programado-futuro';
    const diff = Math.floor((ahora - inicio) / 1000);
    if (diff > 3600) return 'alerta-roja';
    if (diff > 900) return 'alerta-amarilla';
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

// ==================== FUNCIONES GLOBALES ====================

window.cambiarEstado = async function(id, nuevoEstado) {
    const updates = { estado: nuevoEstado };
    const now = serverTimestamp();
    const tecnologo = localStorage.getItem('tecnologoNombre') || 'Tecnologo';
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
    const notas = prompt('Ingrese nota de contingencia / observacion:');
    if (notas && notas.trim() !== '') {
        try {
            const docRef = doc(db, 'solicitudes', id);
            const docSnap = await getDoc(docRef);
            const data = docSnap.data();
            const nuevaNota = {
                fecha: new Date().toLocaleString('es-PE', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                }),
                texto: notas.trim(),
                tecnologo: localStorage.getItem('tecnologoNombre') || 'Tecnologo'
            };
            const historialActual = data.historialNotas || [];
            historialActual.push(nuevaNota);
            await updateDoc(docRef, { historialNotas: historialActual });
        } catch (error) {
            alert('❌ Error: ' + error.message);
        }
    }
};

window.mostrarRechazo = async function(id) {
    const motivo = prompt('¿Por que no es posible atender?');
    if (motivo && motivo.trim() !== '') {
        try {
            await updateDoc(doc(db, 'solicitudes', id), {
                estado: 'rechazado',
                'timestamps.rechazado': serverTimestamp(),
                motivoRechazo: motivo,
                tecnologoAsignado: localStorage.getItem('tecnologoNombre') || 'Tecnologo'
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

window.revertirEstadoAdmin = async function(id) {
    if (confirm('¿Revertir esta solicitud a estado PENDIENTE?')) {
        try {
            await updateDoc(doc(db, 'solicitudes', id), {
                estado: 'pendiente',
                motivoRechazo: null,
                tecnologoAsignado: null,
                'timestamps.enCamino': null,
                'timestamps.finalizado': null,
                'timestamps.rechazado': null
            });
            alert('✅ Estado revertido a PENDIENTE');
        } catch (error) {
            alert('❌ Error: ' + error.message);
        }
    }
};

window.eliminarSolicitud = async function(id) {
    if (confirm('¿Eliminar permanentemente esta solicitud?')) {
        try {
            await deleteDoc(doc(db, 'solicitudes', id));
            alert('✅ Solicitud eliminada');
        } catch (error) {
            alert('❌ Error: ' + error.message);
        }
    }
};

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
            if (tipoReporte === 'individual' && tecnologoFiltro && d.tecnologoAsignado !== tecnologoFiltro) return;
            total++;
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
                servicio: d.servicio || '-',
                solicitadoPor: d.solicitadoPor,
                estado: d.estado,
                tecnologo: d.tecnologoAsignado || 'Sin asignar',
                tiempoAtencion: tiempoAtencion,
                notas: d.notas || '',
                historialNotas: d.historialNotas || [],
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
    let htmlTec = '';
    for (const [tec, cant] of Object.entries(porTecnologo)) {
        htmlTec += '<li>' + tec + ': ' + cant + ' atenciones</li>';
    }
    let tablaHTML = '<table class="tabla-reporte" id="tablaReporte"><thead><tr><th>Fecha/Hora</th><th>DNI</th><th>Paciente</th><th>Servicio</th><th>Solicita</th><th>Estado</th><th>Tecnologo</th><th>Tiempo Atencion</th><th>Notas</th></tr></thead><tbody>';
    solicitudes.forEach(s => {
        tablaHTML += '<tr><td>' + s.fechaHora + '</td><td>' + s.dni + '</td><td>' + s.paciente + '</td><td>' + s.servicio + '</td><td>' + s.solicitadoPor + '</td><td>' + s.estado + '</td><td>' + s.tecnologo + '</td><td>' + s.tiempoAtencion + '</td><td>' + s.notas + '</td></tr>';
    });
    tablaHTML += '</tbody></table>';
    contenedor.innerHTML = '<div class="card"><h3>📊 Reporte ' + (tipoReporte === 'individual' ? 'Individual' : 'General') + ' del ' + desde + ' al ' + hasta + '</h3><div class="stats-reporte"><div class="stat-box"><strong>Total:</strong> ' + total + '</div><div class="stat-box"><strong>Atendidas:</strong> ' + atendidos + '</div><div class="stat-box"><strong>No atendidas:</strong> ' + rechazados + '</div><div class="stat-box"><strong>Pendientes:</strong> ' + pendientes + '</div><div class="stat-box"><strong>Tiempo promedio:</strong> ' + tiempoPromedio + ' min</div></div>' + (tipoReporte === 'general' ? '<h4>👥 Por tecnologo:</h4><ul>' + (htmlTec || '<li>Sin datos</li>') + '</ul>' : '') + '<h4>📋 Detalle:</h4>' + tablaHTML + '<button onclick="exportarExcel()" class="btn-primary" style="margin-top:15px;">📥 Exportar a Excel</button></div>';
    window.datosReporte = solicitudes;
};

window.exportarExcel = function() {
    if (!window.datosReporte || window.datosReporte.length === 0) {
        alert('No hay datos para exportar');
        return;
    }
    let csv = 'Fecha/Hora,DNI,Paciente,Servicio,Solicita,Estado,Tecnologo,Tiempo Atencion,Notas\n';
    window.datosReporte.forEach(s => {
        csv += '"' + s.fechaHora + '","' + s.dni + '","' + s.paciente + '","' + s.servicio + '","' + s.solicitadoPor + '","' + s.estado + '","' + s.tecnologo + '","' + s.tiempoAtencion + '","' + s.notas + '"\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'reporte_ssp_' + new Date().toISOString().split('T')[0] + '.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// ==================== PAGINA: REGISTRAR ====================

const formSolicitud = document.getElementById('formSolicitud');
if (formSolicitud) {
    formSolicitud.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = formSolicitud.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = '⏳ Subiendo...';
        try {
            const file = document.getElementById('archivoSolicitud').files[0];
            if (!file) {
                alert('❌ Debe seleccionar una foto o PDF');
                btn.disabled = false;
                btn.textContent = '➕ Registrar Solicitud';
                return;
            }
            const esPDF = file.type === 'application/pdf';
            const esImagen = file.type.startsWith('image/');
            if (!esPDF && !esImagen) {
                alert('❌ Solo se permiten fotos (JPG, PNG) o PDF');
                btn.disabled = false;
                btn.textContent = '➕ Registrar Solicitud';
                return;
            }
            let archivoSubir = file;
            if (esImagen) {
                archivoSubir = await comprimirImagen(file, 800, 0.7);
            }
            const archivoUrl = await subirArchivoCloudinary(archivoSubir);
            const dni = document.getElementById('dniPaciente').value;
            const esProgramado = document.getElementById('esProgramado').value === 'si';
            const horaProgramadaInput = document.getElementById('horaProgramada').value;
            let horaProgramadaTimestamp = null;
            if (esProgramado && horaProgramadaInput) {
                const fechaProgramada = new Date(horaProgramadaInput);
                horaProgramadaTimestamp = Timestamp.fromDate(fechaProgramada);
            }
            await addDoc(collection(db, 'solicitudes'), {
                dniPaciente: dni,
                nombrePaciente: document.getElementById('nombrePaciente').value || '',
                servicio: document.getElementById('servicio').value,
                solicitadoPor: document.getElementById('solicitadoPor').value || '',
                notas: document.getElementById('notas').value || '',
                archivoSolicitud: archivoUrl,
                esPDF: esPDF,
                estado: 'pendiente',
                esProgramado: esProgramado,
                horaProgramada: horaProgramadaTimestamp,
                timestamps: {
                    creado: serverTimestamp(),
                    enCamino: null,
                    finalizado: null,
                    rechazado: null
                },
                tecnologoAsignado: null,
                motivoRechazo: null,
                historialNotas: []
            });
            formSolicitud.reset();
            document.getElementById('grupoHoraProgramada').style.display = 'none';
            hablar('Tu solicitud ha sido registrada con exito');
            alert('✅ Solicitud registrada correctamente. Codigo de seguimiento: ' + dni);
        } catch (error) {
            console.error(error);
            alert('❌ Error: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = '➕ Registrar Solicitud';
        }
    });
}

// ==================== PAGINA: CONSULTA ====================

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
                resultado.innerHTML = '<p class="empty">❌ No se encontro solicitud con ese DNI</p>';
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
                let infoProgramado = '';
                if (data.esProgramado && data.horaProgramada) {
                    infoProgramado = '<p><strong>⏰ Programado para:</strong> ' + formatearFechaHora(data.horaProgramada) + '</p>';
                }
                let historialNotasHTML = '';
                if (data.historialNotas && data.historialNotas.length > 0) {
                    historialNotasHTML = '<div class="historial-notas-consulta"><h4>📝 Trazabilidad - Registro de eventos:</h4>';
                    data.historialNotas.forEach((nota) => {
                        historialNotasHTML += '<div class="nota-item-consulta"><div class="nota-header"><span class="nota-fecha">📅 ' + nota.fecha + '</span><span class="nota-tecnologo">👤 ' + nota.tecnologo + '</span></div><p class="nota-texto">' + nota.texto + '</p></div>';
                    });
                    historialNotasHTML += '</div>';
                }
                let trazabilidadHTML = '';
                let estadosLines = [];
                if (data.timestamps && data.timestamps.creado) {
                    estadosLines.push('📋 Registrado: ' + formatearFechaHora(data.timestamps.creado));
                }
                if (data.timestamps && data.timestamps.enCamino) {
                    estadosLines.push('🚶 En camino: ' + formatearFechaHora(data.timestamps.enCamino));
                }
                if (data.timestamps && data.timestamps.finalizado) {
                    estadosLines.push('✅ Finalizado: ' + formatearFechaHora(data.timestamps.finalizado));
                }
                if (data.timestamps && data.timestamps.rechazado) {
                    estadosLines.push('❌ No atendido: ' + formatearFechaHora(data.timestamps.rechazado));
                }
                if (estadosLines.length > 0) {
                    trazabilidadHTML = '<div class="trazabilidad-estados"><h4>📊 Trazabilidad de estados:</h4>';
                    estadosLines.forEach((line) => {
                        trazabilidadHTML += '<p class="estado-line">' + line + '</p>';
                    });
                    trazabilidadHTML += '</div>';
                }
                let archivoHTML = '';
                if (data.archivoSolicitud) {
                    const tipoArchivo = data.esPDF ? '📄 PDF' : '📷 Foto';
                    archivoHTML = '<p><strong>📎 Archivo:</strong> <a href="' + data.archivoSolicitud + '" target="_blank">' + tipoArchivo + ' - Ver solicitud</a></p>';
                }
                html += '<div class="card">';
                html += '<h3>📋 Solicitud - ' + formatearFechaHora(data.timestamps.creado) + '</h3>';
                html += '<p><strong>👤 Paciente:</strong> ' + data.nombrePaciente + '</p>';
                if (data.servicio) {
                    html += '<p><strong>🏥 Servicio:</strong> ' + data.servicio + '</p>';
                }
                html += infoProgramado;
                html += '<p><strong>⚡ Estado actual:</strong> <span class="estado-' + data.estado + '">' + estadosLabels[data.estado] + '</span></p>';
                if (data.tecnologoAsignado) {
                    html += '<p><strong>🔬 Tecnologo asignado:</strong> ' + data.tecnologoAsignado + '</p>';
                }
                if (data.motivoRechazo) {
                    html += '<p><strong>❌ Motivo no atencion:</strong> ' + data.motivoRechazo + '</p>';
                }
                html += archivoHTML;
                html += trazabilidadHTML;
                html += historialNotasHTML;
                html += '</div>';
            });
            resultado.innerHTML = html;
        } catch (error) {
            resultado.innerHTML = '<p class="empty">❌ Error: ' + error.message + '</p>';
        }
    });
}

// ==================== PAGINA: LOGIN ====================

const formLogin = document.getElementById('formLogin');
if (formLogin) {
    const params = new URLSearchParams(window.location.search);
    const rol = params.get('rol') || 'tecnologo';
    const tituloLogin = document.getElementById('tituloLogin');
    const grupoDNI = document.getElementById('grupoDNI');
    if (rol === 'admin') {
        if (tituloLogin) tituloLogin.textContent = '⚙️ Acceso Administrador';
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

// ==================== PAGINA: DASHBOARD ====================

const listaCards = document.getElementById('listaSolicitudes');
let estadoFiltro = 'todos';
let fechaFiltro = '';
let solicitudesAnteriores = new Set();

function crearCardSolicitud(sol) {
    const id = sol.id;
    const data = sol.data;
    const fechaHora = formatearFechaHora(data.timestamps?.creado);
    const tiempo = tiempoTranscurrido(data.timestamps?.creado, data.horaProgramada, data.estado, data.timestamps?.finalizado, data.timestamps?.rechazado);
    const alerta = colorAlerta(data);
    let acciones = '';
    let estadoBadge = '';
    let indicadorProgramado = '';
    if (data.esProgramado && data.horaProgramada) {
        const horaProg = data.horaProgramada.toDate ? data.horaProgramada.toDate() : new Date(data.horaProgramada);
        const horaProgStr = horaProg.toLocaleString('es-PE', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        });
        indicadorProgramado = '<span class="badge-programado">⏰ Programado: ' + horaProgStr + '</span>';
    }
    let historialNotasHTML = '';
    if (data.historialNotas && data.historialNotas.length > 0) {
        historialNotasHTML = '<div class="historial-notas"><h4>📝 Registro de eventos:</h4>';
        data.historialNotas.forEach((nota) => {
            historialNotasHTML += '<div class="nota-item"><span class="nota-fecha">' + nota.fecha + '</span><span class="nota-tecnologo">👤 ' + nota.tecnologo + '</span><p class="nota-texto">' + nota.texto + '</p></div>';
        });
        historialNotasHTML += '</div>';
    }
    if (data.estado === 'pendiente') {
        estadoBadge = '<span class="estado-badge pendiente">⏳ PENDIENTE</span>';
        acciones = '<button onclick="cambiarEstado(\'' + id + '\', \'en_camino\')" class="btn-action camino">🚶 EN CAMINO</button><button onclick="mostrarRechazo(\'' + id + '\')" class="btn-action rechazar">❌ NO ATENDER</button>';
    } else if (data.estado === 'en_camino') {
        estadoBadge = '<span class="estado-badge camino">🚶 EN CAMINO</span>';
        acciones = '<button onclick="mostrarNotasContingencia(\'' + id + '\')" class="btn-action notas">📝 NOTAS</button><button onclick="cambiarEstado(\'' + id + '\', \'finalizado\')" class="btn-action finalizar">✅ FINALIZAR</button><button onclick="mostrarRechazo(\'' + id + '\')" class="btn-action rechazar">❌ NO ATENDER</button>';
    } else if (data.estado === 'rechazado') {
        estadoBadge = '<span class="estado-badge rechazado">❌ NO ATENDIDO</span>';
        acciones = '<button onclick="revertirRechazo(\'' + id + '\')" class="btn-action revertir">↩️ REVERTIR</button><p class="motivo">Motivo: ' + (data.motivoRechazo || 'No especificado') + '</p>';
    } else if (data.estado === 'finalizado') {
        estadoBadge = '<span class="estado-badge finalizado">✅ ATENDIDO</span>';
        acciones = '<span class="completado">Completado</span>';
    }
    let adminBotones = '';
    if (localStorage.getItem('rol') === 'admin') {
        adminBotones = '<div style="margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 10px;"><button onclick="revertirEstadoAdmin(\'' + id + '\')" class="btn-action" style="background: #e3f2fd; color: #1976d2;">↩️ REVERTIR A PENDIENTE</button><button onclick="eliminarSolicitud(\'' + id + '\')" class="btn-action" style="background: #ffebee; color: #d32f2f;">🗑️ ELIMINAR</button></div>';
    }
    let servicioHTML = '';
    if (data.servicio) {
        servicioHTML = '<div class="info-row"><span>🏥 ' + data.servicio + '</span></div>';
    }
    let archivoHTML = '';
    if (data.archivoSolicitud) {
        const tipoArchivo = data.esPDF ? '📄 PDF' : '📷 Foto';
        archivoHTML = '<div class="card-foto"><a href="' + data.archivoSolicitud + '" target="_blank">' + tipoArchivo + ' - Ver solicitud</a></div>';
    }
    return '<div class="solicitud-card-v2 ' + alerta + '" id="card-' + id + '"><div class="card-header"><div class="card-titulo"><strong>' + (data.nombrePaciente || '-') + '</strong><span class="dni">DNI: ' + (data.dniPaciente || '-') + '</span>' + indicadorProgramado + '</div>' + estadoBadge + '</div><div class="card-info"><div class="info-row"><span>🕐 ' + fechaHora + '</span><span class="tiempo">⏱️ ' + tiempo + '</span></div>' + servicioHTML + '<div class="info-row"><span>🙋 ' + data.solicitadoPor + '</span><span>🔬 ' + (data.tecnologoAsignado || 'Sin asignar') + '</span></div>' + (data.notas ? '<div class="info-row notas">📝 ' + data.notas + '</div>' : '') + '</div>' + archivoHTML + '<div class="card-actions">' + acciones + historialNotasHTML + adminBotones + '</div></div>';
}

let unsubscribe = null;

function cargarSolicitudes() {
    if (unsubscribe) unsubscribe();
    const q = query(collection(db, 'solicitudes'), orderBy('timestamps.creado', 'desc'));
    unsubscribe = onSnapshot(q, (snapshot) => {
        let html = '';
        let counts = { pendiente: 0, en_camino: 0, rechazado: 0, finalizado: 0 };
        let nuevasSolicitudes = 0;
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.estado === 'pendiente' && !solicitudesAnteriores.has(docSnap.id)) {
                nuevasSolicitudes++;
            }
            if (estadoFiltro !== 'todos' && data.estado !== estadoFiltro) return;
            if (fechaFiltro && data.timestamps?.creado) {
                const fechaDoc = data.timestamps.creado.toDate().toISOString().split('T')[0];
                if (fechaDoc !== fechaFiltro) return;
            }
            if (counts[data.estado] !== undefined) counts[data.estado]++;
            html += crearCardSolicitud({ id: docSnap.id, data });
            solicitudesAnteriores.add(docSnap.id);
        });
        if (nuevasSolicitudes > 0) {
            hablar('Ha llegado una nueva solicitud');
        }
        const countPendiente = document.getElementById('countPendiente');
        const countEnCamino = document.getElementById('countEnCamino');
        const countRechazado = document.getElementById('countRechazado');
        const countFinalizado = document.getElementById('countFinalizado');
        if (countPendiente) countPendiente.textContent = counts.pendiente;
        if (countEnCamino) countEnCamino.textContent = counts.en_camino;
        if (countRechazado) countRechazado.textContent = counts.rechazado;
        if (countFinalizado) countFinalizado.textContent = counts.finalizado;
        if (listaCards) listaCards.innerHTML = html || '<p class="empty">No hay solicitudes</p>';
    }, (error) => {
        console.error('Error:', error);
        if (listaCards) listaCards.innerHTML = '<p class="empty">❌ Error: ' + error.message + '</p>';
    });
}

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
    cargarSolicitudes();
}

// ==================== PAGINA: ADMIN ====================

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
            alert('✅ Tecnologo creado correctamente');
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
                html += '<div class="tecnologo-item"><span><strong>' + t.nombre + '</strong> (DNI: ' + t.dni + ')</span><button onclick="eliminarTecnologo(\'' + docSnap.id + '\')" class="btn-eliminar">🗑️</button></div>';
            });
            const lista = document.getElementById('listaTecnologos');
            if (lista) lista.innerHTML = html || '<p class="empty">No hay tecnologos registrados</p>';
        });
    }
    window.eliminarTecnologo = async function(id) {
        if (confirm('¿Eliminar este tecnologo?')) {
            await deleteDoc(doc(db, 'tecnologos', id));
        }
    };
    cargarTecnologos();
    function cargarTecnologosSelect() {
        const select = document.getElementById('tecnologoFiltro');
        if (!select) return;
        const q = query(collection(db, 'tecnologos'), orderBy('nombre'));
        onSnapshot(q, (snapshot) => {
            select.innerHTML = '<option value="">Seleccionar...</option>';
            snapshot.forEach((docSnap) => {
                const t = docSnap.data();
                const option = document.createElement('option');
                option.value = t.nombre;
                option.textContent = t.nombre + ' (DNI: ' + t.dni + ')';
                select.appendChild(option);
            });
        });
    }
    cargarTecnologosSelect();
}

// ==================== ADMIN: GESTION DE SOLICITUDES ====================

window.cargarSolicitudesAdmin = function() {
    const filtro = document.getElementById('filtroEstadoAdmin').value;
    const contenedor = document.getElementById('listaSolicitudesAdmin');
    if (!contenedor) return;
    let q;
    if (filtro === 'todos') {
        q = query(collection(db, 'solicitudes'), orderBy('timestamps.creado', 'desc'));
    } else {
        q = query(collection(db, 'solicitudes'), where('estado', '==', filtro), orderBy('timestamps.creado', 'desc'));
    }
    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            contenedor.innerHTML = '<p class="empty">No hay solicitudes</p>';
            return;
        }
        let html = '';
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            const estadosLabels = {
                'pendiente': '⏳ Pendiente',
                'en_camino': '🚶 En camino',
                'rechazado': '❌ No atendido',
                'finalizado': '✅ Atendido'
            };
            const fecha = data.timestamps?.creado?.toDate()?.toLocaleString('es-PE', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
            }) || '-';
            html += '<div class="solicitud-card-v2" style="border-left: 4px solid #1a5276;">';
            html += '<div class="card-header">';
            html += '<div class="card-titulo">';
            html += '<strong>' + (data.nombrePaciente || '-') + '</strong>';
            html += '<span class="dni">DNI: ' + (data.dniPaciente || '-') + '</span>';
            if (data.servicio) {
                html += '<span class="servicio-badge">🏥 ' + data.servicio + '</span>';
            }
            html += '</div>';
            html += '<span class="estado-badge ' + data.estado + '">' + estadosLabels[data.estado] + '</span>';
            html += '</div>';
            html += '<div class="card-info">';
            html += '<div class="info-row"><span>🕐 ' + fecha + '</span></div>';
            html += '<div class="info-row"><span>🙋 ' + data.solicitadoPor + '</span><span>🔬 ' + (data.tecnologoAsignado || 'Sin asignar') + '</span></div>';
            if (data.motivoRechazo) {
                html += '<div class="info-row" style="color: #d32f2f;"><strong>❌ Motivo:</strong> ' + data.motivoRechazo + '</div>';
            }
            html += '</div>';
            if (data.archivoSolicitud) {
                const esPDF = data.esPDF ? '📄 PDF' : '📷 Foto';
                html += '<div class="card-foto"><a href="' + data.archivoSolicitud + '" target="_blank">' + esPDF + ' - Ver solicitud</a></div>';
            }
            html += '<div class="admin-actions">';
            html += '<button onclick="revertirEstadoAdmin(\'' + id + '\')" class="btn-action" style="background: #e3f2fd; color: #1976d2;">↩️ REVERTIR A PENDIENTE</button>';
            html += '<button onclick="eliminarSolicitud(\'' + id + '\')" class="btn-action" style="background: #ffebee; color: #d32f2f;">🗑️ ELIMINAR</button>';
            html += '</div>';
            html += '</div>';
        });
        contenedor.innerHTML = html;
    });
};

if (document.getElementById('listaSolicitudesAdmin')) {
    cargarSolicitudesAdmin();
}
