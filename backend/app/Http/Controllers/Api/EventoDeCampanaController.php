<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Campana;
use App\Models\EventoDeCampana;
use App\Models\RegistroActividad;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * EventoDeCampanaController — corregir el historial de acciones.
 * ---------------------------------------------------------------------
 * Los eventos nacen solos al asignar una campaña con su fecha en la
 * ficha de la marca, pero después la realidad se mueve: una visita se
 * aplaza, una invitación se cancela, alguien anota el día equivocado.
 * Sin poder tocarlos, el calendario acabaría enseñando cosas que ya no
 * van a ocurrir y el reporte semanal contaría acciones fantasma.
 *
 * Quién puede qué está en EventoDeCampanaPolicy: editar lo puede hacer
 * quien pueda editar la marca; borrar, solo admin y comercial.
 *
 * DESPUÉS DE CADA CAMBIO se vuelve a fijar la acción en curso de la
 * marca a partir del historial. Si no, borrar el evento más reciente
 * dejaría la ficha apuntando a una acción que ya no existe.
 */
class EventoDeCampanaController extends Controller
{
    /**
     * PUT /api/eventos-de-campana/{evento}
     * Corrige la campaña, el día o la nota de una acción ya anotada.
     */
    public function update(Request $peticion, EventoDeCampana $evento): JsonResponse
    {
        // La política necesita la marca para decidir el permiso. Se carga
        // explícitamente porque el modelo llega del enrutador sin
        // relaciones, y la carga perezosa está desactivada a propósito.
        $evento->loadMissing('marca');

        $this->authorize('update', $evento);

        $datos = $peticion->validate([
            'campanaId' => ['required', 'uuid', Rule::exists('campanas', 'id')],
            'fecha' => ['required', 'date_format:Y-m-d'],
            'nota' => ['nullable', 'string', 'max:2000'],
        ], [
            'campanaId.required' => 'Elige la campaña de esta acción.',
            'campanaId.exists' => 'Esa campaña ya no existe.',
            'fecha.required' => 'Indica el día en que se hace la acción.',
            'fecha.date_format' => 'La fecha debe tener el formato AAAA-MM-DD.',
        ]);

        /** @var User $usuarioQueCorrige */
        $usuarioQueCorrige = $peticion->user();

        $comoEstabaAntes = [
            'campana' => $evento->campana_nombre,
            'fecha' => $evento->fecha->toDateString(),
        ];

        $campanaElegida = Campana::query()->findOrFail($datos['campanaId']);

        DB::transaction(function () use ($evento, $datos, $campanaElegida): void {
            $evento->fill([
                'campana_id' => $campanaElegida->id,
                // El nombre y el color se vuelven a copiar: el evento
                // guarda cómo se llamaba la campaña cuando se anotó, y al
                // cambiarla hay que copiar la nueva.
                'campana_nombre' => $campanaElegida->nombre,
                'campana_color' => $campanaElegida->color,
                'fecha' => $datos['fecha'],
                'nota' => $datos['nota'] ?? null,
            ])->save();

            $evento->marca?->sincronizarAccionEnCursoConSuHistorial();
        });

        RegistroActividad::anotar(
            $usuarioQueCorrige,
            RegistroActividad::ACCION_ACTUALIZO,
            'evento_de_campana',
            $evento->id,
            sprintf(
                'Corrigió una acción de %s: %s del %s → %s del %s',
                $evento->marca?->nombre_marca ?? 'una marca',
                $comoEstabaAntes['campana'],
                $comoEstabaAntes['fecha'],
                $campanaElegida->nombre,
                $datos['fecha'],
            ),
            ['antes' => $comoEstabaAntes],
        );

        return response()->json([
            'mensaje' => 'Acción actualizada.',
            'evento' => $this->comoArreglo($evento->fresh()),
        ]);
    }

    /**
     * DELETE /api/eventos-de-campana/{evento}
     * Borra una acción del historial.
     */
    public function destroy(Request $peticion, EventoDeCampana $evento): JsonResponse
    {
        $evento->loadMissing('marca');

        $this->authorize('delete', $evento);

        /** @var User $usuarioQueBorra */
        $usuarioQueBorra = $peticion->user();

        $descripcionDeLoBorrado = sprintf(
            'Eliminó del historial de %s la acción "%s" del %s',
            $evento->marca?->nombre_marca ?? 'una marca',
            $evento->campana_nombre,
            $evento->fecha->toDateString(),
        );

        $marca = $evento->marca;
        $idDelEvento = $evento->id;

        DB::transaction(function () use ($evento, $marca): void {
            $evento->delete();

            // Con el evento fuera, la acción en curso de la marca puede
            // haber quedado apuntando a algo que ya no está.
            $marca?->sincronizarAccionEnCursoConSuHistorial();
        });

        RegistroActividad::anotar(
            $usuarioQueBorra,
            RegistroActividad::ACCION_ELIMINO,
            'evento_de_campana',
            $idDelEvento,
            $descripcionDeLoBorrado,
        );

        return response()->json(['mensaje' => 'Acción eliminada del historial.']);
    }

    /**
     * La forma en la que un evento viaja al cliente.
     *
     * Coincide con las líneas de `historialDeCampanas` de RecursoMarca,
     * para que la interfaz pueda sustituir una línea sin recargar toda
     * la ficha.
     *
     * @return array<string,mixed>
     */
    private function comoArreglo(EventoDeCampana $evento): array
    {
        return [
            'id' => $evento->id,
            'campanaId' => $evento->campana_id,
            'campanaNombre' => $evento->campana_nombre,
            'campanaColor' => $evento->campana_color,
            'fecha' => $evento->fecha->format('Y-m-d'),
            'nota' => $evento->nota,
            'registradoPorNombre' => $evento->registrado_por_nombre,
            'registradoEn' => $evento->created_at?->toIso8601String(),
        ];
    }
}
