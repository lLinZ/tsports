<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\GuardarSuscripcionPushRequest;
use App\Models\SuscripcionPush;
use App\Support\Push;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * SuscripcionPushController — dar de alta y de baja el móvil de cada
 * quien para los avisos con el panel cerrado.
 * ---------------------------------------------------------------------
 * NO HAY POLÍTICA PORQUE NO HACE FALTA: aquí nadie toca nada de otra
 * persona. El alta se guarda a nombre de quien hace la petición, y la
 * baja borra por endpoint —la dirección de ESTE navegador—, así que lo
 * único que se puede quitar es lo que se tiene delante.
 *
 * Y el alta REASIGNA si hace falta. En el ordenador compartido de la
 * oficina, si entra otra persona el endpoint ya existe a nombre de la
 * anterior; se actualiza en vez de duplicarse, porque el dispositivo
 * ahora lo usa quien acaba de entrar. Sin eso, el ordenador seguiría
 * recibiendo los avisos de quien lo usó antes.
 */
class SuscripcionPushController extends Controller
{
    /**
     * GET /api/push
     *
     * Si los avisos al móvil están encendidos y con qué clave se
     * suscribe el navegador. Mismo papel que /api/tiempo-real para el
     * WebSocket: la interfaz no pide permiso para unos avisos que el
     * servidor no puede mandar.
     */
    public function configuracion(): JsonResponse
    {
        return response()->json([
            'activo' => Push::estaActivo(),
            'clavePublica' => Push::clavePublica(),
        ]);
    }

    /**
     * POST /api/push/suscripciones
     *
     * Guarda este navegador. Se llama también cuando el navegador
     * renueva la suscripción por su cuenta, así que tiene que poder
     * repetirse sin duplicar nada.
     */
    public function store(GuardarSuscripcionPushRequest $peticion): JsonResponse
    {
        $datos = $peticion->validated();

        SuscripcionPush::updateOrCreate(
            ['endpoint' => $datos['endpoint']],
            [
                'usuario_id' => $peticion->user()->id,
                'clave_p256dh' => $datos['p256dh'],
                'clave_auth' => $datos['auth'],
                'dispositivo' => $datos['dispositivo'] ?? null,
            ],
        );

        return response()->json(['mensaje' => 'Este dispositivo recibirá los avisos.']);
    }

    /**
     * DELETE /api/push/suscripciones
     *
     * Deja de avisar a este navegador. Lo llama la interfaz al cerrar
     * sesión, que es lo que evita que el siguiente en entrar reciba los
     * avisos del anterior.
     *
     * Responde bien aunque no hubiera nada que borrar: quien quiere
     * dejar de recibir avisos ya los ha dejado de recibir, y un error
     * aquí solo complicaría el cierre de sesión.
     */
    public function destroy(Request $peticion): JsonResponse
    {
        $peticion->validate([
            'endpoint' => ['required', 'string', 'max:500'],
        ]);

        SuscripcionPush::query()
            ->where('endpoint', $peticion->string('endpoint')->toString())
            // Por el endpoint bastaría, pero el id de quien pregunta deja
            // escrito que aquí nadie puede borrar el dispositivo de otro
            // aunque conozca su dirección.
            ->where('usuario_id', $peticion->user()->id)
            ->delete();

        return response()->json(['mensaje' => 'Este dispositivo ya no recibirá avisos.']);
    }
}
