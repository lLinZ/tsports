<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoUsuario;
use App\Models\RegistroActividad;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * AutenticacionController — entrada y salida del sistema.
 * ---------------------------------------------------------------------
 * Sustituye a `supabase.auth.signInWithPassword`. Emite un token de
 * Sanctum que el frontend guarda y envía en la cabecera Authorization.
 *
 * Dos detalles heredados de problemas reales de la versión anterior:
 *
 *   · El correo se normaliza a minúsculas antes de buscarlo. Antes, una
 *     cuenta creada como "Juan@x.com" no podía entrar escribiendo
 *     "juan@x.com" y parecía que la contraseña estaba mal.
 *
 *   · El mensaje de error no distingue entre "no existe ese correo" y
 *     "la contraseña no coincide", para no confirmarle a nadie qué
 *     correos están dados de alta.
 */
class AutenticacionController extends Controller
{
    /** Intentos de acceso fallidos permitidos antes de bloquear. */
    private const INTENTOS_MAXIMOS_POR_MINUTO = 5;

    /**
     * POST /api/auth/login
     * Comprueba las credenciales y devuelve un token de acceso.
     */
    public function iniciarSesion(Request $peticion): JsonResponse
    {
        $datos = $peticion->validate([
            'email' => ['required', 'email:filter'],
            'password' => ['required', 'string'],
        ], [
            'email.required' => 'Escribe tu correo.',
            'password.required' => 'Escribe tu contraseña.',
        ]);

        $correoNormalizado = mb_strtolower(trim($datos['email']));

        // Freno por fuerza bruta: se cuenta por correo + IP, así un
        // atacante no puede bloquear la cuenta de otra persona.
        $claveDelLimite = 'acceso:'.$correoNormalizado.'|'.$peticion->ip();

        if (RateLimiter::tooManyAttempts($claveDelLimite, self::INTENTOS_MAXIMOS_POR_MINUTO)) {
            $segundosParaReintentar = RateLimiter::availableIn($claveDelLimite);

            throw ValidationException::withMessages([
                'email' => "Demasiados intentos. Prueba de nuevo en {$segundosParaReintentar} segundos.",
            ]);
        }

        $usuario = User::query()->where('email', $correoNormalizado)->first();

        $lasCredencialesSonCorrectas = $usuario !== null
            && Hash::check($datos['password'], $usuario->password);

        if (! $lasCredencialesSonCorrectas) {
            RateLimiter::hit($claveDelLimite, 60);

            throw ValidationException::withMessages([
                'email' => 'Correo o contraseña incorrectos. Recuerda que la contraseña distingue mayúsculas.',
            ]);
        }

        if (! $usuario->activo) {
            throw ValidationException::withMessages([
                'email' => 'Esta cuenta está desactivada. Pide a un administrador que la reactive.',
            ]);
        }

        RateLimiter::clear($claveDelLimite);

        // Un token por sesión: al salir se revoca solo ese, de modo que
        // cerrar sesión en el móvil no echa a nadie del ordenador.
        $nombreDelDispositivo = mb_substr((string) $peticion->userAgent(), 0, 120) ?: 'navegador';
        $tokenDeAcceso = $usuario->createToken($nombreDelDispositivo)->plainTextToken;

        $usuario->forceFill(['ultimo_acceso_at' => now()])->save();

        RegistroActividad::anotar(
            $usuario,
            RegistroActividad::ACCION_INICIO_SESION,
            'usuario',
            $usuario->id,
            $usuario->nombreParaMostrar().' inició sesión',
        );

        // En una petición de login todavía no hay usuario autenticado, y
        // RecursoUsuario consulta quién pregunta para decidir si incluye
        // el correo. Sin esto, la respuesta del login llegaría sin correo
        // y el panel de perfil aparecería con el campo vacío.
        $peticion->setUserResolver(static fn (): User => $usuario);

        return response()->json([
            'token' => $tokenDeAcceso,
            // resolve() devuelve el arreglo plano, sin el envoltorio
            // "data" que Laravel añade cuando un recurso es la respuesta
            // completa. Aquí el usuario es solo una parte del cuerpo.
            'usuario' => (new RecursoUsuario($usuario))->resolve($peticion),
        ]);
    }

    /**
     * GET /api/auth/yo
     * Devuelve el usuario de la sesión actual. El frontend lo llama al
     * arrancar para saber si el token guardado sigue siendo válido.
     */
    public function usuarioActual(Request $peticion): RecursoUsuario
    {
        /** @var User $usuarioAutenticado */
        $usuarioAutenticado = $peticion->user();

        return new RecursoUsuario($usuarioAutenticado);
    }

    /**
     * POST /api/auth/logout
     * Revoca únicamente el token con el que se hizo la petición.
     */
    public function cerrarSesion(Request $peticion): JsonResponse
    {
        /** @var \Laravel\Sanctum\PersonalAccessToken|null $tokenEnUso */
        $tokenEnUso = $peticion->user()?->currentAccessToken();

        $tokenEnUso?->delete();

        return response()->json(['mensaje' => 'Sesión cerrada.']);
    }

    /**
     * POST /api/auth/cambiar-password
     * Cambio de contraseña por parte del propio usuario, exigiendo la
     * actual. Es distinto de que un administrador la reinicie desde la
     * pantalla de usuarios.
     */
    public function cambiarPassword(Request $peticion): JsonResponse
    {
        $datos = $peticion->validate([
            'passwordActual' => ['required', 'string'],
            'passwordNueva' => ['required', 'string', 'min:8', 'max:100', 'confirmed'],
        ], [
            'passwordNueva.min' => 'La contraseña nueva debe tener al menos 8 caracteres.',
            'passwordNueva.confirmed' => 'La confirmación no coincide con la contraseña nueva.',
        ]);

        /** @var User $usuario */
        $usuario = $peticion->user();

        if (! Hash::check($datos['passwordActual'], $usuario->password)) {
            throw ValidationException::withMessages([
                'passwordActual' => 'La contraseña actual no es correcta.',
            ]);
        }

        $usuario->forceFill(['password' => $datos['passwordNueva']])->save();

        // Al cambiar la contraseña se cierran las demás sesiones abiertas,
        // que es justo lo que se espera si uno la cambia por sospecha.
        $idDelTokenEnUso = $usuario->currentAccessToken()?->getKey();
        $usuario->tokens()->where('id', '!=', $idDelTokenEnUso)->delete();

        RegistroActividad::anotar(
            $usuario,
            RegistroActividad::ACCION_ACTUALIZO,
            'usuario',
            $usuario->id,
            'Cambió su contraseña',
        );

        return response()->json(['mensaje' => 'Contraseña actualizada. Se cerraron las demás sesiones.']);
    }
}
