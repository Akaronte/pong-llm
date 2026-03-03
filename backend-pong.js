import fs from 'fs/promises';
import { watch } from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const openai = new OpenAI({
    baseURL: process.env.OPENAI_BASE_URL || 'http://localhost:11434/v1',
    apiKey: process.env.OPENAI_API_KEY || 'ollama' // La API key es ignorada por Ollama
});

const outputDir = path.resolve(process.cwd(), 'output');
const processedFiles = new Set();

async function startPong() {
    // Asegurarse de que el directorio output existe antes de vigilar
    await fs.mkdir(outputDir, { recursive: true });

    console.log('======================================================');
    console.log('🤖 BACKEND PONG INICIADO');
    console.log(`📂 Vigilando nuevos archivos .md en: ${outputDir}`);
    console.log('======================================================\n');

    watch(outputDir, async (eventType, filename) => {
        // En Windows/Linux un archivo nuevo suele emitir un evento de 'rename' o 'change'
        if (filename && filename.endsWith('.md') && !processedFiles.has(filename)) {
            processedFiles.add(filename); // Registrar para no procesar el mismo archivo múltiples veces

            // Pequeña espera para asegurar que el sistema operativo haya terminado de escribir el archivo
            setTimeout(async () => {
                try {
                    const filePath = path.join(outputDir, filename);
                    const content = await fs.readFile(filePath, 'utf-8');

                    console.log(`\n🏓 [Backend Pong] 📄 Nuevo archivo modificado/creado: ${filename}`);
                    console.log(`🏓 [Backend Pong] 🧠 Leyendo contenido y pensando el siguiente prompt...\n`);

                    const model = process.env.DEFAULT_MODEL || 'llama3';

                    // Pedimos al LLM que lea el documento y plantee un follow-up prompt
                    const completion = await openai.chat.completions.create({
                        messages: [
                            {
                                role: "system",
                                content: "Eres el 'Backend Pong'. Tu tarea es leer un documento o texto, y generar UNA SOLA PREGUNTA O PROMPT de seguimiento muy interesante y desafiante relacionada con el texto. Responde SOLAMENTE con la pregunta/prompt a enviar a otro LLM, sin explicaciones, sin comillas y sin texto adicional."
                            },
                            {
                                role: "user",
                                content: `Documento a analizar:\n\n${content.substring(0, 3000)}` // Limitamos para no desbordar el contexto
                            }
                        ],
                        model: model,
                    });

                    let newPrompt = completion.choices[0].message.content.trim();

                    console.log(`========================= PROMPT GENERADO =========================`);
                    console.log(newPrompt);
                    console.log(`===================================================================\n`);
                    console.log(`🚀 [Backend Pong] Enviando petición a Backend Principal (Esperando 3 seg para ser natural)...`);

                    // Esperamos unos segundos para que se vea el ping-pong claramente en consola
                    setTimeout(async () => {
                        try {
                            const response = await fetch('http://localhost:3000/api/generate', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    prompt: newPrompt,
                                    filename: `pong-reply-${Date.now()}`, // Nombre con timestamp
                                    model: model
                                })
                            });

                            if (!response.ok) {
                                console.error('❌ [Backend Pong] Error enviando el prompt al backend principal. ¿Está encendido el servidor?');
                            } else {
                                console.log('✅ [Backend Pong] Prompt enviado exitosamente. ¡A esperar el siguiente round!');
                            }
                        } catch (err) {
                            console.error('❌ [Backend Pong] Error de red conectando al servidor principal (¿está en http://localhost:3000?):', err.message);
                        }
                    }, 3000);

                } catch (error) {
                    // Ignorar errores si hay lectura antes de que se guarde el archivo del todo
                    if (error.code !== 'ENOENT') {
                        console.error(`❌ [Backend Pong] Error procesando el archivo ${filename}:`, error.message);
                    }
                }
            }, 1000);
        }
    });
}

startPong();
