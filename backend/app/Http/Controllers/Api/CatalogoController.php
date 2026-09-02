<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\CatalogosDelCrm;
use Illuminate\Http\JsonResponse;

/**
 * CatalogoController — las listas cerradas que usa la interfaz.
 * ---------------------------------------------------------------------
 * Zonas, sectores, vías de contacto, roles, temas y colores de acento.
 * El frontend las pide una vez al arrancar y con ellas puebla todos sus
 * selectores.
 *
 * Existe para que esas listas dejen de estar duplicadas: antes vivían
 * copiadas en tres ficheros JavaScript distintos y añadir una zona
 * significaba acordarse de tocarlos todos.
 */
class CatalogoController extends Controller
{
    /**
     * GET /api/catalogos
     */
    public function index(): JsonResponse
    {
        return response()->json(CatalogosDelCrm::comoArreglo());
    }
}
