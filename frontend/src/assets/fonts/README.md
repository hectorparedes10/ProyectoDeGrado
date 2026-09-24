# Fuentes locales de ARENA FUTSAL

Se conservan los archivos WOFF2 oficiales usados por la hoja de Google Fonts del diseño: Barlow Condensed (600, 700 y 800; subconjuntos vietnamese, latin-ext y latin) y DM Sans (400, 500, 600 y 700; latin-ext y latin). Google sirve el mismo archivo DM Sans para los cuatro pesos de cada subconjunto; se almacena una sola copia de cada uno.

`fonts.css` conserva los pesos, estilos, `font-display` y rangos Unicode de la hoja original. Todas sus URLs apuntan a archivos de esta carpeta, por lo que el navegador obtiene las fuentes desde ARENA aun cuando la red Wi-Fi o el hotspot no tenga internet.

Origen de la hoja: https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap

`sources.json` documenta las URLs oficiales de cada archivo y sus SHA-256. Los binarios no fueron modificados. Las licencias SIL Open Font License 1.1 completas y sus avisos de copyright están en `BarlowCondensed-OFL.txt` y `DMSans-OFL.txt`. Sus copias idénticas en `frontend/public/fonts/` se publican en `/fonts/` y Vite las copia al compilar para que acompañen las fuentes distribuidas.
