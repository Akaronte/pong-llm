document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('ai-form');
    const promptInput = document.getElementById('prompt');
    const modelInput = document.getElementById('model');
    const filenameInput = document.getElementById('filename');
    const submitBtn = document.getElementById('submit-btn');
    const submitText = submitBtn.querySelector('span');
    const loader = document.getElementById('loader');

    const responseContainer = document.getElementById('response-container');
    const responseContent = document.getElementById('response-content');
    const fileBadge = document.getElementById('file-badge');

    const errorContainer = document.getElementById('error-container');
    const errorText = document.getElementById('error-text');

    // --- LÓGICA DE PESTAÑAS (TABS) ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Quitar clase active a todos
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Dar clase active al clickeado
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // --- LÓGICA DE TÉRMINAL DE LOGS (SSE) ---
    const logContainer = document.getElementById('log-container');

    // Conectar a la API de SSE
    const evtSource = new EventSource('/api/logs');

    evtSource.onmessage = function (event) {
        try {
            const data = JSON.parse(event.data);
            appendLog(data);
        } catch (e) {
            console.error("Error parseando log:", e);
        }
    };

    evtSource.onerror = function () {
        appendLog({ type: 'error', message: 'Conexión con el servidor de logs perdida. Reintentando...', source: 'System' });
    };

    function appendLog(logData) {
        const { type, message, timestamp, source } = logData;
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;

        const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

        entry.innerHTML = `<span class="log-time">[${timeStr}]</span> <span class="log-source">[${source}]</span> ${escapeHTML(message)}`;

        logContainer.appendChild(entry);

        // Auto-scroll al fondo
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>'"]/g,
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag])
        );
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Obtener los valores
        const prompt = promptInput.value.trim();
        const model = modelInput.value.trim();
        const filename = filenameInput.value.trim();

        if (!prompt) return;

        // 2. Preparar el body de la petición
        const payload = { prompt };
        if (model) payload.model = model;
        if (filename) payload.filename = filename;

        // 3. UI: Estado de carga
        setLoading(true);
        hideResponse();
        hideError();

        try {
            // 4. Hacer la petición a nuestro backend
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Ocurrió un error desconocido procesando la solicitud.');
            }

            // 5. Mostrar la respuesta exitosa
            showResponse(data.content, data.file);

        } catch (err) {
            // 6. Mostrar error si falla
            showError(err.message);
        } finally {
            // 7. UI: Quitar estado de carga
            setLoading(false);
        }
    });

    // Funciones de utilidad para la UI
    function setLoading(isLoading) {
        if (isLoading) {
            submitBtn.disabled = true;
            submitText.textContent = 'Generando...';
            loader.style.display = 'block';
        } else {
            submitBtn.disabled = false;
            submitText.textContent = 'Generar Respuesta';
            loader.style.display = 'none';
        }
    }

    function showResponse(markdown, filename) {
        // Usar marked para convertir markdown a HTML con seguridad básica
        responseContent.innerHTML = marked.parse(markdown);
        fileBadge.textContent = `💾 Guardado como ${filename}`;
        responseContainer.classList.remove('hidden');
    }

    function hideResponse() {
        responseContainer.classList.add('hidden');
        responseContent.innerHTML = '';
    }

    function showError(message) {
        errorText.textContent = message;
        errorContainer.classList.remove('hidden');
    }

    function hideError() {
        errorContainer.classList.add('hidden');
        errorText.textContent = '';
    }
});
