// --- Configuración de Supabase ---
const SUPABASE_URL = 'https://azlyezhhjdwtvqdgjuxo.supabase.co'; // Pega tu URL aquí
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6bHllemhoamR3dHZxZGdqdXhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMzMzgzOTEsImV4cCI6MjA1ODkxNDM5MX0.5Wt9cRD2CqheK5z2522kToQMI70dNhQIZ0zi33OGrHw'; // Pega tu clave Anon aquí

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Referencias a Elementos del DOM ---
const reactorGrid = document.getElementById('reactor-grid');
const reservationForm = document.getElementById('reservation-form');
const errorMessageDiv = document.getElementById('error-message');
const calendarEl = document.getElementById('calendar');
const exportButton = document.getElementById('export-button');

// --- Estado de la Aplicación (simple) ---
let positions = {}; // Guardaremos info de cada posición aquí { 0: {data}, 1: {data}, ... }
let calendarInstance = null;

// --- Funciones ---

// Función para mapear longitud de onda a color (¡MEJORAR ESTO!)
function wavelengthToColor(wl) {
    if (!wl) return '#f0f0f0'; // Gris por defecto
    if (wl >= 380 && wl < 450) return 'violet';
    if (wl >= 450 && wl < 495) return 'blue';
    if (wl >= 495 && wl < 570) return 'green';
    if (wl >= 570 && wl < 590) return 'yellow';
    if (wl >= 590 && wl < 620) return 'orange';
    if (wl >= 620 && wl < 750) return 'red';
    return '#f0f0f0'; // Gris si está fuera de rango visible
}

// ¡NUEVA FUNCIÓN! Para obtener eventos para FullCalendar
async function getCalendarEvents() {
    console.log("Obteniendo eventos para el calendario desde Supabase...");
    // Seleccionamos todas las columnas de todas las reservas
    const { data, error } = await supabase
        .from('reservations')
        .select('*'); // Traemos TODAS las reservas

    if (error) {
        console.error('Error fetching calendar events:', error);
        return []; // Devolvemos un array vacío si hay error
    }

    console.log(`Se encontraron ${data.length} reservas para el calendario.`);

    // Convertimos cada reserva al formato que FullCalendar necesita
    // https://fullcalendar.io/docs/event-object
    return data.map(res => {
        return {
            id: res.id, // ID único del evento (útil para futuras interacciones)
            title: `Pos ${res.position}: ${res.user_name} (${res.wavelength}nm)`, // Texto que se muestra en el evento
            start: res.start_time, // Fecha/Hora de inicio (Supabase nos da el formato correcto)
            end: res.end_time,     // Fecha/Hora de fin
            backgroundColor: wavelengthToColor(res.wavelength), // Color de fondo basado en la lambda
            borderColor: wavelengthToColor(res.wavelength),     // Color del borde
            // Podemos guardar datos originales por si los necesitamos al hacer click
            extendedProps: {
                position: res.position,
                user_name: res.user_name,
                wavelength: res.wavelength,
                description: res.description,
                // Guardamos las fechas originales por si acaso
                original_start: res.start_time,
                original_end: res.end_time
            }
        };
    });
}

// ¡NUEVA FUNCIÓN! Para crear o actualizar la instancia de FullCalendar
async function initializeOrUpdateCalendar() {
    console.log("Inicializando o actualizando el calendario...");
    const events = await getCalendarEvents(); // Obtenemos los eventos formateados

    if (!calendarInstance) {
        // Si el calendario NO existe todavía, lo creamos
        console.log("Creando nueva instancia de FullCalendar.");
        calendarInstance = new FullCalendar.Calendar(calendarEl, {
            // --- Configuración básica ---
            initialView: 'timeGridWeek', // Vista inicial: Semana con horas
            locale: 'es', // Usar el idioma español que incluimos
            headerToolbar: { // Botones de navegación del calendario
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' // Vistas disponibles
            },
            // --- Datos / Eventos ---
            events: events, // Le pasamos los eventos que obtuvimos de Supabase

            // --- Interactividad (Ejemplo) ---
             eventClick: function(info) {
                 // Se ejecuta cuando el usuario hace clic en un evento del calendario
                 console.log('Evento clickeado:', info.event);
                 // Reutilizamos la función showDetails que ya teníamos para el grid
                 // Pasamos los datos guardados en extendedProps
                 alert(`Detalles Reserva (Calendario):\n` +
                       `Posición: ${info.event.extendedProps.position}\n` +
                       `Usuario: ${info.event.extendedProps.user_name}\n` +
                       `Lambda: ${info.event.extendedProps.wavelength} nm\n` +
                       `Inicio: ${new Date(info.event.start).toLocaleString()}\n` +
                       `Fin: ${new Date(info.event.end).toLocaleString()}\n` +
                       `Descripción: ${info.event.extendedProps.description || '-'}`);
             },
             // Podríamos añadir más opciones: selectable para seleccionar rangos, etc.
             // Ver documentación de FullCalendar: https://fullcalendar.io/docs
        });
        // ¡Dibujamos el calendario por primera vez!
        calendarInstance.render();
    } else {
        // Si el calendario YA existe, solo actualizamos la lista de eventos
        console.log("Actualizando eventos en calendario existente.");
        // Quitamos todos los eventos actuales
        calendarInstance.removeAllEvents();
        // Añadimos los nuevos eventos (recién obtenidos de Supabase)
        calendarInstance.addEventSource(events);
    }
}

// Función para manejar cambios en tiempo real (MODIFICADA)
function handleRealtimeChanges(payload) {
    console.log('Cambio detectado en Supabase:', payload);

    // 1. Volver a renderizar el grid visual (como antes)
    renderGrid();

    // 2. ¡NUEVO! Actualizar también el calendario
    initializeOrUpdateCalendar();
}

// Función para renderizar el grid completo
async function renderGrid() {
    reactorGrid.innerHTML = ''; // Limpiar grid actual
    positions = {}; // Resetear estado local

    // Obtener reservas activas AHORA
    const now = new Date().toISOString();
    const { data: currentReservations, error } = await supabase
        .from('reservations')
        .select('*')
        .lte('start_time', now) // Que hayan empezado
        .gte('end_time', now);   // Y no hayan terminado

    if (error) {
        console.error('Error fetching current reservations:', error);
        return;
    }

    // Marcar posiciones ocupadas
    currentReservations.forEach(res => {
        positions[res.position] = { occupied: true, ...res };
    });

    // Crear los 16 círculos
    for (let i = 0; i < 16; i++) {
        const posDiv = document.createElement('div');
        posDiv.classList.add('reactor-position');
        posDiv.dataset.positionId = i; // Guardar el ID de la posición

        const positionState = positions[i];

        if (positionState?.occupied) {
            posDiv.classList.add('occupied');
            posDiv.style.backgroundColor = wavelengthToColor(positionState.wavelength);
            posDiv.innerHTML = `
                Pos ${i}<br>
                (${positionState.wavelength}nm)<br>
                <span class="tooltip">
                    Usuario: ${positionState.user_name}<br>
                    Fin: ${new Date(positionState.end_time).toLocaleString()}<br>
                    Desc: ${positionState.description || '-'}
                </span>
            `;
             // Añadir evento click para ver detalles/modificar (futuro)
            posDiv.addEventListener('click', () => showDetails(positionState));
        } else {
            posDiv.textContent = `Pos ${i} (Libre)`;
             // Añadir evento click para rellenar formulario de reserva
            posDiv.addEventListener('click', () => fillReservationForm(i));
        }
        reactorGrid.appendChild(posDiv);
    }
}

// Función para rellenar el form al hacer click en una posición libre
function fillReservationForm(positionId) {
     reservationForm.elements['position'].value = positionId;
     // Opcional: poner foco en el campo de usuario
     reservationForm.elements['user_name'].focus();
}

 // Función para mostrar detalles (simple alert por ahora)
function showDetails(reservationData) {
     alert(`Detalles Reserva Posición ${reservationData.position}:
         Usuario: ${reservationData.user_name}
         Longitud Onda: ${reservationData.wavelength} nm
         Inicio: ${new Date(reservationData.start_time).toLocaleString()}
         Fin: ${new Date(reservationData.end_time).toLocaleString()}
         Descripción: ${reservationData.description || '-'}`);
}

// Función para manejar el envío del formulario
async function handleReservationSubmit(event) {
    event.preventDefault(); // Evitar que la página se recargue
    errorMessageDiv.textContent = ''; // Limpiar errores previos

    const formData = new FormData(reservationForm);
    const reservationData = {
        position: parseInt(formData.get('position')),
        user_name: formData.get('user_name'),
        wavelength: parseInt(formData.get('wavelength')),
        start_time: new Date(formData.get('start_time')).toISOString(),
        end_time: new Date(formData.get('end_time')).toISOString(),
        description: formData.get('description')
    };

    // --- Validación Simple de Solapamiento (MEJORAR ESTO) ---
    const { data: existing, error: validationError } = await supabase
        .from('reservations')
        .select('id')
        .eq('position', reservationData.position) // Misma posición
        .lt('start_time', reservationData.end_time) // Que empiecen antes de que la nueva termine
        .gt('end_time', reservationData.start_time); // Y terminen después de que la nueva empiece

    if (validationError) {
         console.error('Error de validación:', validationError);
         errorMessageDiv.textContent = 'Error al validar la reserva.';
         return;
     }

    if (existing && existing.length > 0) {
         errorMessageDiv.textContent = `Error: La posición ${reservationData.position} ya está reservada en ese horario.`;
         return; // Detener si hay conflicto
    }
     // --- Fin Validación ---


    // Insertar en Supabase
    const { error: insertError } = await supabase
        .from('reservations')
        .insert([reservationData]);

    if (insertError) {
        console.error('Error inserting reservation:', insertError);
        errorMessageDiv.textContent = 'Error al guardar la reserva: ' + insertError.message;
    } else {
        console.log('Reserva creada:', reservationData);
        reservationForm.reset(); // Limpiar formulario
        // No necesitamos llamar a renderGrid() aquí si el tiempo real funciona
    }
}

// Función para manejar cambios en tiempo real
function handleRealtimeChanges(payload) {
    console.log('Cambio detectado:', payload);
    // Simplemente volvemos a renderizar todo el grid cuando algo cambia
    // Se podría optimizar para actualizar solo el elemento cambiado
    renderGrid();
    // También actualizar el calendario si ya está implementado
    // updateCalendar();
}

// ¡NUEVA FUNCIÓN! Para manejar la exportación a .ics
async function handleExport() {
    console.log("Iniciando exportación a .ics...");
    // Deshabilitar botón mientras se procesa (opcional, buena UX)
    exportButton.disabled = true;
    exportButton.textContent = 'Exportando...';

    // 1. Obtener TODAS las reservas de Supabase (similar a como hicimos para el calendario)
    const { data: reservationsToExport, error } = await supabase
        .from('reservations')
        .select('*') // Traer todas las reservas
        // Podríamos añadir filtros .order() si quisiéramos ordenarlas
        .order('start_time', { ascending: true });

    if (error || !reservationsToExport) {
        console.error('Error fetching data for export:', error);
        alert('Error: No se pudieron obtener los datos para exportar.');
        // Volver a habilitar el botón en caso de error
        exportButton.disabled = false;
        exportButton.textContent = 'Exportar a .ics';
        return; // Salir de la función si hay error
    }

    if (reservationsToExport.length === 0) {
         alert('No hay reservas para exportar.');
         exportButton.disabled = false;
         exportButton.textContent = 'Exportar a .ics';
         return;
    }

    console.log(`Se exportarán ${reservationsToExport.length} reservas.`);

    // 2. Crear una instancia del calendario con ics.js
    // ¡Asegúrate de que la librería ics() esté disponible globalmente!
    // Si usas módulos JS, tendrías que importarla: import * as ics from 'ics';
    try {
        const cal = ics(); // Llama a la función principal de la librería

        // 3. Añadir cada reserva como un evento al calendario
        reservationsToExport.forEach(res => {
            // Las fechas de Supabase (timestamptz) deben ser convertidas
            // a un formato que ics.js entienda (array [año, mes, dia, hora, minuto])
            // o simplemente pasarlas como objetos Date de JavaScript.
            // Usar objetos Date es más fácil.
            const startDate = new Date(res.start_time);
            const endDate = new Date(res.end_time);

            cal.addEvent(
                // Argumento 1: Título del evento
                `Pos ${res.position}: ${res.user_name} (${res.wavelength}nm)`,
                // Argumento 2: Descripción del evento
                res.description || 'Sin descripción adicional.',
                // Argumento 3: Ubicación (opcional)
                'Reactor Medusa Lab', // Puedes poner el nombre del lab o sala
                // Argumento 4: Fecha/Hora de inicio (como objeto Date)
                startDate,
                // Argumento 5: Fecha/Hora de fin (como objeto Date)
                endDate
                // Se pueden añadir más argumentos opcionales (URL, etc.)
            );
        });

        // 4. Iniciar la descarga del archivo .ics generado
        console.log("Generando y descargando archivo .ics...");
        // El nombre del archivo descargado será 'medusa_reactor_schedule.ics'
        cal.download('medusa_reactor_schedule');

    } catch (e) {
        console.error("Error al usar la librería ics.js:", e);
        alert("Ocurrió un error al generar el archivo .ics. Asegúrate de que la librería ics.js esté cargada correctamente.");
    } finally {
        // 5. Volver a habilitar el botón, haya éxito o error
         exportButton.disabled = false;
         exportButton.textContent = 'Exportar a .ics';
    }
}

// --- Inicialización y Suscripciones ---
// Renderizar el grid al cargar la página
renderGrid();

// Escuchar envíos del formulario
reservationForm.addEventListener('submit', handleReservationSubmit);

exportButton.addEventListener('click', handleExport);

// Suscribirse a cambios en tiempo real en la tabla 'reservations'
const channel = supabase.channel('public:reservations')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, handleRealtimeChanges)
    .subscribe();

console.log('Escuchando cambios en tiempo real...');

// Renderizar el grid al cargar la página
renderGrid();

// ¡NUEVO! Inicializar/Renderizar el calendario al cargar la página
initializeOrUpdateCalendar();

// Escuchar envíos del formulario
reservationForm.addEventListener('submit', handleReservationSubmit);

// Suscribirse a cambios en tiempo real...