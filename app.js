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
    
    // Filtro por fecha
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
            acciones = `<button onclick="cambiarEstado('${id}', 'finalizado')" class="btn-action finalizar">✅ FINALIZAR</button>`;
        } else if (data.estado === 'rechazado') {
            estadoBadge = '<span class="estado-badge rechazado">❌ NO ATENDIDO</span>';
            acciones = `
                <button onclick="revertirRechazo('${id}')" class="btn-action revertir">↩️ REVERTIR</button>
                <p class="motivo">Motivo: ${data.motivoRechazo || 'No especificado'}</p>
            `;
        } else if (data.estado === 'finalizado') {
            estadoBadge = '<span class="estado-badge finalizado">✅ ATENDIDO</span>';
            acciones = `<span class="completado">Completado</span>`;
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
