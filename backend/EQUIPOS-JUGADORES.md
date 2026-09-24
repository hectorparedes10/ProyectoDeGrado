# Equipos, jugadores y estadísticas

Dentro de cada campeonato, la pestaña **Equipos e inscripciones** muestra tarjetas con nombre, curso y escudo. Si no se carga una imagen, aparece un emblema discreto con las iniciales del equipo.

Para registrar un equipo se solicitan nombre, curso, nombre del delegado y celular. El escudo es opcional. Administrador y mesa pueden registrar y editar; el árbitro consulta los datos.

Al abrir una tarjeta se muestra la plantilla ordenada por dorsal numérico. El nombre del jugador abre una ficha con foto, nombre completo, equipo, curso, edad, dorsal, goles y tarjetas acumuladas. El formulario exige nombres, apellidos, CI, curso, fecha de nacimiento, dorsal y fotografía tanto al registrar como al editar. No acepta valores vacíos ni textos formados solo por espacios. El dorsal 0 es válido. La edad se calcula automáticamente en horario de Bolivia. Un dorsal no se puede repetir dentro del mismo equipo.

Los escudos y las fotos se guardan con los registros en PostgreSQL. Se aceptan PNG, JPG y WebP de hasta 8 MB en el formulario; el navegador reduce la imagen antes de enviarla. El servidor acepta imágenes válidas de hasta 1 MiB y no utiliza enlaces externos. La base de datos conserva la imagen al editar otros campos.

Solo el administrador puede eliminar equipos y jugadores; mesa conserva el registro y la edición. La eliminación es definitiva en PostgreSQL e incluye las fotos y los registros asociados. Al borrar un jugador se eliminan sus participaciones, goles y tarjetas, se recalculan los marcadores y se libera su CI para un nuevo registro. Al borrar un equipo se eliminan también sus jugadores y encuentros, incluidas las estadísticas de ambos equipos en esos encuentros. No se elimina un equipo individual mientras tenga partidos pendientes o el calendario automático siga en curso. El administrador sí puede eliminar el campeonato completo con sus datos asociados. La confirmación explica las consecuencias antes de borrar.

## Partidos y acumulados

En **Fixture y partidos**, administrador y mesa pueden pulsar **Generar fechas**, indicar únicamente la hora límite diaria e iniciar la fecha 1. La programación usa los equipos inscritos, modalidad, hora de inicio, duración, descanso y canchas del campeonato. La primera fecha comienza desde el próximo horario disponible, en horario de Bolivia.

Al finalizar el último partido pendiente, el servidor genera la siguiente fecha automáticamente y una sola vez, incluso si varios dispositivos guardan resultados a la vez. Si queda tiempo continúa el mismo día; ningún encuentro termina después de la hora límite. Con una cancha evita que un equipo participe en dos partidos seguidos. Si no hay un cruce que permita ese descanso, pasa al día siguiente. Con varias canchas permite continuidad sin superponer equipos y procura alternar cancha. Los equipos impares tienen un descanso por vuelta. Ida y vuelta invierte la localía de cada cruce.

Los equipos participantes y condiciones deportivas quedan fijados al iniciar el calendario. Los nombres, contactos y datos de jugadores se pueden seguir editando. La generación admite hasta 256 equipos. Si ya había partidos manuales, el administrador debe eliminarlos antes de iniciar el generador.

Al abrir la planilla se seleccionan los participantes y se registran goles, amarillas y rojas de cada uno. El marcador se calcula a partir de esos goles.

Los acumulados oficiales incluyen únicamente partidos **finalizados**. La pestaña **Máximos goleadores** ordena los jugadores por goles y comparte posición cuando hay empate. El nombre permite abrir su ficha.

Corregir una planilla reemplaza sus registros anteriores en una transacción: no vuelve a sumar todo el partido. En partidos manuales o en la jornada actual aún no concluida, volver a marcar un encuentro como programado o en curso lo excluye de los acumulados. Las fechas anteriores al avance del calendario permiten corregir cifras, manteniendo el estado finalizado. Si otra persona guardó cambios mientras la planilla estaba abierta, se pide volver a cargarla para evitar sobrescribirlos.

Solo el administrador puede borrar un partido. Sus goles y tarjetas dejan de contar; si era el último pendiente, el calendario avanza. También puede eliminar un campeonato completo aunque contenga equipos, jugadores, partidos o un calendario en curso: se borra definitivamente de PostgreSQL junto con sus registros asociados, conservando la auditoría y las solicitudes de autorización. No se generan más fechas para ese campeonato.

Las acciones se registran con el usuario que las realiza. El árbitro mantiene solo lectura. Los contadores de tarjetas no aplican suspensiones automáticas; las reglas disciplinarias y el reconocimiento facial siguen pendientes.

Al iniciar esta versión, la migración elimina físicamente los registros deportivos que ya estaban marcados como eliminados por el administrador. Es transaccional e idempotente, conserva la auditoría y no selecciona campeonatos solamente inactivos ni cuentas de usuario.

## Verificación

Las pruebas de integración usan esquemas temporales de PostgreSQL y cuentas ficticias. Desde `backend`, ejecutar `node --test tests/*.test.js`.

Para revisión visual aislada, `node tests/roster-preview.cjs` crea datos de prueba y una web local en el puerto 5175. Escribir `cerrar` en esa terminal elimina únicamente su esquema de prueba. No modifica registros reales.
