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
use Illuminate\Support\Facades\DB;

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

        // La persona puede llegar como id de cuenta o como nombre, y se
        // busca por las dos cosas: el historial graba el nombre además
        // del id, así que se puede seguir consultando lo que hizo alguien
        // cuya cuenta ya se borró. De paso, si una misma persona llegara
        // a tener dos cuentas, saldría entera en vez de repartida. Es la
        // misma regla que sigue el filtro por agente del tablero.
        //
        // Se comprueba contra la cadena vacía y no con `empty()`: para PHP
        // la cadena "0" está vacía, así que un filtro que valiera "0" se
        // ignoraría en silencio y la pantalla enseñaría el historial
        // entero como si no se hubiera filtrado nada.
        if (($datos['usuario'] ?? '') !== '') {
            $personaPedida = $datos['usuario'];
            $cuenta = User::query()->find($personaPedida);
            $nombreBuscado = $cuenta?->nombreParaMostrar() ?? $personaPedida;

            $consulta->where(function ($subconsulta) use ($personaPedida, $nombreBuscado): void {
                $subconsulta->where('usuario_id', $personaPedida)
                    ->orWhereRaw(
                        'LOWER(TRIM(usuario_nombre)) = ?',
                        [mb_strtolower(trim($nombreBuscado))],
                    );
            });
        }

        if (($datos['entidad'] ?? '') !== '') {
            $consulta->where('entidad_tipo', $datos['entidad']);
        }

        if (($datos['accion'] ?? '') !== '') {
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

        // Se consulta con el constructor de consultas y NO con el modelo,
        // y el identificador de la persona NO se llama `id`.
        //
        // Las dos cosas son la misma trampa, que costó un despliegue:
        // `registros_actividad` tiene una clave primaria entera, así que
        // Eloquent castea a entero cualquier columna que llegue con el
        // alias `id`. Un `MIN(usuario_id)` que vale
        // "01a07f25-7f83-70bd-…" se leía como 1. Con eso, todas las
        // personas salían con la misma clave —el desplegable perdía a la
        // mayoría— y al filtrar se enviaba un 1 que no correspondía a
        // nadie, así que el historial salía vacío. `DB::table` devuelve
        // objetos planos, sin casteos que adivinen tipos.
        // La agrupación se normaliza en SQL (minúsculas, sin espacios
        // sobrantes) y no en PHP: MariaDB compara sin distinguir
        // mayúsculas y SQLite sí, así que agrupar por la columna tal cual
        // daría una lista en el servidor y otra en las pruebas.
        $movimientos = DB::table('registros_actividad')
            ->selectRaw('LOWER(TRIM(COALESCE(usuario_nombre, ?))) as clave', ['Sistema'])
            ->selectRaw('MIN(TRIM(COALESCE(usuario_nombre, ?))) as nombre', ['Sistema'])
            ->selectRaw('MIN(usuario_id) as usuario_id')
            ->selectRaw('COUNT(*) as total')
            ->groupBy('clave')
            ->get()
            ->keyBy(fn ($fila): string => (string) $fila->clave);

        $personas = $movimientos->map(static fn ($fila): array => [
            // Se filtra por id de cuenta cuando lo hay; si no —alguien a
            // quien ya se le borró la cuenta—, por su nombre.
            'id' => $fila->usuario_id ?: (string) $fila->nombre,
            'nombre' => (string) $fila->nombre,
            'totalMovimientos' => (int) $fila->total,
        ])->values();

        // Las cuentas que todavía no han hecho nada también salen, con
        // cero. Que alguien falte del desplegable se lee como un fallo;
        // verlo con un cero contesta la pregunta.
        $sinMovimientos = User::query()
            ->where('activo', true)
            ->orderBy('name')
            ->get()
            ->reject(fn (User $usuario): bool => $movimientos->has(
                mb_strtolower(trim($usuario->nombreParaMostrar())),
            ))
            ->map(static fn (User $usuario): array => [
                'id' => $usuario->id,
                'nombre' => $usuario->nombreParaMostrar(),
                'totalMovimientos' => 0,
            ]);

        $todas = $personas->concat($sinMovimientos)
            ->sortBy('nombre', SORT_NATURAL | SORT_FLAG_CASE)
            ->values()
            ->all();

        return response()->json(['data' => $todas]);
    }
}
