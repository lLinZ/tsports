<?php

declare(strict_types=1);

namespace App\Support;

use App\Events\NotificacionNueva;
use App\Models\Marca;
use App\Models\Notificacion;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Notificador — quién se entera de qué.
 * ---------------------------------------------------------------------
 * Es el único sitio que crea notificaciones. Los controladores le cuentan
 * lo que acaba de pasar («entró un lead», «cambió el agente de esta
 * marca») y aquí se decide a quién avisar y con qué palabras.
 *
 * DOS PASOS, EN ESTE ORDEN
 *   1. Guardar el aviso. A partir de aquí ya no se pierde.
 *   2. Empujarlo en vivo por Reverb, a quien tenga el panel abierto.
 * El segundo paso es una mejora, no una condición: si Reverb está
 * parado, el error se anota en el registro y la petición sigue como si
 * nada. Quien asignó la marca no tiene por qué enterarse de que el
 * demonio del tiempo real está caído; el agente verá el aviso al entrar.
 *
 * A QUIÉN
 * Por permisos del rol (`RolUsuario`), nunca comparando nombres de rol.
 * Y solo a cuentas activas: una cuenta desactivada no entra, así que
 * sus avisos se acumularían para nadie.
 */
class Notificador
{
    /**
     * Entró un lead por el formulario de la web.
     *
     * Avisa a quien ve las marcas sin dueño —hoy, admin y comercial—,
     * que es quien reparte. El agente no: desde septiembre no ve los
     * leads sin asignar, y un aviso que lleva a una ficha que no puede
     * abrir solo confunde (y le filtraría el nombre de la empresa).
     */
    public function avisarDeUnLeadNuevo(Marca $marca): void
    {
        $quienReparte = User::query()
            ->where('activo', true)
            ->get()
            ->filter(fn (User $persona): bool => $persona->rol->veTodasLasMarcas());

        $cuerpo = $marca->persona_contacto !== null && $marca->persona_contacto !== $marca->nombre_marca
            ? sprintf('%s escribió desde la web por %s. Está sin asignar.', $marca->persona_contacto, $marca->nombre_marca)
            : sprintf('%s escribió desde la web. Está sin asignar.', $marca->nombre_marca);

        $this->crearYEmpujar(
            $quienReparte,
            Notificacion::TIPO_LEAD_NUEVO,
            'Nuevo lead desde la web',
            $cuerpo,
            $marca,
        );
    }

    /**
     * Se guardó una marca y quizá cambió su agente.
     *
     * Se llama desde TODOS los caminos que pueden asignar —el alta, la
     * ficha y el selector rápido del tablero— para que la regla viva en
     * un solo sitio. Solo avisa cuando hay un agente nuevo de verdad:
     *
     *   · Si no cambió (se guardó la ficha por un teléfono), nada.
     *   · Si se quitó el agente, nada: no hay a quién avisar.
     *   · Si la persona se la asignó a sí misma (o la adoptó), nada:
     *     ya lo sabe.
     */
    public function avisarSiCambioElAgente(Marca $marca, ?string $idDelAgenteAnterior, User $quienAsigna): void
    {
        $idDelAgenteNuevo = $marca->vendedor_asignado_id;

        if ($idDelAgenteNuevo === null
            || $idDelAgenteNuevo === $idDelAgenteAnterior
            || $idDelAgenteNuevo === $quienAsigna->id) {
            return;
        }

        $agenteNuevo = User::query()->where('activo', true)->find($idDelAgenteNuevo);

        if ($agenteNuevo === null) {
            return;
        }

        $this->crearYEmpujar(
            collect([$agenteNuevo]),
            Notificacion::TIPO_MARCA_ASIGNADA,
            'Te asignaron una marca',
            sprintf('%s te asignó %s.', $quienAsigna->nombreParaMostrar(), $marca->nombre_marca),
            $marca,
        );
    }

    /**
     * @param  Collection<int,User>  $destinatarios
     */
    private function crearYEmpujar(
        Collection $destinatarios,
        string $tipo,
        string $titulo,
        string $cuerpo,
        Marca $marca,
    ): void {
        $notificaciones = $destinatarios->map(fn (User $destinatario): Notificacion => Notificacion::create([
            'destinatario_id' => $destinatario->id,
            'tipo' => $tipo,
            'titulo' => $titulo,
            'cuerpo' => $cuerpo,
            'entidad_tipo' => 'marca',
            'entidad_id' => $marca->id,
        ]));

        $this->empujarEnVivo($notificaciones);
    }

    /**
     * @param  Collection<int,Notificacion>  $notificaciones
     */
    private function empujarEnVivo(Collection $notificaciones): void
    {
        // Con el tiempo real apagado (producción, hasta que se active) no
        // se intenta: con el driver `log` cada aviso acabaría escrito en
        // el registro sin llegar a nadie.
        if (! TiempoReal::estaActivo()) {
            return;
        }

        foreach ($notificaciones->values() as $posicion => $notificacion) {
            // event() y no broadcast(): broadcast() envía al destruirse el
            // objeto que devuelve, y un fallo ahí es fácil que escape del
            // try. event() falla en esta misma línea.
            try {
                event(new NotificacionNueva($notificacion));
            } catch (Throwable $error) {
                // Se captura todo y no solo BroadcastException: con Reverb
                // parado, Laravel deja pasar la excepción de conexión de
                // Guzzle tal cual.
                //
                // Y se deja de intentar con el resto: si Reverb no contestó
                // al primero, tampoco va a contestar al siguiente, y cada
                // intento es una espera más para quien hizo la petición.
                Log::warning('No se pudo empujar en vivo; los avisos quedan guardados.', [
                    'sinEmpujar' => $notificaciones->count() - $posicion,
                    'error' => $error->getMessage(),
                ]);

                return;
            }
        }
    }
}
