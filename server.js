import express from 'express';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

// Cargar variables de entorno desde el archivo .env
dotenv.config();

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

// Endpoint POST para recibir el prompt
app.post('/api/generate', async (req, res) => {
    try {
        // Obtenemos el prompt, modelo a usar y un nombre de archivo opcional
        const { prompt, filename = 'respuesta', model = process.env.DEFAULT_MODEL || 'llama3' } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'El campo "prompt" es requerido.' });
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
            content: respuesta
        });

    } catch (error) {
        console.error('Error procesando la solicitud:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Error interno del servidor.'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
    console.log(`Endpoint disponible: POST http://localhost:${PORT}/api/generate`);
});
