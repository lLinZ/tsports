<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoPropiedadEnLaWeb;
use App\Models\AccesoDeInvitados;
use App\Models\Propiedad;
use App\Support\LlaveDelCatalogo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\ValidationException;

/**
 * PropiedadesEnLaWebController — el catálogo que ve un invitado.
 * ---------------------------------------------------------------------
 * Rutas sin sesión del panel: la sección de propiedades de la web de la
 * agencia. Desde el 2026-09-30 el catálogo no lo ve cualquiera: se entra
 * con el usuario y la contraseña de invitado (AccesoDeInvitados), y eso
 * da una llave con la que se pide (LlaveDelCatalogo).
 *
 * Enseña las propiedades ACTIVAS que alguien marcó como publicadas, en
 * el orden del catálogo, con sus fotos para la web y su texto en los dos
 * idiomas. Qué sale y qué no lo decide RecursoPropiedadEnLaWeb, que es
 * una lista blanca: ni montos, ni documentos, ni notas internas.
 *
 * Sin llave, o con una caducada, responde 403 y no 401. En este sistema
 * un 401 significa «tu sesión del panel terminó», y el navegador de
 * alguien del equipo que mira la web con el panel abierto lo sacaría del
 * panel.
 */
class PropiedadesEnLaWebController extends Controller
{
    /**
     * GET /api/propiedades-en-la-web/acceso  (público)
     *
     * Si hay catálogo que enseñar, sin enseñarlo: la web lo usa para
     * decidir si pinta la sección (con su puerta) y el enlace del menú.
     * Sin acceso de invitados configurado nadie podría entrar, así que
     * tampoco se ofrece.
     */
    public function acceso(): JsonResponse
    {
        $hayCatalogo = AccesoDeInvitados::elVigente() !== null
            && Propiedad::query()->enLaWeb()->exists();

        return response()->json(['hayCatalogo' => $hayCatalogo]);
    }

    /**
     * POST /api/propiedades-en-la-web/entrar  (público, con límite)
     *
     * El usuario y la contraseña de invitado, a cambio de una llave.
     */
    public function entrar(Request $peticion): JsonResponse
    {
        $datos = $peticion->validate([
            'usuario' => ['required', 'string', 'max:60'],
            'contrasena' => ['required', 'string', 'max:100'],
        ], [
            'usuario.required' => 'Escribe el usuario.',
            'contrasena.required' => 'Escribe la contraseña.',
        ]);

        $acceso = AccesoDeInvitados::elVigente();

        // El mismo mensaje en los dos casos: decir cuál de los dos falla
        // le ahorra la mitad del trabajo a quien prueba contraseñas.
        if ($acceso === null || ! $acceso->aceptaA($datos['usuario'], $datos['contrasena'])) {
            throw ValidationException::withMessages([
                'contrasena' => 'El usuario o la contraseña no son correctos.',
            ]);
        }

        $llave = LlaveDelCatalogo::emitir($acceso);

        return response()->json([
            'llave' => $llave['llave'],
            'caducaEn' => $llave['caducaEn']->toIso8601String(),
        ]);
    }

    /**
     * GET /api/propiedades-en-la-web  (con la llave del invitado)
     */
    public function index(Request $peticion): AnonymousResourceCollection|JsonResponse
    {
        if (! LlaveDelCatalogo::abre($peticion->header(LlaveDelCatalogo::CABECERA))) {
            return response()->json([
                'mensaje' => 'Entra con el usuario de invitado para ver el catálogo.',
            ], 403);
        }

        $propiedades = Propiedad::query()
            ->enLaWeb()
            ->enOrdenDeCatalogo()
            ->with('galeria.archivo')
            ->get();

        return RecursoPropiedadEnLaWeb::collection($propiedades);
    }
}
