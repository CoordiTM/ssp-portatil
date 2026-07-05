// ==================== CONFIGURACION ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, 
    doc, updateDoc, query, orderBy, serverTimestamp, Timestamp, where, getDocs, deleteDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// jsPDF y autoTable se cargan via script tags en HTML (UMD)

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

// ==================== NOTIFICACIONES PUSH SIMPLIFICADAS ====================

let notificacionPermiso = false;

// Solicitar permiso de notificaciones
async function solicitarPermisoNotificaciones() {
    if (!('Notification' in window)) {
        console.log('Este navegador no soporta notificaciones');
        return false;
    }

    console.log('Estado actual de permiso:', Notification.permission);

    if (Notification.permission === 'granted') {
        notificacionPermiso = true;
        return true;
    }

    if (Notification.permission === 'denied') {
        alert('Las notificaciones estan bloqueadas. Por favor, habilita las notificaciones en la configuracion del navegador (icono de candado junto a la URL).');
        return false;
    }

    const permission = await Notification.requestPermission();
    console.log('Nuevo permiso:', permission);

    if (permission === 'granted') {
        notificacionPermiso = true;
        return true;
    }

    return false;
}

// Mostrar notificacion con las 4 alertas
function mostrarNotificacionCompleta(titulo, body, servicio, paciente) {
    console.log('Mostrando notificacion completa...');

    // 1. POPUP - Notificacion nativa del navegador
    if (notificacionPermiso && Notification.permission === 'granted') {
        try {
            const notif = new Notification(titulo, {
                body: body,
                icon: 'https://cdn-icons-png.flaticon.com/512/2964/2964514.png',
                tag: 'nueva-solicitud-' + Date.now(),
                requireInteraction: true
            });

            notif.onclick = function() {
                window.focus();
                notif.close();
            };

            console.log('Popup mostrado');
        } catch (e) {
            console.error('Error mostrando popup:', e);
        }
    } else {
        console.log('No hay permiso para popup');
    }

    // 2. SONIDO - Beep fuerte con AudioContext
    reproducirSonidoAlerta();

    // 3. VIBRACION - Patron de vibracion
    if ('vibrate' in navigator) {
        try {
            navigator.vibrate([500, 200, 500, 200, 1000]);
            console.log('Vibracion activada');
        } catch (e) {
            console.error('Error vibracion:', e);
        }
    } else {
        console.log('Vibrate no soportado');
    }

    // 4. VOZ - Mensaje hablado
    hablar('Nueva solicitud de radiografia portatil. Servicio: ' + (servicio || 'Sin servicio'));
}

// Sonido de alerta usando AudioContext
function reproducirSonidoAlerta() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 800;
        oscillator.type = 'square';
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);

        setTimeout(() => {
            const osc2 = audioContext.createOscillator();
            const gain2 = audioContext.createGain();
            osc2.connect(gain2);
            gain2.connect(audioContext.destination);
            osc2.frequency.value = 1000;
            osc2.type = 'square';
            gain2.gain.setValueAtTime(0.5, audioContext.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            osc2.start(audioContext.currentTime);
            osc2.stop(audioContext.currentTime + 0.3);
        }, 400);

        setTimeout(() => {
            const osc3 = audioContext.createOscillator();
            const gain3 = audioContext.createGain();
            osc3.connect(gain3);
            gain3.connect(audioContext.destination);
            osc3.frequency.value = 1200;
            osc3.type = 'square';
            gain3.gain.setValueAtTime(0.5, audioContext.currentTime);
            gain3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            osc3.start(audioContext.currentTime);
            osc3.stop(audioContext.currentTime + 0.5);
        }, 800);

        console.log('Sonido reproducido');
    } catch (error) {
        console.error('Error reproduciendo sonido:', error);
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
    const resourceType = file.type === 'application/pdf' ? 'raw' : 'image';
    const response = await fetch(
        'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/' + resourceType + '/upload',
        { method: 'POST', body: formData }
    );
    const data = await response.json();
    return data.secure_url;
}

// ==================== UTILIDADES ====================

function formatearTiempoHHMMSS(totalSegundos) {
    if (!totalSegundos || totalSegundos < 0) return '00:00:00';
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = Math.floor(totalSegundos % 60);
    return String(horas).padStart(2, '0') + ':' + String(minutos).padStart(2, '0') + ':' + String(segundos).padStart(2, '0');
}

function formatearMinutosAHHMMSS(minutosDecimales) {
    if (!minutosDecimales || minutosDecimales < 0) return '00:00:00';
    const totalSegundos = Math.round(minutosDecimales * 60);
    return formatearTiempoHHMMSS(totalSegundos);
}

function limpiarNombreTecnologo(nombre) {
    if (!nombre) return nombre;
    const prefijos = ['Lic. ', 'Lic ', 'Dr. ', 'Dr ', 'Dra. ', 'Dra ', 'Ing. ', 'Ing '];
    let limpio = nombre;
    for (const prefijo of prefijos) {
        if (limpio.startsWith(prefijo)) {
            limpio = limpio.substring(prefijo.length);
        }
    }
    return limpio.trim();
}

window.abrirKanteron = function(dni) {
    if (!dni) {
        alert('No hay DNI disponible');
        return;
    }
    navigator.clipboard.writeText(dni).then(() => {
        console.log('DNI copiado:', dni);
    }).catch(err => {
        console.error('Error copiando DNI:', err);
    });
    window.open('http://172.22.55.100:8080/kWebViewer/main.jsp?lang=es', '_blank');
};

function tiempoTranscurrido(timestamp, horaProgramada, estado, timestampFinalizado, timestampRechazado, esProgramado) {
    const puntoInicio = (esProgramado && horaProgramada) ? horaProgramada : timestamp;

    if (estado === 'finalizado') {
        if (timestampFinalizado) {
            const inicio = puntoInicio.toDate ? puntoInicio.toDate() : new Date(puntoInicio);
            const fin = timestampFinalizado.toDate ? timestampFinalizado.toDate() : new Date(timestampFinalizado);
            const diff = Math.floor((fin - inicio) / 1000);
            if (diff < 60) return '✅ ' + diff + 's total';
            if (diff < 3600) return '✅ ' + Math.floor(diff/60) + 'm total';
            return '✅ ' + Math.floor(diff/3600) + 'h ' + Math.floor((diff%3600)/60) + 'm total';
        }
        return '✅ Completado';
    }
    if (estado === 'rechazado') {
        if (timestampRechazado) {
            const inicio = puntoInicio.toDate ? puntoInicio.toDate() : new Date(puntoInicio);
            const fin = timestampRechazado.toDate ? timestampRechazado.toDate() : new Date(timestampRechazado);
            const diff = Math.floor((fin - inicio) / 1000);
            if (diff < 60) return '❌ ' + diff + 's total';
            if (diff < 3600) return '❌ ' + Math.floor(diff/60) + 'm total';
            return '❌ ' + Math.floor(diff/3600) + 'h ' + Math.floor((diff%3600)/60) + 'm total';
        }
        return '❌ No atendido';
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

// === NUEVO: filtrarEstado con 5 estados incluyendo programado_pendiente ===
window.filtrarEstado = function(estado) {
    estadoFiltro = estado;
    document.querySelectorAll('.btn-filtro').forEach(btn => {
        if (btn) btn.classList.remove('active');
    });
    const btnActivo = document.getElementById('btn-' + estado);
    if (btnActivo) btnActivo.classList.add('active');
    
    const titulos = {
        'todos': '📋 Todas',
        'pendiente': '🚨 Pendientes Urgentes',
        'programado_pendiente': '⏰ Programados Pendientes',
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

    snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const fechaCreado = d.timestamps?.creado?.toDate();

        if (fechaCreado && fechaCreado >= fechaDesde && fechaCreado <= fechaHasta) {
            if (tipoReporte === 'individual' && tecnologoFiltro && d.tecnologoAsignado !== tecnologoFiltro) return;
            total++;

            let puntoInicioTimestamp = d.timestamps?.creado;
            let esProgramada = d.esProgramado && d.horaProgramada;

            if (esProgramada) {
                puntoInicioTimestamp = d.horaProgramada;
            }

            let tiempoAtencion = '-';
            let tiempoTotal = '-';
            let infoPausas = '';

            if (puntoInicioTimestamp && d.timestamps.finalizado) {
                const tiempos = calcularTiempoEfectivo(d);
                tiempoAtencion = formatearTiempoHHMMSS(tiempos.efectivo);
                tiempoTotal = formatearTiempoHHMMSS(tiempos.total);

                if (tiempos.pausasTiempo > 0) {
                    infoPausas = ' (+' + formatearTiempoHHMMSS(tiempos.pausasTiempo) + ' espera)';
                }

                const diffMin = tiempos.efectivo / 60;
                tiemposAtencion.push(diffMin);
            }

            let fechaHoraDisplay = formatearFechaHora(d.timestamps?.creado);
            if (esProgramada) {
                fechaHoraDisplay = formatearFechaHora(d.horaProgramada) + ' (prog.)';
            }

            solicitudes.push({
                fechaHora: fechaHoraDisplay,
                fechaCreacion: formatearFechaHora(d.timestamps?.creado),
                dni: d.dniPaciente,
                paciente: d.nombrePaciente,
                servicio: d.servicio || '-',
                numeroCama: d.numeroCama || '-',
                solicitadoPor: d.solicitadoPor,
                estado: d.estado,
                tecnologo: limpiarNombreTecnologo(d.tecnologoAsignado) || 'Sin asignar',
                tiempoAtencion: tiempoAtencion,
                tiempoTotal: tiempoTotal,
                infoPausas: infoPausas,
                notas: d.notas || '',
                historialNotas: d.historialNotas || [],
                motivoRechazo: d.motivoRechazo || '',
                esProgramado: d.esProgramado || false
            });

            if (d.estado === 'finalizado') {
                atendidos++;
            } else if (d.estado === 'rechazado') {
                rechazados++;
            } else {
                pendientes++;
            }
        }
    });

    const tiempoPromedioSeg = tiemposAtencion.length > 0 
        ? (tiemposAtencion.reduce((a,b) => a+b, 0) / tiemposAtencion.length)
        : 0;
    const tiempoPromedio = formatearMinutosAHHMMSS(tiempoPromedioSeg);

    let tablaHTML = '<table class="tabla-reporte" id="tablaReporte"><thead><tr><th>Fecha/Hora Inicio</th><th>DNI</th><th>Paciente</th><th>Servicio</th><th>Cama</th><th>Solicita</th><th>Estado</th><th>Tecnologo Medico</th><th>Tiempo Efectivo</th><th>Notas</th></tr></thead><tbody>';
    solicitudes.forEach(s => {
        tablaHTML += '<tr><td>' + s.fechaHora + '</td><td>' + s.dni + '</td><td>' + s.paciente + '</td><td>' + s.servicio + '</td><td>' + s.numeroCama + '</td><td>' + s.solicitadoPor + '</td><td>' + s.estado + '</td><td>' + limpiarNombreTecnologo(s.tecnologo) + '</td><td>' + s.tiempoAtencion + (s.infoPausas || '') + '</td><td>' + s.notas + '</td></tr>';
    });
    tablaHTML += '</tbody></table>';

    contenedor.innerHTML = '<div class="card"><h3>📊 Reporte ' + (tipoReporte === 'individual' ? 'Individual' : 'General') + ' del ' + desde + ' al ' + hasta + '</h3><div class="stats-reporte"><div class="stat-box"><strong>Total:</strong> ' + total + '</div><div class="stat-box"><strong>Atendidas:</strong> ' + atendidos + '</div><div class="stat-box"><strong>No atendidas:</strong> ' + rechazados + '</div><div class="stat-box"><strong>Pendientes:</strong> ' + pendientes + '</div><div class="stat-box"><strong>Tiempo promedio:</strong> ' + tiempoPromedio + ' min</div></div>' +  '<h4>📋 Detalle:</h4>' + tablaHTML + '<button onclick="exportarExcel()" class="btn-primary" style="margin-top:15px;">📥 Exportar a Excel</button></div>';
    window.datosReporte = solicitudes;
};

window.exportarExcel = function() {
    if (!window.datosReporte || window.datosReporte.length === 0) {
        alert('No hay datos para exportar');
        return;
    }
    const wb = XLSX.utils.book_new();
    const data = window.datosReporte.map(s => ({
        'Fecha/Hora': s.fechaHora,
        'DNI': s.dni,
        'Paciente': s.paciente,
        'Servicio': s.servicio,
        'Cama': s.numeroCama,
        'Solicita': s.solicitadoPor,
        'Estado': s.estado,
        'Tecnologo Medico': s.tecnologo,
        'Tiempo Atencion': s.tiempoAtencion,
        'Notas': s.notas
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    XLSX.writeFile(wb, 'reporte_ssp_' + new Date().toISOString().split('T')[0] + '.xlsx');
};

window.exportarPDF = function() {
    if (!window.datosReporte || window.datosReporte.length === 0) {
        alert('No hay datos para exportar');
        return;
    }
    const pdf = new window.jspdf.jsPDF('l', 'mm', 'a4');
    const desde = document.getElementById('fechaDesde').value;
    const hasta = document.getElementById('fechaHasta').value;
    const tipoReporte = document.getElementById('tipoReporte')?.value || 'general';
    const tecnologoFiltro = document.getElementById('tecnologoFiltro')?.value || '';

    pdf.setFontSize(16);
    pdf.text('Reporte SSP Rx Portatil - HNASS', 14, 15);
    pdf.setFontSize(10);
    pdf.text('Periodo: ' + desde + ' al ' + hasta, 14, 22);
    if (tipoReporte === 'individual' && tecnologoFiltro) {
        pdf.text('Tecnologo Medico: ' + limpiarNombreTecnologo(tecnologoFiltro), 14, 27);
    }

    let atendidos = 0, rechazados = 0, pendientes = 0;
    window.datosReporte.forEach(s => {
        if (s.estado === 'finalizado') atendidos++;
        else if (s.estado === 'rechazado') rechazados++;
        else pendientes++;
    });

    pdf.setFontSize(9);
    pdf.text('Total: ' + window.datosReporte.length + ' | Atendidas: ' + atendidos + ' | No atendidas: ' + rechazados + ' | Pendientes: ' + pendientes, 14, 34);

    const headers = ['Fecha/Hora', 'DNI', 'Paciente', 'Servicio', 'Cama', 'Solicita', 'Estado', 'Tecnologo Medico', 'Tiempo'];
    const data = window.datosReporte.map(s => [
        s.fechaHora, s.dni, s.paciente, s.servicio, s.numeroCama, s.solicitadoPor, s.estado, s.tecnologo, s.tiempoAtencion
    ]);

    pdf.autoTable({
        head: [headers],
        body: data,
        startY: 40,
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [26, 82, 118], textColor: 255 },
        alternateRowStyles: { fillColor: [240, 240, 240] },
        margin: { left: 10, right: 10 }
    });

    pdf.save('reporte_ssp_' + desde + '_' + hasta + '.pdf');
};

window.exportarProduccionPDF = async function() {
    const desdeInput = document.getElementById('fechaDesdeProd').value;
    const hastaInput = document.getElementById('fechaHastaProd').value;

    if (!desdeInput || !hastaInput) {
        alert('Selecciona fecha Desde y Hasta');
        return;
    }

    const desdeParts = desdeInput.split('-');
    const hastaParts = hastaInput.split('-');
    const fechaDesde = new Date(parseInt(desdeParts[0]), parseInt(desdeParts[1]) - 1, parseInt(desdeParts[2]), 0, 0, 0);
    const fechaHasta = new Date(parseInt(hastaParts[0]), parseInt(hastaParts[1]) - 1, parseInt(hastaParts[2]), 23, 59, 59);

    const tecnologoNombre = localStorage.getItem('tecnologoNombre');
    if (!tecnologoNombre) {
        alert('No hay tecnologo medico logueado');
        return;
    }

    const q = query(collection(db, 'solicitudes'), where('tecnologoAsignado', '==', tecnologoNombre), orderBy('timestamps.creado', 'desc'));
    const snapshot = await getDocs(q);

    let produccion = [];
    snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const fechaCreado = d.timestamps?.creado?.toDate();
        if (fechaCreado && fechaCreado >= fechaDesde && fechaCreado <= fechaHasta && d.estado === 'finalizado') {
            let tiempoAtencion = '-';
            
            let puntoInicio = d.timestamps.creado;
            if (d.esProgramado && d.horaProgramada) {
                puntoInicio = d.horaProgramada;
            }
            
            if (puntoInicio && d.timestamps.finalizado) {
                const inicio = puntoInicio.toDate ? puntoInicio.toDate() : new Date(puntoInicio);
                const fin = d.timestamps.finalizado.toDate ? d.timestamps.finalizado.toDate() : new Date(d.timestamps.finalizado);
                const diffSeg = (fin - inicio) / 1000;
                tiempoAtencion = formatearTiempoHHMMSS(diffSeg);
            }
            
            produccion.push({
                fechaHora: formatearFechaHora(d.timestamps?.creado),
                dni: d.dniPaciente,
                paciente: d.nombrePaciente,
                servicio: d.servicio || '-',
                numeroCama: d.numeroCama || '-',
                numeroSolicitud: d.ocrData?.numeroSolicitud || '-',
                tiempoAtencion: tiempoAtencion,
                notas: d.notas || ''
            });
        }
    });

    if (produccion.length === 0) {
        alert('No hay atenciones atendidas en este rango de fechas');
        return;
    }

    const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
    pdf.setFontSize(16);
    pdf.text('Produccion del Tecnologo Medico - HNASS', 14, 15);
    pdf.setFontSize(11);
    pdf.text('Tecnologo Medico: ' + limpiarNombreTecnologo(tecnologoNombre), 14, 23);
    pdf.text('Periodo: ' + desdeInput + ' al ' + hastaInput, 14, 29);
    pdf.text('Total atenciones: ' + produccion.length, 14, 35);

    const headers = ['Fecha/Hora', 'DNI', 'Paciente', 'Servicio', 'Cama', 'N° Solicitud', 'Tiempo', 'Notas'];
    const data = produccion.map(p => [p.fechaHora, p.dni, p.paciente, p.servicio, p.numeroCama, p.numeroSolicitud, p.tiempoAtencion, p.notas]);

    pdf.autoTable({
        head: [headers],
        body: data,
        startY: 42,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [26, 82, 118], textColor: 255 },
        alternateRowStyles: { fillColor: [240, 240, 240] },
        margin: { left: 10, right: 10 }
    });

    pdf.save('produccion_' + tecnologoNombre.replace(/\s+/g, '_') + '_' + desdeInput + '_' + hastaInput + '.pdf');
};

// ==================== FUNCIONES GLOBALES: EDITAR TECNÓLOGO ====================

window.abrirModalEditarTecnologo = async function(id) {
    try {
        const docRef = doc(db, 'tecnologos', id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
            alert('Tecnólogo Médico no encontrado');
            return;
        }
        const data = docSnap.data();
        document.getElementById('editTecId').value = id;
        document.getElementById('editTecDNI').value = data.dni || '';
        document.getElementById('editTecNombre').value = data.nombre || '';
        document.getElementById('editTecClave').value = '';
        document.getElementById('modalEditarTecnologo').classList.add('active');
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
};

window.guardarEdicionTecnologo = async function() {
    const id = document.getElementById('editTecId').value;
    const dni = document.getElementById('editTecDNI').value.trim();
    const nombre = document.getElementById('editTecNombre').value.trim();
    const clave = document.getElementById('editTecClave').value;

    if (!dni || !nombre) {
        alert('DNI y nombre son obligatorios');
        return;
    }

    try {
        const updates = { dni: dni, nombre: nombre };
        if (clave && clave.trim() !== '') {
            updates.clave = clave;
        }
        await updateDoc(doc(db, 'tecnologos', id), updates);
        alert('✅ Tecnólogo Médico actualizado correctamente');
        cerrarModalEditar();
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
};

window.abrirModalEditarSolicitud = async function(id) {
    try {
        const docRef = doc(db, 'solicitudes', id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
            alert('Solicitud no encontrada');
            return;
        }
        const data = docSnap.data();
        document.getElementById('editSolId').value = id;
        document.getElementById('editSolDNI').value = data.dniPaciente || '';
        document.getElementById('editSolNombre').value = data.nombrePaciente || '';
        document.getElementById('editSolServicio').value = data.servicio || '';
        document.getElementById('editSolCama').value = data.numeroCama || '';
        document.getElementById('editSolSolicita').value = data.solicitadoPor || '';
        document.getElementById('editSolNotas').value = data.notas || '';
        document.getElementById('editSolEstado').value = data.estado || 'pendiente';
        document.getElementById('editSolTecnologo').value = data.tecnologoAsignado || '';

        // === NUEVO: Cargar campos de programación ===
        const esProgramadoCheckbox = document.getElementById('editSolEsProgramado');
        const horaProgramadaInput = document.getElementById('editSolHoraProgramada');
        const grupoHoraProgramada = document.getElementById('grupoEditSolHoraProgramada');
        
        if (esProgramadoCheckbox) {
            esProgramadoCheckbox.checked = data.esProgramado || false;
        }
        if (horaProgramadaInput && data.horaProgramada) {
            const d = data.horaProgramada.toDate ? data.horaProgramada.toDate() : new Date(data.horaProgramada);
            horaProgramadaInput.value = d.toISOString().slice(0, 16);
        } else if (horaProgramadaInput) {
            horaProgramadaInput.value = '';
        }
        if (grupoHoraProgramada) {
            grupoHoraProgramada.style.display = data.esProgramado ? 'block' : 'none';
        }

        const toLocalInput = (ts) => {
            if (!ts) return '';
            const d = ts.toDate ? ts.toDate() : new Date(ts);
            return d.toISOString().slice(0, 16);
        };
        document.getElementById('editSolCreado').value = toLocalInput(data.timestamps?.creado);
        document.getElementById('editSolEnCamino').value = toLocalInput(data.timestamps?.enCamino);
        document.getElementById('editSolFinalizado').value = toLocalInput(data.timestamps?.finalizado);
        document.getElementById('editSolRechazado').value = toLocalInput(data.timestamps?.rechazado);

        document.getElementById('modalEditarSolicitud').classList.add('active');
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
};

window.guardarEdicionSolicitud = async function() {
    const id = document.getElementById('editSolId').value;
    const creado = document.getElementById('editSolCreado').value;
    const enCamino = document.getElementById('editSolEnCamino').value;
    const finalizado = document.getElementById('editSolFinalizado').value;
    const rechazado = document.getElementById('editSolRechazado').value;
    
    // === NUEVO: Leer campos de programación ===
    const esProgramado = document.getElementById('editSolEsProgramado')?.checked || false;
    const horaProgramadaInput = document.getElementById('editSolHoraProgramada')?.value;

    const toTimestamp = (val) => val ? Timestamp.fromDate(new Date(val)) : null;

    const updates = {
        dniPaciente: document.getElementById('editSolDNI').value.trim(),
        nombrePaciente: document.getElementById('editSolNombre').value.trim(),
        servicio: document.getElementById('editSolServicio').value.trim(),
        numeroCama: document.getElementById('editSolCama').value.trim(),
        solicitadoPor: document.getElementById('editSolSolicita').value.trim(),
        notas: document.getElementById('editSolNotas').value.trim(),
        estado: document.getElementById('editSolEstado').value,
        tecnologoAsignado: document.getElementById('editSolTecnologo').value.trim() || null,
        // === NUEVO: Campos de programación ===
        esProgramado: esProgramado,
        horaProgramada: esProgramado && horaProgramadaInput ? toTimestamp(horaProgramadaInput) : null,
        'timestamps.creado': toTimestamp(creado),
        'timestamps.enCamino': toTimestamp(enCamino),
        'timestamps.finalizado': toTimestamp(finalizado),
        'timestamps.rechazado': toTimestamp(rechazado)
    };

    if (updates.estado === 'finalizado' && !updates.tecnologoAsignado) {
        if (!confirm('Estado es FINALIZADO pero no hay tecnólogo asignado. ¿Continuar?')) return;
    }

    try {
        await updateDoc(doc(db, 'solicitudes', id), updates);
        alert('✅ Solicitud actualizada correctamente');
        cerrarModalEditarSolicitud();
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
};

window.cerrarModalEditarSolicitud = function() {
    document.getElementById('modalEditarSolicitud').classList.remove('active');
};

// ==================== PAUSA DE ATENCIÓN ====================

window.mostrarPausaAtencion = async function(id) {
    const horaRegreso = prompt('⏸️ PACIENTE NO DISPONIBLE\n\nIngrese hora de regreso (HH:MM):\nEjemplo: 14:30');
    if (!horaRegreso || !horaRegreso.match(/^\d{2}:\d{2}$/)) {
        alert('❌ Formato inválido. Use HH:MM (ej: 14:30)');
        return;
    }

    const notas = prompt('Motivo de la pausa (opcional):\nEj: Paciente en diálisis, en procedimiento, etc.');

    try {
        const docRef = doc(db, 'solicitudes', id);
        const docSnap = await getDoc(docRef);
        const data = docSnap.data();

        const ahora = new Date();
        const [horas, minutos] = horaRegreso.split(':');
        const hoy = new Date();
        let reinicioProgramado = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), parseInt(horas), parseInt(minutos));

        if (reinicioProgramado < ahora) {
            reinicioProgramado.setDate(reinicioProgramado.getDate() + 1);
        }

        const nuevaPausa = {
            inicio: Timestamp.fromDate(ahora),
            reinicioProgramado: Timestamp.fromDate(reinicioProgramado),
            motivo: notas || 'Paciente no disponible',
            tecnologo: localStorage.getItem('tecnologoNombre') || 'Tecnologo',
            estado: 'pausada'
        };

        const pausasActuales = data.pausas || [];
        pausasActuales.push(nuevaPausa);

        await updateDoc(docRef, {
            pausas: pausasActuales,
            estadoPausa: 'pausada'
        });

        alert('⏸️ Atención pausada. Regreso programado: ' + horaRegreso);

    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
};

window.reiniciarAtencion = async function(id) {
    try {
        const docRef = doc(db, 'solicitudes', id);
        const docSnap = await getDoc(docRef);
        const data = docSnap.data();

        if (!data.pausas || data.pausas.length === 0) {
            alert('No hay pausas registradas');
            return;
        }

        const ultimaPausa = data.pausas[data.pausas.length - 1];
        if (ultimaPausa.estado !== 'pausada') {
            alert('La última pausa ya fue reiniciada o completada');
            return;
        }

        const ahora = new Date();
        ultimaPausa.reinicioReal = Timestamp.fromDate(ahora);
        ultimaPausa.estado = 'reiniciada';

        const pausasActualizadas = [...data.pausas];
        pausasActualizadas[pausasActualizadas.length - 1] = ultimaPausa;

        await updateDoc(docRef, {
            pausas: pausasActualizadas,
            estadoPausa: 'reiniciada'
        });

        alert('▶️ Atención reiniciada. Tiempo de espera no contará para el total.');

    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
};

function calcularTiempoEfectivo(data) {
    let puntoInicio = data.timestamps?.creado;
    if (data.esProgramado && data.horaProgramada) {
        puntoInicio = data.horaProgramada;
    }
    
    if (!puntoInicio) return { efectivo: 0, total: 0, pausasTiempo: 0 };

    const inicio = puntoInicio.toDate ? puntoInicio.toDate() : new Date(puntoInicio);
    const finalizado = data.timestamps.finalizado?.toDate ? data.timestamps.finalizado.toDate() : null;

    if (!finalizado) return { efectivo: 0, total: 0, pausasTiempo: 0 };

    const tiempoTotal = (finalizado - inicio) / 1000;

    if (!data.pausas || data.pausas.length === 0) {
        return { efectivo: tiempoTotal, total: tiempoTotal, pausasTiempo: 0 };
    }

    let tiempoPausas = 0;

    data.pausas.forEach(pausa => {
        if (pausa.reinicioReal) {
            const inicioPausa = pausa.inicio.toDate ? pausa.inicio.toDate() : new Date(pausa.inicio);
            const finPausa = pausa.reinicioReal.toDate ? pausa.reinicioReal.toDate() : new Date(pausa.reinicioReal);
            tiempoPausas += (finPausa - inicioPausa) / 1000;
        } else if (pausa.reinicioProgramado && !pausa.reinicioReal) {
            const inicioPausa = pausa.inicio.toDate ? pausa.inicio.toDate() : new Date(pausa.inicio);
            const finPausa = pausa.reinicioProgramado.toDate ? pausa.reinicioProgramado.toDate() : new Date(pausa.reinicioProgramado);
            tiempoPausas += (finPausa - inicioPausa) / 1000;
        }
    });

    const tiempoEfectivo = tiempoTotal - tiempoPausas;

    return {
        efectivo: Math.max(0, tiempoEfectivo),
        total: tiempoTotal,
        pausasTiempo: tiempoPausas
    };
}

window.toggleAcordeon = function(id) {
    const el = document.getElementById(id);
    const icon = document.getElementById(id.replace('Acordeon', 'Icon'));
    if (el) {
        el.classList.toggle('collapsed');
        if (icon) {
            icon.textContent = el.classList.contains('collapsed') ? '▶' : '▼';
        }
    }
};

// ==================== FUNCIONES GLOBALES: GESTIÓN DE SERVICIOS ====================

window.cargarServiciosSelect = async function(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    try {
        const q = query(collection(db, 'servicios'), orderBy('nombre'));
        const snapshot = await getDocs(q);
        select.innerHTML = '<option value="">Seleccionar servicio...</option>';
        snapshot.forEach((docSnap) => {
            const s = docSnap.data();
            const option = document.createElement('option');
            option.value = s.nombre;
            option.textContent = s.nombre;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error cargando servicios:', error);
    }
};

window.abrirModalEditarServicio = async function(id) {
    try {
        const docRef = doc(db, 'servicios', id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
            alert('Servicio no encontrado');
            return;
        }
        const data = docSnap.data();
        document.getElementById('editServId').value = id;
        document.getElementById('editServNombre').value = data.nombre || '';
        document.getElementById('modalEditarServicio').classList.add('active');
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
};

window.guardarEdicionServicio = async function() {
    const id = document.getElementById('editServId').value;
    const nombre = document.getElementById('editServNombre').value.trim();

    if (!nombre) {
        alert('El nombre del servicio es obligatorio');
        return;
    }

    try {
        await updateDoc(doc(db, 'servicios', id), { nombre: nombre });
        alert('✅ Servicio actualizado correctamente');
        cerrarModalEditarServicio();
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
};

window.cerrarModalEditarServicio = function() {
    document.getElementById('modalEditarServicio').classList.remove('active');
};

window.eliminarServicio = async function(id) {
    if (confirm('¿Eliminar este servicio?')) {
        try {
            await deleteDoc(doc(db, 'servicios', id));
            alert('✅ Servicio eliminado');
        } catch (error) {
            alert('❌ Error: ' + error.message);
        }
    }
};

// ==================== PAGINA: REGISTRAR (CON OCR) ====================

const formSolicitud = document.getElementById('formSolicitud');
if (formSolicitud) {
    formSolicitud.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = formSolicitud.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = '⏳ Registrando...';

        try {
            const file = document.getElementById('archivoSolicitud').files[0];
            if (!file) {
                alert('❌ Debe seleccionar el PDF de la solicitud');
                btn.disabled = false;
                btn.textContent = '➕ Registrar Solicitud';
                return;
            }

            const esPDF = file.type === 'application/pdf';
            if (!esPDF) {
                alert('❌ Solo se permiten archivos PDF');
                btn.disabled = false;
                btn.textContent = '➕ Registrar Solicitud';
                return;
            }

            const archivoUrl = await subirArchivoCloudinary(file);

            const dni = document.getElementById('dniPaciente').value.trim();
            if (!dni || dni.length !== 8) {
                alert('❌ El DNI debe tener 8 dígitos');
                btn.disabled = false;
                btn.textContent = '➕ Registrar Solicitud';
                return;
            }

            const nombrePaciente = document.getElementById('nombrePaciente').value.trim();
            if (!nombrePaciente) {
                alert('❌ El nombre del paciente es obligatorio');
                btn.disabled = false;
                btn.textContent = '➕ Registrar Solicitud';
                return;
            }

            const servicio = document.getElementById('servicio').value;
            if (!servicio) {
                alert('❌ Debe seleccionar un servicio');
                btn.disabled = false;
                btn.textContent = '➕ Registrar Solicitud';
                return;
            }

            const esProgramado = document.getElementById('esProgramado').value === 'si';
            const horaProgramadaInput = document.getElementById('horaProgramada').value;
            let horaProgramadaTimestamp = null;
            if (esProgramado && horaProgramadaInput) {
                const fechaProgramada = new Date(horaProgramadaInput);
                horaProgramadaTimestamp = Timestamp.fromDate(fechaProgramada);
            }

            // Datos extraídos por OCR (4 campos - sin examen)
            const numeroSolicitud = document.getElementById('numeroSolicitud').value.trim() || null;
            const numeroHistoria = document.getElementById('numeroHistoria').value.trim() || null;

            await addDoc(collection(db, 'solicitudes'), {
                dniPaciente: dni,
                nombrePaciente: nombrePaciente,
                servicio: servicio,
                numeroCama: document.getElementById('numeroCama').value.trim() || '',
                solicitadoPor: document.getElementById('solicitadoPor').value.trim() || '',
                archivoSolicitud: archivoUrl,
                esPDF: true,
                estado: 'pendiente',
                esProgramado: esProgramado,
                horaProgramada: horaProgramadaTimestamp,
                // Datos OCR extraídos (4 campos - sin examen)
                ocrData: {
                    numeroSolicitud: numeroSolicitud,
                    numeroHistoria: numeroHistoria,
                    extraidoAutomaticamente: true,
                    fechaExtraccion: new Date().toISOString()
                },
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

            // Resetear estado OCR
            document.getElementById('uploadPlaceholder').style.display = 'block';
            document.getElementById('uploadPreview').style.display = 'none';
            document.getElementById('ocrResultado').style.display = 'none';
            document.getElementById('ocrProgress').style.display = 'none';
            document.getElementById('archivoSolicitud').value = '';
            document.getElementById('numeroSolicitud').value = '';
            document.getElementById('numeroHistoria').value = '';
            document.getElementById('dniPaciente').value = '';
            document.getElementById('nombrePaciente').value = '';
            document.getElementById('numeroSolicitud').disabled = true;
            document.getElementById('numeroHistoria').disabled = true;
            document.getElementById('dniPaciente').disabled = true;
            document.getElementById('nombrePaciente').disabled = true;
            document.getElementById('btnRegistrar').disabled = true;
            document.getElementById('hintSolicitud').textContent = 'Esperando PDF...';
            document.getElementById('hintSolicitud').className = 'field-hint';
            document.getElementById('hintHistoria').textContent = 'Esperando PDF...';
            document.getElementById('hintHistoria').className = 'field-hint';
            document.getElementById('hintDNI').textContent = 'Esperando PDF...';
            document.getElementById('hintDNI').className = 'field-hint';
            document.getElementById('hintNombre').textContent = 'Esperando PDF...';
            document.getElementById('hintNombre').className = 'field-hint';

            hablar('Tu solicitud ha sido registrada con exito');
            alert('✅ Solicitud registrada correctamente. DNI: ' + dni);

        } catch (error) {
            console.error(error);
            alert('❌ Error: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = '➕ Registrar Solicitud';
        }
    });
}

// ==================== PAGINA: CONSULTA (CON FILTROS) ====================

const formConsulta = document.getElementById('formConsulta');
const resultadoConsulta = document.getElementById('resultadoConsulta');
const resultadosSection = document.getElementById('resultadosSection');
const contadorResultados = document.getElementById('contadorResultados');
const btnLimpiar = document.getElementById('btnLimpiar');
const filtroServicio = document.getElementById('filtroServicio');

// Cargar servicios en el filtro
if (filtroServicio) {
    cargarServiciosSelect('filtroServicio');
}

// Función para aplicar filtros
async function buscarSolicitudes() {
    if (!resultadoConsulta) return;

    const dniFiltro = document.getElementById('filtroDNI').value.trim();
    const nombreFiltro = document.getElementById('filtroNombre').value.trim().toUpperCase();
    const servicioFiltro = document.getElementById('filtroServicio').value;
    const fechaDesde = document.getElementById('filtroFechaDesde').value;
    const fechaHasta = document.getElementById('filtroFechaHasta').value;

    resultadoConsulta.innerHTML = '<p style="text-align:center;padding:20px;">⏳ Buscando...</p>';
    resultadosSection.style.display = 'block';

    try {
        // Query base ordenada por fecha
        let q = query(collection(db, 'solicitudes'), orderBy('timestamps.creado', 'desc'));

        const snapshot = await getDocs(q);
        let solicitudes = [];

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;

            // Filtro por DNI (exacto)
            if (dniFiltro && data.dniPaciente !== dniFiltro) return;

            // Filtro por Nombre (búsqueda parcial, case-insensitive)
            if (nombreFiltro) {
                const nombreUpper = (data.nombrePaciente || '').toUpperCase();
                if (!nombreUpper.includes(nombreFiltro)) return;
            }

            // Filtro por Servicio
            if (servicioFiltro && data.servicio !== servicioFiltro) return;

            // Filtro por Fecha Desde
            if (fechaDesde && data.timestamps?.creado) {
                const fechaCreado = data.timestamps.creado.toDate();
                const fechaDesdeObj = new Date(fechaDesde + 'T00:00:00');
                if (fechaCreado < fechaDesdeObj) return;
            }

            // Filtro por Fecha Hasta
            if (fechaHasta && data.timestamps?.creado) {
                const fechaCreado = data.timestamps.creado.toDate();
                const fechaHastaObj = new Date(fechaHasta + 'T23:59:59');
                if (fechaCreado > fechaHastaObj) return;
            }

            solicitudes.push({ id, data });
        });

        // Actualizar contador
        contadorResultados.textContent = solicitudes.length + ' encontrado' + (solicitudes.length !== 1 ? 's' : '');

        // Renderizar resultados
        if (solicitudes.length === 0) {
            resultadoConsulta.innerHTML = '<div class="consulta-empty"><div class="consulta-empty-icon">😕</div><p>No se encontraron solicitudes con esos filtros</p></div>';
            return;
        }

        let html = '';
        solicitudes.forEach((sol) => {
            const data = sol.data;
            const id = sol.id;

            const estadosLabels = {
                'pendiente': '⏳ Pendiente',
                'en_camino': '🚶 En camino',
                'rechazado': '❌ No atendido',
                'finalizado': '✅ Atendido'
            };

            const estadoClass = 'estado-' + data.estado;

            let infoProgramado = '';
            if (data.esProgramado && data.horaProgramada) {
                infoProgramado = '<span>⏰ ' + formatearFechaHora(data.horaProgramada) + ' (prog.)</span>';
            }

            let ocrInfo = '';
            if (data.ocrData?.numeroSolicitud) {
                ocrInfo = '<span class="ocr-badge-mini">📋 Sol: ' + data.ocrData.numeroSolicitud + '</span>';
            }
            if (data.ocrData?.numeroHistoria) {
                ocrInfo += '<span class="ocr-badge-mini">📁 HC: ' + data.ocrData.numeroHistoria + '</span>';
            }

            let tiempoInfo = '';
            if (data.estado === 'finalizado' && data.timestamps?.creado && data.timestamps?.finalizado) {
                const tiempos = calcularTiempoEfectivo(data);
                tiempoInfo = '<div class="consulta-card-tiempos">⏱️ Tiempo: ' + formatearTiempoHHMMSS(tiempos.efectivo) + '</div>';
            } else if (data.estado !== 'finalizado' && data.estado !== 'rechazado') {
                tiempoInfo = '<div class="consulta-card-tiempos">⏱️ ' + tiempoTranscurrido(data.timestamps?.creado, data.horaProgramada, data.estado, data.timestamps?.finalizado, data.timestamps?.rechazado, data.esProgramado) + '</div>';
            }

            let kanteronBtn = '';
            if (data.estado === 'finalizado' && data.dniPaciente) {
                kanteronBtn = '<button onclick="abrirKanteron(\'' + data.dniPaciente + '\')" class="kanteron-btn">🔍 Kanteron PACS</button>';
            }

            html += '<div class="consulta-card">';
            html += '<div class="consulta-card-header">';
            html += '<div><div class="consulta-card-titulo">' + (data.nombrePaciente || '-') + ocrInfo + '</div>';
            html += '<div class="consulta-card-dni">DNI: ' + (data.dniPaciente || '-') + '</div></div>';
            html += '<span class="consulta-card-estado ' + estadoClass + '">' + estadosLabels[data.estado] + '</span>';
            html += '</div>';
            html += '<div class="consulta-card-info">';
            html += '<span>🏥 ' + (data.servicio || '-') + '</span>';
            html += '<span>🛏️ ' + (data.numeroCama || '-') + '</span>';
            html += '<span>🙋 ' + (data.solicitadoPor || '-') + '</span>';
            html += '<span>🔬 ' + (data.tecnologoAsignado || 'Sin asignar') + '</span>';
            html += '<span>🕐 ' + formatearFechaHora(data.timestamps?.creado) + '</span>';
            if (infoProgramado) html += infoProgramado;
            html += '</div>';
            html += tiempoInfo;
            if (kanteronBtn) html += kanteronBtn;
            html += '</div>';
        });

        resultadoConsulta.innerHTML = html;

    } catch (error) {
        console.error('Error en búsqueda:', error);
        resultadoConsulta.innerHTML = '<div class="consulta-empty"><div class="consulta-empty-icon">❌</div><p>Error: ' + error.message + '</p></div>';
    }
}

// Eventos
if (formConsulta) {
    formConsulta.addEventListener('submit', (e) => {
        e.preventDefault();
        buscarSolicitudes();
    });
}

if (btnLimpiar) {
    btnLimpiar.addEventListener('click', () => {
        document.getElementById('filtroDNI').value = '';
        document.getElementById('filtroNombre').value = '';
        document.getElementById('filtroServicio').value = '';
        document.getElementById('filtroFechaDesde').value = '';
        document.getElementById('filtroFechaHasta').value = '';
        resultadoConsulta.innerHTML = '';
        resultadosSection.style.display = 'none';
        contadorResultados.textContent = '0 encontrados';
    });
}

// Búsqueda automática si hay DNI en URL (compatibilidad)
const urlParams = new URLSearchParams(window.location.search);
const dniFromUrl = urlParams.get('dni');
if (dniFromUrl) {
    const filtroDNI = document.getElementById('filtroDNI');
    if (filtroDNI) {
        filtroDNI.value = dniFromUrl;
        buscarSolicitudes();
    }
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
let estadoFiltro = 'pendiente';
let fechaFiltro = '';
let solicitudesAnteriores = new Set();

// === NUEVO: crearCardSolicitud con clasificación Programado Pendiente ===
function crearCardSolicitud(sol) {
    const id = sol.id;
    const data = sol.data;
    const fechaHora = formatearFechaHora(data.timestamps?.creado);
    const tiempo = tiempoTranscurrido(data.timestamps?.creado, data.horaProgramada, data.estado, data.timestamps?.finalizado, data.timestamps?.rechazado, data.esProgramado);
    const alerta = colorAlerta(data);
    let acciones = '';
    let estadoBadge = '';
    let indicadorProgramado = '';
    
    // === NUEVO: Determinar si es programado pendiente (futuro > 2h) ===
    const ahora = new Date();
    let esProgramadoPendiente = false;
    if (data.estado === 'pendiente' && data.esProgramado && data.horaProgramada) {
        const horaProg = data.horaProgramada.toDate ? data.horaProgramada.toDate() : new Date(data.horaProgramada);
        const dosHoras = 2 * 60 * 60 * 1000;
        esProgramadoPendiente = horaProg > new Date(ahora.getTime() + dosHoras);
    }
    
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
        if (esProgramadoPendiente) {
            // === NUEVO: Programado Pendiente (no urgente, futuro > 2h) ===
            estadoBadge = '<span class="estado-badge programado-pendiente">⏰ PROGRAMADO</span>';
            acciones = '<button onclick="cambiarEstado(\'' + id + '\', \'en_camino\')" class="btn-action camino">🚶 ATENDER AHORA</button><button onclick="mostrarNotasContingencia(\'' + id + '\')" class="btn-action notas">📝 NOTAS</button><button onclick="mostrarRechazo(\'' + id + '\')" class="btn-action rechazar">❌ NO ATENDER</button>';
        } else {
            // Pendiente Urgente (normal o programado próximo)
            estadoBadge = '<span class="estado-badge pendiente">⏳ PENDIENTE</span>';
            acciones = '<button onclick="cambiarEstado(\'' + id + '\', \'en_camino\')" class="btn-action camino">🚶 EN CAMINO</button><button onclick="mostrarNotasContingencia(\'' + id + '\')" class="btn-action notas">📝 NOTAS</button><button onclick="mostrarRechazo(\'' + id + '\')" class="btn-action rechazar">❌ NO ATENDER</button>';
        }
    } else if (data.estado === 'en_camino') {
        estadoBadge = '<span class="estado-badge camino">🚶 EN CAMINO</span>';
        if (data.estadoPausa === 'pausada' && data.pausas && data.pausas.length > 0) {
            const ultimaPausa = data.pausas[data.pausas.length - 1];
            const horaProg = ultimaPausa.reinicioProgramado?.toDate ? ultimaPausa.reinicioProgramado.toDate().toLocaleTimeString('es-PE', {hour: '2-digit', minute:'2-digit'}) : 'programada';
            acciones = '<button onclick="reiniciarAtencion(\'' + id + '\')" class="btn-action reiniciar">▶️ REINICIAR (regreso ' + horaProg + ')</button><button onclick="mostrarNotasContingencia(\'' + id + '\')" class="btn-action notas">📝 NOTAS</button><button onclick="mostrarRechazo(\'' + id + '\')" class="btn-action rechazar">❌ NO ATENDER</button>';
        } else {
            acciones = '<button onclick="mostrarNotasContingencia(\'' + id + '\')" class="btn-action notas">📝 NOTAS</button><button onclick="mostrarPausaAtencion(\'' + id + '\')" class="btn-action pausa">⏸️ PAUSAR</button><button onclick="cambiarEstado(\'' + id + '\', \'finalizado\')" class="btn-action finalizar">✅ FINALIZAR</button><button onclick="mostrarRechazo(\'' + id + '\')" class="btn-action rechazar">❌ NO ATENDER</button>';
        }
    } else if (data.estado === 'rechazado') {
        estadoBadge = '<span class="estado-badge rechazado">❌ NO ATENDIDO</span>';
        acciones = '<button onclick="revertirRechazo(\'' + id + '\')" class="btn-action revertir">↩️ REVERTIR</button><p class="motivo">Motivo: ' + (data.motivoRechazo || 'No especificado') + '</p>';
    } else if (data.estado === 'finalizado') {
        estadoBadge = '<span class="estado-badge finalizado">✅ ATENDIDO</span>';
        
        // === Trazabilidad de tiempos en cards finalizados ===
        let lineasTiempo = [];
        if (data.timestamps?.creado) lineasTiempo.push('📋 Registro: ' + formatearFechaHora(data.timestamps.creado));
        if (data.timestamps?.enCamino) lineasTiempo.push('🚶 En camino: ' + formatearFechaHora(data.timestamps.enCamino));
        if (data.pausas && data.pausas.length > 0) {
            data.pausas.forEach((p, idx) => {
                const inicio = p.inicio ? formatearFechaHora(p.inicio) : '-';
                const fin = p.reinicioReal ? formatearFechaHora(p.reinicioReal) : (p.reinicioProgramado ? formatearFechaHora(p.reinicioProgramado) + ' (prog)' : '...');
                lineasTiempo.push('⏸️ Pausa ' + (idx + 1) + ': ' + inicio + ' → ' + fin);
            });
        }
        if (data.timestamps?.finalizado) lineasTiempo.push('✅ Finalizado: ' + formatearFechaHora(data.timestamps.finalizado));
        
        const tiemposCalc = calcularTiempoEfectivo(data);
        const tiempoTotal = tiemposCalc.efectivo > 0 
            ? '<strong style="color:#2e7d32;">⏱️ Tiempo total: ' + formatearTiempoHHMMSS(tiemposCalc.efectivo) + '</strong>'
            : '';
        
        let trazabilidadHTML = '';
        if (lineasTiempo.length > 0) {
            trazabilidadHTML = '<div style="background:#e8f5e9;padding:8px 10px;border-radius:6px;margin:8px 0;font-size:12px;line-height:1.6;">';
            trazabilidadHTML += lineasTiempo.join('<br>');
            if (tiempoTotal) trazabilidadHTML += '<br>' + tiempoTotal;
            trazabilidadHTML += '</div>';
        }
        
        acciones = '<button onclick="abrirKanteron(\'' + (data.dniPaciente || '') + '\')" class="btn-action kanteron">🔍 Kanteron PACS</button>' + trazabilidadHTML;
    }
    
    let adminBotones = '';
    if (localStorage.getItem('rol') === 'admin') {
        adminBotones = '<div style="margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 10px;"><button onclick="revertirEstadoAdmin(\'' + id + '\')" class="btn-action" style="background: #e3f2fd; color: #1976d2;">↩️ REVERTIR A PENDIENTE</button><button onclick="eliminarSolicitud(\'' + id + '\')" class="btn-action" style="background: #ffebee; color: #d32f2f;">🗑️ ELIMINAR</button></div>';
    }
    
    let servicioHTML = '';
    if (data.servicio) {
        servicioHTML = '<div class="info-row"><span>🏥 ' + data.servicio + '</span>';
        if (data.numeroCama) servicioHTML += '<span>🛏️ ' + data.numeroCama + '</span>';
        servicioHTML += '</div>';
    } else if (data.numeroCama) {
        servicioHTML = '<div class="info-row"><span>🛏️ ' + data.numeroCama + '</span></div>';
    }
    
    let archivoHTML = '';
    if (data.archivoSolicitud) {
        const tipoArchivo = data.esPDF ? '📄 PDF' : '📷 Foto';
        archivoHTML = '<div class="card-foto"><a href="' + data.archivoSolicitud + '" target="_blank">' + tipoArchivo + ' - Ver solicitud</a></div>';
    }
    
    // === NUEVO: CSS class para programados pendientes ===
    let cardClass = 'solicitud-card-v2 ' + alerta;
    if (esProgramadoPendiente) cardClass += ' programado-pendiente-card';
    
    return '<div class="' + cardClass + '" id="card-' + id + '"><div class="card-header"><div class="card-titulo"><strong>' + (data.nombrePaciente || '-') + '</strong><span class="dni">DNI: ' + (data.dniPaciente || '-') + '</span>' + indicadorProgramado + '</div>' + estadoBadge + '</div><div class="card-info"><div class="info-row"><span>🕐 ' + fechaHora + '</span><span class="tiempo">⏱️ ' + tiempo + '</span></div>' + servicioHTML + '<div class="info-row"><span>🙋 ' + data.solicitadoPor + '</span><span>🔬 ' + (data.tecnologoAsignado || 'Sin asignar') + '</span></div>' + (data.notas ? '<div class="info-row notas">📝 ' + data.notas + '</div>' : '') + '</div>' + archivoHTML + '<div class="card-actions">' + acciones + historialNotasHTML + adminBotones + '</div></div>';
}

let unsubscribe = null;

// === NUEVO: cargarSolicitudes con 5 contadores y clasificación programado_pendiente ===
function cargarSolicitudes() {
    if (unsubscribe) unsubscribe();
    const q = query(collection(db, 'solicitudes'), orderBy('timestamps.creado', 'desc'));
    unsubscribe = onSnapshot(q, (snapshot) => {
        let html = '';
        let counts = { 
            pendiente: 0, 
            programado_pendiente: 0,
            en_camino: 0, 
            rechazado: 0, 
            finalizado: 0 
        };
        let nuevasSolicitudes = 0;

        // === Contar TODOS primero, antes del filtro ===
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const ahora = new Date();
            
            // === NUEVO: Clasificar programados vs urgentes ===
            let estadoClasificado = data.estado;
            if (data.estado === 'pendiente') {
                if (data.esProgramado && data.horaProgramada) {
                    const horaProg = data.horaProgramada.toDate ? data.horaProgramada.toDate() : new Date(data.horaProgramada);
                    const dosHoras = 2 * 60 * 60 * 1000;
                    if (horaProg <= new Date(ahora.getTime() + dosHoras)) {
                        estadoClasificado = 'pendiente'; // Ya es hora o casi → URGENTE
                    } else {
                        estadoClasificado = 'programado_pendiente'; // Futuro → Programado
                    }
                } else {
                    estadoClasificado = 'pendiente'; // No programado → URGENTE
                }
            }
            
            // Contadores globales (sin filtros)
            if (counts[estadoClasificado] !== undefined) counts[estadoClasificado]++;
            
            // Notificaciones solo para nuevas pendientes URGENTES (no programados)
            if (data.estado === 'pendiente' && !data.esProgramado && !solicitudesAnteriores.has(docSnap.id)) {
                nuevasSolicitudes++;
                mostrarNotificacionCompleta(
                    '🚨 Nueva Solicitud Rx Portatil',
                    '🏥 ' + (data.servicio || 'Sin servicio') + ' | 👤 ' + (data.nombrePaciente || 'Sin nombre'),
                    data.servicio,
                    data.nombrePaciente
                );
            }
        });

        // === NUEVO: Actualizar 5 contadores en UI ===
        const countPendiente = document.getElementById('countPendiente');
        const countProgramado = document.getElementById('countProgramado');
        const countEnCamino = document.getElementById('countEnCamino');
        const countRechazado = document.getElementById('countRechazado');
        const countFinalizado = document.getElementById('countFinalizado');
        
        if (countPendiente) countPendiente.textContent = counts.pendiente;
        if (countProgramado) countProgramado.textContent = counts.programado_pendiente;
        if (countEnCamino) countEnCamino.textContent = counts.en_camino;
        if (countRechazado) countRechazado.textContent = counts.rechazado;
        if (countFinalizado) countFinalizado.textContent = counts.finalizado;

        // === Ahora aplicar filtros solo para renderizar cards ===
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const ahora = new Date();
            
            // === NUEVO: Determinar estado clasificado para filtro ===
            let estadoClasificado = data.estado;
            if (data.estado === 'pendiente') {
                if (data.esProgramado && data.horaProgramada) {
                    const horaProg = data.horaProgramada.toDate ? data.horaProgramada.toDate() : new Date(data.horaProgramada);
                    const dosHoras = 2 * 60 * 60 * 1000;
                    if (horaProg <= new Date(ahora.getTime() + dosHoras)) {
                        estadoClasificado = 'pendiente';
                    } else {
                        estadoClasificado = 'programado_pendiente';
                    }
                } else {
                    estadoClasificado = 'pendiente';
                }
            }
            
            // Filtro de estado
            if (estadoFiltro !== 'todos' && estadoClasificado !== estadoFiltro) return;
            
            // Filtro de fecha
            if (fechaFiltro && data.timestamps?.creado) {
                const fechaDoc = data.timestamps.creado.toDate().toISOString().split('T')[0];
                if (fechaDoc !== fechaFiltro) return;
            }
            
            html += crearCardSolicitud({ id: docSnap.id, data });
            solicitudesAnteriores.add(docSnap.id);
        });

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
    // Solicitar permiso de notificaciones automaticamente al cargar el dashboard
    solicitarPermisoNotificaciones().then(permitido => {
        if (permitido) {
            console.log('Notificaciones activadas automaticamente');
        } else {
            console.log('Notificaciones no permitidas por el usuario');
        }
    });
    cargarSolicitudes();

    // Recargar dashboard automaticamente cada 15 minutos para mantener datos frescos
    setInterval(() => {
        console.log('Recargando dashboard automaticamente (15 minutos)');
        window.location.reload();
    }, 900000); // 15 minutos = 900,000 ms
}

// ==================== PAGINA: ADMIN ====================

const formCrearTecnologo = document.getElementById('formCrearTecnologo');
if (formCrearTecnologo) {
    if (localStorage.getItem('rol') !== 'admin') {
        alert('Acceso denegado');
        window.location.href = 'index.html';
    }
    // Formulario crear servicio
    const formCrearServicio = document.getElementById('formCrearServicio');
    if (formCrearServicio) {
        formCrearServicio.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nombre = document.getElementById('servNombre').value.trim();
            if (!nombre) {
                alert('Ingrese el nombre del servicio');
                return;
            }
            try {
                await addDoc(collection(db, 'servicios'), {
                    nombre: nombre,
                    creado: serverTimestamp()
                });
                alert('✅ Servicio creado correctamente');
                formCrearServicio.reset();
            } catch (error) {
                alert('❌ Error: ' + error.message);
            }
        });
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
    function cargarServiciosAdmin() {
        const q = query(collection(db, 'servicios'), orderBy('nombre'));
        onSnapshot(q, (snapshot) => {
            let html = '';
            snapshot.forEach((docSnap) => {
                const s = docSnap.data();
                html += '<div class="servicio-item"><span><strong>' + s.nombre + '</strong></span><div><button onclick="abrirModalEditarServicio(\'' + docSnap.id + '\')" class="btn-eliminar" style="background: #e3f2fd; color: #1976d2; margin-right: 5px;">✏️</button><button onclick="eliminarServicio(\'' + docSnap.id + '\')" class="btn-eliminar">🗑️</button></div></div>';
            });
            const lista = document.getElementById('listaServicios');
            if (lista) lista.innerHTML = html || '<p class="empty">No hay servicios registrados</p>';
        });
    }
    cargarServiciosAdmin();

    function cargarTecnologos() {
        const q = query(collection(db, 'tecnologos'), orderBy('nombre'));
        onSnapshot(q, (snapshot) => {
            let html = '';
            snapshot.forEach((docSnap) => {
                const t = docSnap.data();
                html += '<div class="tecnologo-item"><span><strong>' + t.nombre + '</strong> (DNI: ' + t.dni + ')</span><div><button onclick="abrirModalEditarTecnologo(\'' + docSnap.id + '\')" class="btn-eliminar" style="background: #e3f2fd; color: #1976d2; margin-right: 5px;">✏️</button><button onclick="eliminarTecnologo(\'' + docSnap.id + '\')" class="btn-eliminar">🗑️</button></div></div>';
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
    async function cargarTecnologosSelect() {
        const select = document.getElementById('tecnologoFiltro');
        if (!select) return;
        try {
            // Sin orderBy para evitar que documentos sin 'nombre' sean excluidos
            const snapshot = await getDocs(collection(db, 'tecnologos'));
            console.log('=== DIAGNÓSTICO TECNÓLOGOS ===');
            console.log('Total documentos en colección tecnologos:', snapshot.size);

            let tecnologos = [];
            snapshot.forEach((docSnap) => {
                const t = docSnap.data();
                console.log('Doc ID:', docSnap.id, 'Datos:', {nombre: t.nombre, dni: t.dni});
                if (t.nombre) {
                    tecnologos.push({nombre: t.nombre, dni: t.dni || '-'});
                }
            });

            // Ordenar manualmente por nombre
            tecnologos.sort((a, b) => a.nombre.localeCompare(b.nombre));

            console.log('Tecnólogos con nombre válido:', tecnologos.length);

            select.innerHTML = '<option value="">Seleccionar...</option>';
            tecnologos.forEach((t) => {
                const option = document.createElement('option');
                option.value = t.nombre;
                option.textContent = t.nombre + ' (DNI: ' + t.dni + ')';
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Error cargando tecnólogos para select:', error);
        }
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
            
            // === NUEVO: Calcular tiempo de atención para finalizados ===
            let tiempoInfo = '';
            if (data.estado === 'finalizado' && data.timestamps?.creado && data.timestamps?.finalizado) {
                const tiempos = calcularTiempoEfectivo(data);
                tiempoInfo = '<div style="background:#e8f5e9;padding:8px 10px;border-radius:6px;margin:8px 0;font-size:12px;">';
                tiempoInfo += '<strong style="color:#2e7d32;">⏱️ Tiempo total: ' + formatearTiempoHHMMSS(tiempos.efectivo) + '</strong>';
                if (tiempos.pausasTiempo > 0) {
                    tiempoInfo += ' (+' + formatearTiempoHHMMSS(tiempos.pausasTiempo) + ' en pausas)';
                }
                tiempoInfo += '</div>';
            }
            
            // === NUEVO: Trazabilidad de estados con timestamps ===
            let trazabilidadHTML = '';
            let estadosLines = [];
            if (data.timestamps?.creado) {
                estadosLines.push('📋 Registrado: ' + formatearFechaHora(data.timestamps.creado));
            }
            if (data.timestamps?.enCamino) {
                estadosLines.push('🚶 En camino: ' + formatearFechaHora(data.timestamps.enCamino));
            }
            if (data.pausas && data.pausas.length > 0) {
                data.pausas.forEach((p, idx) => {
                    const inicio = p.inicio ? formatearFechaHora(p.inicio) : '-';
                    const fin = p.reinicioReal ? formatearFechaHora(p.reinicioReal) : (p.reinicioProgramado ? formatearFechaHora(p.reinicioProgramado) + ' (prog)' : '...');
                    estadosLines.push('⏸️ Pausa ' + (idx + 1) + ': ' + inicio + ' → ' + fin);
                });
            }
            if (data.timestamps?.finalizado) {
                estadosLines.push('✅ Finalizado: ' + formatearFechaHora(data.timestamps.finalizado));
            }
            if (data.timestamps?.rechazado) {
                estadosLines.push('❌ Rechazado: ' + formatearFechaHora(data.timestamps.rechazado));
            }
            if (estadosLines.length > 0) {
                trazabilidadHTML = '<div style="background:#f0f7ff;padding:8px 10px;border-radius:6px;margin:8px 0;font-size:12px;line-height:1.6;">';
                trazabilidadHTML += '<strong style="color:#1a5276;">📊 Trazabilidad:</strong><br>';
                trazabilidadHTML += estadosLines.join('<br>');
                trazabilidadHTML += '</div>';
            }
            
            // === NUEVO: Historial de notas de tecnólogos ===
            let notasHTML = '';
            if (data.historialNotas && data.historialNotas.length > 0) {
                notasHTML = '<div style="background:#fff8f0;padding:8px 10px;border-radius:6px;margin:8px 0;font-size:12px;">';
                notasHTML += '<strong style="color:#e65100;">📝 Notas de Tecnólogos (' + data.historialNotas.length + '):</strong><br>';
                data.historialNotas.forEach((nota, idx) => {
                    notasHTML += '<div style="border-left:2px solid #ff9800;padding-left:8px;margin:4px 0;">';
                    notasHTML += '<span style="color:#666;font-size:11px;">📅 ' + nota.fecha + ' | 👤 ' + nota.tecnologo + '</span><br>';
                    notasHTML += '<span style="color:#333;">' + nota.texto + '</span>';
                    notasHTML += '</div>';
                });
                notasHTML += '</div>';
            }
            
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
            if (data.numeroCama) {
                html += '<span class="servicio-badge">🛏️ ' + data.numeroCama + '</span>';
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
            
            // === NUEVO: Insertar tiempo, trazabilidad y notas ===
            html += tiempoInfo;
            html += trazabilidadHTML;
            html += notasHTML;
            
            if (data.archivoSolicitud) {
                const esPDF = data.esPDF ? '📄 PDF' : '📷 Foto';
                html += '<div class="card-foto"><a href="' + data.archivoSolicitud + '" target="_blank">' + esPDF + ' - Ver solicitud</a></div>';
            }
            html += '<div class="admin-actions">';
            html += '<button onclick="abrirModalEditarSolicitud(\'' + id + '\')" class="btn-action" style="background: #fff3e0; color: #e65100;">✏️ EDITAR</button>';
            html += '<button onclick="abrirKanteron(\'' + (data.dniPaciente || '') + '\')" class="btn-action" style="background: #e8f5e9; color: #2e7d32;">🔍 Kanteron PACS</button>';
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
