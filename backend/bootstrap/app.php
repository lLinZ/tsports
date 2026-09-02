<?php

declare(strict_types=1);

/**
 * bootstrap/app.php — arranque y configuración global de Laravel.
 * ---------------------------------------------------------------------
 * Aquí se define el enrutado, los middleware y, sobre todo, cómo se
 * traducen los errores a JSON.
 *
 * Lo último importa mucho en este proyecto: el frontend es una SPA que
 * SIEMPRE espera JSON con la misma forma. Toda respuesta de error de
 * /api sale así:
 *
 *     { "mensaje": "texto para enseñar al usuario",
 *       "errores": { "campo": ["motivo"] } }        // solo en un 422
 *
 * Con eso, la capa de red del cliente tiene un único sitio donde leer el
 * motivo y no necesita adivinar la forma según el código de estado.
 */

use App\Http\Middleware\ForzarRespuestaJson;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // CORS: necesario mientras el frontend corre en otro puerto
        // (Vite en :5173 y Laravel en :8000). En producción los dos
        // salen por el mismo dominio y esto deja de intervenir.
        $middleware->api(prepend: [
            \Illuminate\Http\Middleware\HandleCors::class,
            ForzarRespuestaJson::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        /*
         | Se usa respond() y no render() a propósito.
         |
         | Laravel normaliza las excepciones ANTES de consultar los
         | render(): una AuthorizationException ya ha pasado a ser una
         | AccessDeniedHttpException cuando llega ahí, así que engancharse
         | por tipo de excepción no funciona de forma fiable.
         |
         | respond() actúa sobre la respuesta ya construida, justo antes
         | de enviarla, y ese sí es un punto único por el que pasa todo.
         */
        $exceptions->respond(function (Response $respuesta, \Throwable $excepcion, Request $peticion): Response {
            // Fuera de /api (por ejemplo la portada) se deja el
            // comportamiento normal de Laravel.
            if (! $peticion->is('api/*')) {
                return $respuesta;
            }

            $codigoDeEstado = $respuesta->getStatusCode();

            // Los errores de validación ya vienen con el detalle por
            // campo; solo se renombran las claves a la convención propia.
            if ($codigoDeEstado === 422) {
                $cuerpoOriginal = json_decode((string) $respuesta->getContent(), true) ?: [];

                return response()->json([
                    'mensaje' => $cuerpoOriginal['message'] ?? 'Revisa los datos del formulario.',
                    'errores' => $cuerpoOriginal['errors'] ?? [],
                ], 422);
            }

            // Mensajes en español para los códigos que el equipo puede
            // encontrarse de verdad usando el CRM.
            $mensajesPorCodigo = [
                401 => 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
                403 => 'No tienes permiso para hacer esto.',
                404 => 'No encontramos lo que buscabas. Puede que alguien lo haya eliminado.',
                405 => 'Esa operación no está permitida en esta dirección.',
                413 => 'El fichero que intentas subir es demasiado grande.',
                429 => 'Demasiadas peticiones seguidas. Espera unos segundos y vuelve a intentarlo.',
                500 => 'Se produjo un error en el servidor. Ya ha quedado registrado.',
                503 => 'El servicio está en mantenimiento. Vuelve a intentarlo en unos minutos.',
            ];

            $mensajeParaElUsuario = $mensajesPorCodigo[$codigoDeEstado]
                ?? 'No se pudo completar la operación.';

            $cuerpoDeLaRespuesta = ['mensaje' => $mensajeParaElUsuario];

            // En desarrollo se adjunta el detalle técnico real, que es lo
            // que hace falta para depurar. En producción jamás: revelaría
            // rutas del servidor y la estructura interna.
            if (config('app.debug')) {
                $cuerpoDeLaRespuesta['detalleTecnico'] = $excepcion->getMessage();
                $cuerpoDeLaRespuesta['excepcion'] = $excepcion::class;
            }

            return response()->json($cuerpoDeLaRespuesta, $codigoDeEstado);
        });
    })
    ->booted(function (): void {
        // Los identificadores de la API son UUID. Declararlo evita que
        // una ruta con basura en el id llegue siquiera a la base de datos.
        Route::pattern('marca', '[0-9a-fA-F-]{36}');
        Route::pattern('usuario', '[0-9a-fA-F-]{36}');
        Route::pattern('comentario', '[0-9a-fA-F-]{36}');
        Route::pattern('archivo', '[0-9a-fA-F-]{36}');
        Route::pattern('evento', '[0-9a-fA-F-]{36}');
    })
    ->create();
