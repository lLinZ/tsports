<?php

declare(strict_types=1);

/**
 * config/cors.php — quién puede llamar a la API desde un navegador.
 * ---------------------------------------------------------------------
 * En producción el frontend y el backend salen por el MISMO dominio (el
 * nginx del VPS sirve el build de React y reenvía /api a Laravel), así
 * que CORS no llega ni a intervenir.
 *
 * Esta configuración existe para el desarrollo local, donde Vite corre
 * en el puerto 5173 y Laravel en el 8000, y para el caso de que algún
 * día el panel viva en un subdominio distinto.
 *
 * Los orígenes permitidos se leen de la variable de entorno
 * FRONTEND_URLS (separados por comas) para no tener que tocar código al
 * cambiar de dominio.
 */

$origenesPermitidos = array_values(array_filter(array_map(
    'trim',
    explode(',', (string) env('FRONTEND_URLS', 'http://localhost:5173,http://127.0.0.1:5173')),
)));

return [
    // Solo la API y el enlace de sesión necesitan cabeceras CORS.
    'paths' => ['api/*', 'sanctum/csrf-cookie', 'storage/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $origenesPermitidos,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    // El frontend necesita leer estas cabeceras de las respuestas.
    'exposed_headers' => ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],

    'max_age' => 3600,

    // Se usa autenticación por token (Bearer), no por cookie: no hacen
    // falta credenciales en las peticiones de origen cruzado.
    'supports_credentials' => false,
];
