# Recuperación de acceso mediante el administrador

1. En el login, pulsa **¿Olvidaste tu contraseña?** e introduce tu usuario (el correo de acceso registrado).
2. La petición aparece en **Recuperación de acceso** y en el contador de la campana del administrador. La fecha y la hora de cada solicitud se muestran en horario de Bolivia (America/La_Paz), con formato de 24 horas, junto a la dirección IP de origen. Las notificaciones se actualizan cada 20 segundos, al volver a la ventana o al pulsar **Actualizar**.
3. El administrador comprueba con el titular que pidió recuperar su cuenta y aprueba o rechaza. La solicitud procede del formulario público, así que el nombre mostrado identifica la cuenta indicada, no certifica quién escribió el formulario.
4. Aprobar asigna **12345678** como contraseña temporal durante 24 horas y cierra las sesiones anteriores. Rechazar conserva la contraseña vigente. No se envían correos.
5. El usuario inicia sesión con su correo y **12345678**. Se abre una ventana obligatoria para escribir la nueva contraseña y confirmarla. Solo puede completar ese cambio o cerrar sesión; los demás apartados están bloqueados también en el servidor.
6. Al guardar una contraseña distinta de la temporal, se invalidan todas las sesiones temporales y se abre una sesión normal. La contraseña personal se guarda con scrypt y no aparece en las respuestas ni en la vista del administrador.

La sesión para cambiar contraseña dura 10 minutos. Si vence, vuelve a iniciar sesión con la temporal mientras siga dentro de sus 24 horas. Si la temporal venció, solicita otra aprobación. Dos aprobaciones simultáneas no duplican la operación; dos cambios simultáneos no elevan sesiones antiguas.

Cambiar la contraseña, correo de acceso, rol o desactivar/eliminar una cuenta cancela sus solicitudes pendientes. Cambiar solo el teléfono no retira el cambio obligatorio. Las resoluciones y los cambios quedan registrados en auditoría sin contraseñas.

La recuperación de un administrador requiere otro administrador activo. No puede aprobarse a sí mismo. Si el único administrador pierde su contraseña y no conserva una sesión, este flujo requiere la intervención del responsable técnico en la base de datos.

El sistema ya no utiliza Gmail ni contraseñas de aplicación. Usuarios conserva el correo de acceso y el teléfono; el correo de recuperación se retiró del formulario y de la API. Los enlaces de correo anteriores no permiten cambiar contraseñas.

## IP de las solicitudes

La IP se guarda al crear la solicitud desde la conexión que observa el servidor. No se acepta una IP enviada en el formulario. Reenviar una solicitud pendiente, aprobarla o rechazarla conserva su IP y fecha originales. Solo el administrador puede consultar estos datos; las solicitudes anteriores a este cambio muestran **No registrada**.

Se admiten IPv4 e IPv6. Express confía únicamente en proxies locales y el proxy de Vite reemplaza `X-Forwarded-For` con la dirección de la conexión entrante. Un proxy de despliegue debe aplicar la misma regla. En pruebas desde el mismo equipo puede aparecer **127.0.0.1** o **::1**. La IP corresponde a la conexión de red; varios dispositivos pueden compartirla.

## Comprobación técnica

Desde `backend`, ejecuta `node --test tests/*.test.js`. Las pruebas usan un esquema PostgreSQL temporal y cuentas ficticias; no modifican usuarios reales ni envían correos. El esquema se prepara automáticamente al iniciar `node server.js`.
