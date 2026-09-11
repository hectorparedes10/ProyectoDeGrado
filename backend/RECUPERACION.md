# Recuperación de acceso mediante el administrador

1. En el login, pulsa **¿Olvidaste tu contraseña?** e introduce tu usuario (el correo de acceso registrado).
2. La petición aparece en **Solicitudes → Recuperación de acceso** y en el contador de la campana del administrador. Las notificaciones se actualizan cada 20 segundos, al volver a la ventana o al pulsar **Actualizar**.
3. El administrador comprueba con el titular que pidió recuperar su cuenta y aprueba o rechaza. La solicitud procede del formulario público, así que el nombre mostrado identifica la cuenta indicada, no certifica quién escribió el formulario.
4. Aprobar asigna **12345678** como contraseña temporal durante 24 horas y cierra las sesiones anteriores. Rechazar conserva la contraseña vigente. No se envían correos.
5. El usuario inicia sesión con su correo y **12345678**. Se abre una ventana obligatoria para escribir la nueva contraseña y confirmarla. Solo puede completar ese cambio o cerrar sesión; los demás apartados están bloqueados también en el servidor.
6. Al guardar una contraseña distinta de la temporal, se invalidan todas las sesiones temporales y se abre una sesión normal. La contraseña personal se guarda con scrypt y no aparece en las respuestas ni en la vista del administrador.

La sesión para cambiar contraseña dura 10 minutos. Si vence, vuelve a iniciar sesión con la temporal mientras siga dentro de sus 24 horas. Si la temporal venció, solicita otra aprobación. Dos aprobaciones simultáneas no duplican la operación; dos cambios simultáneos no elevan sesiones antiguas.

Cambiar la contraseña, correo de acceso, correo de recuperación, rol o desactivar/eliminar una cuenta cancela sus solicitudes pendientes. Cambiar solo el teléfono no retira el cambio obligatorio. Las resoluciones y los cambios quedan registrados en auditoría sin contraseñas.

La recuperación de un administrador requiere otro administrador activo. No puede aprobarse a sí mismo. Si el único administrador pierde su contraseña y no conserva una sesión, este flujo requiere la intervención del responsable técnico en la base de datos.

El sistema ya no utiliza Gmail ni contraseñas de aplicación. Los campos de teléfono y correo de recuperación de Usuarios se conservan como datos de contacto. Los enlaces de correo anteriores no permiten cambiar contraseñas.

## Comprobación técnica

Desde `backend`, ejecuta `node --test tests/*.test.js`. Las pruebas usan un esquema PostgreSQL temporal y cuentas ficticias; no modifican usuarios reales ni envían correos. El esquema se prepara automáticamente al iniciar `node server.js`.
