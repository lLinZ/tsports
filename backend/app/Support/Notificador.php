<?php

declare(strict_types=1);

namespace App\Support;

use App\Events\NotificacionNueva;
use App\Jobs\EnviarAvisoPush;
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
 * TRES PASOS, EN ESTE ORDEN
 *   1. Guardar el aviso. A partir de aquí ya no se pierde.
 *   2. Empujarlo en vivo por Reverb, a quien tenga el panel abierto.
 *   3. Encolar el aviso al móvil, para quien lo tenga cerrado.
 * Los pasos 2 y 3 son mejoras, no condiciones: si Reverb está parado, el
 * error se anota en el registro y la petición sigue como si nada; si no
 * hay trabajador de colas, el push espera en la tabla `jobs`. Quien
 * asignó la marca no tiene por qué enterarse de que un demonio está
 * caído; el agente verá el aviso al entrar.
 *
 * El push va EN COLA y el empuje en vivo NO, y es deliberado: el
 * WebSocket es un mensaje a un proceso de esta misma máquina, y un push
 * es una petición de red al servidor de Google o de Apple por cada
 * dispositivo. Ver EnviarAvisoPush.
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
     * Te etiquetaron en la bitácora de una marca.
     *
     * A quién se puede etiquetar ya lo decidió `QuienPuedeVerLaMarca`
     * antes de llegar aquí, y por eso este método no vuelve a filtrar
     * por permisos: recibe personas que SÍ pueden ver la marca. Si
     * alguna vez se le llamara con otra, el aviso le filtraría el nombre
     * de una marca ajena (regla 6), así que es la única puerta y la
     * guarda el controlador.
     *
     * No se avisa a quien se etiqueta a sí mismo: ya sabe que lo hizo.
     *
     * @param  Collection<int,User>  $mencionados
     */
    public function avisarDeUnaMencion(
        Collection $mencionados,
        Marca $marca,
        User $quienEscribe,
        string $textoDelComentario,
    ): void {
        $aQuienAvisar = $mencionados
            ->filter(fn (User $persona): bool => $persona->id !== $quienEscribe->id)
            ->filter(fn (User $persona): bool => $persona->activo);

        if ($aQuienAvisar->isEmpty()) {
            return;
        }

        $this->crearYEmpujar(
            $aQuienAvisar,
            Notificacion::TIPO_MENCION,
            'Te etiquetaron en '.$marca->nombre_marca,
            sprintf('%s: «%s»', $quienEscribe->nombreParaMostrar(), $this->comoAdelanto($textoDelComentario)),
            $marca,
        );
    }

    /**
     * Las primeras palabras del comentario, para que el aviso diga de
     * qué va sin tener que abrir la ficha.
     *
     * Se corta por longitud y no por palabras: un comentario puede ser
     * una sola línea larguísima pegada de un correo.
     */
    private function comoAdelanto(string $texto): string
    {
        $limpio = trim(preg_replace('/\s+/u', ' ', $texto) ?? $texto);

        return mb_strlen($limpio) > 120
            ? mb_substr($limpio, 0, 119).'…'
            : $limpio;
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
        $this->empujarAlMovil($notificaciones);
    }

    /**
     * Pone en cola el aviso al móvil de cada destinatario.
     *
     * Va detrás de guardar y detrás del empuje en vivo. Si el panel está
     * abierto, para cuando el trabajador saque esto de la cola el aviso
     * ya estará leído y el trabajo no hará sonar nada (lo comprueba
     * EnviarAvisoPush).
     *
     * @param  Collection<int,Notificacion>  $notificaciones
     */
    private function empujarAlMovil(Collection $notificaciones): void
    {
        // Sin claves VAPID no hay push. Se comprueba aquí además de
        // dentro del trabajo para no llenar la tabla `jobs` de trabajos
        // que solo van a devolverse a sí mismos.
        if (! Push::estaActivo()) {
            return;
        }

        foreach ($notificaciones as $notificacion) {
            EnviarAvisoPush::dispatch($notificacion->id);
        }
    }

    /**
     * @param  Collection<int,Notificacion>  $notificaciones
     */
    private function empujarEnVivo(Collection $notificaciones): void
    {
        // Con el tiempo real apagado no se intenta: con el driver `log`
        // cada aviso acabaría escrito en el registro sin llegar a nadie.
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
