<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notificacion;
use App\Models\PreferenciaDeAviso;
use App\Models\SuscripcionPush;
use App\Models\User;
use App\Support\AjustesDeAvisos;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * MisAvisosController — Notificaciones › Ajustes: lo que elige cada quien.
 * ---------------------------------------------------------------------
 * Desde el 2026-11-05. Cada persona ve los avisos que le llegan a ELLA y
 * elige, uno por uno, si le suena el móvil y si suena con el panel
 * abierto; y su horario de silencio. Debajo, sus dispositivos.
 *
 * LA CAMPANITA NO SE APAGA: es donde queda el aviso (regla 17). Lo que
 * se silencia son las salidas.
 *
 * Cada quien toca solo lo suyo. No hay ruta para las preferencias de otro,
 * ni de un administrador, como no la hay para leer sus avisos.
 *
 * Un aviso que el administrador apagó sale aquí desactivado y dicho: si
 * desapareciera, la persona no sabría por qué dejó de llegarle.
 */
class MisAvisosController extends Controller
{
    /**
     * GET /api/mis-avisos
     */
    public function index(Request $peticion): JsonResponse
    {
        /** @var User $persona */
        $persona = $peticion->user();

        return response()->json($this->deLaPersona($persona));
    }

    /**
     * PUT /api/mis-avisos/{tipo}  { alMovil?, conSonido? }
     */
    public function update(Request $peticion, string $tipo): JsonResponse
    {
        /** @var User $persona */
        $persona = $peticion->user();

        abort_unless(in_array($tipo, $this->tiposQueLeLlegan($persona, AjustesDeAvisos::vigentes()), true), 404, 'Ese aviso no te llega.');

        $datos = $peticion->validate(
            [
                'alMovil' => ['sometimes', 'boolean'],
                'conSonido' => ['sometimes', 'boolean'],
            ],
            ['*' => 'Indica sí o no.'],
        );

        $preferencia = PreferenciaDeAviso::query()->firstOrNew(['usuario_id' => $persona->id, 'tipo' => $tipo]);
        $preferencia->al_movil = (bool) ($datos['alMovil'] ?? $preferencia->al_movil ?? true);
        $preferencia->con_sonido = (bool) ($datos['conSonido'] ?? $preferencia->con_sonido ?? true);
        $preferencia->save();

        return response()->json($this->deLaPersona($persona));
    }

    /**
     * PUT /api/mis-avisos/silencio  { activo, desde, hasta, finesDeSemana }
     */
    public function silencio(Request $peticion): JsonResponse
    {
        /** @var User $persona */
        $persona = $peticion->user();

        $hora = ['required', 'string', 'regex:/^([01]\d|2[0-3]):[0-5]\d$/'];

        $datos = $peticion->validate(
            [
                'activo' => ['required', 'boolean'],
                'desde' => $hora,
                'hasta' => $hora,
                'finesDeSemana' => ['required', 'boolean'],
            ],
            [
                'activo.*' => 'Indica si el horario de silencio queda encendido.',
                'desde.*' => 'Escribe la hora de inicio como 20:00.',
                'hasta.*' => 'Escribe la hora de fin como 07:30.',
                'finesDeSemana.*' => 'Indica si los fines de semana también son de silencio.',
            ],
        );

        if ($datos['desde'] === $datos['hasta']) {
            abort(422, 'El silencio no puede empezar y acabar a la misma hora.');
        }

        $persona->forceFill([
            'silencio_activo' => (bool) $datos['activo'],
            'silencio_desde' => $datos['desde'],
            'silencio_hasta' => $datos['hasta'],
            'silencio_fines_de_semana' => (bool) $datos['finesDeSemana'],
        ])->save();

        return response()->json($this->deLaPersona($persona->fresh()));
    }

    /**
     * @return array<string, mixed>
     */
    private function deLaPersona(User $persona): array
    {
        $ajustes = AjustesDeAvisos::vigentes();
        $tipos = $this->tiposQueLeLlegan($persona, $ajustes);
        $preferencias = PreferenciaDeAviso::query()
            ->where('usuario_id', $persona->id)
            ->get()
            ->keyBy('tipo');

        return [
            'avisos' => collect($tipos)->map(fn (string $tipo): array => [
                'tipo' => $tipo,
                'nombre' => AjustesDeAvisos::nombre($tipo),
                'porQue' => $this->porQueLeLlega($persona, $tipo),
                'vaALaCampanita' => AjustesDeAvisos::vaALaCampanita($tipo),
                'alMovil' => $preferencias->get($tipo)?->al_movil ?? true,
                'conSonido' => $preferencias->get($tipo)?->con_sonido ?? true,
                'apagadoEnElSistema' => ! $ajustes->estaActivo($tipo),
            ])->values(),
            'silencio' => [
                'activo' => (bool) $persona->silencio_activo,
                'desde' => (string) $persona->silencio_desde,
                'hasta' => (string) $persona->silencio_hasta,
                'finesDeSemana' => (bool) $persona->silencio_fines_de_semana,
            ],
            'dispositivos' => SuscripcionPush::query()
                ->where('usuario_id', $persona->id)
                ->orderByDesc('updated_at')
                ->get()
                ->map(fn (SuscripcionPush $suscripcion): array => [
                    'id' => $suscripcion->id,
                    'dispositivo' => $suscripcion->dispositivo,
                    'desde' => $suscripcion->created_at?->toIso8601String(),
                    'ultimoEnvioEn' => $suscripcion->ultimo_envio_en?->toIso8601String(),
                ])
                ->values(),
        ];
    }

    /**
     * Los avisos que le pueden llegar a esta persona. El lead, solo a quien
     * lo recibe por su rol; el resto, a cualquiera del equipo.
     *
     * @return list<string>
     */
    private function tiposQueLeLlegan(User $persona, AjustesDeAvisos $ajustes): array
    {
        return array_values(array_filter(
            AjustesDeAvisos::TIPOS,
            fn (string $tipo): bool => $tipo !== Notificacion::TIPO_LEAD_NUEVO
                || ($persona->rol->veTodasLasMarcas() && $ajustes->llegaAlRol($tipo, $persona->rol)),
        ));
    }

    private function porQueLeLlega(User $persona, string $tipo): string
    {
        return match ($tipo) {
            Notificacion::TIPO_LEAD_NUEVO => 'Te llega porque repartes las marcas',
            Notificacion::TIPO_MARCA_ASIGNADA => 'Cuando alguien te pone una marca',
            Notificacion::TIPO_MENCION => 'Cuando alguien te nombra con @',
            Notificacion::TIPO_COMENTARIO => AjustesDeAvisos::vigentes()->llegaAlRol($tipo, $persona->rol)
                ? 'Cuando escriben en la bitácora de cualquier marca'
                : 'Cuando escriben en la bitácora de una marca tuya',
            Notificacion::TIPO_RECORDATORIOS_DEL_DIA => 'A las 08:00, lo que te toca hoy',
            AjustesDeAvisos::CHAT => 'Se leen en el chat, no en la campanita',
            default => '',
        };
    }
}
