<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoSector;
use App\Models\Marca;
use App\Models\RegistroActividad;
use App\Models\Sector;
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

        // Los totales, en UNA consulta agrupada y no una por fila. Con
        // doce sectores la diferencia no se nota, pero el catálogo está
        // pensado para que el equipo lo haga crecer.
        $marcasPorSector = Marca::query()
            ->selectRaw('sector, COUNT(*) as total')
            ->whereNotNull('sector')
            ->groupBy('sector')
            ->pluck('total', 'sector');

        $sectores->each(static function (Sector $sector) use ($marcasPorSector): void {
            $sector->setAttribute('total_marcas', (int) ($marcasPorSector[$sector->nombre] ?? 0));
        });

        return RecursoSector::collection($sectores);
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
