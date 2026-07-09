// ==================== MÓDULO OCR PARA SOLICITUDES ESSALUD ====================

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

async function pdfToCanvas(file, scale) {
    scale = scale || 2.0;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: scale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    return canvas;
}

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

async function ejecutarOCR(canvas, onProgress) {
    const worker = await Tesseract.createWorker('spa', 1, {
        logger: function(m) {
            if (m.status === 'recognizing text' && onProgress) {
                onProgress(Math.round(m.progress * 100));
            }
        }
    });
    await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:-_/()',
        preserve_interword_spaces: '1'
    });
    const result = await worker.recognize(canvas);
    await worker.terminate();
    return {
        text: result.data.text,
        confidence: result.data.confidence
    };
}

function parsearDatosESSALUD(texto) {
    const datos = {
        numeroSolicitud: null,
        dni: null,
        nombres: null,
        examen: null,
        numeroHistoria: null
    };

    const textoNormalizado = texto.replace(/[ \t]+/g, ' ').trim();
    const lineas = textoNormalizado.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
    const textoUpper = textoNormalizado.toUpperCase();

    // ========== NRO. DE SOLICITUD - Múltiples patrones ==========
    const patronesSolicitud = [
        /NRO\.?\s*DE?\s*SOLICITUD\s*(\d{6,10})/i,
        /NRO\.?\s*SOLICITUD\s*(\d{6,10})/i,
        /SOLICITUD\s*(\d{6,10})/i,
        /NRO\.\s*DE\s*SOLICITUD\s+(\d{6,10})/i,
        /NRO\.DE\s*SOLICITUD\s*(\d{6,10})/i,
    ];

    for (const patron of patronesSolicitud) {
        const match = textoNormalizado.match(patron);
        if (match) {
            datos.numeroSolicitud = match[1];
            break;
        }
    }

    if (!datos.numeroSolicitud) {
        for (let i = 0; i < lineas.length; i++) {
            const lineaUpper = lineas[i].toUpperCase();
            if (/NRO\.?\s*DE?\s*SOLICITUD|SOLICITUD/i.test(lineaUpper)) {
                const matchEnLinea = lineas[i].match(/(\d{6,10})/);
                if (matchEnLinea) { 
                    datos.numeroSolicitud = matchEnLinea[1]; 
                    break; 
                }
                if (i + 1 < lineas.length) {
                    const matchSiguiente = lineas[i + 1].match(/^(\d{6,10})$/);
                    if (matchSiguiente) { 
                        datos.numeroSolicitud = matchSiguiente[1]; 
                        break; 
                    }
                }
            }
        }
    }

    // ========== DNI - Múltiples patrones ==========
    const patronesDNI = [
        /D\.?N\.?I\.?\s*(\d{8})/i,
        /D\.?N\.?I\s+(\d{8})/i,
        /DOCUMENTO\s*DE\s*IDENTIDAD\s*[D\.N\.I\.]*\s*(\d{8})/i,
        /IDENTIDAD\s*(\d{8})/i,
        /DNI\s*(\d{8})/i,
    ];

    for (const patron of patronesDNI) {
        const match = textoNormalizado.match(patron);
        if (match) {
            datos.dni = match[1];
            break;
        }
    }

    if (!datos.dni) {
        for (let i = 0; i < lineas.length; i++) {
            const lineaUpper = lineas[i].toUpperCase();
            if (/D\.?N\.?I\.?|DOCUMENTO\s*DE\s*IDENTIDAD|IDENTIDAD/i.test(lineaUpper)) {
                const matchEnLinea = lineas[i].match(/(\d{8})/);
                if (matchEnLinea) { 
                    datos.dni = matchEnLinea[1]; 
                    break; 
                }
                if (i + 1 < lineas.length) {
                    const matchSiguiente = lineas[i + 1].match(/^(\d{8})$/);
                    if (matchSiguiente) { 
                        datos.dni = matchSiguiente[1]; 
                        break; 
                    }
                }
            }
        }
    }

    // ========== NOMBRES Y APELLIDOS - Búsqueda por índice ==========
    let indiceNombre = -1;
    for (let i = 0; i < lineas.length; i++) {
        const lineaUpper = lineas[i].toUpperCase();
        if (/NOMBRE\s*Y\s*APELLIDOS|APELLIDOS\s*PACIENTE|NOMBRE\s*PACIENTE/i.test(lineaUpper)) {
            indiceNombre = i;
            break;
        }
    }

    if (indiceNombre !== -1) {
        for (let j = indiceNombre + 1; j < lineas.length && j < indiceNombre + 5; j++) {
            const linea = lineas[j].trim().toUpperCase();
            if (/^[A-Z\s]{10,80}$/.test(linea) && !/\d/.test(linea)) {
                if (!/NRO|HISTORIA|DNI|DOCUMENTO|TIPO|EXAMEN|FECHA|HORA|SEXO|EDAD|SERVICIO|AREA/i.test(linea)) {
                    datos.nombres = linea.replace(/\s+/g, ' ').trim();
                    break;
                }
            }
        }
    }

    if (!datos.nombres) {
        const matchNombres = textoUpper.match(/NOMBRE\s*Y\s*APELLIDOS\s*(?:PACIENTE)?\s*[:\n]?\s*([A-Z\s]{10,80})(?=\n|$)/);
        if (matchNombres) {
            datos.nombres = matchNombres[1].trim().replace(/\s+/g, ' ');
        }
    }

    // ========== EXAMEN SOLICITADO ==========
    const patronesExamen = [
        /EXAMEN\s*RADIOLOGICO\s*DE\s*([^\n]{10,200}?)\s*(?=\s*\d{5}|\s*INDICACIONES|\s*INDICACIONE|\s*AREA|\s*RADIOLOGIA\s*DIAGNOSTICA|$)/i,
        /EXAMEN\s*RADIOLOGICO\s*([^\n]{10,200})/i,
        /RADIOLOGIA\s*DIAGNOSTICA\s*EXAMEN\s*([^\n]{10,200})/i,
    ];

    for (const patron of patronesExamen) {
        const match = textoUpper.match(patron);
        if (match) {
            datos.examen = match[0].trim().replace(/\s+/g, ' ').substring(0, 100);
            break;
        }
    }

    // ========== NRO DE HISTORIA CLINICA - Múltiples patrones ==========
    const patronesHistoria = [
        /NRO\.?\s*DE?\s*HISTORIA\s*CLINICA\s*(\d{5,10})/i,
        /HISTORIA\s*CLINICA\s*(\d{5,10})/i,
        /NRO\.?\s*HISTORIA\s*(\d{5,10})/i,
        /H\.C\.\s*(\d{5,10})/i,
        /HISTORIA\s*(\d{5,10})/i,
    ];

    for (const patron of patronesHistoria) {
        const match = textoNormalizado.match(patron);
        if (match) {
            datos.numeroHistoria = match[1];
            break;
        }
    }

    if (!datos.numeroHistoria) {
        for (let i = 0; i < lineas.length; i++) {
            const lineaUpper = lineas[i].toUpperCase();
            if (/HISTORIA\s*CLINICA|NRO\.?\s*DE?\s*HISTORIA/i.test(lineaUpper)) {
                const matchEnLinea = lineas[i].match(/(\d{5,10})/);
                if (matchEnLinea) { 
                    datos.numeroHistoria = matchEnLinea[1]; 
                    break; 
                }
                if (i + 1 < lineas.length) {
                    const matchSiguiente = lineas[i + 1].match(/^(\d{5,10})$/);
                    if (matchSiguiente) { 
                        datos.numeroHistoria = matchSiguiente[1]; 
                        break; 
                    }
                }
            }
        }
    }

    return datos;
}

async function procesarPDF(file, callbacks) {
    callbacks = callbacks || {};
    const onProgress = callbacks.onProgress;
    const onComplete = callbacks.onComplete;
    const onError = callbacks.onError;
    
    try {
        if (onProgress) onProgress(5, 'Convirtiendo PDF a imagen...');
        let canvas = await pdfToCanvas(file);
        
        if (onProgress) onProgress(15, 'Preprocesando imagen...');
        canvas = preprocesarImagen(canvas);
        
        if (onProgress) onProgress(25, 'Iniciando reconocimiento OCR...');
        const resultadoOCR = await ejecutarOCR(canvas, function(pct) {
            if (onProgress) onProgress(25 + Math.round(pct * 0.6), 'Leyendo documento... ' + pct + '%');
        });
        
        if (onProgress) onProgress(90, 'Extrayendo datos...');
        const datos = parsearDatosESSALUD(resultadoOCR.text);
        
        if (onProgress) onProgress(100, 'Datos extraidos!');
        
        if (onComplete) {
            onComplete({
                datos: datos,
                textoCrudo: resultadoOCR.text,
                confianza: resultadoOCR.confidence,
                canvas: canvas
            });
        }
        
        return { datos: datos, textoCrudo: resultadoOCR.text, confianza: resultadoOCR.confidence, canvas: canvas };
        
    } catch (error) {
        console.error('Error en OCR:', error);
        if (onError) onError(error.message);
        throw error;
    }
}

window.procesarPDF = procesarPDF;
window.parsearDatosESSALUD = parsearDatosESSALUD;
