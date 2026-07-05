// ==================== MÓDULO OCR PARA SOLICITUDES ESSALUD ====================
// Usa: pdf.js + Tesseract.js (client-side, sin costos)

// Configuración de pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

/**
 * Convierte un archivo PDF a imagen (canvas) para OCR
 */
async function pdfToCanvas(file, scale = 2.0) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
}

/**
 * Preprocesamiento de imagen para mejorar OCR
 */
function preprocesarImagen(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const contrasted = Math.min(255, Math.max(0, (gray - 128) * 1.5 + 128));
        data[i] = contrasted;
        data[i + 1] = contrasted;
        data[i + 2] = contrasted;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

/**
 * Ejecuta OCR con Tesseract.js
 */
async function ejecutarOCR(canvas, onProgress) {
    const worker = await Tesseract.createWorker('spa', 1, {
        logger: (m) => {
            if (m.status === 'recognizing text' && onProgress) {
                onProgress(Math.round(m.progress * 100));
            }
        }
    });

    await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÉÍÓÚÑáéíóúñ0123456789 .,;:-_/()',
        preserve_interword_spaces: '1'
    });

    const result = await worker.recognize(canvas);
    await worker.terminate();

    return {
        text: result.data.text,
        confidence: result.data.confidence
    };
}

/**
 * Parser de datos ESSALUD - Extrae campos específicos del texto OCR
 * VERSIÓN CORREGIDA: maneja formato donde etiquetas y valores están en líneas separadas
 */
function parsearDatosESSALUD(texto) {
    const datos = {
        numeroSolicitud: null,
        dni: null,
        nombres: null,
        examen: null,
        numeroHistoria: null,
        autogenerado: null,
        tipoSeguro: null,
        sexo: null,
        edad: null,
        servicio: null,
        profesional: null,
        colegiatura: null,
        cama: null,
        fechaAtencion: null
    };

    // Normalizar: eliminar espacios múltiples pero preservar saltos de línea
    const textoNormalizado = texto.replace(/[ 	]+/g, ' ').trim();
    const lineas = textoNormalizado.split(/
/).map(l => l.trim()).filter(l => l.length > 0);
    const textoLimpio = textoNormalizado.toUpperCase();

    // === NRO. DE SOLICITUD ===
    // Busca: "Nro.de Solicitud 1331054" o "Nro. de Solicitud 1331054"
    const matchSolicitud = textoLimpio.match(/NRO\.?\s*DE?\s*SOLICITUD\s*(\d{6,10})/i);
    if (matchSolicitud) {
        datos.numeroSolicitud = matchSolicitud[1];
    } else {
        // Fallback: buscar en líneas individuales
        for (let i = 0; i < lineas.length; i++) {
            if (/NRO\.?\s*DE?\s*SOLICITUD/i.test(lineas[i]) && i + 1 < lineas.length) {
                const siguiente = lineas[i + 1].match(/^(\d{6,10})$/);
                if (siguiente) { datos.numeroSolicitud = siguiente[1]; break; }
            }
        }
    }

    // === DNI ===
    // El PDF tiene: "Documento de Identidad" en una línea, "D.N.I. 04031142" en otra
    // O a veces: "D.N.I." en una línea y "04031142" en la siguiente
    const matchDNI = textoLimpio.match(/D\.?N\.?I\.?\s*(\d{8})/i);
    if (matchDNI) {
        datos.dni = matchDNI[1];
    } else {
        // Buscar línea que contenga DNI o Documento de Identidad
        for (let i = 0; i < lineas.length; i++) {
            const lineaUpper = lineas[i].toUpperCase();
            if (/D\.?N\.?I\.?|DOCUMENTO\s*DE\s*IDENTIDAD/i.test(lineaUpper)) {
                // Revisar esta línea y la siguiente
                const matchEnLinea = lineas[i].match(/(\d{8})/);
                if (matchEnLinea) { datos.dni = matchEnLinea[1]; break; }
                if (i + 1 < lineas.length) {
                    const matchSiguiente = lineas[i + 1].match(/^(\d{8})$/);
                    if (matchSiguiente) { datos.dni = matchSiguiente[1]; break; }
                }
            }
        }
    }

    // === NOMBRES Y APELLIDOS ===
    // El PDF tiene: "Nombre y Apellidos Paciente" en una línea, "BORJA VILLANUEVA NELLY NEYME" en otra
    const matchNombres = textoLimpio.match(/NOMBRE\s*Y\s*APELLIDOS\s*PACIENTE\s*([A-Z\s]{10,60}?)(?=\s*NRO|\s*DOCUMENTO|\s*TIPO|\s*HISTORIA|$)/i);
    if (matchNombres) {
        datos.nombres = matchNombres[1].trim().replace(/\s+/g, ' ');
    } else {
        // Buscar línea con "PACIENTE" y tomar la siguiente línea como nombre
        for (let i = 0; i < lineas.length; i++) {
            const lineaUpper = lineas[i].toUpperCase();
            if (/NOMBRE\s*Y\s*APELLIDOS\s*PACIENTE|NOMBRE\s*Y\s*APELLIDOS|PACIENTE/i.test(lineaUpper)) {
                if (i + 1 < lineas.length) {
                    const nombreLinea = lineas[i + 1].toUpperCase();
                    // Validar que sea un nombre (muchos caracteres alfabéticos, no números)
                    if (/^[A-Z\s]{10,60}$/.test(nombreLinea) && !/\d/.test(nombreLinea)) {
                        datos.nombres = nombreLinea.trim().replace(/\s+/g, ' ');
                        break;
                    }
                }
            }
        }
    }

    // === EXAMEN SOLICITADO ===
    const matchExamen = textoLimpio.match(/EXAMEN\s*RADIOLOGICO\s*DE\s*([^
]{10,200}?)(?=\d{5}|\s*INDICACIONES|\s*INDICACIONE|\s*AREA|\s*RADIOLOGIA\s*DIAGNOSTICA|$)/i);
    if (matchExamen) {
        datos.examen = 'EXAMEN RADIOLOGICO DE ' + matchExamen[1].trim().replace(/\s+/g, ' ');
    } else {
        const matchExamen2 = textoLimpio.match(/(EXAMEN\s*RADIOLOGICO[^
]{10,200})/i);
        if (matchExamen2) datos.examen = matchExamen2[1].trim().replace(/\s+/g, ' ');
    }

    // === NRO DE HISTORIA CLÍNICA ===
    // El PDF tiene: "Nro de Historia Clinica" en una línea, "1166855" en otra
    const matchHistoria = textoLimpio.match(/NRO\s*DE\s*HISTORIA\s*CLINICA\s*(\d{5,10})/i);
    if (matchHistoria) {
        datos.numeroHistoria = matchHistoria[1];
    } else {
        // Buscar línea con "HISTORIA CLINICA" y tomar la siguiente
        for (let i = 0; i < lineas.length; i++) {
            const lineaUpper = lineas[i].toUpperCase();
            if (/HISTORIA\s*CLINICA|NRO\s*DE\s*HISTORIA/i.test(lineaUpper)) {
                const matchEnLinea = lineas[i].match(/(\d{5,10})/);
                if (matchEnLinea) { datos.numeroHistoria = matchEnLinea[1]; break; }
                if (i + 1 < lineas.length) {
                    const matchSiguiente = lineas[i + 1].match(/^(\d{5,10})$/);
                    if (matchSiguiente) { datos.numeroHistoria = matchSiguiente[1]; break; }
                }
            }
        }
    }

    // === AUTOGENERADO ===
    const matchAutogenerado = textoLimpio.match(/AUTOGENERADO\s*([A-Z0-9]{10,20})/i);
    if (matchAutogenerado) datos.autogenerado = matchAutogenerado[1];

    // === TIPO DE SEGURO ===
    const matchSeguro = textoLimpio.match(/TIPO\s*DE\s*SEGURO\s*([A-Z\s]{5,40}?)(?=\s*SEXO|\s*PLAN|\s*EDAD)/i);
    if (matchSeguro) datos.tipoSeguro = matchSeguro[1].trim();

    // === SEXO ===
    const matchSexo = textoLimpio.match(/SEXO\s*(FEMENINO|MASCULINO)/i);
    if (matchSexo) datos.sexo = matchSexo[1];

    // === EDAD ===
    const matchEdad = textoLimpio.match(/EDAD\s*(\d{1,3})/i);
    if (matchEdad) datos.edad = matchEdad[1];

    // === SERVICIO HOSPITALARIO ===
    const matchServicio = textoLimpio.match(/SERVICIO\s*HOSPITALARIO\s*([A-Z\s]{5,40}?)(?=\s*PROFESIONAL|\s*MEDICO|\s*ACTIVIDAD)/i);
    if (matchServicio) datos.servicio = matchServicio[1].trim();

    // === PROFESIONAL MÉDICO ===
    const matchProfesional = textoLimpio.match(/PROFESIONAL\s*MEDICO\s*([A-Z\s]{10,60}?)(?=\s*COLEGIATURA|\s*ACTIVIDAD|\s*ESTACION)/i);
    if (matchProfesional) datos.profesional = matchProfesional[1].trim();

    // === COLEGIATURA ===
    const matchColegiatura = textoLimpio.match(/COLEGIATURA[:\s]*\s*(\d{4,8})/i);
    if (matchColegiatura) datos.colegiatura = matchColegiatura[1];

    // === CAMA ===
    const matchCama = textoLimpio.match(/CAMA\s*([A-Z0-9\-]{1,10})/i);
    if (matchCama) datos.cama = matchCama[1].trim();

    // === FECHA DE ATENCIÓN ===
    const matchFecha = textoLimpio.match(/FECHA\s*DE\s*ATENCION\s*(\d{2}[/\-]\d{2}[/\-]\d{4})/i);
    if (matchFecha) datos.fechaAtencion = matchFecha[1];

    return datos;
}

/**
 * Función principal: Procesa un archivo PDF y extrae datos
 */
async function procesarPDF(file, callbacks = {}) {
    const { onProgress, onComplete, onError } = callbacks;

    try {
        if (onProgress) onProgress(5, 'Convirtiendo PDF a imagen...');
        let canvas = await pdfToCanvas(file);

        if (onProgress) onProgress(15, 'Preprocesando imagen...');
        canvas = preprocesarImagen(canvas);

        if (onProgress) onProgress(25, 'Iniciando reconocimiento OCR...');
        const resultadoOCR = await ejecutarOCR(canvas, (pct) => {
            if (onProgress) onProgress(25 + Math.round(pct * 0.6), 'Leyendo documento... ' + pct + '%');
        });

        if (onProgress) onProgress(90, 'Extrayendo datos...');
        const datos = parsearDatosESSALUD(resultadoOCR.text);

        if (onProgress) onProgress(100, '¡Datos extraídos!');

        if (onComplete) {
            onComplete({
                datos,
                textoCrudo: resultadoOCR.text,
                confianza: resultadoOCR.confidence,
                canvas: canvas
            });
        }

        return { datos, textoCrudo: resultadoOCR.text, confianza: resultadoOCR.confidence, canvas };

    } catch (error) {
        console.error('Error en OCR:', error);
        if (onError) onError(error.message);
        throw error;
    }
}

// Exportar funciones globales
window.procesarPDF = procesarPDF;
window.parsearDatosESSALUD = parsearDatosESSALUD;
