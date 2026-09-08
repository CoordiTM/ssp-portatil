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
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:-_/()ÑñÁÉÍÓÚáéíóúÜü',
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
    
    // NRO. DE SOLICITUD
    const matchSolicitud = textoUpper.match(/NRO\.?\s*DE?\s*SOLICITUD\s*(\d{6,10})/);
    if (matchSolicitud) {
        datos.numeroSolicitud = matchSolicitud[1];
    } else {
        for (let i = 0; i < lineas.length; i++) {
            if (/NRO\.?\s*DE?\s*SOLICITUD/i.test(lineas[i]) && i + 1 < lineas.length) {
                const siguiente = lineas[i + 1].match(/^(\d{6,10})$/);
                if (siguiente) { datos.numeroSolicitud = siguiente[1]; break; }
            }
        }
    }
    
    // DNI
    const matchDNI = textoUpper.match(/D\.?N\.?I\.?\s*(\d{8})/);
    if (matchDNI) {
        datos.dni = matchDNI[1];
    } else {
        for (let i = 0; i < lineas.length; i++) {
            const lineaUpper = lineas[i].toUpperCase();
            if (/D\.?N\.?I\.?|DOCUMENTO\s*DE\s*IDENTIDAD/i.test(lineaUpper)) {
                const matchEnLinea = lineas[i].match(/(\d{8})/);
                if (matchEnLinea) { datos.dni = matchEnLinea[1]; break; }
                if (i + 1 < lineas.length) {
                    const matchSiguiente = lineas[i + 1].match(/^(\d{8})$/);
                    if (matchSiguiente) { datos.dni = matchSiguiente[1]; break; }
                }
            }
        }
    }
    
    // NOMBRES Y APELLIDOS
    const matchNombres = textoUpper.match(/NOMBRE\s*Y\s*APELLIDOS\s*PACIENTE\s*([A-ZÑÁÉÍÓÚ\s]{10,60}?)(?=\s*NRO|\s*DOCUMENTO|\s*TIPO|\s*HISTORIA|$)/);
    if (matchNombres) {
        datos.nombres = matchNombres[1].trim().replace(/\s+/g, ' ');
    } else {
        for (let i = 0; i < lineas.length; i++) {
            const lineaUpper = lineas[i].toUpperCase();
            if (/NOMBRE\s*Y\s*APELLIDOS/i.test(lineaUpper)) {
                if (i + 1 < lineas.length) {
                    const nombreLinea = lineas[i + 1].toUpperCase();
                    if (/^[A-ZÑÁÉÍÓÚ\s]{10,60}$/.test(nombreLinea) && !/\d/.test(nombreLinea)) {
                        datos.nombres = nombreLinea.trim().replace(/\s+/g, ' ');
                        break;
                    }
                }
            }
        }
    }
    
    // EXAMEN SOLICITADO
    const matchExamen = textoUpper.match(/EXAMEN\s*RADIOLOGICO\s*DE\s*([^\n]{10,200}?)(?=\d{5}|\s*INDICACIONES|\s*INDICACIONE|\s*AREA|\s*RADIOLOGIA\s*DIAGNOSTICA|$)/);
    if (matchExamen) {
        datos.examen = 'EXAMEN RADIOLOGICO DE ' + matchExamen[1].trim().replace(/\s+/g, ' ');
    } else {
        const matchExamen2 = textoUpper.match(/(EXAMEN\s*RADIOLOGICO[^\n]{10,200})/);
        if (matchExamen2) datos.examen = matchExamen2[1].trim().replace(/\s+/g, ' ');
    }
    
    // NRO DE HISTORIA CLINICA
    const matchHistoria = textoUpper.match(/NRO\s*DE\s*HISTORIA\s*CLINICA\s*(\d{5,10})/);
    if (matchHistoria) {
        datos.numeroHistoria = matchHistoria[1];
    } else {
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
    
    return datos;
}

async function procesarPDF(file, callbacks) {
    callbacks = callbacks || {};
    const onProgress = callbacks.onProgress;
    const onComplete = callbacks.onComplete;
    const onError = callbacks.onError;

    try {
        console.log('=== INICIANDO PROCESAMIENTO OCR ===');
        console.log('Archivo:', file.name, 'Tipo:', file.type, 'Tamaño:', file.size);

        // ========== PASO 1: Intentar extraer texto nativo del PDF ==========
        if (onProgress) onProgress(5, 'Leyendo PDF...');

        let textoNativo = '';
        let usoTextoNativo = false;

        try {
            console.log('Intentando extracción nativa de texto...');
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            const textContent = await page.getTextContent();

            textoNativo = textContent.items.map(item => item.str).join('\n');
            console.log('Texto nativo extraído:', textoNativo.substring(0, 500));
            console.log('Items de texto:', textContent.items.length);

            if (textContent.items.length > 10 && textoNativo.length > 50) {
                usoTextoNativo = true;
                console.log('✅ Usando texto nativo del PDF (no necesita Tesseract)');
            } else {
                console.log('⚠️ Texto nativo insuficiente, usando Tesseract OCR...');
            }
        } catch (e) {
            console.log('❌ Error extrayendo texto nativo:', e.message);
            console.log('Usando Tesseract OCR como fallback...');
        }

        let resultadoTexto = '';
        let confianza = 0;
        let canvas = null;

        // ========== PASO 2: Si no hay texto nativo, usar Tesseract ==========
        if (!usoTextoNativo) {
            if (onProgress) onProgress(10, 'Convirtiendo PDF a imagen...');

            try {
                canvas = await pdfToCanvas(file);
                console.log('✅ PDF convertido a canvas:', canvas.width, 'x', canvas.height);
            } catch (e) {
                console.error('❌ Error convirtiendo PDF a canvas:', e);
                throw new Error('No se pudo convertir el PDF a imagen: ' + e.message);
            }

            if (onProgress) onProgress(20, 'Preprocesando imagen...');
            canvas = preprocesarImagen(canvas);

            if (onProgress) onProgress(30, 'Iniciando OCR (Tesseract)...');

            try {
                const resultadoOCR = await ejecutarOCR(canvas, function(pct) {
                    if (onProgress) onProgress(30 + Math.round(pct * 0.6), 'Leyendo documento... ' + pct + '%');
                });

                resultadoTexto = resultadoOCR.text;
                confianza = resultadoOCR.confidence;
                console.log('✅ Tesseract OCR completado. Confianza:', confianza);
                console.log('Texto OCR (primeros 500 chars):', resultadoTexto.substring(0, 500));
            } catch (e) {
                console.error('❌ Error en Tesseract OCR:', e);
                throw new Error('Error en OCR: ' + e.message);
            }
        } else {
            resultadoTexto = textoNativo;
            confianza = 95; // Alta confianza para texto nativo
            if (onProgress) onProgress(50, 'Texto nativo extraído...');
        }

        // ========== PASO 3: Parsear datos ==========
        if (onProgress) onProgress(80, 'Extrayendo datos...');

        console.log('=== TEXTO A PARSEAR ===');
        console.log(resultadoTexto);
        console.log('=======================');

        const datos = parsearDatosESSALUD(resultadoTexto);

        console.log('=== DATOS EXTRAÍDOS ===');
        console.log('N° Solicitud:', datos.numeroSolicitud);
        console.log('DNI:', datos.dni);
        console.log('Nombres:', datos.nombres);
        console.log('Historia:', datos.numeroHistoria);
        console.log('Examen:', datos.examen);
        console.log('=======================');

        // Calcular confianza real basada en datos encontrados
        let camposEncontrados = 0;
        if (datos.numeroSolicitud) camposEncontrados++;
        if (datos.dni) camposEncontrados++;
        if (datos.nombres) camposEncontrados++;
        if (datos.numeroHistoria) camposEncontrados++;

        const confianzaReal = usoTextoNativo ? 95 : (camposEncontrados > 0 ? Math.max(confianza, camposEncontrados * 25) : confianza);

        if (onProgress) onProgress(100, 'Datos extraídos!');

        const resultado = {
            datos: datos,
            textoCrudo: resultadoTexto,
            confianza: confianzaReal,
            canvas: canvas,
            usoTextoNativo: usoTextoNativo
        };

        console.log('=== RESULTADO FINAL ===');
        console.log('Confianza:', confianzaReal);
        console.log('Campos encontrados:', camposEncontrados);
        console.log('Usó texto nativo:', usoTextoNativo);

        if (onComplete) {
            onComplete(resultado);
        }

        return resultado;

    } catch (error) {
        console.error('=== ERROR EN PROCESAMIENTO OCR ===');
        console.error(error);
        console.error('===================================');

        if (onError) onError(error.message || 'Error desconocido en OCR');
        throw error;
    }
}

window.procesarPDF = procesarPDF;
window.parsearDatosESSALUD = parsearDatosESSALUD;
