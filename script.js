// --- START OF FILE script.js (Edit/Delete Implemented) ---

// Envolvemos TODO en DOMContentLoaded para asegurar que el HTML y las librerías (idealmente) estén listas
document.addEventListener('DOMContentLoaded', (event) => {
    console.log('EVENTO: DOMContentLoaded disparado.');

    // --- Configuración de Supabase ---
    const SUPABASE_URL = 'https://azlyezhhjdwtvqdgjuxo.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6bHllemhoamR3dHZxZGdqdXhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMzMzgzOTEsImV4cCI6MjA1ODkxNDM5MX0.5Wt9cRD2CqheK5z2522kToQMI70dNhQIZ0zi33OGrHw';

    //Wavelengths por defecto
    const defaultWavelengths = {
        1: 617,  2: 530,  3: 470,  4: 447,
        5: 591,  6: 505,  7: 470,  8: 447,
        9: 447, 10: 470, 11: 470, 12: 447,
        13: 655, 14: 655, 15: 470, 16: 447
    };
    // Declaramos la variable para el cliente aquí, pero la inicializamos dentro del if
    let supabaseClient = null;

    // --- VERIFICACIÓN DE LA LIBRERÍA SUPABASE ---
    console.log("Verificando si la librería 'supabase' global existe...");
    console.log("Tipo de window.supabase:", typeof window.supabase);

    if (typeof supabase !== 'undefined' && typeof supabase.createClient === 'function') {
        console.log("VERIFICACIÓN: ¡Éxito! supabase.createClient está disponible.");

        // --- CREACIÓN DEL CLIENTE SUPABASE ---
        try {
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log("Cliente Supabase ('supabaseClient') creado:", supabaseClient ? 'OK' : 'FALLÓ');
            if (!supabaseClient) throw new Error("La creación del cliente Supabase devolvió null.");
        } catch (error) {
            console.error("¡ERROR CRÍTICO al crear el cliente Supabase!", error);
            const errorDiv = document.getElementById('error-message');
            if(errorDiv) errorDiv.textContent = "Error crítico al inicializar la conexión. Intente refrescar.";
            return;
        }

        // --- Referencias a Elementos del DOM ---
        const reactorGrid = document.getElementById('reactor-grid');
        const reservationForm = document.getElementById('reservation-form'); // Formulario principal
        const errorMessageDiv = document.getElementById('error-message');
        const calendarEl = document.getElementById('calendar');
        const exportButton = document.getElementById('export-button');

        if (!reactorGrid || !reservationForm || !errorMessageDiv || !calendarEl || !exportButton) {
             console.error("¡Error crítico! No se encontraron todos los elementos HTML necesarios.");
             if(errorMessageDiv) errorMessageDiv.textContent = "Error: Faltan elementos en la página.";
             return;
        }

        // --- Estado de la Aplicación ---
        let positions = {}; // Almacena estado de posiciones activas { positionId: {id: ..., occupied: true, ...data} }
        let calendarInstance = null;

        // --- Funciones ---

        function wavelengthToColor(wl) {
            const wavelengthNum = parseInt(wl);
            if (isNaN(wavelengthNum)) return '#cccccc';
            if (wavelengthNum >= 380 && wavelengthNum < 450) return '#191970';
            if (wavelengthNum >= 450 && wavelengthNum < 495) return 'blue';
            if (wavelengthNum >= 495 && wavelengthNum < 570) return 'green';
            if (wavelengthNum >= 570 && wavelengthNum < 590) return 'yellow';
            if (wavelengthNum >= 590 && wavelengthNum < 620) return 'orange';
            if (wavelengthNum >= 620 && wavelengthNum < 750) return 'red';
            return '#cccccc';
        }

        // --- OBTENER EVENTOS PARA CALENDARIO (Asegurarse de incluir 'id') ---
        async function getCalendarEvents() {
            console.log("getCalendarEvents: Obteniendo eventos...");
            if (!supabaseClient) { console.error("getCalendarEvents: supabaseClient no está inicializado."); return []; }
            try {
                // Seleccionar todos los campos necesarios, incluyendo 'id'
                const { data, error } = await supabaseClient.from('reservations').select('id, position, user_name, wavelength, start_time, end_time, description');
                if (error) throw error;
                const eventsData = data || [];
                console.log(`getCalendarEvents: Se encontraron ${eventsData.length} reservas.`);
                return eventsData.map(res => ({
                    id: res.id, // <-- ID es crucial para editar/borrar
                    title: `Pos ${res.position}: ${res.user_name || '??'} (${res.wavelength || '??'}nm)`,
                    start: res.start_time,
                    end: res.end_time,
                    backgroundColor: wavelengthToColor(res.wavelength),
                    borderColor: wavelengthToColor(res.wavelength),
                    extendedProps: { // Pasar todos los datos originales
                        position: res.position,
                        user_name: res.user_name || '',
                        wavelength: res.wavelength,
                        description: res.description || '',
                        original_start: res.start_time, // Guardar original para modales
                        original_end: res.end_time
                    }
                }));
            } catch (error) {
                 console.error('Error fetching calendar events:', error);
                 if (errorMessageDiv) errorMessageDiv.textContent = "Error al cargar datos del calendario.";
                 return [];
            }
        }

        // --- INICIALIZAR/ACTUALIZAR CALENDARIO (Modificado eventClick) ---
        async function initializeOrUpdateCalendar() {
             console.log("initializeOrUpdateCalendar: Iniciando...");
             if (!calendarEl || typeof FullCalendar === 'undefined' || !FullCalendar.Calendar) { console.error("Fallo al cargar FullCalendar o el elemento."); return; }

             const events = await getCalendarEvents(); // Obtiene eventos CON ID

             try {
                 if (!calendarInstance) {
                     console.log("initializeOrUpdateCalendar: Creando nueva instancia...");
                     calendarInstance = new FullCalendar.Calendar(calendarEl, {
                         initialView: 'timeGridWeek',
                         locale: 'es',
                         headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' },
                         events: events,
                         eventClick: function(info) { // <-- MODIFICADO: Llama al modal
                             console.log('Evento de calendario clickeado:', info.event);
                             // Construir objeto con datos completos, incluido ID
                             const reservationData = {
                                 id: info.event.id, // Tomar ID del evento
                                 position: info.event.extendedProps.position,
                                 user_name: info.event.extendedProps.user_name,
                                 wavelength: info.event.extendedProps.wavelength,
                                 start_time: info.event.extendedProps.original_start, // Usar original
                                 end_time: info.event.extendedProps.original_end,     // Usar original
                                 description: info.event.extendedProps.description
                             };

                             if (reservationData.id && typeof showReservationModal === 'function') {
                                 showReservationModal(reservationData);
                             } else {
                                 console.error("No se pudo obtener el ID de la reserva o showReservationModal no está definida.");
                                 Swal.fire('Error', 'No se pudo identificar la reserva seleccionada.', 'error');
                             }
                         },
                         loading: function(isLoading) { console.log("FullCalendar loading:", isLoading); }
                     });
                     calendarInstance.render();
                     console.log("initializeOrUpdateCalendar: Instancia renderizada.");
                 } else {
                     console.log("initializeOrUpdateCalendar: Actualizando eventos...");
                     calendarInstance.setOption('events', events);
                     console.log("initializeOrUpdateCalendar: Eventos actualizados.");
                 }
             } catch (error) {
                 console.error("Error inicializando/actualizando FullCalendar:", error);
                 if (errorMessageDiv) errorMessageDiv.textContent = "Error al mostrar calendario.";
             }
        }

        function handleRealtimeChanges(payload) {
             console.log('handleRealtimeChanges: Cambio detectado:', payload);
             if (typeof renderGrid === 'function') renderGrid(); else console.error("renderGrid no definida.");
             if (typeof initializeOrUpdateCalendar === 'function') initializeOrUpdateCalendar(); else console.error("initializeOrUpdateCalendar no definida.");
        }

         // --- RENDERIZAR GRID (Modificado para añadir ID a 'positions' y listener de click) ---
         async function renderGrid() {
            console.log("renderGrid: Iniciando renderizado del grid...");
            if (!reactorGrid || !supabaseClient) { console.error("renderGrid: Faltan elementos."); return; }

            const now = new Date().toISOString();

            try {
                // Obtener solo campos necesarios, incluyendo 'id'
                const { data, error } = await supabaseClient
                    .from('reservations')
                    .select('id, position, user_name, wavelength, start_time, end_time, description') // Asegurar ID
                    .lte('start_time', now)
                    .gte('end_time', now);

                if (error) throw error;
                const currentReservations = data || [];
                console.log(`renderGrid: ${currentReservations.length} reservas activas.`);

                // Resetear y rellenar 'positions' asegurando que incluya el 'id'
                positions = {};
                currentReservations.forEach(res => {
                    if (typeof res.position === 'number' && res.position >= 1 && res.position <= 16) {
                        // Guardar todos los datos de la reserva activa, incluido el ID
                        positions[res.position] = { id: res.id, occupied: true, ...res }; // <-- IMPORTANTE: id: res.id
                    }
                });

                reactorGrid.innerHTML = '';
                for (let i = 1; i <= 16; i++) {
                    const posDiv = document.createElement('div');
                    posDiv.classList.add('reactor-position');
                    posDiv.dataset.positionId = i;

                    const positionState = positions[i]; // Contiene la reserva activa, si existe
                    const defaultWL = defaultWavelengths[i] || '???';

                    if (positionState?.occupied) {
                        // --- POSICIÓN OCUPADA ---
                        const occupiedWL = positionState.wavelength || '???';
                        const bgColor = wavelengthToColor(occupiedWL);

                        posDiv.classList.add('occupied');
                        posDiv.style.border = '3px solid black';
                        posDiv.style.setProperty('--position-bg-color', bgColor);

                        const icon = '🔒';
                        posDiv.innerHTML = `${icon}<br>Pos ${i} (${occupiedWL}nm)`;

                        // Tooltip (se mantiene igual)
                        const tooltipSpan = document.createElement('span');
                        tooltipSpan.classList.add('tooltip');
                        const userName = positionState.user_name || 'Desconocido';
                        const endTime = positionState.end_time ? new Date(positionState.end_time).toLocaleString('es-ES') : 'N/A';
                        const description = positionState.description || '-';
                        tooltipSpan.innerHTML = `Usuario: ${userName}<br>Fin: ${endTime}<br>Desc: ${description}`;
                        posDiv.appendChild(tooltipSpan);

                        // --- MODIFICADO: Evento Click OCUPADO llama al modal ---
                        if (positionState.id && typeof showReservationModal === 'function') {
                            // Pasar el objeto completo que contiene el ID y demás datos
                            posDiv.addEventListener('click', () => showReservationModal(positionState));
                        } else {
                             console.error(`No se encontró ID o función modal para la reserva activa en posición ${i}`);
                             posDiv.addEventListener('click', () => {
                                 Swal.fire('Error', 'No se pudo identificar la reserva activa para esta posición.', 'error');
                             });
                        }

                    } else {
                        // --- POSICIÓN LIBRE ---
                        const defaultWLColor = wavelengthToColor(defaultWL);

                        posDiv.classList.remove('occupied');
                        posDiv.style.border = '2px solid #ccc';
                        posDiv.style.setProperty('--position-bg-color', defaultWLColor);

                        posDiv.textContent = `Pos ${i} (${defaultWL}nm)`;

                        // Listener para fillReservationForm (se mantiene igual)
                        if (typeof fillReservationForm === 'function') {
                            posDiv.addEventListener('click', () => fillReservationForm(i));
                        } else {
                            console.warn(`fillReservationForm no definida para pos ${i}`);
                        }
                    }
                    reactorGrid.appendChild(posDiv);
                }
                console.log("renderGrid: Grid renderizado con listeners.");

            } catch (error) {
                console.error('Error fetching/rendering current reservations:', error);
                 if (errorMessageDiv) errorMessageDiv.textContent = "Error al cargar el estado del reactor.";
            }
        }
        // --- FIN FUNCIÓN renderGrid ---

        // --- FUNCION fillReservationForm (Se mantiene igual) ---
        function fillReservationForm(positionId) {
            if (!reservationForm) { console.error("fillReservationForm: reservationForm no encontrado."); return; }
            console.log(`fillReservationForm: Rellenando para posición ${positionId}`);
            if (reservationForm.elements['position']) reservationForm.elements['position'].value = positionId;
            if (reservationForm.elements['wavelength']) {
                const defaultWL = defaultWavelengths[positionId] || '';
                reservationForm.elements['wavelength'].value = defaultWL;
                console.log(`fillReservationForm: λ predeterminada ${defaultWL}nm.`);
            }
            if (reservationForm.elements['user_name']) reservationForm.elements['user_name'].value = '';
            if (reservationForm.elements['start_time']) reservationForm.elements['start_time'].value = '';
            if (reservationForm.elements['end_time']) reservationForm.elements['end_time'].value = '';
            if (reservationForm.elements['description']) reservationForm.elements['description'].value = '';
            if (reservationForm.elements['user_name']) reservationForm.elements['user_name'].focus();
        }

        // --- FUNCION showDetails (Ya no se usa directamente, pero se puede mantener por si acaso) ---
        function showDetails(reservationData) {
             // Podría llamarse desde otro sitio, o eliminarse si no se usa.
             console.warn("Llamada a showDetails (posiblemente obsoleta):", reservationData);
             const detailsMessage = `Detalles (Pos ${reservationData?.position ?? 'N/A'}):\nUsuario: ${reservationData?.user_name || 'N/A'}\n...etc`;
             alert(detailsMessage);
        }

        // --- FUNCIÓN handleReservationSubmit (Con Logs Detallados en Validación) ---
        async function handleReservationSubmit(event) {
            event.preventDefault();
            console.log("handleReservationSubmit: Iniciando envío...");
            if (!reservationForm || !supabaseClient || !errorMessageDiv) { console.error("handleRS: Faltan elementos."); return; }

            errorMessageDiv.textContent = '';
            const submitButton = reservationForm.querySelector('button[type="submit"]');
            if(submitButton) submitButton.disabled = true;

            const formData = new FormData(reservationForm);
            const reservationData = {
                position: parseInt(formData.get('position')) || null,
                user_name: formData.get('user_name') || null,
                wavelength: parseInt(formData.get('wavelength')) || null,
                start_time: null, end_time: null, // Se asignan después
                description: formData.get('description') || ''
            };

            // --- Validación de Entradas (Igual que antes) ---
            // ...
            if (!reservationData.user_name /* || ... */) { if(submitButton) submitButton.disabled = false; return; }

            // --- Validación y Procesamiento de Fechas (Igual que antes) ---
            try {
                const startDate = new Date(formData.get('start_time'));
                const endDate = new Date(formData.get('end_time'));
                if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) throw new Error("Formato de fecha inválido.");
                if (endDate <= startDate) throw new Error('Fin debe ser posterior a Inicio.');
                reservationData.start_time = startDate.toISOString();
                reservationData.end_time = endDate.toISOString();
                console.log("Fechas procesadas:", reservationData.start_time, reservationData.end_time);
            } catch (dateError) {
                // ... (manejo de error)
                if(submitButton) submitButton.disabled = false; return;
            }

            // --- Validación de Solapamiento (CON LOGS DETALLADOS) ---
            console.log("handleReservationSubmit: Validando solapamiento...");
            // Loguea los datos específicos que entran a la consulta
            console.log(`---> Validando para Pos: ${reservationData.position}, Inicio: ${reservationData.start_time}, Fin: ${reservationData.end_time}`);
            try {
                 const { count, error: validationError } = await supabaseClient
                     .from('reservations').select('*', { count: 'exact', head: true })
                     .eq('position', reservationData.position)
                     .lt('start_time', reservationData.end_time) // Existente empieza ANTES que nueva termine
                     .gt('end_time', reservationData.start_time); // Existente termina DESPUÉS que nueva empiece

                 // Loguea el resultado INMEDIATAMENTE después de la consulta
                 console.log("Validación - Error retornado por Supabase:", validationError);
                 console.log("Validación - Count retornado por Supabase:", count);

                 // Comprueba primero el error
                 if (validationError) {
                     console.error('Error explícito durante validación de solapamiento:', validationError);
                     throw validationError; // Lanza para que el catch lo maneje
                 }

                 // Ahora verifica el count
                 if (count !== null && count > 0) {
                      // Muestra el count en el mensaje de error para depurar
                      errorMessageDiv.textContent = `Error: Posición ${reservationData.position} ocupada en ese horario (Count: ${count}).`;
                      if(submitButton) submitButton.disabled = false;
                      return; // Detiene la ejecución
                 }
                  // Si llegas aquí, count fue 0 o null
                  console.log("handleReservationSubmit: Validación OK (Count fue 0 o null).");

            } catch(error) { // Captura cualquier error (de red, Supabase, o el relanzado)
                  console.error('Error en bloque catch de validación de solapamiento:', error);
                  errorMessageDiv.textContent = 'Error al validar disponibilidad.';
                   if(submitButton) submitButton.disabled = false;
                  return;
            }
            // --- FIN Validación de Solapamiento ---


            // --- Insertar en Supabase (Código igual que la versión anterior con .select()) ---
            console.log("handleReservationSubmit: Insertando reserva:", JSON.stringify(reservationData));
            try {
                const { data: insertedData, error: insertError } = await supabaseClient
                    .from('reservations')
                    .insert([reservationData])
                    .select();

                if (insertError) throw insertError;

                console.log('handleReservationSubmit: Datos devueltos por .select() tras insert:', insertedData);

                if (!insertedData || insertedData.length === 0) {
                    console.warn('Inserción OK, pero .select() no devolvió datos (¿RLS SELECT?).');
                } else {
                    console.log('Reserva aparentemente creada y leída.');
                }

                reservationForm.reset(); // Resetear independientemente de si se leyó bien

                // Refresco manual añadido en la versión anterior
                console.log("handleReservationSubmit: Refrescando UI manualmente...");
                renderGrid();
                initializeOrUpdateCalendar();

            } catch(error) {
                console.error('Error en bloque try/catch de inserción:', error);
                errorMessageDiv.textContent = `Error al guardar: ${error.message}`;
            } finally {
                if(submitButton) submitButton.disabled = false;
            }
        }


        // ==================================================
        // --- NUEVAS FUNCIONES PARA EDITAR Y BORRAR ---
        // ==================================================

        // --- NUEVA FUNCIÓN: Mostrar Modal de Detalles/Acciones ---
        function showReservationModal(reservationData) {
            // ... (código inicial igual: logs, comprobaciones, formateo de fechas para mostrar) ...
            const startDate = reservationData.start_time ? new Date(reservationData.start_time) : null;
            const endDate = reservationData.end_time ? new Date(reservationData.end_time) : null;
            const startTimeFormatted = startDate ? startDate.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short'}) : 'N/A';
            const endTimeFormatted = endDate ? endDate.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short'}) : 'N/A';
        
            Swal.fire({
                title: `Detalles Reserva Pos. ${reservationData.position}`,
                html: `
                    <div style="text-align: left; margin-left: 20px;">
                        <p><strong>ID:</strong> ${reservationData.id}</p>
                        <p><strong>Usuario:</strong> ${reservationData.user_name || 'N/A'}</p>
                        <p><strong>λ (nm):</strong> ${reservationData.wavelength || 'N/A'}</p>
                        <p><strong>Inicio:</strong> ${startTimeFormatted}</p>
                        <p><strong>Fin:</strong> ${endTimeFormatted}</p>
                        <p><strong>Descripción:</strong> ${reservationData.description || '-'}</p>
                    </div>
                    `,
                icon: 'info',
                showCloseButton: true, // Mantenemos el botón de cerrar 'X'
        
                // --- CONFIGURACIÓN DE BOTONES REORDENADOS ---
                showConfirmButton: true, // Botón 1: Editar
                confirmButtonText: 'Editar Reserva',
                confirmButtonColor: 'green', // Azul para editar (era el color de Cancel)
        
                showDenyButton: true,    // Botón 2: Añadir a Google
                denyButtonText: 'Añadir a Google Calendar',
                denyButtonColor: '#4285F4', // Azul Google
        
                showCancelButton: true,  // Botón 3: Borrar (usando Cancel)
                cancelButtonText: 'Borrar Reserva',
                cancelButtonColor: '#d33', // Rojo para borrar (era el color de Confirm)
                // --- FIN CONFIGURACIÓN BOTONES ---
        
                buttonsStyling: true, // Dejamos que Swal maneje estilos base
        
            }).then((result) => {
        
                // --- LÓGICA DEL .then AJUSTADA AL NUEVO ORDEN ---
        
                if (result.isConfirmed) { // Botón Confirmar -> AHORA ES EDITAR
                    console.log("Acción: Editar Reserva");
                    if (typeof openEditReservationModal === 'function'){
                        openEditReservationModal(reservationData);
                    } else { console.error("openEditReservationModal no definida"); }
        
                } else if (result.isDenied) { // Botón Denegar -> SIGUE SIENDO AÑADIR GOOGLE
                    console.log("Acción: Añadir a Google Calendar");
                    // ... (Lógica para abrir Google Calendar igual que antes) ...
                    const start = reservationData.start_time ? new Date(reservationData.start_time) : null;
                    const end = reservationData.end_time ? new Date(reservationData.end_time) : null;
                    if (start && !isNaN(start.getTime()) && end && !isNaN(end.getTime())) {
                        const googleStartDate = formatDateForGoogle(reservationData.start_time);
                        const googleEndDate = formatDateForGoogle(reservationData.end_time);
                        if (googleStartDate && googleEndDate) {
                            const googleDates = `${googleStartDate}/${googleEndDate}`;
                            const title = `Pos ${reservationData.position || '?'}: ${reservationData.user_name || '??'} (${reservationData.wavelength || '??'}nm)`;
                            const details = reservationData.description || `Reserva Reactor Medusa Pos ${reservationData.position || '?'}.`;
                            const location = `Reactor Medusa - Posición ${reservationData.position || '?'}`;
                            const googleCalendarUrl = `https://www.google.com/calendar/render?action=TEMPLATE` +
                                                      `&text=${encodeURIComponent(title)}` +
                                                      `&dates=${googleDates}` +
                                                      `&details=${encodeURIComponent(details)}` +
                                                      `&location=${encodeURIComponent(location)}`;
                            window.open(googleCalendarUrl, '_blank', 'noopener,noreferrer');
                        } else { /* manejo de error */ Swal.fire('Error', 'No se pudieron procesar las fechas.', 'error'); }
                    } else { /* manejo de error */ Swal.fire('Error', 'Fechas inválidas.', 'error'); }
                     // --- FIN LÓGICA GOOGLE CALENDAR ---
        
                } else if (result.dismiss === Swal.DismissReason.cancel) { // Botón Cancelar -> AHORA ES BORRAR
                     console.log("Acción: Borrar Reserva (desde botón Cancelar)");
                    // Llamamos a la función de confirmación/borrado
                     if (typeof confirmAndDeleteReservation === 'function'){
                          confirmAndDeleteReservation(reservationData.id);
                     } else { console.error("confirmAndDeleteReservation no definida"); }
                }
                // Nota: Si el usuario cierra con la 'X' (showCloseButton: true),
                // el resultado será result.dismiss === Swal.DismissReason.close
                // y no se ejecutará ninguna de estas acciones, lo cual es correcto.
        
            });
        }

        // --- NUEVA FUNCIÓN: Confirmar y Borrar ---
        function confirmAndDeleteReservation(reservationId) {
             if (!reservationId) {
                 Swal.fire('Error', 'ID de reserva inválido para borrar.', 'error');
                 return;
             }
            Swal.fire({
                title: '¿Estás seguro?',
                text: `¡No podrás revertir esto! Se borrará la reserva con ID: ${reservationId}`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                confirmButtonText: 'Sí, ¡borrar!',
                cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) {
                    // Llamar a la función que realmente borra
                     if (typeof deleteReservation === 'function'){
                        deleteReservation(reservationId);
                    } else { console.error("deleteReservation no definida"); }
                }
            });
        }

        // --- NUEVA FUNCIÓN: Borrar en Supabase ---
        async function deleteReservation(reservationId) {
            if (!reservationId) { Swal.fire('Error', 'No se proporcionó ID para borrar.', 'error'); return; }
            console.log(`Intentando borrar reserva ID: ${reservationId}`);
            try {
                 Swal.showLoading(); // Mostrar indicador

                const { error } = await supabaseClient
                    .from('reservations')
                    .delete()
                    .eq('id', reservationId);

                if (error) throw error;

                Swal.fire('¡Borrado!', 'La reserva ha sido eliminada.', 'success');

                // Refrescar UI
                renderGrid();
                initializeOrUpdateCalendar();

            } catch (error) {
                console.error('Error deleting reservation:', error);
                Swal.fire('Error', `No se pudo borrar la reserva: ${error.message}`, 'error');
            }
        }

        // --- NUEVA FUNCIÓN: Abrir Modal de Edición ---
        async function openEditReservationModal(reservationData) {
            console.log("Abriendo modal de edición para:", reservationData);
             if (!reservationData || !reservationData.id) {
                 console.error("openEditReservationModal llamada sin datos válidos o sin ID.");
                 Swal.fire('Error', 'No se pudieron cargar los datos para editar.', 'error');
                 return;
            }

            // Helper para formatear fecha ISO a YYYY-MM-DDTHH:mm
             const formatForInput = (isoDateString) => {
                 if (!isoDateString) return '';
                 try {
                     const date = new Date(isoDateString);
                     date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); // Ajustar a zona local
                     return date.toISOString().slice(0, 16); // Cortar a YYYY-MM-DDTHH:mm
                 } catch(e){
                      console.error("Error formateando fecha para input:", e);
                      return '';
                 }
             };

            const startTimeForInput = formatForInput(reservationData.start_time);
            const endTimeForInput = formatForInput(reservationData.end_time);

            Swal.fire({
                title: `Editar Reserva Pos. ${reservationData.position}`,
                html: `
                    <form id="swal-edit-form" style="text-align: left; padding: 0 10px;">
                        <input type="hidden" id="swal-reservation-id" value="${reservationData.id}">

                        <label for="swal-user_name" style="display: block; margin-bottom: 5px;">Usuario:</label>
                        <input type="text" id="swal-user_name" class="swal2-input" value="${reservationData.user_name || ''}" required style="margin-bottom: 10px;">

                        <label for="swal-wavelength" style="display: block; margin-bottom: 5px;">Longitud de Onda (nm):</label>
                        <input type="number" id="swal-wavelength" class="swal2-input" value="${reservationData.wavelength || ''}" required style="margin-bottom: 10px;">

                        <label for="swal-start_time" style="display: block; margin-bottom: 5px;">Inicio:</label>
                        <input type="datetime-local" id="swal-start_time" class="swal2-input" value="${startTimeForInput}" required style="margin-bottom: 10px;">

                        <label for="swal-end_time" style="display: block; margin-bottom: 5px;">Fin:</label>
                        <input type="datetime-local" id="swal-end_time" class="swal2-input" value="${endTimeForInput}" required style="margin-bottom: 10px;">

                        <label for="swal-description" style="display: block; margin-bottom: 5px;">Descripción:</label>
                        <textarea id="swal-description" class="swal2-textarea" style="width: 95%; margin-bottom: 10px;">${reservationData.description || ''}</textarea>
                    </form>
                `,
                width: '600px', // Hacer el modal un poco más ancho
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: 'Guardar Cambios',
                cancelButtonText: 'Cancelar',
                didOpen: () => { // Asegurar que los estilos de los input se apliquen bien
                     const inputs = Swal.getPopup().querySelectorAll('.swal2-input, .swal2-textarea');
                     inputs.forEach(input => input.style.width = '95%');
                 },
                preConfirm: () => {
                    // Recoger datos del formulario DENTRO del modal
                    const id = document.getElementById('swal-reservation-id').value;
                    const userName = document.getElementById('swal-user_name').value;
                    const wavelength = document.getElementById('swal-wavelength').value;
                    const startTime = document.getElementById('swal-start_time').value;
                    const endTime = document.getElementById('swal-end_time').value;
                    const description = document.getElementById('swal-description').value;

                    const updatedData = {
                        user_name: userName,
                        wavelength: parseInt(wavelength) || null,
                        start_time: startTime, // String de datetime-local
                        end_time: endTime,     // String de datetime-local
                        description: description
                    };

                    if (!userName || !wavelength || !startTime || !endTime) {
                        Swal.showValidationMessage(`Por favor, completa todos los campos requeridos.`);
                        return false;
                    }
                     // Validación básica de fechas en el modal
                     if (new Date(endTime) <= new Date(startTime)) {
                         Swal.showValidationMessage('La fecha de fin debe ser posterior a la fecha de inicio.');
                         return false;
                     }

                    return { id: id, data: updatedData };
                }
            }).then((result) => {
                if (result.isConfirmed && result.value) {
                     if (typeof updateReservation === 'function'){
                        updateReservation(result.value.id, result.value.data);
                    } else { console.error("updateReservation no definida"); }
                }
            });
        }


         // --- NUEVA FUNCIÓN: Actualizar en Supabase (con Logs de Control) ---
         async function updateReservation(reservationId, updatedData) {
            console.log(`Intentando actualizar reserva ID: ${reservationId} con datos:`, updatedData);
            if (!reservationId || !updatedData) {
                 Swal.fire('Error Interno', 'Faltan datos para la actualización.', 'error');
                 return;
            }

            // VALIDACIÓN INICIAL
            if (!updatedData.user_name || updatedData.wavelength === null || isNaN(updatedData.wavelength) || !updatedData.start_time || !updatedData.end_time) {
                Swal.fire('Error de Validación', 'Faltan campos requeridos o la longitud de onda no es válida.', 'error');
                return;
            }

            // VALIDACIÓN Y CONVERSIÓN DE FECHAS
            let startDate, endDate;
            try {
                startDate = new Date(updatedData.start_time);
                endDate = new Date(updatedData.end_time);
                if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) throw new Error("Formato de fecha inválido.");
                if (endDate <= startDate) throw new Error('Fin debe ser posterior a Inicio.');
                updatedData.start_time = startDate.toISOString();
                updatedData.end_time = endDate.toISOString();
                console.log("Fechas procesadas OK para UPDATE:", updatedData.start_time, updatedData.end_time); // Log añadido
            } catch (dateError) {
                 console.error("Error procesando fechas en actualización:", dateError);
                 Swal.fire('Error de Fechas', `Error en formato de fechas: ${dateError.message}`, 'error');
                 return;
            }

            // OBTENER POSICIÓN ORIGINAL
            let originalPosition;
            try {
                Swal.showLoading();
                const { data: originalData, error: fetchError } = await supabaseClient
                   .from('reservations').select('position').eq('id', reservationId).single();
                Swal.hideLoading();
                if (fetchError) throw fetchError;
                if (!originalData) throw new Error("No se encontró reserva original.");
                originalPosition = originalData.position;
                console.log("Posición original obtenida:", originalPosition); // Log añadido
            } catch(fetchError){
                 console.error("Error obteniendo posición original:", fetchError);
                 Swal.fire('Error Interno', 'No se pudo verificar la posición original para validar solapamiento.', 'error');
                 return;
            }

            // VALIDACIÓN DE SOLAPAMIENTO
            console.log(`Validando solapamiento para pos ${originalPosition} excluyendo ID ${reservationId}`);
            try {
                 Swal.showLoading();
                 const { count, error: validationError } = await supabaseClient
                     .from('reservations').select('*', { count: 'exact', head: true })
                     .eq('position', originalPosition)
                     .lt('start_time', updatedData.end_time)
                     .gt('end_time', updatedData.start_time)
                     .neq('id', reservationId);
                 Swal.hideLoading();
                 if (validationError) throw validationError;

                 console.log("Resultado validación solapamiento (count):", count);
                 if (count !== null && count > 0) {
                      Swal.fire('Conflicto de Horario', `Posición ${originalPosition} ya ocupada en ese horario por otra reserva.`, 'error');
                      return;
                 }
                  console.log("Validación de solapamiento OK.");
            } catch(validationError) {
                  Swal.hideLoading();
                  console.error('Error validación solapamiento en actualización:', validationError);
                  Swal.fire('Error de Validación', 'Error al comprobar disponibilidad del horario.', 'error');
                  return;
            }

            // --- SI TODAS LAS VALIDACIONES PASAN, ACTUALIZAR ---
            console.log(">>> PUNTO DE CONTROL: Antes de llamar a Supabase UPDATE"); // <-- LOG AÑADIDO
            try {
                 Swal.showLoading();
                const dataToUpdate = {
                    user_name: updatedData.user_name,
                    wavelength: updatedData.wavelength,
                    start_time: updatedData.start_time,
                    end_time: updatedData.end_time,
                    description: updatedData.description,
                };
                console.log(">>> PUNTO DE CONTROL: Datos a enviar en UPDATE:", dataToUpdate); // <-- LOG AÑADIDO

                // Llamada a Supabase UPDATE
                const { error: updateError } = await supabaseClient
                    .from('reservations')
                    .update(dataToUpdate)
                    .eq('id', reservationId);

                // Log INMEDIATAMENTE después del await
                console.log(">>> PUNTO DE CONTROL: Después de llamar a Supabase UPDATE. Error retornado:", updateError); // <-- LOG AÑADIDO

                // Comprobar error explícitamente
                if (updateError) {
                    console.error("Error explícito detectado en UPDATE:", updateError);
                    throw updateError; // Lanza el error para que lo capture el catch
                }

                // Si no hubo error, mostrar éxito y refrescar
                Swal.fire('¡Actualizado!', 'La reserva ha sido modificada.', 'success');

                console.log(">>> PUNTO DE CONTROL: Refrescando UI tras UPDATE exitoso"); // <-- LOG AÑADIDO
                renderGrid();
                initializeOrUpdateCalendar();

            } catch (errorCaught) { // Renombrado a errorCaught para evitar confusión
                console.error('Error en bloque catch del UPDATE:', errorCaught);
                Swal.fire('Error', `No se pudo actualizar la reserva: ${errorCaught.message}`, 'error');
            } finally {
                 console.log(">>> PUNTO DE CONTROL: Bloque finally del UPDATE"); // <-- LOG AÑADIDO
                 // No es necesario Swal.hideLoading() aquí si muestras un Swal de éxito/error
            }
        }
       // --- FIN FUNCIÓN updateReservation ---


       // --- FUNCION handleExport (Se mantiene igual) ---
       async function handleExport() {
           console.log("handleExport: Iniciando exportación...");
            if (!exportButton || !supabaseClient) { console.error("handleExport: Faltan elementos."); return; }
            exportButton.disabled = true; exportButton.textContent = 'Exportando...';
            try {
                if (typeof ics !== 'function') {
                     alert("Error: Falta librería ics.js para exportar.");
                     console.error("Librería ics no cargada.");
                     return; // Salir temprano
                }
                const { data, error } = await supabaseClient.from('reservations').select('*').order('start_time', { ascending: true });
                if (error) throw error;
                const reservationsToExport = data || [];
                if (reservationsToExport.length === 0) {
                     alert('No hay reservas para exportar.');
                     return; // Salir temprano
                }
                console.log(`handleExport: Exportando ${reservationsToExport.length} reservas.`);
                const cal = ics();
                reservationsToExport.forEach(res => {
                    if (res.start_time && res.end_time) {
                        const startDate = new Date(res.start_time);
                        const endDate = new Date(res.end_time);
                        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                            const subject = `Reserva Pos ${res.position}: ${res.user_name || '??'} (${res.wavelength || '??'}nm)`;
            const description = res.description || `Reserva para ${res.user_name || 'desconocido'} en posición ${res.position}.`;
            const location = `Reactor Medusa - Posición ${res.position}`; // O lo que tenga sentido
            // ¡Llamada real a addEvent!
            cal.addEvent(subject, description, location, startDate, endDate);
                        } else { console.warn("Export: Omitida reserva con fecha inválida:", res); }
                    } else { console.warn("Export: Omitida reserva sin fecha inicio/fin:", res); }
                });
                cal.download('medusa_reactor_schedule');
                console.log("handleExport: Descarga iniciada.");
            } catch (e) {
                console.error("Error durante la exportación:", e);
                alert("Ocurrió un error al generar o descargar el archivo .ics.");
            } finally {
                exportButton.disabled = false;
                exportButton.textContent = 'Exportar a .ics';
            }
       }

       // --- INICIALIZACIÓN y SUSCRIPCIONES (Se mantiene igual) ---
       console.log("Inicializando la aplicación...");
       renderGrid();
       initializeOrUpdateCalendar();

       reservationForm.addEventListener('submit', handleReservationSubmit);
       exportButton.addEventListener('click', handleExport);

       // Suscripción a tiempo real (igual)
       try {
           console.log("Suscribiéndose al canal...");
           const channel = supabaseClient.channel('public:reservations')
               .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, (payload) => {
                    if(typeof handleRealtimeChanges === 'function') { handleRealtimeChanges(payload); }
                    else { console.error("handleRealtimeChanges no definida."); }
                })
               .subscribe((status, err) => {
                   if (status === 'SUBSCRIBED') { console.log('¡Conectado al canal de tiempo real!'); }
                   else if (status === 'CHANNEL_ERROR') { console.error('Error en conexión del canal:', err); }
                   else { console.log("Estado del canal:", status); }
               });
           console.log('Suscripción iniciada.');
       } catch (channelError) {
           console.error("Error al suscribirse:", channelError);
           if (errorMessageDiv) errorMessageDiv.textContent = "No se pudo conectar en tiempo real.";
       }

   } else {
       // Fallo al cargar Supabase
       console.error("VERIFICACIÓN: ¡FALLÓ! 'supabase' no disponible.");
       const errorDiv = document.getElementById('error-message');
       if(errorDiv) errorDiv.textContent = "Error crítico (Supabase). Refrescar.";
   }
// --- NUEVA FUNCIÓN DE AYUDA PARA FORMATEAR FECHAS PARA GOOGLE CALENDAR ---
function formatDateForGoogle(isoDateString) {
    if (!isoDateString) return '';
    try {
        const date = new Date(isoDateString);
        if (isNaN(date.getTime())) return ''; // Devuelve vacío si la fecha no es válida

        // Funciones UTC para obtener los componentes en Tiempo Universal Coordinado
        const year = date.getUTCFullYear();
        // getUTCMonth() devuelve 0-11, por eso sumamos 1
        const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
        const day = date.getUTCDate().toString().padStart(2, '0');
        const hours = date.getUTCHours().toString().padStart(2, '0');
        const minutes = date.getUTCMinutes().toString().padStart(2, '0');
        const seconds = date.getUTCSeconds().toString().padStart(2, '0');

        // Formato YYYYMMDDTHHmmSSZ (Z indica UTC)
        return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
    } catch (e) {
        console.error("Error formateando fecha para Google Calendar:", e);
        return ''; // Devuelve vacío en caso de error
    }
}
// --- FIN FUNCIÓN DE AYUDA ---
}); // <-- FIN del addEventListener DOMContentLoaded
// --- END OF FILE script.js ---