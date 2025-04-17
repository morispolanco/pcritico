// api/generate-exercise.js

// Accede a la clave API desde las variables de entorno configuradas en Vercel
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Construye la URL aquí para evitar reconstruirla en cada llamada
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// Función principal exportada que Vercel ejecutará
export default async function handler(request, response) {

    // 1. Configurar Headers CORS (permisivo ya que se sirve desde el mismo dominio Vercel)
    //    Aunque sea el mismo dominio, es buena práctica incluirlos para OPTIONS.
    response.setHeader('Access-Control-Allow-Origin', '*'); // O tu dominio Vercel específico si prefieres
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 2. Manejar solicitud OPTIONS (preflight CORS)
    if (request.method === 'OPTIONS') {
        response.status(204).end(); // 204 No Content
        return;
    }

    // 3. Asegurarse que sea método POST
    if (request.method !== 'POST') {
        response.setHeader('Allow', ['POST']);
        response.status(405).json({ error: 'Método no permitido. Usa POST.' });
        return;
    }

    // 4. Verificar si la clave API está configurada en Vercel
    if (!GEMINI_API_KEY) {
        console.error("FATAL: GEMINI_API_KEY no está configurada en las variables de entorno de Vercel.");
        response.status(500).json({ error: 'Error de configuración del servidor (falta clave API).' });
        return;
    }

    // 5. Lógica para generar el prompt
    const exerciseTypes = [
        "identificar una falacia lógica común (ej. ad hominem, hombre de paja, falsa dicotomía, apelación a la autoridad, pendiente resbaladiza, generalización precipitada)",
        "evaluar la fortaleza o debilidad de la evidencia presentada en un argumento corto",
        "identificar la suposición principal (premisa no declarada) en un razonamiento",
        "distinguir entre hechos objetivos y opiniones o juicios de valor",
        "identificar un posible sesgo cognitivo (ej. sesgo de confirmación, anclaje) implícito en una afirmación",
        "evaluar la relevancia de una pieza de información para una conclusión dada",
        "determinar si una conclusión se sigue lógicamente de las premisas dadas",
        "analizar la estructura de un argumento simple (identificar premisas y conclusión)"
    ];
    const chosenType = exerciseTypes[Math.floor(Math.random() * exerciseTypes.length)];
    const prompt = `
    Eres un asistente experto en lógica y pensamiento crítico. Tu tarea es crear un ejercicio conciso para evaluar la habilidad de ${chosenType}.

    Genera UN ejercicio que incluya:
    1.  Un argumento, escenario o afirmación corta (1-4 frases).
    2.  Una pregunta clara y directa sobre ese texto, relacionada con el tipo de ejercicio (${chosenType}).
    3.  Cuatro (4) opciones de respuesta de selección múltiple. Solo UNA debe ser la respuesta correcta. Las otras tres deben ser distractores plausibles pero incorrectos.
    4.  La indicación del índice (basado en 0) de la opción correcta.
    5.  Una explicación breve pero clara (1-3 frases) de por qué la opción correcta es la mejor y, opcionalmente, por qué los distractores comunes son incorrectos.

    IMPORTANTE: Responde únicamente con un objeto JSON válido que siga esta estructura exacta. No incluyas texto introductorio, comentarios, ni marques el JSON con \`\`\`json ... \`\`\`.

    {{
      "argument": "string",
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correct_option_index": integer,
      "explanation": "string"
    }}

    Ejemplo de cómo debe ser tu respuesta (¡NO uses este contenido exacto, crea uno nuevo!):
    {{
      "argument": "El informe sobre el cambio climático fue financiado por una compañía petrolera. Por lo tanto, sus conclusiones sobre la baja influencia humana deben ser ignoradas.",
      "question": "¿Qué falacia se comete principalmente al descartar el informe basándose únicamente en su fuente de financiación?",
      "options": [
        "Falacia del hombre de paja",
        "Falacia ad hominem (circunstancial)",
        "Apelación a la ignorancia",
        "Falsa causa"
      ],
      "correct_option_index": 1,
      "explanation": "Se comete una falacia ad hominem circunstancial al atacar la fuente del argumento (su financiación) en lugar de evaluar la calidad de la evidencia o el razonamiento del informe mismo."
    }}

    Genera un ejercicio nuevo y único enfocado en '${chosenType}'. Asegúrate de que el JSON sea sintácticamente correcto.
    `;

    // 6. Construir el payload para la API de Gemini
    const requestPayload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.75, // Un poco más variado
            "maxOutputTokens": 700 // Margen extra por si acaso
         },
         "safetySettings": [ // Mantener filtros de seguridad
             { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
             { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
             { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
             { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" }
         ]
    };

    // 7. Llamar a la API de Gemini y procesar la respuesta
    try {
        console.log(`Llamando a Gemini para tipo: ${chosenType}`);
        const geminiResponse = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
        });

        console.log("Respuesta de Gemini recibida. Status:", geminiResponse.status);

        // --- INICIO CORRECCIÓN: Procesar respuesta completa de Gemini ---
        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.text(); // Leer cuerpo para detalles
            console.error(`Error de la API de Gemini (${geminiResponse.status}):`, errorBody);
            let errorMsg = `Error ${geminiResponse.status} de la API de Gemini.`;
            try {
                const errorJson = JSON.parse(errorBody);
                if (errorJson?.error?.message) { errorMsg = errorJson.error.message; }
                else if (errorJson?.message) { errorMsg = errorJson.message; }
            } catch (e) { /* Ignorar si no es JSON */ }
            if (errorBody.includes("SAFETY") || errorBody.includes("blockReason")) {
                errorMsg += " (Posible bloqueo por filtros de seguridad o contenido)";
            }
            throw new Error(errorMsg);
        }

        // Si es OK, parsear la respuesta COMPLETA de Gemini como JSON
        const geminiData = await geminiResponse.json();
        console.log("Datos JSON completos de Gemini recibidos."); // Log simplificado

        // Extraer el texto relevante que CONTIENE el JSON del ejercicio
        // Añadir verificaciones más robustas
        if (!geminiData.candidates || !Array.isArray(geminiData.candidates) || geminiData.candidates.length === 0) {
             console.error("Respuesta de Gemini sin 'candidates' válidos:", geminiData);
             throw new Error("La respuesta de la API no contiene candidatos válidos.");
        }

        const candidate = geminiData.candidates[0];

         // Verificar si fue bloqueado por seguridad u otro motivo
         if (candidate.finishReason && candidate.finishReason !== "STOP") {
             console.warn(`Gemini terminó con razón: ${candidate.finishReason}. Revisar safetyRatings si existen.`);
             if (candidate.safetyRatings) {
                 console.warn("Safety Ratings:", candidate.safetyRatings);
             }
             // Podrías lanzar un error aquí si finishReason no es STOP, dependiendo de tu caso de uso
             // throw new Error(`Generación detenida por Gemini. Razón: ${candidate.finishReason}`);
         }


        if (!candidate.content || !candidate.content.parts || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0 || !candidate.content.parts[0].text) {
            console.error("Estructura de respuesta de Gemini inesperada (faltan partes de contenido):", geminiData);
             // Revisar feedback del prompt si existe
            if (geminiData.promptFeedback && geminiData.promptFeedback.blockReason) {
                 throw new Error(`Solicitud bloqueada por Gemini. Razón: ${geminiData.promptFeedback.blockReason}`);
            }
            throw new Error("Formato de respuesta inesperado de la API de Gemini.");
        }

        let generatedText = candidate.content.parts[0].text;
        console.log("Texto crudo extraído:", generatedText.substring(0, 100) + "..."); // Loguear inicio

        // Limpiar los ```json ... ``` de ESTE TEXTO EXTRAÍDO
        generatedText = generatedText.trim();
        if (generatedText.startsWith("```json")) {
            generatedText = generatedText.substring(7).replace(/```$/, '').trim();
        } else if (generatedText.startsWith("```")) {
             generatedText = generatedText.substring(3).replace(/```$/, '').trim();
        }
         console.log("Texto limpiado para parsear:", generatedText.substring(0, 100) + "...");

        // --- FIN CORRECCIÓN ---

        // 8. Parsear y validar el JSON del ejercicio (el que estaba dentro de 'text')
        try {
            const exerciseData = JSON.parse(generatedText); // Parsear el string que contiene el ejercicio
            console.log("JSON del ejercicio parseado con éxito.");

            // Validación robusta de la estructura final
            if (!exerciseData || typeof exerciseData.argument !== 'string' || !exerciseData.argument ||
                typeof exerciseData.question !== 'string' || !exerciseData.question ||
                !Array.isArray(exerciseData.options) || exerciseData.options.length !== 4 ||
                !exerciseData.options.every(opt => typeof opt === 'string' && opt) || // Opciones no vacías
                typeof exerciseData.correct_option_index !== 'number' ||
                exerciseData.correct_option_index < 0 || exerciseData.correct_option_index >= 4 ||
                typeof exerciseData.explanation !== 'string' || !exerciseData.explanation)
            {
                console.error("El JSON del ejercicio parseado no cumple la estructura esperada:", exerciseData);
                throw new Error("El formato del JSON generado por la IA es incorrecto o incompleto.");
            }

             // 9. Devolver el ejercicio parseado al frontend
             console.log("Devolviendo ejercicio válido al frontend.");
             response.status(200).json(exerciseData); // Enviar el objeto ejercicio

        } catch (parseError) {
             // Este catch ahora maneja errores al parsear el JSON *interno*
             console.error("Error al parsear JSON del ejercicio extraído:", parseError);
             console.error("Texto que falló el parseo:", generatedText); // Loguear texto problemático
             // Devolver un error más específico
             throw new Error(`No se pudo interpretar el texto de la IA como JSON de ejercicio válido. Inicio: ${generatedText.substring(0,100)}...`);
        }

    } catch (error) {
        // Este catch maneja errores de red, errores de Gemini (no OK),
        // o errores lanzados durante la extracción/parseo interno.
        console.error("Error final en la ejecución de la función serverless:", error);
        // Enviar el mensaje de error específico al cliente si es posible
        response.status(500).json({ error: error.message || 'Ocurrió un error interno en el servidor.' });
    }
} // Fin del handler exportado
