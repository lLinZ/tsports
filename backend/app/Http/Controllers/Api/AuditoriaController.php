<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoRegistroActividad;
use App\Models\RegistroActividad;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * AuditoriaController — el historial de lo que hace el equipo.
 * ---------------------------------------------------------------------
 * No tenía equivalente en la versión de Supabase. Responde a la pregunta
 * que más se repite cuando varias personas trabajan sobre las mismas
 * marcas: "¿quién cambió esto y cuándo?".
 *
 * Solo lo consulta un administrador.
 */
class AuditoriaController extends Controller
{
    /**
     * GET /api/admin/auditoria
     * Admite filtrar por usuario, por tipo de entidad y por acción.
     */
    public function index(Request $peticion): AnonymousResourceCollection
    {
        $this->authorize('verAuditoria', User::class);

        $consulta = RegistroActividad::query()->latest('id');

        if ($usuarioPedido = $peticion->query('usuario')) {
            $consulta->where('usuario_id', $usuarioPedido);
        }

        if ($entidadPedida = $peticion->query('entidad')) {
            $consulta->where('entidad_tipo', $entidadPedida);
        }

        if ($accionPedida = $peticion->query('accion')) {
            $consulta->where('accion', $accionPedida);
        }

        $registrosPorPagina = min((int) $peticion->query('porPagina', 50), 200);

        return RecursoRegistroActividad::collection($consulta->paginate($registrosPorPagina));
    }
}
