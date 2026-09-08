<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoRegistroActividad;
use App\Models\RegistroActividad;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * AuditoriaController — el historial de lo que hace el equipo.
 * ---------------------------------------------------------------------
 * No tenía equivalente en la versión de Supabase. Responde a la pregunta
 * que más se repite cuando varias personas trabajan sobre las mismas
 * marcas: "¿quién cambió esto y cuándo?".
 *
 * El historial crece rápido —cada guardado deja una línea—, así que sin
 * filtros deja de servir a las pocas semanas: la pregunta real nunca es
 * "¿qué ha pasado?" sino "¿qué hizo esta persona el martes?". De ahí que
 * se pueda acotar por fecha, por persona, por acción y por tipo de cosa,
 * y que los cuatro se combinen.
 *
 * Solo lo consulta un administrador.
 */
class AuditoriaController extends Controller
{
    /**
     * GET /api/admin/auditoria
     * Filtra por fecha, persona, acción y tipo de entidad.
     */
    public function index(Request $peticion): AnonymousResourceCollection
    {
        $this->authorize('verAuditoria', User::class);

        // Las fechas se validan antes de llegar al SQL: una cadena
        // cualquiera en la dirección no debe reventar la consulta ni,
        // peor, devolver un listado vacío sin explicar por qué.
        $datos = $peticion->validate([
            'desde' => ['nullable', 'date_format:Y-m-d'],
            'hasta' => ['nullable', 'date_format:Y-m-d'],
            'usuario' => ['nullable', 'string', 'max:255'],
            'entidad' => ['nullable', 'string', 'max:50'],
            'accion' => ['nullable', 'string', 'max:50'],
        ], [
            'desde.date_format' => 'La fecha «desde» tiene que ser AAAA-MM-DD.',
            'hasta.date_format' => 'La fecha «hasta» tiene que ser AAAA-MM-DD.',
        ]);

        $consulta = RegistroActividad::query()->latest('id');

        // Se compara solo el DÍA y no la marca de tiempo completa: quien
        // pide "hasta el 8" espera que entre todo lo del día 8, no lo
        // anterior a su medianoche.
        if (! empty($datos['desde'])) {
            $consulta->whereDate('created_at', '>=', $datos['desde']);
        }

        if (! empty($datos['hasta'])) {
            $consulta->whereDate('created_at', '<=', $datos['hasta']);
        }

        // La persona puede llegar como id de cuenta o como nombre: en el
        // historial queda grabado el nombre además del id, y así se puede
        // seguir filtrando por alguien cuya cuenta ya se borró.
        if (! empty($datos['usuario'])) {
            $consulta->where(function ($subconsulta) use ($datos): void {
                $subconsulta->where('usuario_id', $datos['usuario'])
                    ->orWhere('usuario_nombre', $datos['usuario']);
            });
        }

        if (! empty($datos['entidad'])) {
            $consulta->where('entidad_tipo', $datos['entidad']);
        }

        if (! empty($datos['accion'])) {
            $consulta->where('accion', $datos['accion']);
        }

        $registrosPorPagina = min((int) $peticion->query('porPagina', 50), 200);

        return RecursoRegistroActividad::collection($consulta->paginate($registrosPorPagina));
    }

    /**
     * GET /api/admin/auditoria/personas
     * Quién aparece en el historial, con cuántos movimientos tiene.
     *
     * Sale del propio historial y no de la tabla de cuentas a propósito:
     * el registro guarda el nombre además del id, así que aquí siguen
     * apareciendo quienes ya no tienen cuenta. Si la lista viniera de
     * `users`, sus movimientos quedarían en el historial sin manera de
     * pedirlos.
     */
    public function personas(): JsonResponse
    {
        $this->authorize('verAuditoria', User::class);

        $personas = RegistroActividad::query()
            ->selectRaw('COALESCE(usuario_nombre, ?) as nombre', ['Sistema'])
            ->selectRaw('MIN(usuario_id) as id')
            ->selectRaw('COUNT(*) as total')
            ->groupBy('nombre')
            ->orderBy('nombre')
            ->get()
            ->map(static fn ($fila): array => [
                // Se filtra por id cuando lo hay; si no, por el nombre.
                'id' => $fila->id ?: (string) $fila->nombre,
                'nombre' => (string) $fila->nombre,
                'totalMovimientos' => (int) $fila->total,
            ])
            ->all();

        return response()->json(['data' => $personas]);
    }
}
