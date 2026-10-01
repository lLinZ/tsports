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
 *
 * Cada propiedad viaja SIEMPRE con su galería: el checklist de la ficha
 * de una marca la necesita para enseñar las fotos delante del cliente, y
 * pedirla aparte serían siete peticiones más cada vez que se abre una
 * ficha. La galería se gestiona en GaleriaDePropiedadController.
 */
class PropiedadController extends Controller
{
    /** Lo que se carga con cada propiedad, en todas las respuestas. */
    private const LO_QUE_ACOMPANA = ['prospectores', 'galeria.archivo'];

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
            ->with(self::LO_QUE_ACOMPANA)
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

        $propiedad->load(self::LO_QUE_ACOMPANA)->loadCount('marcasQueLaOfrecen');

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

        return (new RecursoPropiedad($propiedad->load(self::LO_QUE_ACOMPANA)))
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

        // Publicar en la web va en la auditoría como un cambio más: que una
        // propiedad salga a la portada es algo que alguien decidió.
        $valoresAnteriores = $propiedad->only([
            'nombre', 'monto_total_usd', 'porcentaje_forecast', 'asignada_a_todos', 'activa',
            'publicada_en_la_web',
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

        return new RecursoPropiedad($propiedad->fresh()->load(self::LO_QUE_ACOMPANA));
    }

    /**
     * PATCH /api/propiedades/{propiedad}/activa
     *
     * Desactivar es lo que toca con una propiedad que ya pasó —un evento
     * de este año, como una carrera—: deja de ofrecerse en el checklist,
     * pero las marcas que la llevaban la conservan con su pronóstico, y el
     * año siguiente se reactiva tal cual. Borrarla, en cambio, se lleva
     * esas líneas para siempre (ver destroy). Va aparte de update para
     * poder hacerlo desde la tarjeta, sin mandar el formulario entero.
     */
    public function activarODesactivar(Request $peticion, Propiedad $propiedad): RecursoPropiedad
    {
        $this->authorize('update', $propiedad);

        $datos = $peticion->validate(
            ['activa' => ['required', 'boolean']],
            ['activa.*' => 'Indica si la propiedad queda activa o desactivada.'],
        );

        $propiedad->activa = (bool) $datos['activa'];
        $propiedad->save();

        // Repetir la misma orden no deja una línea más en la auditoría.
        if ($propiedad->wasChanged('activa')) {
            RegistroActividad::anotar(
                $peticion->user(),
                RegistroActividad::ACCION_ACTUALIZO,
                'propiedad',
                $propiedad->id,
                ($propiedad->activa ? 'Reactivó' : 'Desactivó').' la propiedad '.$propiedad->nombre,
                ['antes' => ['activa' => ! $propiedad->activa], 'despues' => ['activa' => $propiedad->activa]],
            );
        }

        return new RecursoPropiedad($propiedad->load(self::LO_QUE_ACOMPANA)->loadCount('marcasQueLaOfrecen'));
    }

    /**
     * PATCH /api/propiedades/{propiedad}/publicada
     *
     * Publicarla en el catálogo de la web, o retirarla, desde la pantalla
     * «Catálogo web» sin abrir el formulario entero. Lo que sale de ella
     * en la web lo sigue decidiendo RecursoPropiedadEnLaWeb.
     */
    public function publicarORetirar(Request $peticion, Propiedad $propiedad): RecursoPropiedad
    {
        $this->authorize('update', $propiedad);

        $datos = $peticion->validate(
            ['publicada' => ['required', 'boolean']],
            ['publicada.*' => 'Indica si la propiedad sale en la web o no.'],
        );

        $propiedad->publicada_en_la_web = (bool) $datos['publicada'];
        $propiedad->save();

        if ($propiedad->wasChanged('publicada_en_la_web')) {
            RegistroActividad::anotar(
                $peticion->user(),
                RegistroActividad::ACCION_ACTUALIZO,
                'propiedad',
                $propiedad->id,
                ($propiedad->publicada_en_la_web ? 'Publicó en la web' : 'Retiró de la web').' la propiedad '.$propiedad->nombre,
                [
                    'antes' => ['publicada_en_la_web' => ! $propiedad->publicada_en_la_web],
                    'despues' => ['publicada_en_la_web' => $propiedad->publicada_en_la_web],
                ],
            );
        }

        return new RecursoPropiedad($propiedad->load(self::LO_QUE_ACOMPANA)->loadCount('marcasQueLaOfrecen'));
    }

    /**
     * DELETE /api/propiedades/{propiedad}
     *
     * Borra la propiedad y, en cascada, sus líneas del checklist en todas
     * las marcas. La interfaz avisa de cuántas se van a perder y ofrece
     * antes desactivarla, que es lo que se quiere casi siempre.
     *
     * Se lleva también su galería, ficheros incluidos.
     */
    public function destroy(Request $peticion, Propiedad $propiedad): JsonResponse
    {
        $this->authorize('delete', $propiedad);

        $nombreDeLaPropiedadBorrada = $propiedad->nombre;

        $propiedad->eliminarConSuGaleria();

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
