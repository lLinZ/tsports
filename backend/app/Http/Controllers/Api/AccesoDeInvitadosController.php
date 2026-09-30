<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccesoDeInvitados;
use App\Models\Propiedad;
use App\Models\RegistroActividad;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * AccesoDeInvitadosController — el usuario y la contraseña del catálogo.
 * ---------------------------------------------------------------------
 * Desde el panel, quien gestiona el catálogo (admin y comercial) ve la
 * pareja con la que los clientes abren el catálogo de la web y la
 * cambia. La ve en claro a propósito: es la que se manda a cada cliente
 * nuevo (ver la migración).
 *
 * Cambiarla echa a todos los que entraron con la anterior: sube la
 * versión del acceso, y las llaves que ya se dieron dejan de abrir.
 */
class AccesoDeInvitadosController extends Controller
{
    /** GET /api/acceso-de-invitados */
    public function mostrar(): JsonResponse
    {
        $this->authorize('gestionarElAccesoDeInvitados', Propiedad::class);

        return response()->json(['data' => self::comoRespuesta(AccesoDeInvitados::elVigente())]);
    }

    /** PUT /api/acceso-de-invitados */
    public function guardar(Request $peticion): JsonResponse
    {
        $this->authorize('gestionarElAccesoDeInvitados', Propiedad::class);

        $datos = $peticion->validate([
            // Sin espacios: se copia de un mensaje, y un espacio que no se
            // ve deja fuera a quien lo teclea bien.
            'usuario' => ['required', 'string', 'min:3', 'max:60', 'regex:/^\S+$/u'],
            'contrasena' => ['required', 'string', 'min:8', 'max:100', 'regex:/^\S+$/u'],
        ], [
            'usuario.regex' => 'El usuario no puede llevar espacios.',
            'contrasena.min' => 'La contraseña necesita al menos 8 caracteres.',
            'contrasena.regex' => 'La contraseña no puede llevar espacios.',
        ]);

        /** @var User $quienCambia */
        $quienCambia = $peticion->user();

        $acceso = AccesoDeInvitados::elVigente() ?? new AccesoDeInvitados(['version' => 0]);

        $cambiaAlgo = ! $acceso->exists
            || $acceso->usuario !== $datos['usuario']
            || $acceso->contrasenaEnClaro() !== $datos['contrasena'];

        if ($cambiaAlgo) {
            $acceso->fill([
                'usuario' => $datos['usuario'],
                'contrasena' => $datos['contrasena'],
                'version' => $acceso->version + 1,
                'cambiado_por_id' => $quienCambia->id,
                'cambiado_por_nombre' => $quienCambia->nombreParaMostrar(),
            ])->save();

            // Sin la contraseña en los metadatos: la auditoría la lee más
            // gente de la que tiene que conocerla.
            RegistroActividad::anotar(
                $quienCambia,
                RegistroActividad::ACCION_ACTUALIZO,
                'acceso_de_invitados',
                (string) $acceso->id,
                'Cambió el usuario y la contraseña de invitado del catálogo de la web',
            );
        }

        return response()->json(['data' => self::comoRespuesta($acceso)]);
    }

    /**
     * @return array<string,mixed>|null
     */
    private static function comoRespuesta(?AccesoDeInvitados $acceso): ?array
    {
        if ($acceso === null) {
            return null;
        }

        return [
            'usuario' => $acceso->usuario,
            'contrasena' => $acceso->contrasenaEnClaro(),
            'cambiadoPor' => $acceso->cambiado_por_nombre,
            'cambiadoEn' => $acceso->updated_at?->toIso8601String(),
        ];
    }
}
