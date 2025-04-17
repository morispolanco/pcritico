// api/generate-exercise.js

// Accede a la clave API desde las variables de entorno configuradas en Vercel
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Construye la URL aquí para evitar reconstruirla en cada llamada
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// Función principal exportada que Vercel ejecutará
export default async function handler(request, response) {

    // 1. Configurar Headers CORS (permisivo ya que se sirve desde el mismo dominio Vercel)
    response.setHeader('Access-Control-Allow-Origin', '*');
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

    // 7. Llamar a la API de Gemini
    try {
        console.log(`Llamando a Gemini para tipo: ${chosenType}`);
        const geminiResponse = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
        });

        console.log("Respuesta de Gemini recibida. Status:", geminiResponse.status);
        const responseBody = await geminiResponse.text(); // Leer como texto para depurar

        if (!geminiResponse.ok) {
            console.error(`Error de la API de Gemini (${geminiResponse.status}):`, responseBody);
            let errorMsg = `Error ${geminiResponse.status} de la API de Gemini.`;
            try {
                 const errorJson = JSON.parse(responseBody);
                 // Extraer mensaje de error específico si existe
                 if (errorJson && errorJson.error && errorJson.error.message) {
                     errorMsg = errorJson.error.message;
                 } else if (errorJson && errorJson.message) { // A veces el error está en .message
                     errorMsg = errorJson.message;
                 }
            } catch (e) { /* Ignorar si el cuerpo de error no es JSON */ }
            // Añadir info si fue bloqueo de seguridad
            if (responseBody.includes("SAFETY")) {
                errorMsg += " (Posible bloqueo por filtros de seguridad)";
            }
            throw new Error(errorMsg);
        }

        // Si la respuesta es OK, intentar parsear como JSON
        console.log("Datos crudos de Gemini (OK):", responseBody.substring(0, 300) + "..."); // Loguear solo el inicio
        let generatedText = responseBody.trim();

         // Limpieza robusta del JSON (quitar ```json ... ``` o solo ``` ... ```)
        if (generatedText.startsWith("```json")) {
            generatedText = generatedText.substring(7).replace(/```$/, '').trim();
        } else if (generatedText.startsWith("```")) {
            generatedText = generatedText.substring(3).replace(/```$/, '').trim();
        }

        // 8. Parsear y validar el JSON del ejercicio
        try {
            const exerciseData = JSON.parse(generatedText);
            console.log("JSON parseado:", exerciseData);

            // Validación robusta
            if (!exerciseData || typeof exerciseData.argument !== 'string' || !exerciseData.argument ||
                typeof exerciseData.question !== 'string' || !exerciseData.question ||
                !Array.isArray(exerciseData.options) || exerciseData.options.length !== 4 ||
                !exerciseData.options.every(opt => typeof opt === 'string' && opt) ||
                typeof exerciseData.correct_option_index !== 'number' ||
                exerciseData.correct_option_index < 0 || exerciseData.correct_option_index >= 4 ||
                typeof exerciseData.explanation !== 'string' || !exerciseData.explanation)
            {
                console.error("El JSON parseado no cumple la estructura esperada:", exerciseData);
                throw new Error("El formato del JSON generado por la IA es incorrecto o incompleto.");
            }


             // 9. Devolver el ejercicio al frontend
             console.log("Devolviendo ejercicio válido al frontend.");
             response.status(200).json(exerciseData); // Enviar el objeto JSON

        } catch (parseError) {
             console.error("Error al parsear JSON del ejercicio:", parseError);
             console.error("Texto que falló el parseo:", generatedText);
             throw new Error(`No se pudo interpretar la respuesta de la IA como JSON válido. Inicio: ${generatedText.substring(0,100)}...`);
        }

    } catch (error) {
        console.error("Error en la ejecución de la función serverless:", error);
        // Enviar error genérico al cliente
        response.status(500).json({ error: error.message || 'Ocurrió un error interno en el servidor.' });
    }
}
