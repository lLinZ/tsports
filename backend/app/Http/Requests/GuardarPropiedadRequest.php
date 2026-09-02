<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Models\Propiedad;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * GuardarPropiedadRequest — validación al crear o editar un producto IOP.
 * ---------------------------------------------------------------------
 * Las reglas que importan de verdad son tres:
 *
 *   · El nombre es único. Dos propiedades llamadas igual serían
 *     indistinguibles en el checklist de una marca.
 *   · El porcentaje del forecast va entre 0 y 100. Un 120 % daría una
 *     meta mayor que el valor de la propiedad entera.
 *   · Si la propiedad NO es para todo el equipo hay que decir quién la
 *     trabaja: si no, se quedaría sin nadie que la pueda ofrecer y
 *     desaparecería del checklist de todos.
 */
class GuardarPropiedadRequest extends FormRequest
{
    /** La autorización la resuelve la política, no la petición. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string,mixed>
     */
    public function rules(): array
    {
        // Al editar hay que dejar fuera la propia fila de la comprobación
        // de nombre único, o guardar sin cambiar el nombre daría error.
        $idDeLaPropiedadEnEdicion = $this->route('propiedad')?->id;

        return [
            'nombre' => [
                'required', 'string', 'max:180',
                Rule::unique('propiedades', 'nombre')->ignore($idDeLaPropiedadEnEdicion),
            ],
            'descripcion' => ['nullable', 'string', 'max:2000'],
            'logoUrl' => ['nullable', 'string', 'max:2048'],

            // MTP — el valor total de la propiedad.
            'montoTotalUsd' => ['nullable', 'numeric', 'min:0', 'max:99999999999'],

            // Porcentaje del MTP que se fija como meta de venta.
            'porcentajeForecast' => ['nullable', 'numeric', 'min:0', 'max:100'],

            'asignadaATodos' => ['boolean'],
            'prospectoresIds' => ['array'],
            'prospectoresIds.*' => ['uuid', 'exists:users,id'],

            'orden' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'activa' => ['boolean'],
        ];
    }

    public function withValidator(Validator $validador): void
    {
        $validador->after(function (Validator $validador): void {
            $esParaTodoElEquipo = $this->boolean('asignadaATodos');
            $prospectoresElegidos = (array) $this->input('prospectoresIds', []);

            if (! $esParaTodoElEquipo && $prospectoresElegidos === []) {
                $validador->errors()->add(
                    'prospectoresIds',
                    'Elige a quién se le asigna la propiedad, o márcala como disponible para todo el equipo.',
                );
            }
        });
    }

    /**
     * @return array<string,string>
     */
    public function messages(): array
    {
        return [
            'nombre.required' => 'Ponle nombre a la propiedad.',
            'nombre.unique' => 'Ya hay una propiedad con ese nombre.',
            'porcentajeForecast.max' => 'El porcentaje del forecast no puede pasar del 100 %.',
            'montoTotalUsd.min' => 'El monto total de la propiedad no puede ser negativo.',
        ];
    }

    /**
     * Traduce el cuerpo camelCase del frontend a las columnas del modelo.
     *
     * @return array<string,mixed>
     */
    public function datosParaElModelo(): array
    {
        $datosValidados = $this->validated();

        return [
            'nombre' => trim((string) $datosValidados['nombre']),
            'descripcion' => $datosValidados['descripcion'] ?? null,
            'logo_url' => $datosValidados['logoUrl'] ?? null,
            'monto_total_usd' => (float) ($datosValidados['montoTotalUsd'] ?? 0),
            'porcentaje_forecast' => (float) (
                $datosValidados['porcentajeForecast']
                ?? Propiedad::PORCENTAJE_FORECAST_POR_DEFECTO
            ),
            'asignada_a_todos' => $this->boolean('asignadaATodos'),
            'orden' => (int) ($datosValidados['orden'] ?? 0),
            // Una propiedad nueva nace activa salvo que se diga lo
            // contrario: es lo que se espera al acabar de crearla.
            'activa' => $this->has('activa') ? $this->boolean('activa') : true,
        ];
    }

    /**
     * Los prospectores a los que queda asignada. Vacío cuando la
     * propiedad es para todo el equipo, porque entonces la lista sobra.
     *
     * @return list<string>
     */
    public function prospectoresAsignados(): array
    {
        if ($this->boolean('asignadaATodos')) {
            return [];
        }

        return array_values(array_unique((array) $this->input('prospectoresIds', [])));
    }
}
