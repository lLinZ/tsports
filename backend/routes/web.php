<?php

declare(strict_types=1);

/**
 * routes/web.php — rutas servidas directamente por Laravel.
 * ---------------------------------------------------------------------
 * En este proyecto Laravel es SOLO una API: la interfaz entera vive en
 * el frontend de React, que nginx sirve como ficheros estáticos (ver
 * deploy/nginx.conf).
 *
 * Por eso aquí queda muy poco:
 *   · Una portada de cortesía para quien abra el dominio del backend por
 *     error, que le dice dónde está la web de verdad.
 *   · La ruta de salud /up, que Laravel registra sola y usa el VPS para
 *     comprobar que el servicio responde.
 */

use Illuminate\Support\Facades\Route;

Route::get('/', function (): array {
    return [
        'servicio' => 'API de TS Sports',
        'estado' => 'en marcha',
        'documentacion' => 'Las rutas disponibles están en routes/api.php',
        'version' => config('app.version', '1.0.0'),
    ];
});
