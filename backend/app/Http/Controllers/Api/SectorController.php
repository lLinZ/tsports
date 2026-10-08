<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoSector;
use App\Models\Marca;
use App\Models\RegistroActividad;
use App\Models\Sector;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * SectorController — el catálogo de rubros.
 * ---------------------------------------------------------------------
 * Los sectores eran una lista escrita en el código, así que añadir uno
 * obligaba a tocar el repositorio y volver a desplegar. Ahora se
 * gestionan desde el panel.
 *
 * Dos reglas que este controlador garantiza y que son la razón de que
 * exista, en vez de un CRUD generado:
 *
 *   · RENOMBRAR arrastra el cambio a las marcas. La marca guarda el
 *     sector como texto, así que un renombrado a secas dejaría a todas
 *     las de ese rubro apuntando a un nombre que ya no está en el
 *     catálogo: desaparecerían del reparto por sector del resumen.
 *   · BORRAR un sector EN USO se rechaza. Se ofrece desactivarlo, que
 *     lo quita del selector sin tocar las marcas que ya lo llevan.
 *
 * DINERO POR SECTOR (desde el 2026-10-07, a petición de LinZ): la suma
 * del valor de las propuestas enviadas de las marcas de cada sector. Es
 * la misma cuenta que el reparto por sector del resumen y la del
 * pipeline (regla 4: sin propuesta el valor no cuenta), así que la suma
 * de la columna, con la fila «Sin sector», da el valor propuesto de la
 * agencia. Solo se calcula para quien ve las cifras de toda la empresa:
 * un agente no tiene por qué saber cuánto mueve la agencia en cada rubro.
 */
class SectorController extends Controller
{
    /**
     * GET /api/sectores
     *
     * `soloActivos=1` deja fuera los retirados: es lo que pide el
     * selector de la ficha, donde ofrecer un rubro que el equipo ya no
     * trabaja solo sirve para equivocarse.
     */
    public function index(Request $peticion): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Sector::class);

        $consulta = Sector::query()->enOrdenDeCatalogo();

        if ($peticion->boolean('soloActivos')) {
            $consulta->activos();
        }

        $sectores = $consulta->get();

        /** @var User $usuario */
        $usuario = $peticion->user();
        $conDinero = $usuario->rol->veLasCifrasDeTodaLaEmpresa();

        // Los totales, en UNA consulta agrupada y no una por fila. Con
        // doce sectores la diferencia no se nota, pero el catálogo está
        // pensado para que el equipo lo haga crecer. Las marcas sin
        // sector salen en su propio grupo (clave vacía).
        $porSector = Marca::query()
            ->selectRaw("COALESCE(sector, '') as sector_de_la_marca")
            ->selectRaw('COUNT(*) as total')
            ->selectRaw('SUM(CASE WHEN fase_propuesta_completada = 1 THEN valor_anual_usd ELSE 0 END) as valor')
            ->groupByRaw("COALESCE(sector, '')")
            ->get()
            ->keyBy('sector_de_la_marca');

        $sectores->each(static function (Sector $sector) use ($porSector, $conDinero): void {
            $fila = $porSector->get($sector->nombre);

            $sector->setAttribute('total_marcas', (int) ($fila->total ?? 0));

            if ($conDinero) {
                $sector->setAttribute('valor_propuesto_usd', round((float) ($fila->valor ?? 0), 2));
            }
        });

        $respuesta = RecursoSector::collection($sectores);

        if (! $conDinero) {
            return $respuesta;
        }

        // Lo que no cae en ningún sector del catálogo: sin sector, o con
        // un nombre que ya no está (no debería quedar ninguna, porque
        // renombrar arrastra, pero lo importado de Supabase no pasó por
        // aquí). Sin esta fila la columna no sumaría el total.
        $nombresDelCatalogo = Sector::query()->pluck('nombre')->all();
        $fueraDelCatalogo = $porSector->reject(
            fn ($fila): bool => in_array($fila->sector_de_la_marca, $nombresDelCatalogo, true),
        );

        return $respuesta->additional([
            'sinSector' => [
                'totalMarcas' => (int) $fueraDelCatalogo->sum('total'),
                'valorPropuestoUsd' => round((float) $fueraDelCatalogo->sum('valor'), 2),
                // Los nombres que llevan esas marcas y no están en la
                // lista: es la pista para añadirlos al catálogo.
                'nombresFueraDelCatalogo' => $fueraDelCatalogo->keys()
                    ->reject(fn (string $nombre): bool => $nombre === '')
                    ->sort()
                    ->values()
                    ->all(),
            ],
            'totalValorPropuestoUsd' => round((float) $porSector->sum('valor'), 2),
        ]);
    }

    /**
     * POST /api/sectores
     */
    public function store(Request $peticion): JsonResponse
    {
        $this->authorize('create', Sector::class);

        $datos = $this->validar($peticion);

        $sector = new Sector([
            'nombre' => $datos['nombre'],
            'activo' => $datos['activo'] ?? true,
            // Al final de la lista: el orden lo decide quien lo crea, y
            // lo natural es que lo nuevo se añada detrás de lo que ya
            // estaba, no en medio.
            'orden' => (int) Sector::query()->max('orden') + 1,
        ]);

        $sector->save();

        RegistroActividad::anotar(
            $peticion->user(),
            RegistroActividad::ACCION_CREO,
            'sector',
            $sector->id,
            'Creó el sector '.$sector->nombre,
        );

        return (new RecursoSector($sector))->response()->setStatusCode(201);
    }

    /**
     * PUT /api/sectores/{sector}
     *
     * Si cambia el nombre, se arrastra a las marcas que lo llevan. Las
     * dos escrituras van en una transacción: a medias dejaría marcas
     * apuntando a un rubro inexistente, que es justo lo que se evita.
     */
    public function update(Request $peticion, Sector $sector): RecursoSector
    {
        $this->authorize('update', $sector);

        $datos = $this->validar($peticion, $sector);

        $nombreAnterior = $sector->nombre;
        $nombreNuevo = $datos['nombre'];

        DB::transaction(function () use ($sector, $datos, $nombreAnterior, $nombreNuevo): void {
            $sector->fill([
                'nombre' => $nombreNuevo,
                'activo' => $datos['activo'] ?? $sector->activo,
            ]);

            $sector->save();

            if ($nombreAnterior !== $nombreNuevo) {
                Marca::query()
                    ->where('sector', $nombreAnterior)
                    ->update(['sector' => $nombreNuevo]);
            }
        });

        RegistroActividad::anotar(
            $peticion->user(),
            RegistroActividad::ACCION_ACTUALIZO,
            'sector',
            $sector->id,
            $nombreAnterior === $nombreNuevo
                ? 'Editó el sector '.$sector->nombre
                : sprintf('Renombró el sector %s a %s', $nombreAnterior, $nombreNuevo),
        );

        return new RecursoSector($sector->fresh());
    }

    /**
     * DELETE /api/sectores/{sector}
     *
     * Solo si no lo usa ninguna marca. Con marcas dentro se responde 422
     * explicando cuántas son y ofreciendo desactivarlo: borrarlo las
     * dejaría con un rubro fuera del catálogo, invisible en el reparto
     * por sector del resumen.
     */
    public function destroy(Request $peticion, Sector $sector): JsonResponse
    {
        $this->authorize('delete', $sector);

        $marcasQueLoUsan = $sector->totalDeMarcas();

        if ($marcasQueLoUsan > 0) {
            throw ValidationException::withMessages([
                'nombre' => sprintf(
                    'No se puede borrar: %d %s en este sector. Desactívalo para quitarlo del selector sin tocarlas.',
                    $marcasQueLoUsan,
                    $marcasQueLoUsan === 1 ? 'marca está' : 'marcas están',
                ),
            ]);
        }

        $nombre = $sector->nombre;
        $identificador = $sector->id;

        $sector->delete();

        RegistroActividad::anotar(
            $peticion->user(),
            RegistroActividad::ACCION_ELIMINO,
            'sector',
            $identificador,
            'Eliminó el sector '.$nombre,
        );

        return response()->json(['mensaje' => 'Sector eliminado.']);
    }

    /**
     * Las reglas del formulario, en un solo sitio porque el alta y la
     * edición piden exactamente lo mismo.
     *
     * @return array<string,mixed>
     */
    private function validar(Request $peticion, ?Sector $sector = null): array
    {
        return $peticion->validate([
            'nombre' => [
                'required',
                'string',
                'max:80',
                // Dos rubros con el mismo nombre serían el mismo rubro
                // partido en dos filas del resumen.
                Rule::unique('sectores', 'nombre')->ignore($sector?->id),
            ],
            'activo' => ['nullable', 'boolean'],
        ], [
            'nombre.required' => 'El sector necesita un nombre.',
            'nombre.unique' => 'Ya existe un sector con ese nombre.',
            'nombre.max' => 'El nombre del sector es demasiado largo.',
        ]);
    }
}
