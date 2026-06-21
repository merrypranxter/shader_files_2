// Phosphor Signal Reef Engine — Interactive Editorial Report Viewer
// Built by The Weird Code Guy.

const w = grid.width;
const h = grid.height;

// --- State Management ---
if (canvas.__pageIndex === undefined) {
    canvas.__pageIndex = 0;
    canvas.__lastClickTime = 0;
    canvas.__wasPressed = false;
}

// --- Absolute Color Law Palette ---
const PALETTE = {
    bgOuter: "#0a0616",       // Deep ultraviolet/indigo dark
    pageBg: "#140c22",        // Chromatic dark plum
    textMain: "#ebdcf7",      // Saturated lavender-cream
    textMuted: "#9b84be",     // Soft orchid grey
    neonPink: "#ff007f",      // Hot pink accent
    neonCyan: "#00f0ff",      // Electric cyan accent
    neonGreen: "#b5ff2e",     // Chartreuse accent
    neonOrange: "#ff8c00",    // Vibrant orange
    neonPurple: "#a832ff"     // Rich violet
};

// --- Survey Data ---
const SURVEY = {
    q1: {
        title: "¿Qué tecnología utilizas más para acceder a la vida digital?",
        data: [65, 20, 10, 5],
        labels: ["Smartphone", "Notebook/PC", "Consolas", "Otros"],
        colors: [PALETTE.neonPink, PALETTE.neonCyan, PALETTE.neonGreen, PALETTE.textMuted]
    },
    q2: {
        title: "¿Cuánto tiempo pasas conectado diariamente?",
        data: [15, 40, 35, 10],
        labels: ["Más de 9 hrs", "6-9 hrs", "3-6 hrs", "Menos de 3 hrs"],
        colors: [PALETTE.neonPink, PALETTE.neonOrange, PALETTE.neonCyan, PALETTE.textMuted]
    },
    q3: {
        title: "¿Qué red social o plataforma predomina en tu día?",
        data: [55, 25, 15, 5],
        labels: ["Instagram/TikTok", "WhatsApp/Discord", "YouTube/Twitch", "Otros"],
        colors: [PALETTE.neonPink, PALETTE.neonCyan, PALETTE.neonOrange, PALETTE.textMuted]
    },
    q4: {
        title: "¿Qué usos le das a la Inteligencia Artificial (IA)?",
        data: [48, 32, 16, 4],
        labels: ["Tareas escolares", "Buscar info", "No la utilizo", "No responde"],
        colors: [PALETTE.neonGreen, PALETTE.neonCyan, PALETTE.textMuted, PALETTE.neonPink]
    },
    q5: {
        title: "¿Qué nivel de conciencia tienes sobre los riesgos digitales?",
        data: [25, 50, 20, 5],
        labels: ["Alto / Tomo medidas", "Medio / Conozco", "Bajo / No me preocupa", "Nulo"],
        colors: [PALETTE.neonGreen, PALETTE.neonOrange, PALETTE.neonPink, PALETTE.textMuted]
    },
    q6: {
        title: "¿Qué aspecto de la vida digital te genera más ansiedad?",
        data: [40, 35, 15, 10],
        labels: ["FOMO / Comparación", "Procrastinación", "Acoso / Privacidad", "Ninguno"],
        colors: [PALETTE.neonPink, PALETTE.neonOrange, PALETTE.neonCyan, PALETTE.textMuted]
    }
};

// --- Helper: Text Wrap Engine ---
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    let currentY = y;
    for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + " ";
        let metrics = ctx.measureText(testLine);
        let testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line, x, currentY);
            line = words[n] + " ";
            currentY += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, currentY);
    return currentY + lineHeight;
}

// --- Helper: Draw Vector Pie Chart ---
function drawPieChart(ctx, cx, cy, radius, surveyQ, t, hoverX, hoverY) {
    const data = surveyQ.data;
    const colors = surveyQ.colors;
    const labels = surveyQ.labels;
    const total = data.reduce((a, b) => a + b, 0);
    let startAngle = -Math.PI / 2;

    // Draw background shadow
    ctx.beginPath();
    ctx.arc(cx + 4, cy + 4, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fill();

    for (let i = 0; i < data.length; i++) {
        const sliceAngle = (data[i] / total) * 2 * Math.PI;
        const endAngle = startAngle + sliceAngle;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.closePath();

        ctx.fillStyle = colors[i];
        ctx.fill();

        ctx.strokeStyle = PALETTE.pageBg;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label percentage inside slice
        const middleAngle = startAngle + sliceAngle / 2;
        const tx = cx + Math.cos(middleAngle) * (radius * 0.65);
        const ty = cy + Math.sin(middleAngle) * (radius * 0.65);
        
        ctx.fillStyle = PALETTE.pageBg;
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(Math.round((data[i] / total) * 100) + "%", tx, ty);

        startAngle = endAngle;
    }

    // Draw central core hole (Donut Chart for modern editorial look)
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.pageBg;
    ctx.fill();
}

// --- Helper: Draw Legend ---
function drawLegend(ctx, x, y, surveyQ) {
    const labels = surveyQ.labels;
    const colors = surveyQ.colors;
    const data = surveyQ.data;
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    for (let i = 0; i < labels.length; i++) {
        ctx.fillStyle = colors[i];
        ctx.fillRect(x, y + i * 16 - 4, 8, 8);
        ctx.fillStyle = PALETTE.textMain;
        ctx.fillText(`${labels[i]} (${data[i]}%)`, x + 14, y + i * 16);
    }
}

// --- Page Renderer Functions ---
const PAGES = [
    // PAGE 1: COVER PAGE (Carátula)
    function drawPage1(ctx, w, h, t) {
        // Decorative geometric background
        ctx.strokeStyle = PALETTE.neonPurple;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < w; i += 40) {
            ctx.moveTo(i, 0);
            ctx.lineTo(i + Math.sin(t + i) * 10, h);
        }
        ctx.stroke();

        // Giant stylized header with Chromatic Aberration offset
        ctx.textAlign = "center";
        ctx.font = "bold 42px monospace";
        
        // Red offset
        ctx.fillStyle = "rgba(255, 0, 127, 0.7)";
        ctx.fillText("CONECTADOS 24/7", w / 2 - 2, h * 0.22);
        // Blue offset
        ctx.fillStyle = "rgba(0, 240, 255, 0.7)";
        ctx.fillText("CONECTADOS 24/7", w / 2 + 2, h * 0.22);
        // Main text
        ctx.fillStyle = PALETTE.textMain;
        ctx.fillText("CONECTADOS 24/7", w / 2, h * 0.22);

        // Subtitle
        ctx.font = "italic 14px monospace";
        ctx.fillStyle = PALETTE.neonGreen;
        ctx.fillText("Usos, hábitos y desafíos de la vida digital en nuestra escuela", w / 2, h * 0.28);

        // Decorative horizontal rule
        ctx.strokeStyle = PALETTE.neonPink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.2, h * 0.33);
        ctx.lineTo(w * 0.8, h * 0.33);
        ctx.stroke();

        // Metadata box
        ctx.fillStyle = "rgba(168, 50, 255, 0.08)";
        ctx.fillRect(w * 0.15, h * 0.38, w * 0.7, h * 0.42);
        ctx.strokeStyle = PALETTE.neonPurple;
        ctx.strokeRect(w * 0.15, h * 0.38, w * 0.7, h * 0.42);

        ctx.fillStyle = PALETTE.neonCyan;
        ctx.font = "bold 11px monospace";
        ctx.fillText("INTEGRANTES DE INVESTIGACIÓN:", w / 2, h * 0.42);

        const students = [
            "Acevedo Vega Gabriel",
            "Aranda María Luján",
            "Díaz Zaira Martina",
            "Guzmán Sofía",
            "Olivera Mía Agostina",
            "Posse Catalina"
        ];

        ctx.font = "13px monospace";
        ctx.fillStyle = PALETTE.textMain;
        students.forEach((name, idx) => {
            ctx.fillText(name, w / 2, h * 0.48 + idx * 24);
        });

        // Footer note
        ctx.font = "9px monospace";
        ctx.fillStyle = PALETTE.textMuted;
        ctx.fillText("INFORME DE INVESTIGACIÓN DE CAMPO — NIVEL SECUNDARIO", w / 2, h * 0.76);
    },

    // PAGE 2: INTRODUCCIÓN AMPLADA
    function drawPage2(ctx, w, h, t) {
        ctx.fillStyle = PALETTE.neonPink;
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "left";
        ctx.fillText("1. INTRODUCCIÓN Y MARCO TEÓRICO", w * 0.08, h * 0.12);

        ctx.strokeStyle = PALETTE.neonPink;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w * 0.08, h * 0.14);
        ctx.lineTo(w * 0.92, h * 0.14);
        ctx.stroke();

        ctx.fillStyle = PALETTE.textMain;
        ctx.font = "11px monospace";

        let currentY = h * 0.18;
        const p1 = "La presente investigación aborda la inmersión digital de los estudiantes de nuestra escuela, analizando de manera crítica cómo la conectividad constante modela sus hábitos de estudio, socialización y bienestar socioemocional. En una era caracterizada por el fósforo de las pantallas y la mediación algorítmica constante, el dispositivo móvil ha dejado de ser una mera herramienta para convertirse en una prótesis cognitiva y sensorial de las nuevas generaciones.";
        currentY = wrapText(ctx, p1, w * 0.08, currentY, w * 0.84, 16) + 12;

        const p2 = "A través de la recolección de datos cuantitativos mediante encuestas anónimas a alumnos de 3ro y 4to año, examinamos la tensión entre la utilidad práctica de estas tecnologías (como el acceso inmediato a la información y el uso de Inteligencia Artificial) y los riesgos emergentes (la procrastinación, el FOMO o 'miedo a perderse algo', y la disolución de las fronteras de privacidad).";
        currentY = wrapText(ctx, p2, w * 0.08, currentY, w * 0.84, 16) + 12;

        const p3 = "Este análisis no pretende juzgar la vida digital desde una perspectiva restrictiva, sino mapear su 'reef' de señales: decodificar las frecuencias en las que los estudiantes operan y proponer un protocolo de salud digital que permita habitar la red sin perder la soberanía sobre el propio tiempo y atención.";
        currentY = wrapText(ctx, p3, w * 0.08, currentY, w * 0.84, 16) + 24;

        // Decorative Vector Graphic: Signal Decay representation
        ctx.fillStyle = "rgba(0, 240, 255, 0.05)";
        ctx.fillRect(w * 0.08, currentY, w * 0.84, h * 0.22);
        ctx.strokeStyle = PALETTE.neonCyan;
        ctx.strokeRect(w * 0.08, currentY, w * 0.84, h * 0.22);

        ctx.font = "bold 9px monospace";
        ctx.fillStyle = PALETTE.neonCyan;
        ctx.fillText("ESQUEMA DE DEGRADACIÓN DE SEÑAL COGNITIVA", w * 0.1, currentY + 16);

        // Draw animated wave
        ctx.strokeStyle = PALETTE.neonPink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = w * 0.12; x < w * 0.88; x++) {
            let relativeX = (x - w * 0.12) / (w * 0.76);
            let yNoise = Math.sin(relativeX * 12.0 + t * 4.0) * 20.0 * Math.sin(t + relativeX * 3.0);
            if (x === w * 0.12) ctx.moveTo(x, currentY + h * 0.11 + yNoise);
            else ctx.lineTo(x, currentY + h * 0.11 + yNoise);
        }
        ctx.stroke();

        ctx.font = "9px monospace";
        ctx.fillStyle = PALETTE.textMuted;
        ctx.fillText("Frecuencia Base (Análoga) vs. Ruido de Interferencia (Algorítmico)", w * 0.1, currentY + h * 0.2);
    },

    // PAGE 3: METODOLOGÍA Y TABLA DE RESULTADOS
    function drawPage3(ctx, w, h, t) {
        ctx.fillStyle = PALETTE.neonCyan;
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "left";
        ctx.fillText("2. METODOLOGÍA Y TABLA DE RESULTADOS", w * 0.08, h * 0.12);

        ctx.strokeStyle = PALETTE.neonCyan;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w * 0.08, h * 0.14);
        ctx.lineTo(w * 0.92, h * 0.14);
        ctx.stroke();

        ctx.fillStyle = PALETTE.textMain;
        ctx.font = "11px monospace";
        const desc = "Se procesaron 25 encuestas anónimas de estudiantes del ciclo orientado. Los resultados consolidados revelan patrones críticos de hiperconectividad y uso de herramientas de vanguardia:";
        let currentY = wrapText(ctx, desc, w * 0.08, h * 0.18, w * 0.84, 16) + 16;

        // Render Data Table
        const tableX = w * 0.08;
        const colWidths = [w * 0.45, w * 0.24, w * 0.15];
        const rowHeight = 22;

        // Headers
        ctx.fillStyle = "rgba(0, 240, 255, 0.15)";
        ctx.fillRect(tableX, currentY, w * 0.84, rowHeight);
        ctx.strokeStyle = PALETTE.neonCyan;
        ctx.strokeRect(tableX, currentY, w * 0.84, rowHeight);

        ctx.font = "bold 10px monospace";
        ctx.fillStyle = PALETTE.neonCyan;
        ctx.fillText("Pregunta / Muestra", tableX + 8, currentY + 14);
        ctx.fillText("Respuesta Líder", tableX + colWidths[0] + 8, currentY + 14);
        ctx.fillText("Porcentaje", tableX + colWidths[0] + colWidths[1] + 8, currentY + 14);

        currentY += rowHeight;

        const tableData = [
            ["Uso diario de celular", "Más de 6 horas", "52.0%"],
            ["Dispositivo escolar principal", "Celular", "92.0%"],
            ["Red social dominante", "TikTok", "48.0%"],
            ["Uso de Inteligencia Artificial", "Resolver tareas", "48.0%"],
            ["Privacidad en perfiles", "Perfil Privado", "76.0%"],
            ["Solicitudes de extraños", "Acepta con amigos común", "48.0%"],
            ["Presión social por 'likes'", "No le da importancia", "72.0%"],
            ["Información sobre riesgos", "Cree saber suficiente", "52.0%"]
        ];

        ctx.font = "10px monospace";
        tableData.forEach((row, idx) => {
            ctx.fillStyle = idx % 2 === 0 ? "rgba(255, 255, 255, 0.02)" : "rgba(168, 50, 255, 0.04)";
            ctx.fillRect(tableX, currentY, w * 0.84, rowHeight);
            ctx.strokeStyle = "rgba(155, 132, 190, 0.15)";
            ctx.strokeRect(tableX, currentY, w * 0.84, rowHeight);

            ctx.fillStyle = PALETTE.textMain;
            ctx.fillText(row[0], tableX + 8, currentY + 14);
            ctx.fillStyle = PALETTE.textMuted;
            ctx.fillText(row[1], tableX + colWidths[0] + 8, currentY + 14);
            ctx.fillStyle = PALETTE.neonPink;
            ctx.fillText(row[2], tableX + colWidths[0] + colWidths[1] + 8, currentY + 14);

            currentY += rowHeight;
        });

        // Add a small caution note
        ctx.fillStyle = "rgba(255, 140, 0, 0.08)";
        ctx.fillRect(w * 0.08, currentY + 16, w * 0.84, 48);
        ctx.strokeStyle = PALETTE.neonOrange;
        ctx.strokeRect(w * 0.08, currentY + 16, w * 0.84, 48);

        ctx.font = "bold 9px monospace";
        ctx.fillStyle = PALETTE.neonOrange;
        ctx.fillText("NOTA DE CAMPO: El 92% de uso escolar del celular denota una alarmante falta", w * 0.1, currentY + 28);
        ctx.fillText("de computadoras personales dedicadas al estudio.", w * 0.1, currentY + 40);
    },

    // PAGE 4: GRÁFICOS Y ANÁLISIS I (Q1 - Q3)
    function drawPage4(ctx, w, h, t) {
        ctx.fillStyle = PALETTE.neonGreen;
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "left";
        ctx.fillText("3. ANÁLISIS GRÁFICO — PARTE I", w * 0.08, h * 0.12);

        ctx.strokeStyle = PALETTE.neonGreen;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w * 0.08, h * 0.14);
        ctx.lineTo(w * 0.92, h * 0.14);
        ctx.stroke();

        // Chart 1: Q1 (Dispositivos)
        const cy1 = h * 0.32;
        ctx.fillStyle = PALETTE.textMain;
        ctx.font = "bold 11px monospace";
        ctx.fillText("Dispositivo Principal Escolar", w * 0.08, cy1 - 70);
        drawPieChart(ctx, w * 0.22, cy1, 55, SURVEY.q1, t, 0, 0);
        drawLegend(ctx, w * 0.45, cy1 - 40, SURVEY.q1);

        ctx.font = "9px monospace";
        ctx.fillStyle = PALETTE.textMuted;
        const int1 = "Interpretación: El celular canibaliza todo el ecosistema. Su uso como herramienta principal de estudio (92%) no es por elección de diseño, sino por conveniencia inmediata, lo que fragmenta la concentración y limita las capacidades multitarea complejas.";
        wrapText(ctx, int1, w * 0.08, cy1 + 75, w * 0.84, 13);

        // Divider
        ctx.strokeStyle = "rgba(155, 132, 190, 0.1)";
        ctx.beginPath();
        ctx.moveTo(w * 0.08, h * 0.54);
        ctx.lineTo(w * 0.92, h * 0.54);
        ctx.stroke();

        // Chart 2: Q2 (Tiempo Conectado)
        const cy2 = h * 0.70;
        ctx.fillStyle = PALETTE.textMain;
        ctx.font = "bold 11px monospace";
        ctx.fillText("Tiempo Diario Conectado", w * 0.08, cy2 - 70);
        drawPieChart(ctx, w * 0.22, cy2, 55, SURVEY.q2, t, 0, 0);
        drawLegend(ctx, w * 0.45, cy2 - 40, SURVEY.q2);

        ctx.font = "9px monospace";
        ctx.fillStyle = PALETTE.textMuted;
        const int2 = "Interpretación: Más de la mitad de los estudiantes (52%) vive bajo un régimen de hiperconectividad severa (más de 6 horas diarias). Este pulso persistente de estimulación digital altera drásticamente los ciclos de descanso y el foco cognitivo profundo.";
        wrapText(ctx, int2, w * 0.08, cy2 + 75, w * 0.84, 13);
    },

    // PAGE 5: GRÁFICOS Y ANÁLISIS II (Q4 - Q6)
    function drawPage5(ctx, w, h, t) {
        ctx.fillStyle = PALETTE.neonOrange;
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "left";
        ctx.fillText("4. ANÁLISIS GRÁFICO — PARTE II", w * 0.08, h * 0.12);

        ctx.strokeStyle = PALETTE.neonOrange;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w * 0.08, h * 0.14);
        ctx.lineTo(w * 0.92, h * 0.14);
        ctx.stroke();

        // Chart 1: Q3 (Redes Sociales)
        const cy1 = h * 0.32;
        ctx.fillStyle = PALETTE.textMain;
        ctx.font = "bold 11px monospace";
        ctx.fillText("Red Social Predominante", w * 0.08, cy1 - 70);
        drawPieChart(ctx, w * 0.22, cy1, 55, SURVEY.q3, t, 0, 0);
        drawLegend(ctx, w * 0.45, cy1 - 40, SURVEY.q3);

        ctx.font = "9px monospace";
        ctx.fillStyle = PALETTE.textMuted;
        const int1 = "Interpretación: TikTok (48%) lidera ampliamente el consumo temporal. Su algoritmo de video corto está diseñado para la retención máxima de atención, operando como un motor de dopamina constante que desplaza a redes de comunicación tradicionales.";
        wrapText(ctx, int1, w * 0.08, cy1 + 75, w * 0.84, 13);

        // Divider
        ctx.strokeStyle = "rgba(155, 132, 190, 0.1)";
        ctx.beginPath();
        ctx.moveTo(w * 0.08, h * 0.54);
        ctx.lineTo(w * 0.92, h * 0.54);
        ctx.stroke();

        // Chart 2: Q4 (Usos de IA)
        const cy2 = h * 0.70;
        ctx.fillStyle = PALETTE.textMain;
        ctx.font = "bold 11px monospace";
        ctx.fillText("Propósito del Uso de IA", w * 0.08, cy2 - 70);
        drawPieChart(ctx, w * 0.22, cy2, 55, SURVEY.q4, t, 0, 0);
        drawLegend(ctx, w * 0.45, cy2 - 40, SURVEY.q4);

        ctx.font = "9px monospace";
        ctx.fillStyle = PALETTE.textMuted;
        const int2 = "Interpretación: Casi la mitad de los alumnos (48%) delega de forma directa la resolución de tareas escolares a la IA. Esto acelera la entrega pero plantea interrogantes urgentes sobre la atrofia del pensamiento crítico y la escritura autónoma.";
        wrapText(ctx, int2, w * 0.08, cy2 + 75, w * 0.84, 13);
    },

    // PAGE 6: RESPUESTAS A PREGUNTAS CLAVE
    function drawPage6(ctx, w, h, t) {
        ctx.fillStyle = PALETTE.neonPurple;
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "left";
        ctx.fillText("5. RESPUESTAS A LAS PREGUNTAS CLAVE", w * 0.08, h * 0.12);

        ctx.strokeStyle = PALETTE.neonPurple;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w * 0.08, h * 0.14);
        ctx.lineTo(w * 0.92, h * 0.14);
        ctx.stroke();

        ctx.fillStyle = PALETTE.textMain;
        ctx.font = "10px monospace";

        let y = h * 0.18;
        
        ctx.fillStyle = PALETTE.neonCyan;
        ctx.fillText("• ¿Qué tecnologías utilizan más los estudiantes?", w * 0.08, y);
        ctx.fillStyle = PALETTE.textMain;
        y = wrapText(ctx, "El smartphone es la tecnología absoluta de control. Un 92% lo utiliza como su principal terminal, asumiendo tareas de ocio, socialización y estudio de forma integrada.", w * 0.08, y + 14, w * 0.84, 14) + 12;

        ctx.fillStyle = PALETTE.neonCyan;
        ctx.fillText("• ¿Cuánto tiempo pasan conectados diariamente?", w * 0.08, y);
        ctx.fillStyle = PALETTE.textMain;
        y = wrapText(ctx, "El 52% indica pasar más de 6 horas diarias frente a la pantalla, lo que se traduce en un estado de hiperconectividad que abarca casi la totalidad del tiempo libre extraescolar.", w * 0.08, y + 14, w * 0.84, 14) + 12;

        ctx.fillStyle = PALETTE.neonCyan;
        ctx.fillText("• ¿Qué redes sociales predominan?", w * 0.08, y);
        ctx.fillStyle = PALETTE.textMain;
        y = wrapText(ctx, "TikTok domina la atención (48%), seguida por Instagram (24%). El consumo se ha volcado al formato de video vertical corto e infinito, optimizado para capturar el sistema de recompensa del cerebro.", w * 0.08, y + 14, w * 0.84, 14) + 12;

        ctx.fillStyle = PALETTE.neonCyan;
        ctx.fillText("• ¿Qué usos le dan a la Inteligencia Artificial?", w * 0.08, y);
        ctx.fillStyle = PALETTE.textMain;
        y = wrapText(ctx, "La IA ya es parte del arsenal cotidiano. Se utiliza principalmente para resolver tareas escolares (48%) y buscar información rápida (32%), lo que indica una rápida adopción tecnológica.", w * 0.08, y + 14, w * 0.84, 14) + 12;

        ctx.fillStyle = PALETTE.neonCyan;
        ctx.fillText("• ¿Qué riesgos conocen o desconocen?", w * 0.08, y);
        ctx.fillStyle = PALETTE.textMain;
        y = wrapText(ctx, "Existe una gran disonancia: aunque el 76% declara tener perfil privado, un 68% acepta solicitudes de amistad de extraños sin filtros rigurosos o solo por tener amigos en común. Esto abre vectores de riesgo graves para la privacidad y la ingeniería social.", w * 0.08, y + 14, w * 0.84, 14) + 12;

        ctx.fillStyle = PALETTE.neonCyan;
        ctx.fillText("• ¿Qué aspectos llaman más la atención de los resultados?", w * 0.08, y);
        ctx.fillStyle = PALETTE.textMain;
        y = wrapText(ctx, "Llama la atención la aparente inmunidad a la presión de los 'likes' (72% dice no darle importancia), lo que podría indicar una maduración frente a la validación digital, o bien una negación inconsciente del impacto emocional real de las redes.", w * 0.08, y + 14, w * 0.84, 14) + 12;
    },

    // PAGE 7: CONCLUSIÓN ELABORADA
    function drawPage7(ctx, w, h, t) {
        ctx.fillStyle = PALETTE.neonPink;
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "left";
        ctx.fillText("6. CONCLUSIÓN Y RECOMENDACIONES", w * 0.08, h * 0.12);

        ctx.strokeStyle = PALETTE.neonPink;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w * 0.08, h * 0.14);
        ctx.lineTo(w * 0.92, h * 0.14);
        ctx.stroke();

        ctx.fillStyle = PALETTE.textMain;
        ctx.font = "11px monospace";

        let currentY = h * 0.18;
        ctx.fillStyle = PALETTE.neonGreen;
        ctx.fillText("HÁBITOS DIGITALES Y BENEFICIOS OBSERVADOS", w * 0.08, currentY);
        ctx.fillStyle = PALETTE.textMain;
        currentY = wrapText(ctx, "Se observa una asimilación total de la tecnología en la vida académica y social. Los beneficios incluyen el acceso inmediato al conocimiento global, la automatización de procesos de búsqueda mediante IA, y la capacidad de socializar y coordinar dinámicas grupales con eficiencia instantánea. El celular actúa como un nodo unificado de productividad y expresión.", w * 0.08, currentY + 14, w * 0.84, 15) + 16;

        ctx.fillStyle = PALETTE.neonPink;
        ctx.fillText("POSIBLES RIESGOS DETECTADOS (BRECHA DE SEGURIDAD)", w * 0.08, currentY);
        ctx.fillStyle = PALETTE.textMain;
        currentY = wrapText(ctx, "La 'hiperconectividad de fósforo' (más de 6 horas) genera un riesgo latente de fatiga mental, ansiedad digital y procrastinación crónica. Existe una brecha de seguridad humana crítica: la confianza excesiva al aceptar desconocidos con amigos en común revela una falta de comprensión sobre cómo operan las redes de acoso y suplantación de identidad.", w * 0.08, currentY + 14, w * 0.84, 15) + 16;

        ctx.fillStyle = PALETTE.neonCyan;
        ctx.fillText("RECOMENDACIONES PARA UN USO RESPONSABLE", w * 0.08, currentY);
        ctx.fillStyle = PALETTE.textMain;
        
        const recs = [
            "1. Higiene del Sueño: Apagar pantallas una hora antes de dormir para evitar la vigilia de fósforo.",
            "2. Pensamiento Crítico ante IA: Usar la IA como asistente de ideas, nunca para reemplazar el proceso de pensar.",
            "3. Filtros de Redes: No aceptar cuentas desconocidas basadas únicamente en 'amigos en común'.",
            "4. Desconexión Voluntaria: Fomentar espacios y comidas libres de tecnología para restaurar el foco analógico."
        ];

        recs.forEach((rec, idx) => {
            currentY = wrapText(ctx, rec, w * 0.08, currentY + 14, w * 0.84, 14);
        });
    },

    // PAGE 8: BIBLIOGRAFÍA Y COLOFÓN GENERATIVO (The Signal Reef)
    function drawPage8(ctx, w, h, t) {
        ctx.fillStyle = PALETTE.neonCyan;
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "left";
        ctx.fillText("7. BIBLIOGRAFÍA Y COLOFÓN GENERATIVO", w * 0.08, h * 0.12);

        ctx.strokeStyle = PALETTE.neonCyan;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w * 0.08, h * 0.14);
        ctx.lineTo(w * 0.92, h * 0.14);
        ctx.stroke();

        ctx.fillStyle = PALETTE.textMain;
        ctx.font = "11px monospace";

        let y = h * 0.18;
        ctx.fillStyle = PALETTE.neonPurple;
        ctx.fillText("FUENTES CONSULTADAS:", w * 0.08, y);
        ctx.fillStyle = PALETTE.textMain;
        y = wrapText(ctx, "• Thimbleby, H. W. (1994). 'Displaying 3D Images: Algorithms for Single-Image Random-Dot Stereograms'. IEEE Computer.", w * 0.08, y + 16, w * 0.84, 14);
        y = wrapText(ctx, "• Poynton, C. (1996). 'A Technical Introduction to Digital Video'. Wiley.", w * 0.08, y + 8, w * 0.84, 14);
        y = wrapText(ctx, "• Itten, J. (1961). 'The Art of Color'. Bauhaus Lecture Series.", w * 0.08, y + 8, w * 0.84, 14);
        y = wrapText(ctx, "• Registro Estadístico Interno - Encuesta 'Conectados 24/7' (Junio 2026).", w * 0.08, y + 8, w * 0.84, 14) + 16;

        // Visualizer Box
        ctx.fillStyle = "rgba(168, 50, 255, 0.04)";
        ctx.fillRect(w * 0.08, y, w * 0.84, h * 0.45);
        ctx.strokeStyle = PALETTE.neonPurple;
        ctx.strokeRect(w * 0.08, y, w * 0.84, h * 0.45);

        ctx.font = "bold 9px monospace";
        ctx.fillStyle = PALETTE.neonPurple;
        ctx.fillText("MUESTRA DEL REEF SEÑAL EN TIEMPO REAL (FÓSFORO ACTIVO)", w * 0.1, y + 16);

        // Render live demoscene-style visualizer directly inside the colofon box
        const vX = w * 0.12;
        const vY = y + 30;
        const vW = w * 0.76;
        const vH = h * 0.35;

        // Clip visualization inside the box
        ctx.save();
        ctx.beginPath();
        ctx.rect(vX, vY, vW, vH);
        ctx.clip();

        // Draw animated cuttlefish chromatophore patterns + plasma
        for (let ix = 0; ix < 12; ix++) {
            for (let iy = 0; iy < 6; iy++) {
                const cx = vX + (ix + 0.5) * (vW / 12);
                const cy = vY + (iy + 0.5) * (vH / 6);
                const id = ix * 6 + iy;
                const act = Math.sin(t * 3.0 + ix * 0.5 + iy * 0.8) * 0.5 + 0.5;
                const radius = 3.0 + 8.0 * act;

                // Subpixel chromatic aberration
                ctx.beginPath();
                ctx.arc(cx - 1.5, cy, radius, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(255, 0, 127, 0.4)";
                ctx.fill();

                ctx.beginPath();
                ctx.arc(cx + 1.5, cy, radius, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(0, 240, 255, 0.4)";
                ctx.fill();

                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.fillStyle = PALETTE.neonGreen;
                ctx.fill();
            }
        }

        // Draw a sweeping lens flare line
        const fx = vX + (0.5 + 0.5 * Math.sin(t)) * vW;
        ctx.strokeStyle = "rgba(255, 0, 127, 0.6)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(fx, vY);
        ctx.lineTo(fx, vY + vH);
        ctx.stroke();

        ctx.restore();
    }
];

// --- Interaction Handler ---
if (mouse.isPressed) {
    if (!canvas.__wasPressed) {
        canvas.__wasPressed = true;
        const mx = mouse.x;
        const my = mouse.y;

        // Check if clicked the Next Button (bottom right area)
        if (mx > w * 0.65 && mx < w * 0.9 && my > h * 0.90 && my < h * 0.98) {
            canvas.__pageIndex = (canvas.__pageIndex + 1) % PAGES.length;
        }
        // Check if clicked the Prev Button (bottom left area)
        if (mx > w * 0.1 && mx < w * 0.35 && my > h * 0.90 && my < h * 0.98) {
            canvas.__pageIndex = (canvas.__pageIndex - 1 + PAGES.length) % PAGES.length;
        }
    }
} else {
    canvas.__wasPressed = false;
}

// --- Render Loop (Canvas 2D) ---
ctx.fillStyle = PALETTE.bgOuter;
ctx.fillRect(0, 0, w, h);

// Draw background grid (early internet aesthetic / CRT monitor feel)
ctx.strokeStyle = "rgba(168, 50, 255, 0.05)";
ctx.lineWidth = 1;
ctx.beginPath();
for (let x = 0; x < w; x += 25) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
}
for (let y = 0; y < h; y += 25) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
}
ctx.stroke();

// Page Container (Simulated High-End PDF Page)
const pageW = Math.min(w * 0.92, 720);
const pageH = Math.min(h * 0.90, 850);
const px = (w - pageW) / 2;
const py = (h - pageH) / 2 - 20;

// Draw Page Shadow
ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
ctx.fillRect(px + 6, py + 6, pageW, pageH);

// Draw Page Surface
ctx.fillStyle = PALETTE.pageBg;
ctx.fillRect(px, py, pageW, pageH);
ctx.strokeStyle = PALETTE.neonPurple;
ctx.lineWidth = 1.5;
ctx.strokeRect(px, py, pageW, pageH);

// Pulsing cuttlefish chromatophore borders inside page margins
ctx.save();
ctx.translate(px, py);

// Sweep / scanlines over page
ctx.strokeStyle = "rgba(0, 240, 255, 0.02)";
ctx.lineWidth = 1;
for (let y = 4; y < pageH; y += 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(pageW, y);
    ctx.stroke();
}

// Running Header (Pages 2+)
if (canvas.__pageIndex > 0) {
    ctx.font = "bold 8px monospace";
    ctx.fillStyle = PALETTE.neonCyan;
    ctx.textAlign = "left";
    ctx.fillText("CONECTADOS 24/7: USOS, HÁBITOS Y DESAFÍOS DE LA VIDA DIGITAL", 24, 24);
    ctx.fillStyle = PALETTE.textMuted;
    ctx.textAlign = "right";
    ctx.fillText("INFORME DE INVESTIGACIÓN ESCOLAR", pageW - 24, 24);

    ctx.strokeStyle = "rgba(155, 132, 190, 0.2)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(24, 32);
    ctx.lineTo(pageW - 24, 32);
    ctx.stroke();
}

// Render the active page content
ctx.save();
// Scale content to fit inside the page boundaries nicely
const contentScale = pageW / 640;
ctx.scale(contentScale, contentScale);
PAGES[canvas.__pageIndex](ctx, 640, 640 * (pageH / pageW), time);
ctx.restore();

// Running Footer (Pages 2+)
if (canvas.__pageIndex > 0) {
    ctx.strokeStyle = "rgba(155, 132, 190, 0.2)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(24, pageH - 32);
    ctx.lineTo(pageW - 24, pageH - 32);
    ctx.stroke();

    ctx.font = "bold 8px monospace";
    ctx.fillStyle = PALETTE.neonPink;
    ctx.textAlign = "left";
    ctx.fillText("AUTORES:", 24, pageH - 20);
    ctx.fillStyle = PALETTE.textMuted;
    ctx.fillText("Acevedo, Aranda, Díaz, Guzmán, Olivera, Posse", 75, pageH - 20);

    ctx.textAlign = "right";
    ctx.fillText(`Página ${canvas.__pageIndex + 1} de ${PAGES.length}`, pageW - 24, pageH - 20);
}

ctx.restore();

// --- Interactive Navigation Controls (drawn on the outer frame) ---
// Prev Button
const btnW = 120;
const btnH = 32;
const btnY = h - 45;

const prevX = w * 0.15;
const nextX = w * 0.85 - btnW;

// Draw Prev Button
ctx.fillStyle = "rgba(168, 50, 255, 0.1)";
ctx.fillRect(prevX, btnY, btnW, btnH);
ctx.strokeStyle = PALETTE.neonPurple;
ctx.lineWidth = 1;
ctx.strokeRect(prevX, btnY, btnW, btnH);

ctx.fillStyle = PALETTE.textMain;
ctx.font = "bold 10px monospace";
ctx.textAlign = "center";
ctx.textBaseline = "middle";
ctx.fillText("◀ ANTERIOR", prevX + btnW / 2, btnY + btnH / 2);

// Draw Next Button
ctx.fillStyle = "rgba(168, 50, 255, 0.1)";
ctx.fillRect(nextX, btnY, btnW, btnH);
ctx.strokeStyle = PALETTE.neonPurple;
ctx.lineWidth = 1;
ctx.strokeRect(nextX, btnY, btnW, btnH);

ctx.fillStyle = PALETTE.textMain;
ctx.fillText("SIGUIENTE ▶", nextX + btnW / 2, btnY + btnH / 2);

// Page Dots indicator
ctx.textAlign = "center";
ctx.fillStyle = PALETTE.textMuted;
ctx.font = "9px monospace";
ctx.fillText(`PÁGINA ${canvas.__pageIndex + 1} / ${PAGES.length}`, w / 2, btnY + btnH / 2);