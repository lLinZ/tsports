<?php

declare(strict_types=1);

namespace App\Support;

use App\Events\CambioEnElChat;
use App\Jobs\EnviarMensajeDeChatAlMovil;
use App\Models\Conversacion;
use App\Models\Marca;
use App\Models\MensajeDeChat;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Mensajeria — el único sitio que escribe en el chat.
 * ---------------------------------------------------------------------
 * Hace con los mensajes lo mismo que `Notificador` con los avisos: el
 * controlador cuenta lo que se pidió, y aquí se guarda y se reparte. Y
 * en el mismo orden, por la misma razón (regla 17 del CLAUDE.md):
 *
 *   1. Guardar el mensaje. A partir de aquí ya no se pierde.
 *   2. Empujarlo en vivo por Reverb, a quien tenga el panel abierto. Si
 *      Reverb no está (producción, hoy) o falla, no pasa nada: el
 *      navegador pregunta cada pocos segundos y lo trae igual.
 *   3. Encolar el aviso al móvil, para quien no esté delante.
 *
 * LAS MARCAS ETIQUETADAS se comprueban aquí, al guardar: quien escribe
 * solo puede etiquetar marcas que él mismo puede ver. El selector de la
 * interfaz ya solo ofrece esas, pero se salta escribiendo la petición a
 * mano, y entonces un agente podría sacar el nombre de una marca ajena
 * probando identificadores.
 *
 * Etiquetar una marca en una charla con alguien que NO la ve sí se
 * permite: quien escribe decide contarle de qué marca habla, igual que
 * podría escribir el nombre a mano. Lo que esa persona recibe es el
 * nombre y nada más —ni logo, ni enlace, ni datos—; eso lo resuelve
 * `RecursoMensajeDeChat` para cada quien que mira.
 */
class Mensajeria
{
    /** Cuántas marcas caben en un mensaje. Más que esto ya es una lista. */
    public const MARCAS_POR_MENSAJE = 10;

    /* ------------------------------------------------------------------
     | Mensajes
     |-----------------------------------------------------------------*/

    /**
     * @throws ValidationException si etiqueta una marca que no existe o
     *                             que quien escribe no puede ver.
     */
    public function enviar(Conversacion $conversacion, User $autor, string $cuerpo): MensajeDeChat
    {
        $cuerpo = trim($cuerpo);
        $marcasEtiquetadas = $this->marcasQuePuedeEtiquetar($autor, $cuerpo);

        $mensaje = DB::transaction(function () use ($conversacion, $autor, $cuerpo, $marcasEtiquetadas): MensajeDeChat {
            $mensaje = $this->guardar($conversacion, $autor, MensajeDeChat::TIPO_TEXTO, $cuerpo);

            foreach ($marcasEtiquetadas as $marca) {
                $mensaje->marcas()->create([
                    'marca_id' => $marca->id,
                    'nombre_marca' => $marca->nombre_marca,
                ]);
            }

            // Lo que uno escribe lo ha leído: sin esto, tu propio mensaje
            // te saldría como pendiente en la otra pestaña.
            $conversacion->participantes()->updateExistingPivot($autor->id, [
                'ultimo_leido_id' => $mensaje->id,
            ]);

            return $mensaje;
        });

        $this->empujarEnVivo($conversacion, CambioEnElChat::TIPO_MENSAJE, $mensaje->id);

        if (Push::estaActivo()) {
            EnviarMensajeDeChatAlMovil::dispatch($mensaje->id);
        }

        return $mensaje;
    }

    /**
     * Una línea del propio chat: «Ana añadió a Pedro». No suena en ningún
     * teléfono ni cuenta como sin leer; queda escrita para que se sepa
     * quién cambió qué en un grupo donde todos pueden cambiarlo todo.
     */
    public function anotarDeSistema(Conversacion $conversacion, User $quien, string $texto): MensajeDeChat
    {
        $mensaje = $this->guardar($conversacion, $quien, MensajeDeChat::TIPO_SISTEMA, $texto);

        $this->empujarEnVivo($conversacion, CambioEnElChat::TIPO_MENSAJE, $mensaje->id);

        return $mensaje;
    }

    /**
     * Marca como leído hasta un mensaje. Nunca hacia atrás: si una pestaña
     * vieja avisa de que leyó hasta el 10 cuando otra ya leyó hasta el 15,
     * se queda el 15.
     *
     * Avisa en vivo a los demás, que es lo que mueve el doble check de
     * «visto» en sus pantallas.
     */
    public function marcarComoLeido(Conversacion $conversacion, User $lector, int $hastaElMensaje): int
    {
        // No se puede leer lo que no existe: se acota al último mensaje
        // de la charla para que un número inventado no deje «leído» algo
        // que llegará después.
        $tope = min($hastaElMensaje, (int) ($conversacion->ultimo_mensaje_id ?? 0));

        $leidoHasta = (int) DB::table('participantes_de_conversacion')
            ->where('conversacion_id', $conversacion->id)
            ->where('usuario_id', $lector->id)
            ->value('ultimo_leido_id');

        if ($tope <= $leidoHasta) {
            return $leidoHasta;
        }

        DB::table('participantes_de_conversacion')
            ->where('conversacion_id', $conversacion->id)
            ->where('usuario_id', $lector->id)
            ->update(['ultimo_leido_id' => $tope, 'updated_at' => now()]);

        $this->empujarEnVivo($conversacion, CambioEnElChat::TIPO_LEIDO);

        return $tope;
    }

    /* ------------------------------------------------------------------
     | Charlas
     |-----------------------------------------------------------------*/

    /**
     * La charla directa entre dos personas: la que ya había o una nueva.
     *
     * Si dos pestañas la piden a la vez, la segunda choca con el índice
     * único de `clave_directa` y se queda con la que creó la primera. Sin
     * ese índice habría dos charlas con la misma persona y los mensajes
     * se repartirían entre las dos.
     */
    public function abrirDirecta(User $una, User $otra): Conversacion
    {
        $clave = Conversacion::claveDirectaEntre($una, $otra);

        $existente = Conversacion::query()->where('clave_directa', $clave)->first();

        if ($existente !== null) {
            return $existente;
        }

        try {
            return DB::transaction(function () use ($una, $otra, $clave): Conversacion {
                $conversacion = Conversacion::create([
                    'tipo' => Conversacion::TIPO_DIRECTA,
                    'clave_directa' => $clave,
                    'creada_por_id' => $una->id,
                ]);

                $conversacion->participantes()->attach([$una->id, $otra->id]);

                return $conversacion;
            });
        } catch (UniqueConstraintViolationException) {
            return Conversacion::query()->where('clave_directa', $clave)->firstOrFail();
        }
    }

    /**
     * @param  Collection<int,User>  $personas  sin contar a quien lo crea
     */
    public function crearGrupo(User $creador, string $nombre, Collection $personas): Conversacion
    {
        if (trim($nombre) === '') {
            $nombre = $this->nombrePorDefectoDelGrupo($creador, $personas);
        }

        $conversacion = DB::transaction(function () use ($creador, $nombre, $personas): Conversacion {
            $conversacion = Conversacion::create([
                'tipo' => Conversacion::TIPO_GRUPO,
                'nombre' => $nombre,
                'creada_por_id' => $creador->id,
            ]);

            $conversacion->participantes()->attach(
                $personas->pluck('id')->push($creador->id)->unique()->values()->all(),
            );

            return $conversacion;
        });

        $this->anotarDeSistema(
            $conversacion,
            $creador,
            sprintf('%s creó el grupo «%s»', $creador->nombreParaMostrar(), $nombre),
        );

        return $conversacion;
    }

    /**
     * El nombre de un grupo al que no se le puso: el de pila de quien lo
     * crea y después el de los demás por orden alfabético («Ana, Luisa y
     * Pedro»); con más de cuatro, los tres primeros y cuántos más.
     *
     * Se guarda como cualquier otro nombre y se cambia igual. No se
     * recalcula cuando alguien entra o sale: un grupo que cambia de nombre
     * solo deja de reconocerse en la lista.
     *
     * @param  Collection<int, User>  $personas
     */
    private function nombrePorDefectoDelGrupo(User $creador, Collection $personas): string
    {
        $nombreDePila = fn (User $persona): string => Str::before(trim($persona->nombreParaMostrar()), ' ');

        $nombres = $personas
            ->reject(fn (User $persona): bool => $persona->id === $creador->id)
            ->map($nombreDePila)
            ->sort(fn (string $uno, string $otro): int => strcasecmp($uno, $otro))
            ->prepend($nombreDePila($creador))
            ->values();

        $texto = $nombres->count() <= 4
            ? $nombres->join(', ', ' y ')
            : $nombres->take(3)->join(', ').' y '.($nombres->count() - 3).' más';

        // El mismo tope que el nombre escrito a mano (80), con el «…» dentro.
        return Str::limit($texto, 79, '…');
    }

    public function renombrarGrupo(Conversacion $conversacion, User $quien, string $nombreNuevo): void
    {
        if ($conversacion->nombre === $nombreNuevo) {
            return;
        }

        $conversacion->update(['nombre' => $nombreNuevo]);

        $this->anotarDeSistema(
            $conversacion,
            $quien,
            sprintf('%s cambió el nombre del grupo a «%s»', $quien->nombreParaMostrar(), $nombreNuevo),
        );
    }

    /**
     * Quien entra a un grupo VE lo que se habló antes —es el equipo, y el
     * contexto es justo lo que le hace falta—, pero no le sale como sin
     * leer: empieza a contar desde que entra.
     *
     * @param  Collection<int,User>  $personas
     */
    public function anadirAlGrupo(Conversacion $conversacion, User $quien, Collection $personas): void
    {
        $yaEstaban = $conversacion->participantes()->pluck('users.id')->all();

        $nuevas = $personas->reject(fn (User $persona): bool => in_array($persona->id, $yaEstaban, true))->values();

        if ($nuevas->isEmpty()) {
            return;
        }

        $conversacion->participantes()->attach(
            $nuevas->mapWithKeys(fn (User $persona): array => [
                $persona->id => ['ultimo_leido_id' => (int) ($conversacion->ultimo_mensaje_id ?? 0)],
            ])->all(),
        );

        $this->anotarDeSistema(
            $conversacion,
            $quien,
            sprintf(
                '%s añadió a %s',
                $quien->nombreParaMostrar(),
                $this->enumerar($nuevas->map(fn (User $persona): string => $persona->nombreParaMostrar())->all()),
            ),
        );
    }

    /**
     * Sacar a alguien, o salirse uno mismo. Si el grupo se queda vacío,
     * se borra: una charla sin nadie dentro no la puede ver nadie.
     */
    public function sacarDelGrupo(Conversacion $conversacion, User $quien, User $saliente): void
    {
        $conversacion->participantes()->detach($saliente->id);

        if (! $conversacion->participantes()->exists()) {
            $conversacion->delete();

            return;
        }

        $this->anotarDeSistema(
            $conversacion,
            $quien,
            $quien->id === $saliente->id
                ? sprintf('%s salió del grupo', $quien->nombreParaMostrar())
                : sprintf('%s sacó a %s del grupo', $quien->nombreParaMostrar(), $saliente->nombreParaMostrar()),
        );

        // Quien sale ya no está entre los que reciben el aviso en vivo;
        // se le avisa aparte para que la charla desaparezca de su lista.
        $this->empujarA([$saliente->id], $conversacion, CambioEnElChat::TIPO_CONVERSACION);
    }

    /* ------------------------------------------------------------------
     | Por dentro
     |-----------------------------------------------------------------*/

    private function guardar(Conversacion $conversacion, User $autor, string $tipo, string $cuerpo): MensajeDeChat
    {
        $mensaje = MensajeDeChat::create([
            'conversacion_id' => $conversacion->id,
            'autor_id' => $autor->id,
            'autor_nombre' => $autor->nombreParaMostrar(),
            'tipo' => $tipo,
            'cuerpo' => $cuerpo,
        ]);

        // La lista de charlas se ordena por este id: la última que se
        // movió va arriba.
        $conversacion->ultimo_mensaje_id = $mensaje->id;
        $conversacion->save();

        return $mensaje;
    }

    /**
     * Las marcas etiquetadas en el texto, comprobadas.
     *
     * @return Collection<int,Marca>
     *
     * @throws ValidationException
     */
    private function marcasQuePuedeEtiquetar(User $autor, string $cuerpo): Collection
    {
        $ids = MensajeDeChat::idsDeMarcasEn($cuerpo);

        if ($ids === []) {
            return collect();
        }

        if (count($ids) > self::MARCAS_POR_MENSAJE) {
            throw ValidationException::withMessages([
                'cuerpo' => sprintf('Un mensaje puede etiquetar %d marcas como mucho.', self::MARCAS_POR_MENSAJE),
            ]);
        }

        $marcas = Marca::query()->whereIn('id', $ids)->get();

        $todasSeVen = $marcas->count() === count($ids)
            && $marcas->every(fn (Marca $marca): bool => Gate::forUser($autor)->allows('view', $marca));

        // «No existe» y «no es tuya» dan el mismo mensaje: distinguirlos
        // le diría a quien prueba identificadores cuáles son marcas de
        // verdad.
        if (! $todasSeVen) {
            throw ValidationException::withMessages([
                'cuerpo' => 'Una de las marcas etiquetadas no existe o no la puedes ver.',
            ]);
        }

        return $marcas;
    }

    private function empujarEnVivo(Conversacion $conversacion, string $tipo, ?int $idDelMensaje = null): void
    {
        $this->empujarA(
            $conversacion->participantes()->pluck('users.id')->all(),
            $conversacion,
            $tipo,
            $idDelMensaje,
        );
    }

    /**
     * @param  list<string>  $idsDeDestinatarios
     */
    private function empujarA(array $idsDeDestinatarios, Conversacion $conversacion, string $tipo, ?int $idDelMensaje = null): void
    {
        // Sin tiempo real configurado no se intenta: los navegadores
        // preguntan solos cada pocos segundos.
        if (! TiempoReal::estaActivo() || $idsDeDestinatarios === []) {
            return;
        }

        // event() y no broadcast(), por lo mismo que en Notificador: el
        // fallo salta en esta línea y lo recoge el try.
        try {
            event(new CambioEnElChat(array_values($idsDeDestinatarios), $tipo, $conversacion->id, $idDelMensaje));
        } catch (Throwable $error) {
            Log::warning('No se pudo empujar el chat en vivo; el mensaje queda guardado.', [
                'conversacion' => $conversacion->id,
                'error' => $error->getMessage(),
            ]);
        }
    }

    /** @param  list<string>  $nombres */
    private function enumerar(array $nombres): string
    {
        if (count($nombres) <= 1) {
            return $nombres[0] ?? '';
        }

        $ultimo = array_pop($nombres);

        return implode(', ', $nombres).' y '.$ultimo;
    }
}
