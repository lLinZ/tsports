<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Meta;
use App\Models\RegistroActividad;
use App\Models\User;
use App\Support\AvanceDeLasMetas;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * MetaController — poner o quitar la meta de una persona.
 * ---------------------------------------------------------------------
 * Se leen desde el panel (PanelController: la propia y, para quien
 * reparte, las del equipo); aquí solo se escriben. Las pone quien reparte
 * el trabajo (UserPolicy::fijarMetas), y queda en la auditoría: una meta
 * es un acuerdo, y tiene que poder saberse quién lo cambió.
 */
class MetaController extends Controller
{
    /**
     * PUT /api/metas/{usuario}
     * `{ anio, montoUsd }`. Con `montoUsd: null` se quita.
     */
    public function guardar(Request $peticion, User $usuario): JsonResponse
    {
        $this->authorize('fijarMetas', User::class);

        $anioEnCurso = AvanceDeLasMetas::anioEnCurso();

        $datos = $peticion->validate([
            // El año pasado se puede corregir y el siguiente adelantar;
            // más allá es un error al teclear.
            'anio' => ['required', 'integer', 'min:'.($anioEnCurso - 1), 'max:'.($anioEnCurso + 1)],
            'montoUsd' => ['present', 'nullable', 'numeric', 'min:1', 'max:999999999'],
        ], [
            'anio.min' => 'Ese año ya no se puede cambiar.',
            'anio.max' => 'Ese año todavía queda lejos.',
            'montoUsd.present' => 'Indica la meta, o null para quitarla.',
            'montoUsd.numeric' => 'La meta tiene que ser un importe.',
            'montoUsd.min' => 'La meta tiene que ser de al menos 1 $.',
            'montoUsd.max' => 'Esa meta es demasiado grande.',
        ]);

        if (! $usuario->activo) {
            throw ValidationException::withMessages([
                'montoUsd' => 'Esa cuenta está desactivada.',
            ]);
        }

        /** @var User $quienLaFija */
        $quienLaFija = $peticion->user();
        $anio = (int) $datos['anio'];

        if ($datos['montoUsd'] === null) {
            Meta::query()->where('persona_id', $usuario->id)->where('anio', $anio)->get()->each->delete();

            $descripcion = sprintf('Quitó la meta de %s para %d', $usuario->nombreParaMostrar(), $anio);
        } else {
            $monto = round((float) $datos['montoUsd'], 2);

            Meta::query()->updateOrCreate(
                ['persona_id' => $usuario->id, 'anio' => $anio],
                [
                    'monto_usd' => $monto,
                    'fijada_por_id' => $quienLaFija->id,
                    'fijada_por_nombre' => $quienLaFija->nombreParaMostrar(),
                ],
            );

            $descripcion = sprintf(
                'Fijó la meta de %s para %d: %s $',
                $usuario->nombreParaMostrar(),
                $anio,
                number_format($monto, 2, ',', '.'),
            );
        }

        RegistroActividad::anotar(
            $quienLaFija,
            RegistroActividad::ACCION_ACTUALIZO,
            'meta',
            $usuario->id,
            $descripcion,
        );

        return response()->json(['data' => AvanceDeLasMetas::deLaPersona($usuario, $anio)]);
    }
}
