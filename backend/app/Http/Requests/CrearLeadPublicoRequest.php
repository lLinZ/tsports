<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * CrearLeadPublicoRequest — el formulario de contacto de la web pública.
 * ---------------------------------------------------------------------
 * Es el único endpoint del sistema que acepta datos de alguien sin
 * sesión iniciada, así que aquí la validación es más estricta de lo
 * normal y la ruta va además con limitación de peticiones.
 *
 * El campo `sitioWeb` es una trampa para robots (honeypot): está oculto
 * por CSS en el formulario, de modo que una persona nunca lo rellena.
 * Si llega con contenido, damos la petición por buena hacia fuera pero
 * no guardamos nada, para no darle pistas al que automatiza.
 */
class CrearLeadPublicoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string,mixed>
     */
    public function rules(): array
    {
        return [
            'nombre' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email:filter', 'max:180'],
            'empresa' => ['nullable', 'string', 'max:180'],
            'telefono' => ['nullable', 'string', 'max:60'],
            'mensaje' => ['required', 'string', 'max:3000'],

            // Trampa para robots: debe llegar siempre vacío.
            'sitioWeb' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * @return array<string,string>
     */
    public function messages(): array
    {
        return [
            'nombre.required' => 'Dinos cómo te llamas.',
            'email.required' => 'Necesitamos un correo para responderte.',
            'email.email' => 'Ese correo no parece válido.',
            'mensaje.required' => 'Cuéntanos brevemente qué necesitas.',
        ];
    }

    /** ¿La petición la hizo un robot que cayó en la trampa? */
    public function pareceUnEnvioAutomatico(): bool
    {
        return trim((string) $this->input('sitioWeb')) !== '';
    }
}
