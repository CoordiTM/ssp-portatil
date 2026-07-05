// ==================== MÓDULO OCR PARA SOLICITUDES ESSALUD ====================
// Usa: pdf.js + Tesseract.js (client-side, sin costos)

// Configuración de pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

/**
 * Convierte un archivo PDF a imagen (canvas) para OCR
 * @param {File} file - Archivo PDF
 * @param {number} scale - Escala de renderizado (default 2.0 para mejor calidad OCR)
 * @returns {Promise<HTMLCanvasElement>}
 */
async function pdfToCanvas(file, scale = 2.0) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1); // Primera página

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
 * - Escala de grises
 * - Aumento de contraste
 * - Binarización adaptativa (simple)
 * @param {HTMLCanvasElement} canvas
 * @returns {HTMLCanvasElement}
 */
function preprocesarImagen(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Convertir a escala de grises + aumentar contraste
    for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        // Aumentar contraste: factor 1.5, centrado en 128
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
 * @param {HTMLCanvasElement} canvas
 * @param {Function} onProgress - Callback para progreso (0-100)
 * @returns {Promise<{text: string, confidence: number}>}
 */
async function ejecutarOCR(canvas, onProgress) {
    const worker = await Tesseract.createWorker('spa', 1, {
        logger: (m) => {
            if (m.status === 'recognizing text' && onProgress) {
                onProgress(Math.round(m.progress * 100));
            }
        }
    });

    // Configurar whitelist para reducir errores en documentos médicos
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
 * @param {string} texto - Texto crudo del OCR
 * @returns {Object} Datos extraídos
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

    const textoLimpio = texto.toUpperCase().replace(/\s+/g, ' ').trim();

    // === NRO. DE SOLICITUD ===
    // Patrones: "Nro.de Solicitud 1331054", "Nro. de Solicitud 1331054", "Nro de Solicitud 1331054"
    const matchSolicitud = textoLimpio.match(/NRO\.?\s*DE\s*SOLICITUD\s*(\d{6,10})/i) ||
                           textoLimpio.match(/NRO\.?\s*SOLICITUD\s*(\d{6,10})/i) ||
                           textoLimpio.match(/SOLICITUD\s*(\d{6,10})/i);
    if (matchSolicitud) datos.numeroSolicitud = matchSolicitud[1];

    // === DNI ===
    // Patrones: "D.N.I. 04031142", "DNI 04031142", "Documento de Identidad D.N.I. 04031142"
    const matchDNI = textoLimpio.match(/D\.?N\.?I\.?\s*(\d{8})/i) ||
                     textoLimpio.match(/DOCUMENTO\s*DE\s*IDENTIDAD\s*D\.?N\.?I\.?\s*(\d{8})/i) ||
                     textoLimpio.match(/IDENTIDAD\s*D\.?N\.?I\.?\s*(\d{8})/i);
    if (matchDNI) datos.dni = matchDNI[1];

    // === NOMBRES Y APELLIDOS ===
    // Patrón: "Nombre y Apellidos Paciente BORJA VILLANUEVA NELLY NEYME"
    // Buscamos después de "PACIENTE" o "NOMBRE Y APELLIDOS" hasta el siguiente campo conocido
    const matchNombres = textoLimpio.match(/NOMBRE\s*Y\s*APELLIDOS\s*PACIENTE\s*([A-Z\s]{10,60}?)(?=\s*NRO\s*DE\s*HISTORIA|\s*NRO\s*DE\s*SOLICITUD|\s*DOCUMENTO|\s*TIPO\s*DE\s*SEGURO|\s*SEXO|\s*PLAN)/i);
    if (matchNombres) {
        datos.nombres = matchNombres[1].trim().replace(/\s+/g, ' ');
    } else {
        // Fallback: buscar línea con muchas mayúsculas después de "PACIENTE"
        const matchNombres2 = textoLimpio.match(/PACIENTE\s*([A-Z\s]{10,60}?)(?=\s*NRO|\s*DOCUMENTO|\s*TIPO)/i);
        if (matchNombres2) datos.nombres = matchNombres2[1].trim().replace(/\s+/g, ' ');
    }

    // === EXAMEN SOLICITADO ===
    // Buscamos líneas que empiecen con "EXAMEN RADIOLOGICO" o "RADIOLOGIA DIAGNOSTICA"
    const matchExamen = textoLimpio.match(/EXAMEN\s*RADIOLOGICO\s*DE\s*([^\n]{10,200}?)(?=\d{5}|\s*INDICACIONES|\s*INDICACIONE|\s*AREA|\s*RADIOLOGIA\s*DIAGNOSTICA|$)/i) ||
                        textoLimpio.match(/RADIOLOGIA\s*DIAGNOSTICA\s*EXAMEN\s*RADIOLOGICO\s*DE\s*([^\n]{10,200}?)(?=\d{5}|\s*INDICACIONES|\s*INDICACIONE|\s*AREA|$)/i);
    if (matchExamen) {
        datos.examen = 'EXAMEN RADIOLOGICO DE ' + matchExamen[1].trim().replace(/\s+/g, ' ');
    } else {
        // Fallback: buscar cualquier línea larga con "EXAMEN"
        const matchExamen2 = textoLimpio.match(/(EXAMEN\s*RADIOLOGICO[^\n]{10,200})/i);
        if (matchExamen2) datos.examen = matchExamen2[1].trim().replace(/\s+/g, ' ');
    }

    // === NRO DE HISTORIA CLÍNICA ===
    const matchHistoria = textoLimpio.match(/NRO\s*DE\s*HISTORIA\s*CLINICA\s*(\d{5,10})/i) ||
                          textoLimpio.match(/HISTORIA\s*CLINICA\s*(\d{5,10})/i);
    if (matchHistoria) datos.numeroHistoria = matchHistoria[1];

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
 * @param {File} file - Archivo PDF
 * @param {Object} callbacks - { onProgress, onComplete, onError }
 */
async function procesarPDF(file, callbacks = {}) {
    const { onProgress, onComplete, onError } = callbacks;

    try {
        // Paso 1: PDF → Canvas
        if (onProgress) onProgress(5, 'Convirtiendo PDF a imagen...');
        let canvas = await pdfToCanvas(file);

        // Paso 2: Preprocesamiento
        if (onProgress) onProgress(15, 'Preprocesando imagen...');
        canvas = preprocesarImagen(canvas);

        // Paso 3: OCR
        if (onProgress) onProgress(25, 'Iniciando reconocimiento OCR...');
        const resultadoOCR = await ejecutarOCR(canvas, (pct) => {
            if (onProgress) onProgress(25 + Math.round(pct * 0.6), 'Leyendo documento... ' + pct + '%');
        });

        // Paso 4: Parsear datos
        if (onProgress) onProgress(90, 'Extrayendo datos...');
        const datos = parsearDatosESSALUD(resultadoOCR.text);

        if (onProgress) onProgress(100, '¡Datos extraídos!');

        if (onComplete) {
            onComplete({
                datos,
                textoCrudo: resultadoOCR.text,
                confianza: resultadoOCR.confidence,
                canvas: canvas // Para mostrar preview
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
