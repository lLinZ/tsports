<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\TiempoReal;
use Illuminate\Http\JsonResponse;

/**
 * TiempoRealController — lo que el navegador necesita para conectarse.
 * ---------------------------------------------------------------------
 * La clave de Reverb se entrega desde aquí y NO va compilada dentro del
 * frontend (con una variable VITE_), por dos motivos:
 *
 *   · Vive en un solo sitio, backend/.env. Compilada, habría que
 *     escribirla dos veces y mantener las dos iguales a mano, y el
 *     síntoma de que no coinciden es un WebSocket que se cierra sin
 *     explicar nada.
 *   · El mismo build sirve para producción y para test.tsports.tech,
 *     que tienen cada uno su propio Reverb con su propia clave.
 *
 * Host y puerto no hacen falta: el navegador abre el WebSocket contra el
 * mismo origen de la página y nginx (o Vite, en local) lo reenvía.
 */
class TiempoRealController extends Controller
{
    /**
     * GET /api/tiempo-real
     */
    public function configuracion(): JsonResponse
    {
        return response()->json([
            'activo' => TiempoReal::estaActivo(),
            'clave' => TiempoReal::clavePublica(),
        ]);
    }
}
