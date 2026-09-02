<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * GuardarCampanaRequest — validación al crear o editar una campaña.
 * ---------------------------------------------------------------------
 * Poco que comprobar: nombre único, un color en hexadecimal para el
 * distintivo del tablero y, si se ponen las dos fechas, que el final no
 * caiga antes del principio.
 */
class GuardarCampanaRequest extends FormRequest
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
        $idDeLaCampanaEnEdicion = $this->route('campana')?->id;

        return [
            'nombre' => [
                'required', 'string', 'max:180',
                Rule::unique('campanas', 'nombre')->ignore($idDeLaCampanaEnEdicion),
            ],
            'descripcion' => ['nullable', 'string', 'max:2000'],

            // Hexadecimal de 6 dígitos, que es lo que produce el selector
            // de color de la interfaz.
            'color' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],

            'fechaInicio' => ['nullable', 'date'],
            'fechaFin' => ['nullable', 'date', 'after_or_equal:fechaInicio'],

            'orden' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'activa' => ['boolean'],
        ];
    }

    /**
     * @return array<string,string>
     */
    public function messages(): array
    {
        return [
            'nombre.required' => 'Ponle nombre a la campaña.',
            'nombre.unique' => 'Ya hay una campaña con ese nombre.',
            'color.regex' => 'El color tiene que venir en hexadecimal, como #1b9aaa.',
            'fechaFin.after_or_equal' => 'La campaña no puede terminar antes de empezar.',
        ];
    }

    /**
     * @return array<string,mixed>
     */
    public function datosParaElModelo(): array
    {
        $datosValidados = $this->validated();

        return [
            'nombre' => trim((string) $datosValidados['nombre']),
            'descripcion' => $datosValidados['descripcion'] ?? null,
            'color' => $datosValidados['color'] ?? '#1b9aaa',
            'fecha_inicio' => $datosValidados['fechaInicio'] ?? null,
            'fecha_fin' => $datosValidados['fechaFin'] ?? null,
            'orden' => (int) ($datosValidados['orden'] ?? 0),
            'activa' => $this->has('activa') ? $this->boolean('activa') : true,
        ];
    }
}
