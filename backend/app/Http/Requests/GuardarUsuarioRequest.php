<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\RolUsuario;
use App\Enums\TemaInterfaz;
use App\Models\User;
use App\Support\CatalogosDelCrm;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * GuardarUsuarioRequest — validación al crear o editar una cuenta.
 * ---------------------------------------------------------------------
 * Cubre los tres caminos que antes atendía la Edge Function
 * `update-user` de Supabase: crear un comercial, que un administrador
 * edite a otra persona, y que cualquiera edite sus propios datos.
 *
 * La diferencia importante entre ellos —quién puede tocar el rol y la
 * zona— NO se resuelve aquí sino en la política (UserPolicy). Esta clase
 * solo se ocupa de que los formatos sean correctos.
 */
class GuardarUsuarioRequest extends FormRequest
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
        $usuarioEditado = $this->route('usuario');
        $estamosCreando = ! $usuarioEditado instanceof User;

        return [
            'nombre' => [$estamosCreando ? 'required' : 'sometimes', 'string', 'max:120'],

            'email' => [
                $estamosCreando ? 'required' : 'sometimes',
                'email:filter',
                'max:180',
                // Al editar hay que ignorar la propia fila o el correo
                // actual chocaría consigo mismo.
                Rule::unique('users', 'email')->ignore($usuarioEditado?->id),
            ],

            // Al crear la contraseña es obligatoria; al editar solo se
            // envía si de verdad se quiere cambiar.
            'password' => [$estamosCreando ? 'required' : 'nullable', 'string', 'min:8', 'max:100'],

            'rol' => ['sometimes', Rule::in(RolUsuario::valores())],
            'zona' => ['nullable', 'string', Rule::in(CatalogosDelCrm::ZONAS)],
            'activo' => ['sometimes', 'boolean'],

            // Preferencias visuales (las edita cada quien para sí mismo).
            'tema' => ['sometimes', Rule::in(TemaInterfaz::valores())],
            'colorAcento' => ['sometimes', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'urlAvatar' => ['nullable', 'string', 'max:2048'],
        ];
    }

    /**
     * @return array<string,string>
     */
    public function messages(): array
    {
        return [
            'nombre.required' => 'El nombre es obligatorio.',
            'email.required' => 'El correo es obligatorio.',
            'email.email' => 'Ese correo no tiene un formato válido.',
            'email.unique' => 'Ya existe una cuenta con ese correo.',
            'password.required' => 'Asigna una contraseña para la cuenta nueva.',
            'password.min' => 'La contraseña debe tener al menos 8 caracteres.',
            'rol.in' => 'El rol indicado no existe.',
            'zona.in' => 'Esa zona no está en la lista de zonas permitidas.',
            'colorAcento.regex' => 'El color debe ser un hexadecimal de 6 dígitos, por ejemplo #1b9aaa.',
        ];
    }

    /**
     * Normaliza el correo antes de validarlo. Es la corrección de un
     * problema real de la versión anterior: alguien creaba la cuenta con
     * mayúsculas y luego no podía entrar escribiéndolo en minúsculas.
     */
    protected function prepareForValidation(): void
    {
        if ($this->has('email')) {
            $this->merge([
                'email' => mb_strtolower(trim((string) $this->input('email'))),
            ]);
        }
    }
}
