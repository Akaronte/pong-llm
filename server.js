import express from 'express';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';

// Cargar variables de entorno desde el archivo .env
dotenv.config();

// Emisor de eventos global para los logs
const logEmitter = new EventEmitter();

// Guardar referencias a las funciones originales de console
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Interceptar console.log
console.log = (...args) => {
    // Convertir argumentos a string como lo haría node
    const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    // Emitir el log
    logEmitter.emit('newLog', { type: 'info', message, timestamp: new Date().toISOString(), source: 'Server' });
    // Llamar a la función original para seguir viéndolo en terminal
    originalConsoleLog.apply(console, args);
};

// Interceptar console.error
console.error = (...args) => {
    const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    logEmitter.emit('newLog', { type: 'error', message, timestamp: new Date().toISOString(), source: 'Server' });
    originalConsoleError.apply(console, args);
};

const app = express();
app.use(express.json());

// Servir la carpeta 'public' para el frontend
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// Inicializa el cliente (por defecto se conecta a Ollama local)
const openai = new OpenAI({
    baseURL: process.env.OPENAI_BASE_URL || 'http://localhost:11434/v1',
    apiKey: process.env.OPENAI_API_KEY || 'ollama' // La API key es requerida por el SDK pero Ollama la ignora
});

// Endpoint SSE para emitir los logs al frontend en tiempo real
app.get('/api/logs', (req, res) => {
    // Configurar cabeceras para Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Enviar algo inmediatamente para confirmar conexión
    res.write(`data: ${JSON.stringify({ type: 'sys', message: 'Conectado al stream de logs...', source: 'System' })}\n\n`);

    // Listener para cuando haya un nuevo log
    const logListener = (logData) => {
        res.write(`data: ${JSON.stringify(logData)}\n\n`);
    };

    logEmitter.on('newLog', logListener);

    // Limpiar al desconectarse el cliente
    req.on('close', () => {
        logEmitter.off('newLog', logListener);
    });
});

// Función para verificar la conexión con el LLM
async function checkLLMConnection() {
    try {
        console.log(`[Verificación] Intentando conectar con el LLM en ${openai.baseURL}...`);
        await openai.models.list(); // Funciona tanto para OpenAI como para la mayoría de endpoints compatibles (incluyendo Ollama v1)
        console.log(`✅ [Verificación] Conexión exitosa con el endpoint del LLM.`);
        return true;
    } catch (error) {
        console.error(`❌ [Verificación] Error conectando con el LLM:`, error.message);
        console.error(`   Asegúrate de que el servidor en ${openai.baseURL} está ejecutándose.`);
        return false;
    }
}

// Endpoint POST para recibir logs de backend-pong u otros servicios internos
app.post('/api/internal-logs', (req, res) => {
    const { type, message, source } = req.body;
    if (message) {
        // Emitir el log recibido a los clientes web a través del EventEmitter
        logEmitter.emit('newLog', {
            type: type || 'info',
            message,
            timestamp: new Date().toISOString(),
            source: source || 'External'
        });
        res.status(200).send('Log received');
    } else {
        res.status(400).send('Message is required');
    }
});

// Endpoint POST para recibir el prompt
app.post('/api/generate', async (req, res) => {
    try {
        // Obtenemos el prompt, modelo a usar y un nombre de archivo opcional
        const { prompt, filename = 'respuesta', model = process.env.DEFAULT_MODEL || 'gemma3:12b' } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'El campo "prompt" es requerido.' });
        }

        console.log(`Verificando existencia del modelo "${model}"...`);
        // Verificar que el modelo a usar existe en la lista de modelos del servidor
        try {
            const modelsList = await openai.models.list();
            const modelExists = modelsList.data.some(m => m.id === model);

            if (!modelExists) {
                const availableModels = modelsList.data.map(m => m.id).join(', ');
                console.error(`❌ [Error] El modelo "${model}" no está disponible. Modelos disponibles: ${availableModels}`);
                return res.status(404).json({
                    success: false,
                    error: `El modelo "${model}" no está disponible en el servidor. Modelos instalados: ${availableModels}`
                });
            }
        } catch (error) {
            console.error(`⚠️ [Aviso] No se pudo verificar la lista de modelos, procediendo bajo riesgo:`, error.message);
        }

        console.log(`Enviando prompt al modelo "${model}": "${prompt}"...`);

        // Llamada a la API (compatible con OpenAI y Ollama)
        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: model,
        });

        const respuesta = completion.choices[0].message.content;

        // Limpiar el nombre del archivo y asegurarse de que termine en .md
        const safeFilename = filename.endsWith('.md') ? filename : `${filename}.md`;

        // Generar un nombre de archivo único añadiendo un timestamp
        const outputFilename = `${Date.now()}-${safeFilename}`;

        // Crear ruta absoluta almacenando en la carpeta "output"
        const outputPath = path.resolve(process.cwd(), 'output', outputFilename);

        // Asegurarse de que el directorio "output" existe
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        // Guardar la respuesta obtenida en el archivo .md
        await fs.writeFile(outputPath, respuesta, 'utf-8');

        console.log(`Respuesta guardada exitosamente en ${outputPath}`);

        // Responder al cliente
        return res.status(200).json({
            success: true,
            message: 'Generado y guardado correctamente.',
            file: outputFilename,
            content: respuesta,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Error procesando la solicitud:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Error interno del servidor.'
        });
    }
});

// Endpoint GET para obtener la última respuesta generada
app.get('/api/latest-output', async (req, res) => {
    try {
        const outputDir = path.resolve(process.cwd(), 'output');

        // Verificar si existe el directorio
        try {
            await fs.access(outputDir);
        } catch {
            return res.status(404).json({ success: false, error: 'No hay respuestas generadas aún.' });
        }

        const files = await fs.readdir(outputDir);

        // Filtrar solo archivos .md y ordenar por fecha de modificación (más reciente primero)
        const mdFiles = files.filter(f => f.endsWith('.md'));

        if (mdFiles.length === 0) {
            return res.status(404).json({ success: false, error: 'No hay respuestas generadas aún.' });
        }

        // Obtener estadísticas de todos los archivos para ordenarlos por fecha de creación/modificación
        const filesWithStats = await Promise.all(
            mdFiles.map(async (filename) => {
                const filePath = path.join(outputDir, filename);
                const stats = await fs.stat(filePath);
                return {
                    filename,
                    filePath,
                    mtime: stats.mtimeMs // Usar tiempo de modificación
                };
            })
        );

        // Ordenar del más nuevo al más viejo
        filesWithStats.sort((a, b) => b.mtime - a.mtime);

        // Coger el más reciente
        const latestFile = filesWithStats[0];

        const content = await fs.readFile(latestFile.filePath, 'utf-8');

        return res.status(200).json({
            success: true,
            file: latestFile.filename,
            content: content,
            timestamp: latestFile.mtime
        });

    } catch (error) {
        console.error('Error leyendo la última respuesta:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Error interno del servidor leyendo archivos.'
        });
    }
});

app.listen(PORT, async () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
    console.log(`Endpoint disponible: POST http://localhost:${PORT}/api/generate`);

    // Ejecutar verificación inicial extendida de LLM
    await checkLLMConnection();
});
