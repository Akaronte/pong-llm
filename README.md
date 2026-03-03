# LLM Backend

Este es un backend en Node.js (Express) que expone un endpoint para enviar un prompt a un LLM local (Ollama) o a la API de OpenAI, y guardar la respuesta automáticamente en la carpeta `output/` como un archivo `.md`.

## Instalación

1. Asegúrate de tener [Node.js](https://nodejs.org/) instalado.
2. Abre la terminal en esta carpeta y ejecuta el comando para instalar las dependencias:
   ```bash
   npm install
   ```
3. Renombra o copia el archivo `.env.example` a `.env` y configura tus opciones. Por defecto está preparado para funcionar con **Ollama** de forma local.

## Uso con Ollama (Por defecto)
Asegúrate de tener [Ollama](https://ollama.com/) corriendo en tu ordenador con un modelo descargado, por ejemplo, `llama3`:
```bash
ollama run llama3
```
Si usas otro modelo (como `mistral`, `phi3`, etc.), puedes cambiar la variable `DEFAULT_MODEL` en tu archivo `.env`.

## Uso con OpenAI
Si quieres usar OpenAI en lugar de Ollama local, modifica tu archivo `.env`:
```env
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxx
DEFAULT_MODEL=gpt-3.5-turbo
```

## Iniciar el servidor

Puedes iniciar el servidor con:
```bash
npm start
```
El servidor se ejecutará por defecto en `http://localhost:3000`.

**Ejecuta también el backend Pong**
En una segunda terminal, ejecuta el siguiente comando para iniciar el proceso que vigila los archivos Markdown:
```bash
npm run pong
```
Este proceso enviará los prompts generados al backend principal y mostrará logs en tiempo real en la pestaña de logs del frontend.

## Uso del Endpoint

Puedes consumir tu API haciendo una petición POST al endpoint `/api/generate`.

### Ejemplo de petición usando cURL:

```bash
curl -X POST http://localhost:3000/api/generate \
-H "Content-Type: application/json" \
-d '{
    "prompt": "Escribe un breve artículo sobre los agujeros negros.",
    "filename": "agujeros-negros",
    "model": "llama3"
}'
```
*(Nota: El parámetro `"model"` es opcional, si no se envía utilizará el modelo de la variable `DEFAULT_MODEL`).*

Una vez procesada la petición, el backend la guardará autómaticamente en la carpeta `output/` en un archivo con formato `.md` (ejemplo: `1712061234567-agujeros-negros.md`).
