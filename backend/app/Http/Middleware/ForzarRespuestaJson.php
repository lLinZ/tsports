<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * ForzarRespuestaJson — la API siempre contesta en JSON.
 * ---------------------------------------------------------------------
 * Laravel decide el formato de la respuesta mirando la cabecera Accept
 * que envía el cliente. Si por lo que sea llega una petición sin ella
 * (una prueba desde el navegador, un curl a secas, un proxy que la
 * reescribe), Laravel devolvería HTML y el frontend recibiría una página
 * de error en lugar de un objeto que pueda leer.
 *
 * Este middleware fuerza `Accept: application/json` en todo lo que entra
 * por /api, de modo que el contrato de la API no dependa de lo bien
 * educado que sea el cliente.
 */
class ForzarRespuestaJson
{
    public function handle(Request $peticion, Closure $siguiente): Response
    {
        $peticion->headers->set('Accept', 'application/json');

        return $siguiente($peticion);
    }
}
