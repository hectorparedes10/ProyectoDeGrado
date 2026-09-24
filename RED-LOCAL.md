# ARENA FUTSAL SYSTEM sin internet

El sistema funciona en una red local: **una laptop aloja la web, el servidor y PostgreSQL**; los celulares y otras computadoras se conectan a ella desde la misma Wi-Fi. No necesita alojamiento en la nube, dominio de pago ni conexión a internet para utilizar los módulos actuales.

## Cómo usarlo en casa, en la cancha o con un celular

1. Conecta la laptop y todos los dispositivos al mismo router Wi-Fi. También puedes conectarlos al punto de acceso de un celular, si ese teléfono permite mantenerlo activo sin datos móviles y comunicar los dispositivos entre sí.
2. En la laptop, abre **Iniciar-ARENA.cmd** con doble clic. PostgreSQL debe estar funcionando. Las dependencias ya instaladas en este proyecto permiten iniciar y preparar la web sin internet.
3. La ventana muestra la dirección actual, por ejemplo `http://192.168.0.21:5173/login`. Abre la dirección que aparece en esa ventana desde cada dispositivo.
4. Mantén la laptop y la ventana encendidas. Cada persona inicia sesión con su usuario; conserva sus permisos y utiliza la misma base de datos.

El celular que comparte la red actúa como punto de acceso. La laptop sigue siendo el servidor; el celular no sustituye PostgreSQL ni los procesos del proyecto.

## Cambiar de Wi-Fi o usar otro punto de acceso

El puerto continúa siendo **5173**. La dirección IP puede cambiar con cada red; la ventana de arranque revisa las direcciones cada cinco segundos y muestra el nuevo enlace. Los otros dispositivos deben abrir ese enlace nuevo. No hace falta editar archivos ni configurar una IP fija en el router.

El arranque identifica adaptadores Wi-Fi físicos para no confundir la VPN o las redes virtuales de la computadora. La detección no consulta internet. Si no hay Wi-Fi conectada, espera y muestra el enlace cuando se conecta.

La regla `ArenaFutsal-WiFi-5173`, autorizada por el usuario, está configurada y verificada para **TCP 5173, interfaces inalámbricas y subred local**, sin una IP, subred o alias de adaptador fijos. Windows mantiene el firewall activo. El script `scripts/Configurar-Red-Local.ps1` configura esa regla una sola vez y guarda el resultado en `scripts/red-local-resultado.json`.

Las redes de invitados y algunos puntos de acceso pueden aislar a sus clientes. En ese caso hay que permitir la comunicación entre dispositivos en el router o utilizar un punto de acceso que la permita; cambiar la web no elimina ese aislamiento. [Ayuda sobre aislamiento de clientes](https://support.google.com/chromecast/answer/7300406?hl=es).

## Datos, sesiones y diseño

Cambiar de red no borra usuarios, campeonatos ni solicitudes: permanecen en PostgreSQL en la laptop. Entrar por una IP distinta puede pedir iniciar sesión otra vez, porque el navegador considera cada dirección un sitio diferente.

Varias personas pueden trabajar simultáneamente. Dos sesiones normales de la misma cuenta también son independientes: cerrar una no cierra la otra. Las solicitudes se actualizan cada 20 segundos, al volver a la ventana o al pulsar Actualizar.

La fecha, hora e IP se guardan con cada solicitud de recuperación. El administrador consulta esos datos en Recuperación de acceso. Las fuentes del diseño están incluidas en los archivos locales; ya no se descargan de Google al abrir la página.

## Arranque y diagnóstico

El lanzador utiliza los servidores de ARENA que ya estén activos. Si faltan, inicia la API local y prepara la web con los archivos instalados. La API y PostgreSQL permanecen en la laptop; los clientes usan solamente el puerto web 5173. Si un puerto está ocupado por otro servicio, avisa y no detiene ese servicio.

Ctrl+C termina los servidores que haya iniciado esa ventana. Los servidores que ya estaban abiertos en otras terminales siguen funcionando. Si modificas el código mientras utilizas la versión preparada por el lanzador, cierra esa ventana y vuelve a abrirla para generar la versión actualizada.

Para consultar el enlace y comprobar los servidores sin iniciar procesos adicionales, ejecuta desde la carpeta del proyecto:

```powershell
node scripts/iniciar-local.cjs --comprobar
```

## Reconocimiento facial pendiente

Los módulos actuales funcionan por HTTP local. Cuando se implemente el reconocimiento facial, la cámara del navegador del celular requerirá HTTPS confiable. Se puede preparar HTTPS en la red local sin contratar un servicio, pero habrá que configurar la confianza en los dispositivos; este arranque todavía no habilita la cámara. [Requisitos de acceso a la cámara](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
