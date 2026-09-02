<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\RolUsuario;
use App\Http\Controllers\Controller;
use App\Http\Requests\GuardarUsuarioRequest;
use App\Http\Resources\RecursoUsuario;
use App\Models\RegistroActividad;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * UsuarioController — administración de cuentas del equipo.
 * ---------------------------------------------------------------------
 * Sustituye a la vista `usuarios.html` y a la Edge Function
 * `update-user` de Supabase, que existía solo porque el navegador no
 * podía cambiar el correo de acceso con la clave pública. Aquí eso es
 * una operación normal del backend y no hace falta ninguna pieza extra.
 *
 * El reparto de responsabilidades es el de siempre:
 *   · La política (UserPolicy) decide QUIÉN puede hacer cada cosa.
 *   · La petición (GuardarUsuarioRequest) valida el FORMATO.
 *   · Este controlador se ocupa del efecto, incluida la salvaguarda de
 *     que nadie pueda ascenderse a sí mismo.
 */
class UsuarioController extends Controller
{
    /**
     * GET /api/usuarios
     * Lista del equipo. Admite ?rol=vendedor para poblar el selector de
     * asignación de marcas sin traerse a todo el mundo.
     */
    public function index(Request $peticion): AnonymousResourceCollection
    {
        $this->authorize('viewAny', User::class);

        $consulta = User::query()->orderBy('name');

        if ($rolPedido = $peticion->query('rol')) {
            $consulta->where('rol', $rolPedido);
        }

        if ($peticion->boolean('soloActivos')) {
            $consulta->where('activo', true);
        }

        return RecursoUsuario::collection($consulta->get());
    }

    /**
     * POST /api/usuarios
     * Alta de una cuenta nueva. Solo un administrador.
     */
    public function store(GuardarUsuarioRequest $peticion): JsonResponse
    {
        $this->authorize('create', User::class);

        $datosValidados = $peticion->validated();

        $usuarioNuevo = User::create([
            'name' => $datosValidados['nombre'],
            'email' => $datosValidados['email'],
            'password' => $datosValidados['password'],
            'rol' => $datosValidados['rol'] ?? RolUsuario::Comercial->value,
            'zona' => $datosValidados['zona'] ?? null,
            'activo' => true,
        ]);

        RegistroActividad::anotar(
            $peticion->user(),
            RegistroActividad::ACCION_CREO,
            'usuario',
            $usuarioNuevo->id,
            'Creó la cuenta de '.$usuarioNuevo->nombreParaMostrar().' ('.$usuarioNuevo->rol->etiqueta().')',
        );

        return (new RecursoUsuario($usuarioNuevo))->response()->setStatusCode(201);
    }

    /**
     * PUT /api/usuarios/{usuario}
     * Edición de una cuenta. Un administrador edita a cualquiera;
     * cualquier persona puede editarse a sí misma, pero el rol y la zona
     * quedan fuera de su alcance (ver UserPolicy::cambiarRolYZona).
     */
    public function update(GuardarUsuarioRequest $peticion, User $usuario): RecursoUsuario
    {
        $this->authorize('update', $usuario);

        $datosValidados = $peticion->validated();

        $valoresAnteriores = $usuario->only(['name', 'email', 'rol', 'zona', 'activo']);

        if (array_key_exists('nombre', $datosValidados)) {
            $usuario->name = $datosValidados['nombre'];
        }

        if (array_key_exists('email', $datosValidados)) {
            $usuario->email = $datosValidados['email'];
        }

        // Contraseña: solo si se envió una. El modelo la cifra solo.
        if (! empty($datosValidados['password'])) {
            $usuario->password = $datosValidados['password'];

            // Reiniciar la contraseña invalida las sesiones abiertas de
            // esa persona; si no, un token robado seguiría sirviendo.
            $usuario->tokens()->delete();
        }

        // Rol y zona: exigen un permiso aparte, precisamente para que
        // nadie pueda ascenderse a administrador editando su perfil.
        $puedeCambiarElRol = $peticion->user()?->can('cambiarRolYZona', $usuario) ?? false;

        if ($puedeCambiarElRol) {
            if (array_key_exists('rol', $datosValidados)) {
                $usuario->rol = RolUsuario::from($datosValidados['rol']);
            }

            if (array_key_exists('zona', $datosValidados)) {
                $usuario->zona = $datosValidados['zona'];
            }

            if (array_key_exists('activo', $datosValidados)) {
                $usuario->activo = (bool) $datosValidados['activo'];
            }
        }

        $usuario->save();

        RegistroActividad::anotar(
            $peticion->user(),
            RegistroActividad::ACCION_ACTUALIZO,
            'usuario',
            $usuario->id,
            'Actualizó la cuenta de '.$usuario->nombreParaMostrar(),
            ['antes' => $valoresAnteriores, 'despues' => $usuario->only(array_keys($valoresAnteriores))],
        );

        return new RecursoUsuario($usuario->fresh());
    }

    /**
     * DELETE /api/usuarios/{usuario}
     * Da de baja una cuenta.
     *
     * Por defecto NO se borra la fila: se desactiva. Así el historial de
     * marcas y comentarios sigue diciendo quién hizo qué. Para borrarla
     * de verdad hay que pedirlo con ?definitivo=1.
     */
    public function destroy(Request $peticion, User $usuario): JsonResponse
    {
        $this->authorize('delete', $usuario);

        $nombreDeLaCuenta = $usuario->nombreParaMostrar();

        if ($peticion->boolean('definitivo')) {
            $usuario->delete();

            RegistroActividad::anotar(
                $peticion->user(),
                RegistroActividad::ACCION_ELIMINO,
                'usuario',
                $usuario->id,
                'Eliminó definitivamente la cuenta de '.$nombreDeLaCuenta,
            );

            return response()->json(['mensaje' => 'Cuenta eliminada definitivamente.']);
        }

        $usuario->activo = false;
        $usuario->save();
        $usuario->tokens()->delete();

        RegistroActividad::anotar(
            $peticion->user(),
            RegistroActividad::ACCION_ACTUALIZO,
            'usuario',
            $usuario->id,
            'Desactivó la cuenta de '.$nombreDeLaCuenta,
        );

        return response()->json(['mensaje' => 'Cuenta desactivada. Su historial se conserva.']);
    }
}
