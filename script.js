// Envolvemos TODO en DOMContentLoaded para asegurar que el HTML y las librerías (idealmente) estén listas
document.addEventListener('DOMContentLoaded', (event) => {
    console.log('EVENTO: DOMContentLoaded disparado.');

    // --- Configuración de Supabase ---
    const SUPABASE_URL = 'https://azlyezhhjdwtvqdgjuxo.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6bHllemhoamR3dHZxZGdqdXhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMzMzgzOTEsImV4cCI6MjA1ODkxNDM5MX0.5Wt9cRD2CqheK5z2522kToQMI70dNhQIZ0zi33OGrHw';

    // Declaramos la variable para el cliente aquí, pero la inicializamos dentro del if
    let supabaseClient = null;

    // --- VERIFICACIÓN DE LA LIBRERÍA SUPABASE ---
    console.log("Verificando si la librería 'supabase' global existe...");
    console.log("Tipo de window.supabase:", typeof window.supabase);
    // console.log("Valor de window.supabase:", window.supabase); // Descomentar si necesitas ver el objeto

    // Usamos el objeto global 'supabase' que debería crear la librería del CDN
    if (typeof supabase !== 'undefined' && typeof supabase.createClient === 'function') {
        console.log("VERIFICACIÓN: ¡Éxito! supabase.createClient está disponible.");

        // --- CREACIÓN DEL CLIENTE SUPABASE ---
        try {
            // Usamos el objeto 'supabase' global para crear nuestro cliente específico
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log("Cliente Supabase ('supabaseClient') creado:", supabaseClient ? 'OK' : 'FALLÓ');

            // --- Si la creación falla, detenemos aquí ---
            if (!supabaseClient) {
                 throw new Error("La creación del cliente Supabase devolvió null.");
            }

        } catch (error) {
            console.error("¡ERROR CRÍTICO al crear el cliente Supabase!", error);
            const errorDiv = document.getElementById('error-message'); // Intentar obtener div de error
            if(errorDiv) errorDiv.textContent = "Error crítico al inicializar la conexión. Intente refrescar.";
            return; // Detener la ejecución si no se puede crear el cliente
        }

        // --- Referencias a Elementos del DOM ---
        // Es más seguro obtenerlas aquí, después de que el DOM esté listo
        const reactorGrid = document.getElementById('reactor-grid');
        const reservationForm = document.getElementById('reservation-form');
        const errorMessageDiv = document.getElementById('error-message');
        const calendarEl = document.getElementById('calendar');
        const exportButton = document.getElementById('export-button');

        // Verificar si los elementos principales existen
        if (!reactorGrid || !reservationForm || !errorMessageDiv || !calendarEl || !exportButton) {
             console.error("¡Error crítico! No se encontraron todos los elementos HTML necesarios (reactor-grid, reservation-form, etc.). Verifica los IDs en index.html.");
             if(errorMessageDiv) errorMessageDiv.textContent = "Error: Faltan elementos en la página.";
             return; // Detener si faltan elementos clave
        }


        // --- Estado de la Aplicación ---
        let positions = {};
        let calendarInstance = null;

        // --- Funciones ---
        // (Todas las definiciones de funciones van aquí DENTRO del if,
        //  ya que dependen de supabaseClient y las referencias del DOM)

        function wavelengthToColor(wl) {
            // Convertir a número por si acaso viene como string
            const wavelengthNum = parseInt(wl);
            if (isNaN(wavelengthNum)) return '#f0f0f0'; // Gris si no es número

            if (wavelengthNum >= 380 && wavelengthNum < 450) return 'violet';
            if (wavelengthNum >= 450 && wavelengthNum < 495) return 'blue';
            if (wavelengthNum >= 495 && wavelengthNum < 570) return 'green';
            if (wavelengthNum >= 570 && wavelengthNum < 590) return 'yellow';
            if (wavelengthNum >= 590 && wavelengthNum < 620) return 'orange';
            if (wavelengthNum >= 620 && wavelengthNum < 750) return 'red';
            return '#f0f0f0'; // Gris si está fuera de rango visible o 0/null
        }

        async function getCalendarEvents() {
            console.log("getCalendarEvents: Obteniendo eventos...");
            // Guardia: Asegurar que supabaseClient esté inicializado
            if (!supabaseClient) {
                console.error("getCalendarEvents: supabaseClient no está inicializado.");
                return [];
            }
            try {
                const { data, error } = await supabaseClient
                    .from('reservations')
                    .select('*');

                if (error) throw error; // Lanzar error para ser capturado abajo

                // Si data es null (puede pasar si hay error o RLS bloquea), tratar como vacío
                const eventsData = data || [];
                console.log(`getCalendarEvents: Se encontraron ${eventsData.length} reservas.`);

                return eventsData.map(res => ({
                    id: res.id,
                    title: `Pos ${res.position}: ${res.user_name || '??'} (${res.wavelength || '??'}nm)`, // Añadir defaults
                    start: res.start_time,
                    end: res.end_time,
                    backgroundColor: wavelengthToColor(res.wavelength),
                    borderColor: wavelengthToColor(res.wavelength),
                    extendedProps: { // Asegurarse que todo tenga valor o default
                        position: res.position,
                        user_name: res.user_name || '',
                        wavelength: res.wavelength,
                        description: res.description || '',
                        original_start: res.start_time,
                        original_end: res.end_time
                    }
                }));
            } catch (error) {
                 console.error('Error fetching calendar events:', error);
                 errorMessageDiv.textContent = "Error al cargar datos del calendario."; // Informar al usuario
                 return [];
            }
        }

        async function initializeOrUpdateCalendar() {
            console.log("initializeOrUpdateCalendar: Iniciando...");
            // Guardia: Asegurar que el elemento del calendario exista
            if (!calendarEl) {
                 console.error("initializeOrUpdateCalendar: calendarEl no encontrado.");
                 return;
            }

             // Verificar si FullCalendar está cargado ANTES de obtener eventos
             if (typeof FullCalendar === 'undefined' || !FullCalendar.Calendar) {
                console.error("¡FullCalendar no está cargado!");
                errorMessageDiv.textContent = "Error al cargar el componente de calendario.";
                return; // Salir si la librería no está
            }

            const events = await getCalendarEvents(); // Obtener eventos (ya maneja errores)

            try {
                if (!calendarInstance) {
                    console.log("initializeOrUpdateCalendar: Creando nueva instancia de FullCalendar.");
                    calendarInstance = new FullCalendar.Calendar(calendarEl, {
                        initialView: 'timeGridWeek',
                        locale: 'es', // Necesita el archivo es.js descomentado y funcionando sin error 'export'
                        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' },
                        events: events, // Pasar los eventos obtenidos
                        eventClick: function(info) {
                            console.log('Evento clickeado:', info.event);
                             // Llamar a showDetails (asegúrate que esté definida dentro de este scope)
                            if (typeof showDetails === 'function') {
                                // Necesitamos pasar un objeto similar al de la reserva original
                                showDetails({
                                     position: info.event.extendedProps.position,
                                     user_name: info.event.extendedProps.user_name,
                                     wavelength: info.event.extendedProps.wavelength,
                                     // Usar las fechas originales guardadas, ya que info.event.start/end pueden ser objetos Date modificados por FullCalendar
                                     start_time: info.event.extendedProps.original_start,
                                     end_time: info.event.extendedProps.original_end,
                                     description: info.event.extendedProps.description
                                 });
                            } else {
                                 console.warn("La función showDetails no está definida al hacer clic en el calendario.");
                            }
                        },
                        // Podríamos añadir un callback por si falla la carga de eventos inicial
                        loading: function(isLoading) {
                             console.log("FullCalendar loading state:", isLoading);
                        }
                        /* // Considerar añadir manejo de errores de eventos
                        eventDidMount: function(info) {
                            // console.log("Event mounted:", info.event.title);
                        },
                        eventSourceFailure: function(error) {
                             console.error("Error cargando eventos en FullCalendar:", error);
                             errorMessageDiv.textContent = "Error al cargar eventos en el calendario.";
                        }
                        */
                    });
                    calendarInstance.render();
                     console.log("initializeOrUpdateCalendar: Instancia de FullCalendar renderizada.");
                } else {
                    console.log("initializeOrUpdateCalendar: Actualizando eventos en calendario existente.");
                    // Forma segura de actualizar eventos
                    calendarInstance.setOption('events', events);
                    // O la forma anterior si setOption no existe en v6 (revisar docs si falla)
                    // calendarInstance.removeAllEvents();
                    // calendarInstance.addEventSource(events);
                     console.log("initializeOrUpdateCalendar: Eventos actualizados.");
                }
            } catch (error) {
                console.error("Error inicializando o actualizando FullCalendar:", error);
                errorMessageDiv.textContent = "Error al mostrar el calendario.";
            }
        }

        // Función para manejar cambios en tiempo real (MODIFICADA para usar cliente y verificar funciones)
        function handleRealtimeChanges(payload) {
            console.log('handleRealtimeChanges: Cambio detectado en Supabase:', payload);
            if (typeof renderGrid === 'function') {
                renderGrid(); // Actualizar el grid visual
            } else {
                 console.error("handleRealtimeChanges: La función renderGrid no está definida.");
            }
            if (typeof initializeOrUpdateCalendar === 'function') {
                initializeOrUpdateCalendar(); // Actualizar también el calendario
            } else {
                 console.error("handleRealtimeChanges: La función initializeOrUpdateCalendar no está definida.");
            }
        }

        async function renderGrid() {
            console.log("renderGrid: Iniciando renderizado del grid...");
            // Guardias
            if (!reactorGrid) { console.error("renderGrid: reactorGrid no encontrado."); return; }
            if (!supabaseClient) { console.error("renderGrid: supabaseClient no está inicializado."); return; }

            reactorGrid.innerHTML = ''; // Limpiar grid
            positions = {}; // Resetear estado local
            const now = new Date().toISOString();

            try {
                const { data, error } = await supabaseClient
                    .from('reservations')
                    .select('*')
                    .lte('start_time', now) // Que hayan empezado
                    .gte('end_time', now);  // Y no hayan terminado

                if (error) throw error; // Lanzar error para capturarlo

                const currentReservations = data || []; // Asegurar que sea un array
                console.log(`renderGrid: Se encontraron ${currentReservations.length} reservas activas.`);

                currentReservations.forEach(res => {
                    // Validar que la posición sea un número esperado
                    if (typeof res.position === 'number' && res.position >= 0 && res.position < 16) {
                        positions[res.position] = { occupied: true, ...res };
                    } else {
                        console.warn("renderGrid: Reserva recibida con posición inválida:", res.position);
                    }
                });

                // Crear los 16 círculos
                for (let i = 0; i < 16; i++) {
                    const posDiv = document.createElement('div');
                    posDiv.classList.add('reactor-position');
                    posDiv.dataset.positionId = i; // Guardar el ID de la posición
                    const positionState = positions[i]; // Puede ser undefined si no hay reserva activa

                    if (positionState?.occupied) { // Usar optional chaining por si positionState es undefined
                        posDiv.classList.add('occupied');
                        posDiv.style.backgroundColor = wavelengthToColor(positionState.wavelength);
                        // Usar textContent para el texto principal y añadir el span del tooltip
                        const textNode = document.createTextNode(`Pos ${i}\n(${positionState.wavelength || '??'}nm)`);
                        posDiv.appendChild(textNode);

                        const tooltipSpan = document.createElement('span');
                        tooltipSpan.classList.add('tooltip');
                        // Limpiar datos para el tooltip
                        const userName = positionState.user_name || 'Desconocido';
                        const endTime = positionState.end_time ? new Date(positionState.end_time).toLocaleString() : 'N/A';
                        const description = positionState.description || '-';
                        tooltipSpan.innerHTML = `Usuario: ${userName}<br>Fin: ${endTime}<br>Desc: ${description}`;
                        posDiv.appendChild(tooltipSpan);

                        // Añadir evento click (asegurarse que showDetails exista)
                        if (typeof showDetails === 'function') {
                             posDiv.addEventListener('click', () => showDetails(positionState));
                        }
                    } else {
                        posDiv.textContent = `Pos ${i} (Libre)`;
                        // Añadir evento click (asegurarse que fillReservationForm exista)
                        if (typeof fillReservationForm === 'function') {
                             posDiv.addEventListener('click', () => fillReservationForm(i));
                        }
                    }
                    reactorGrid.appendChild(posDiv);
                }
                 console.log("renderGrid: Grid renderizado.");

            } catch (error) {
                 console.error('Error fetching/rendering current reservations:', error);
                 errorMessageDiv.textContent = "Error al cargar el estado del reactor.";
            }
        }

        function fillReservationForm(positionId) {
             // Guardia
             if (!reservationForm) { console.error("fillReservationForm: reservationForm no encontrado."); return; }
             console.log(`fillReservationForm: Rellenando para posición ${positionId}`);
             // Verificar que el elemento exista antes de asignarle valor
             if (reservationForm.elements['position']) {
                reservationForm.elements['position'].value = positionId;
             }
             if (reservationForm.elements['user_name']) {
                 reservationForm.elements['user_name'].focus(); // Poner foco
             }
        }

        function showDetails(reservationData) {
            // Guardia
            if (!reservationData) {
                 console.warn("showDetails llamada sin datos de reserva.");
                 return;
            }
             console.log("showDetails: Mostrando detalles para:", reservationData);
             // Usar template literals para más claridad
             const detailsMessage = `Detalles Reserva Posición ${reservationData.position ?? 'N/A'}:
                 Usuario: ${reservationData.user_name || 'N/A'}
                 Longitud Onda: ${reservationData.wavelength || 'N/A'} nm
                 Inicio: ${reservationData.start_time ? new Date(reservationData.start_time).toLocaleString() : 'N/A'}
                 Fin: ${reservationData.end_time ? new Date(reservationData.end_time).toLocaleString() : 'N/A'}
                 Descripción: ${reservationData.description || '-'}`;
             alert(detailsMessage);
        }

        async function handleReservationSubmit(event) {
            event.preventDefault(); // Prevenir recarga de página
            console.log("handleReservationSubmit: Iniciando envío de formulario...");
            // Guardias
            if (!reservationForm) { console.error("handleReservationSubmit: reservationForm no encontrado."); return; }
            if (!supabaseClient) { console.error("handleReservationSubmit: supabaseClient no está inicializado."); return; }
            if (!errorMessageDiv) { console.error("handleReservationSubmit: errorMessageDiv no encontrado."); return; }

            errorMessageDiv.textContent = ''; // Limpiar errores previos
            const submitButton = reservationForm.querySelector('button[type="submit"]'); // Encontrar botón
            if(submitButton) submitButton.disabled = true; // Deshabilitar botón

            const formData = new FormData(reservationForm);
            const reservationData = { // Usar defaults seguros
                position: parseInt(formData.get('position')) || null,
                user_name: formData.get('user_name') || null,
                wavelength: parseInt(formData.get('wavelength')) || null,
                start_time: null,
                end_time: null,
                description: formData.get('description') || '' // Usar string vacío como default
            };

            // --- Validación de Entradas ---
            if (reservationData.position === null || isNaN(reservationData.position) || reservationData.position < 0 || reservationData.position > 15) {
                 errorMessageDiv.textContent = 'Error: Posición inválida (debe ser 0-15).';
                 if(submitButton) submitButton.disabled = false;
                 return;
            }
            if (!reservationData.user_name) {
                 errorMessageDiv.textContent = 'Error: El nombre de usuario es obligatorio.';
                 if(submitButton) submitButton.disabled = false;
                 return;
            }
             if (reservationData.wavelength === null || isNaN(reservationData.wavelength)) {
                 errorMessageDiv.textContent = 'Error: La longitud de onda es obligatoria y debe ser un número.';
                  if(submitButton) submitButton.disabled = false;
                 return;
            }

            // Validar fechas
            const startTimeStr = formData.get('start_time');
            const endTimeStr = formData.get('end_time');

            if (!startTimeStr || !endTimeStr) {
                 errorMessageDiv.textContent = 'Error: Las fechas de inicio y fin son obligatorias.';
                 if(submitButton) submitButton.disabled = false;
                 return;
            }

            try {
                const startDate = new Date(startTimeStr);
                const endDate = new Date(endTimeStr);

                // Verificar si las fechas son válidas
                if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                     throw new Error("Formato de fecha inválido.");
                }

                 reservationData.start_time = startDate.toISOString();
                 reservationData.end_time = endDate.toISOString();

                // Validar que la fecha de fin sea posterior a la de inicio
                if (endDate <= startDate) {
                    errorMessageDiv.textContent = 'Error: La fecha de fin debe ser posterior a la fecha de inicio.';
                    if(submitButton) submitButton.disabled = false;
                    return;
                }

            } catch (dateError) {
                 console.error("Error procesando fechas:", dateError);
                 errorMessageDiv.textContent = `Error en fechas: ${dateError.message}`;
                 if(submitButton) submitButton.disabled = false;
                 return;
            }

            // --- Validación de Solapamiento ---
            console.log("handleReservationSubmit: Validando solapamiento...");
            try {
                 const { count, error: validationError } = await supabaseClient
                     .from('reservations')
                     .select('*', { count: 'exact', head: true }) // head:true para no traer datos, solo conteo
                     .eq('position', reservationData.position)
                     .lt('start_time', reservationData.end_time) // Solapamiento: existente empieza antes de que nueva termine
                     .gt('end_time', reservationData.start_time); // Solapamiento: existente termina después de que nueva empiece

                 if (validationError) throw validationError;

                 console.log("Resultado validación (count):", count);
                 if (count !== null && count > 0) { // Si count es mayor que 0, hay solapamiento
                      errorMessageDiv.textContent = `Error: La posición ${reservationData.position} ya está reservada en ese horario.`;
                      if(submitButton) submitButton.disabled = false;
                      return;
                 }
                  console.log("handleReservationSubmit: Validación OK (sin solapamiento).");

            } catch(validationError) {
                  console.error('Error de validación de solapamiento:', validationError);
                  errorMessageDiv.textContent = 'Error al validar disponibilidad.';
                   if(submitButton) submitButton.disabled = false;
                  return;
            }

            // --- Insertar en Supabase ---
            console.log("handleReservationSubmit: Insertando reserva:", reservationData);
            try {
                 const { error: insertError } = await supabaseClient
                     .from('reservations')
                     .insert([reservationData]); // Supabase espera un array de objetos

                 if (insertError) throw insertError;

                 console.log('handleReservationSubmit: Reserva creada con éxito.');
                 reservationForm.reset(); // Limpiar formulario solo si todo fue bien

            } catch(insertError) {
                 console.error('Error inserting reservation:', insertError);
                 errorMessageDiv.textContent = 'Error al guardar la reserva: ' + (insertError.message || 'Error desconocido.');
                 // Considerar no resetear el form si hay error, para que el usuario no pierda datos
            } finally {
                 // Volver a habilitar el botón independientemente del resultado
                 if(submitButton) submitButton.disabled = false;
            }
        }

        async function handleExport() {
            console.log("handleExport: Iniciando exportación...");
            // Guardias
            if (!exportButton) { console.error("handleExport: exportButton no encontrado."); return; }
            if (!supabaseClient) { console.error("handleExport: supabaseClient no está inicializado."); return; }

            exportButton.disabled = true;
            exportButton.textContent = 'Exportando...';

             try {
                // Verificar si la librería ics está cargada
                 if (typeof ics !== 'function') {
                    console.error("¡La librería ics.js no está cargada o no es una función!");
                    alert("Error: No se puede exportar porque falta la librería necesaria (ics).");
                    // No necesitamos finally aquí si salimos temprano
                    exportButton.disabled = false;
                    exportButton.textContent = 'Exportar a .ics';
                    return;
                 }

                 // Obtener datos para exportar
                 const { data, error } = await supabaseClient
                     .from('reservations')
                     .select('*')
                     .order('start_time', { ascending: true });

                 if (error) throw error; // Lanzar error

                 const reservationsToExport = data || []; // Asegurar array

                 if (reservationsToExport.length === 0) {
                      alert('No hay reservas para exportar.');
                      // No necesitamos finally aquí si salimos temprano
                      exportButton.disabled = false;
                      exportButton.textContent = 'Exportar a .ics';
                      return;
                 }
                  console.log(`handleExport: Se exportarán ${reservationsToExport.length} reservas.`);

                 // Crear y descargar .ics
                 const cal = ics();
                 reservationsToExport.forEach(res => {
                     // Validar fechas antes de añadirlas
                     if (res.start_time && res.end_time) {
                         const startDate = new Date(res.start_time);
                         const endDate = new Date(res.end_time);
                         // Verificar si son fechas válidas
                         if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                             cal.addEvent(
                                 `Pos ${res.position ?? '?'}: ${res.user_name || '??'} (${res.wavelength || '??'}nm)`,
                                 res.description || 'Sin descripción adicional.',
                                 'Reactor Medusa Lab',
                                 startDate,
                                 endDate
                             );
                         } else {
                              console.warn("handleExport: Se omitió una reserva con fechas inválidas:", res);
                         }
                     } else {
                          console.warn("handleExport: Se omitió una reserva sin fecha de inicio o fin:", res);
                     }
                 });

                 console.log("handleExport: Descargando archivo .ics...");
                 cal.download('medusa_reactor_schedule');

             } catch (e) {
                 console.error("Error durante la exportación:", e);
                 alert("Ocurrió un error al generar o descargar el archivo .ics.");
             } finally {
                 // Asegurar que el botón se rehabilite
                 exportButton.disabled = false;
                 exportButton.textContent = 'Exportar a .ics';
             }
        }


        // --- INICIALIZACIÓN y SUSCRIPCIONES (dentro del IF donde supabaseClient se creó con éxito) ---
        console.log("Inicializando la aplicación...");

        // Renderizar Grid y Calendario Inicialmente
        // Estas funciones ahora tienen sus propios try/catch internos
        renderGrid();
        initializeOrUpdateCalendar(); // Asegúrate que el archivo es.js esté descomentado en HTML si quieres español y funciona

        // Añadir Listeners a los botones/forms (ya verificamos que existen)
        reservationForm.addEventListener('submit', handleReservationSubmit);
        exportButton.addEventListener('click', handleExport);


        // Suscribirse a cambios en tiempo real
        try {
            console.log("Suscribiéndose al canal de Supabase...");
            const channel = supabaseClient.channel('public:reservations')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, (payload) => {
                     // Llamar a handleRealtimeChanges SOLO si la función existe
                     if(typeof handleRealtimeChanges === 'function') {
                          handleRealtimeChanges(payload);
                     } else {
                          console.error("Error: La función handleRealtimeChanges no está definida al recibir un cambio.");
                     }
                 })
                .subscribe((status, err) => { // Usar el callback con dos argumentos
                    // Callback opcional para saber el estado de la suscripción
                    if (status === 'SUBSCRIBED') {
                        console.log('¡Conectado exitosamente al canal de tiempo real!');
                    } else if (status === 'CHANNEL_ERROR') {
                         console.error('Error en la conexión del canal de tiempo real:', err);
                    } else if (status === 'TIMED_OUT') {
                         console.warn('Se agotó el tiempo de espera para la conexión del canal.');
                    } else {
                         console.log("Estado del canal de tiempo real:", status);
                    }
                });

            // Opcional: Guardar referencia al canal si necesitas desuscribirte luego
            // window.realtimeChannel = channel; // Ejemplo

            console.log('Suscripción al canal iniciada (estado pendiente).');

        } catch (channelError) {
            console.error("Error al intentar suscribirse al canal:", channelError);
            errorMessageDiv.textContent = "No se pudo conectar para actualizaciones en tiempo real.";
        }


    } else {
        // Este bloque se ejecuta si la librería Supabase NO estaba lista
        console.error("VERIFICACIÓN: ¡FALLÓ! El objeto global 'supabase' o 'supabase.createClient' NO está disponible al cargar el DOM.");
        const errorDiv = document.getElementById('error-message'); // Intenta obtenerlo de nuevo
        if(errorDiv) errorDiv.textContent = "Error crítico al cargar la aplicación (Fallo en Supabase). Intente refrescar la página.";
    }

}); // <-- FIN del addEventListener DOMContentLoaded