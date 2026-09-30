<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoPropiedadEnLaWeb;
use App\Models\Propiedad;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * PropiedadesEnLaWebController — el catálogo que ve un visitante.
 * ---------------------------------------------------------------------
 * Ruta pública, sin sesión: la sección de propiedades de la web de la
 * agencia. Enseña las propiedades ACTIVAS que alguien marcó como
 * publicadas, en el orden del catálogo, con sus fotos para la web y su
 * texto en los dos idiomas.
 *
 * Qué sale y qué no lo decide RecursoPropiedadEnLaWeb, que es una lista
 * blanca: ni montos, ni documentos, ni notas internas.
 */
class PropiedadesEnLaWebController extends Controller
{
    /**
     * GET /api/propiedades-en-la-web  (público)
     */
    public function index(): AnonymousResourceCollection
    {
        $propiedades = Propiedad::query()
            ->enLaWeb()
            ->enOrdenDeCatalogo()
            ->with('galeria.archivo')
            ->get();

        return RecursoPropiedadEnLaWeb::collection($propiedades);
    }
}
