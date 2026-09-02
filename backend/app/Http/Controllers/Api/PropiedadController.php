<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\GuardarPropiedadRequest;
use App\Http\Resources\RecursoPropiedad;
use App\Models\Propiedad;
use App\Models\RegistroActividad;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

/**
 * PropiedadController — el catálogo de productos IOP.
 * ---------------------------------------------------------------------
 * Es el módulo de la segunda etapa: subir las propiedades que la agencia
 * vende (Comité Olímpico, Dvo. Táchira, Kombat Challenge…), con su
 * monto total, su meta de venta y a qué prospectores se les asigna.
 *
 * El catálogo lo VE todo el equipo, porque un vendedor necesita saber
 * cuánto vale una propiedad aunque la lleve otra persona; lo EDITA solo
 * quien gestiona el catálogo comercial. Esa asimetría es la misma que ya
 * había con las marcas y la resuelve PropiedadPolicy.
 */
class PropiedadController extends Controller
{
    /**
     * GET /api/propiedades
     *
     * Devuelve el catálogo entero en su orden de siempre. Admite dos
     * parámetros:
     *   · `soloActivas=1`   → lo que se ofrece hoy (lo que usa la ficha
     *                         de una marca para pintar el checklist).
     *   · `conTotales=1`    → añade cuántas marcas la llevan y cuánto
     *                         suman sus pronósticos (lo usa la pantalla
     *                         del catálogo, no el selector).
     */
    public function index(Request $peticion): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Propiedad::class);

        $consulta = Propiedad::query()
            ->with('prospectores')
            ->enOrdenDeCatalogo();

        if ($peticion->boolean('soloActivas')) {
            $consulta->activas();
        }

        if ($peticion->boolean('conTotales')) {
            // El `select` explícito es necesario: en cuanto se añade una
            // columna calculada, Eloquent deja de traer `propiedades.*`
            // por su cuenta y la fila llegaría sin sus propios campos.
            $consulta->select('propiedades.*')
                ->withCount('marcasQueLaOfrecen')
                // Suma de los OVP en una subconsulta: traer las líneas
                // enteras solo para sumarlas descargaría toda la tabla
                // puente en cada carga del catálogo.
                ->addSelect([
                    'ovp_acumulado' => DB::table('propiedades_de_marca')
                        ->selectRaw('COALESCE(SUM(ovp_usd), 0)')
                        ->whereColumn('propiedad_id', 'propiedades.id'),
                ]);
        }

        return RecursoPropiedad::collection($consulta->get());
    }

    /**
     * GET /api/propiedades/{propiedad}
     */
    public function show(Propiedad $propiedad): RecursoPropiedad
    {
        $this->authorize('view', $propiedad);

        $propiedad->load('prospectores')->loadCount('marcasQueLaOfrecen');

        return new RecursoPropiedad($propiedad);
    }

    /**
     * POST /api/propiedades
     */
    public function store(GuardarPropiedadRequest $peticion): JsonResponse
    {
        $this->authorize('create', Propiedad::class);

        $propiedad = new Propiedad($peticion->datosParaElModelo());
        $propiedad->save();

        $propiedad->prospectores()->sync($peticion->prospectoresAsignados());

        /** @var User $usuarioQueRegistra */
        $usuarioQueRegistra = $peticion->user();

        RegistroActividad::anotar(
            $usuarioQueRegistra,
            RegistroActividad::ACCION_CREO,
            'propiedad',
            $propiedad->id,
            'Creó la propiedad '.$propiedad->nombre,
        );

        return (new RecursoPropiedad($propiedad->load('prospectores')))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * PUT /api/propiedades/{propiedad}
     *
     * Cambiar el MTP recalcula automáticamente la meta y todos los
     * porcentajes de las marcas que la ofrecen, porque ninguno de esos
     * dos valores está guardado: se derivan al leer.
     */
    public function update(GuardarPropiedadRequest $peticion, Propiedad $propiedad): RecursoPropiedad
    {
        $this->authorize('update', $propiedad);

        $valoresAnteriores = $propiedad->only([
            'nombre', 'monto_total_usd', 'porcentaje_forecast', 'asignada_a_todos', 'activa',
        ]);

        $propiedad->fill($peticion->datosParaElModelo());
        $propiedad->save();

        $propiedad->prospectores()->sync($peticion->prospectoresAsignados());

        RegistroActividad::anotar(
            $peticion->user(),
            RegistroActividad::ACCION_ACTUALIZO,
            'propiedad',
            $propiedad->id,
            'Editó la propiedad '.$propiedad->nombre,
            [
                'antes' => $valoresAnteriores,
                'despues' => $propiedad->only(array_keys($valoresAnteriores)),
            ],
        );

        return new RecursoPropiedad($propiedad->fresh()->load('prospectores'));
    }

    /**
     * DELETE /api/propiedades/{propiedad}
     *
     * Borra la propiedad y, en cascada, sus líneas del checklist en todas
     * las marcas. La interfaz avisa de cuántas se van a perder y ofrece
     * antes desactivarla, que es lo que se quiere casi siempre.
     */
    public function destroy(Request $peticion, Propiedad $propiedad): JsonResponse
    {
        $this->authorize('delete', $propiedad);

        $nombreDeLaPropiedadBorrada = $propiedad->nombre;

        $propiedad->delete();

        RegistroActividad::anotar(
            $peticion->user(),
            RegistroActividad::ACCION_ELIMINO,
            'propiedad',
            $propiedad->id,
            'Eliminó la propiedad '.$nombreDeLaPropiedadBorrada,
        );

        return response()->json(['mensaje' => 'Propiedad eliminada.']);
    }
}
