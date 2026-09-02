<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\GuardarCampanaRequest;
use App\Http\Resources\RecursoCampana;
use App\Models\Campana;
use App\Models\RegistroActividad;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * CampanaController — las campañas comerciales.
 * ---------------------------------------------------------------------
 * Es la pieza que faltaba de la primera etapa: poder asignar cada marca
 * a la campaña dentro de la que se está trabajando, y sacar después el
 * reparto por campaña en el resumen.
 *
 * Igual que el catálogo de propiedades: lo ve todo el equipo (hace falta
 * para el selector de la ficha) y lo edita quien gestiona el catálogo
 * comercial.
 */
class CampanaController extends Controller
{
    /**
     * GET /api/campanas
     *
     * `soloActivas=1` deja fuera las campañas cerradas: es lo que pide el
     * selector de la ficha, donde ofrecer una campaña terminada solo
     * sirve para equivocarse.
     */
    public function index(Request $peticion): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Campana::class);

        $consulta = Campana::query()
            ->withCount('marcas')
            ->enOrdenDeCatalogo();

        if ($peticion->boolean('soloActivas')) {
            $consulta->activas();
        }

        return RecursoCampana::collection($consulta->get());
    }

    /**
     * POST /api/campanas
     */
    public function store(GuardarCampanaRequest $peticion): JsonResponse
    {
        $this->authorize('create', Campana::class);

        $campana = new Campana($peticion->datosParaElModelo());
        $campana->save();

        RegistroActividad::anotar(
            $peticion->user(),
            RegistroActividad::ACCION_CREO,
            'campana',
            $campana->id,
            'Creó la campaña '.$campana->nombre,
        );

        return (new RecursoCampana($campana))->response()->setStatusCode(201);
    }

    /**
     * PUT /api/campanas/{campana}
     */
    public function update(GuardarCampanaRequest $peticion, Campana $campana): RecursoCampana
    {
        $this->authorize('update', $campana);

        $valoresAnteriores = $campana->only(['nombre', 'fecha_inicio', 'fecha_fin', 'activa']);

        $campana->fill($peticion->datosParaElModelo());
        $campana->save();

        RegistroActividad::anotar(
            $peticion->user(),
            RegistroActividad::ACCION_ACTUALIZO,
            'campana',
            $campana->id,
            'Editó la campaña '.$campana->nombre,
            [
                'antes' => $valoresAnteriores,
                'despues' => $campana->only(array_keys($valoresAnteriores)),
            ],
        );

        return new RecursoCampana($campana->fresh());
    }

    /**
     * DELETE /api/campanas/{campana}
     *
     * Las marcas que pertenecían a la campaña NO se borran: se quedan sin
     * campaña. Perder la etiqueta es asumible; perder el trabajo hecho
     * dentro de ella, no.
     */
    public function destroy(Request $peticion, Campana $campana): JsonResponse
    {
        $this->authorize('delete', $campana);

        $nombreDeLaCampanaBorrada = $campana->nombre;

        $campana->delete();

        RegistroActividad::anotar(
            $peticion->user(),
            RegistroActividad::ACCION_ELIMINO,
            'campana',
            $campana->id,
            'Eliminó la campaña '.$nombreDeLaCampanaBorrada,
        );

        return response()->json(['mensaje' => 'Campaña eliminada.']);
    }
}
