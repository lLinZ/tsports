<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoNotificacion;
use App\Models\Notificacion;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * NotificacionController — la campanita.
 * ---------------------------------------------------------------------
 * Todo lo de aquí trabaja sobre los avisos de QUIEN PREGUNTA y de nadie
 * más: el listado se corta por destinatario en la consulta, y las rutas
 * que reciben un id pasan por `NotificacionPolicy`.
 *
 * Aquí no se crean avisos. Los crea `App\Support\Notificador` cuando pasa
 * algo que merece uno.
 */
class NotificacionController extends Controller
{
    /**
     * GET /api/notificaciones
     * Las de la persona, las últimas primero. Paginado para el scroll
     * infinito de la página de avisos; la campanita pide solo la primera.
     *
     * ?soloSinLeer=1 deja fuera las leídas.
     */
    public function index(Request $peticion): AnonymousResourceCollection
    {
        /** @var User $persona */
        $persona = $peticion->user();

        $consulta = Notificacion::query()
            ->de($persona)
            ->when($peticion->boolean('soloSinLeer'), fn ($consulta) => $consulta->sinLeer())
            ->orderByDesc('created_at')
            // Desempate, igual que en el tablero: un lead avisa a varias
            // personas en el mismo segundo, y sin él una página podría
            // repetir un aviso y saltarse otro.
            ->orderByDesc('id');

        $porPagina = max(1, min((int) $peticion->query('porPagina', 30), 100));

        return RecursoNotificacion::collection($consulta->paginate($porPagina));
    }

    /**
     * GET /api/notificaciones/sin-leer
     * El número de la campanita. Va aparte del listado porque se pide
     * mucho más a menudo y no necesita traer ningún aviso.
     */
    public function contarSinLeer(Request $peticion): JsonResponse
    {
        /** @var User $persona */
        $persona = $peticion->user();

        return response()->json([
            'sinLeer' => Notificacion::query()->de($persona)->sinLeer()->count(),
        ]);
    }

    /**
     * PATCH /api/notificaciones/{notificacion}/leida
     * Marcar una como leída. Marcar dos veces la misma no cambia su hora
     * de lectura: la primera es la que cuenta.
     */
    public function marcarComoLeida(Notificacion $notificacion): RecursoNotificacion
    {
        $this->authorize('update', $notificacion);

        if (! $notificacion->estaLeida()) {
            $notificacion->leida_en = now();
            $notificacion->save();
        }

        return new RecursoNotificacion($notificacion);
    }

    /**
     * POST /api/notificaciones/leidas
     * «Marcar todas como leídas». Solo toca las de quien lo pide.
     */
    public function marcarTodasComoLeidas(Request $peticion): JsonResponse
    {
        /** @var User $persona */
        $persona = $peticion->user();

        $marcadas = Notificacion::query()
            ->de($persona)
            ->sinLeer()
            ->update(['leida_en' => now()]);

        return response()->json([
            'marcadas' => $marcadas,
            'mensaje' => $marcadas === 0
                ? 'No tenías avisos sin leer.'
                : ($marcadas === 1 ? 'Marcado como leído.' : "Marcados {$marcadas} avisos como leídos."),
        ]);
    }
}
