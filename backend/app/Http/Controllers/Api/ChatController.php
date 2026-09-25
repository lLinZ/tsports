<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoConversacion;
use App\Http\Resources\RecursoMensajeDeChat;
use App\Http\Resources\RecursoPersonaDelChat;
use App\Models\Conversacion;
use App\Models\MensajeDeChat;
use App\Models\User;
use App\Support\Mensajeria;
use App\Support\Presencia;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * ChatController — el chat interno del equipo.
 * ---------------------------------------------------------------------
 * Mensajería entre personas, uno a uno y en grupo, con marcas
 * etiquetadas dentro de los mensajes.
 *
 * Aquí no se escribe nada a mano: todo mensaje y todo cambio de grupo
 * pasa por `App\Support\Mensajeria`, que guarda, empuja en vivo y
 * encola el aviso al móvil en ese orden. Quién puede qué lo decide
 * `ConversacionPolicy`: lo de una charla es de quien está dentro, y de
 * nadie más, administrador incluido.
 *
 * FUNCIONA SIN REVERB. El navegador llama al «latido» cada pocos
 * segundos; con él la persona sigue en línea y se entera de si hay algo
 * nuevo. Con Reverb encendido, además, cada cambio llega al momento y el
 * latido se espacia.
 */
class ChatController extends Controller
{
    /** Cuántos mensajes trae cada vez que se sube en una charla. */
    private const MENSAJES_POR_TANDA = 40;

    public function __construct(private readonly Mensajeria $mensajeria) {}

    /* ------------------------------------------------------------------
     | Presencia y novedades
     |-----------------------------------------------------------------*/

    /**
     * POST /api/chat/latido  { visible: bool }
     *
     * Dos cosas en una sola petición, porque se hace cada pocos segundos:
     *
     *   · Deja constancia de que la persona está delante (o de que se fue,
     *     con `visible: false`, al esconder la pestaña).
     *   · Le dice si hay algo nuevo: cuántos mensajes tiene sin leer y el
     *     id del último mensaje de sus charlas. Si alguno cambió desde el
     *     latido anterior, el navegador pide lo que le falte.
     *
     * Y trae quién está en línea, para mover los puntos verdes sin otra
     * petición.
     */
    public function latido(Request $peticion): JsonResponse
    {
        $datos = $peticion->validate(['visible' => ['sometimes', 'boolean']]);

        /** @var User $persona */
        $persona = $peticion->user();

        Presencia::anotarLatido($persona, (bool) ($datos['visible'] ?? true));

        $ultimoMensajeId = (int) Conversacion::query()->de($persona)->max('ultimo_mensaje_id');

        return response()->json([
            'sinLeer' => array_sum($this->sinLeerPorConversacion($persona)),
            'ultimoMensajeId' => $ultimoMensajeId,
            'enLinea' => User::query()
                ->where('activo', true)
                ->where('en_linea_hasta', '>', now())
                ->pluck('id')
                ->values()
                ->all(),
        ]);
    }

    /**
     * GET /api/chat/personas
     * El equipo, para escribirle a alguien: primero quien está en línea.
     * Solo cuentas activas, y sin uno mismo.
     */
    public function personas(Request $peticion): AnonymousResourceCollection
    {
        /** @var User $persona */
        $persona = $peticion->user();

        $equipo = User::query()
            ->where('activo', true)
            ->where('id', '!=', $persona->id)
            ->get()
            ->sortBy([
                fn (User $una, User $otra): int => Presencia::estaEnLinea($otra) <=> Presencia::estaEnLinea($una),
                fn (User $una, User $otra): int => strcasecmp($una->nombreParaMostrar(), $otra->nombreParaMostrar()),
            ])
            ->values();

        return RecursoPersonaDelChat::collection($equipo);
    }

    /* ------------------------------------------------------------------
     | Charlas
     |-----------------------------------------------------------------*/

    /**
     * GET /api/chat/conversaciones
     * Las charlas de quien pregunta, la que se movió última arriba.
     */
    public function conversaciones(Request $peticion): AnonymousResourceCollection
    {
        /** @var User $persona */
        $persona = $peticion->user();

        $charlas = Conversacion::query()
            ->de($persona)
            ->with(['participantes', 'ultimoMensaje.marcas'])
            // Las recién creadas, aún sin mensajes, van arriba: si no, un
            // grupo nuevo aparecería al final de la lista y parecería que
            // no se creó.
            ->orderByRaw('CASE WHEN ultimo_mensaje_id IS NULL THEN 0 ELSE 1 END')
            ->orderByDesc('ultimo_mensaje_id')
            ->orderByDesc('created_at')
            ->get();

        return RecursoConversacion::collection($this->conSusSinLeer($charlas, $persona));
    }

    /** GET /api/chat/conversaciones/{conversacion} */
    public function mostrar(Request $peticion, Conversacion $conversacion): RecursoConversacion
    {
        $this->authorize('view', $conversacion);

        return $this->comoRecurso($conversacion, $peticion->user());
    }

    /**
     * POST /api/chat/directas  { persona: id }
     * Abre la charla con alguien: la que ya había o una nueva.
     */
    public function abrirDirecta(Request $peticion): RecursoConversacion
    {
        /** @var User $persona */
        $persona = $peticion->user();

        $datos = $peticion->validate([
            'persona' => ['required', 'uuid', Rule::exists('users', 'id')->where('activo', true), Rule::notIn([$persona->id])],
        ], [
            'persona.exists' => 'Esa persona no existe o su cuenta está desactivada.',
            'persona.not_in' => 'No puedes abrir una charla contigo.',
        ]);

        $conversacion = $this->mensajeria->abrirDirecta($persona, User::query()->findOrFail($datos['persona']));

        return $this->comoRecurso($conversacion, $persona);
    }

    /**
     * POST /api/chat/grupos  { nombre, personas: [id, …] }
     */
    public function crearGrupo(Request $peticion): JsonResponse
    {
        /** @var User $persona */
        $persona = $peticion->user();

        $datos = $peticion->validate([
            'nombre' => ['required', 'string', 'max:80'],
            'personas' => ['required', 'array', 'min:1', 'max:50'],
            'personas.*' => ['uuid', Rule::exists('users', 'id')->where('activo', true)],
        ], [
            'personas.required' => 'Elige al menos a una persona para el grupo.',
            'personas.min' => 'Elige al menos a una persona para el grupo.',
            'personas.*.exists' => 'Alguna de las personas elegidas no existe o tiene la cuenta desactivada.',
        ], [
            'nombre' => 'nombre del grupo',
        ]);

        $conversacion = $this->mensajeria->crearGrupo(
            $persona,
            trim($datos['nombre']),
            $this->personasPorId($datos['personas']),
        );

        return $this->comoRecurso($conversacion, $persona)->response()->setStatusCode(201);
    }

    /** PATCH /api/chat/conversaciones/{conversacion}  { nombre } */
    public function renombrar(Request $peticion, Conversacion $conversacion): RecursoConversacion
    {
        $this->authorize('cambiarElGrupo', $conversacion);

        $datos = $peticion->validate(['nombre' => ['required', 'string', 'max:80']], [], ['nombre' => 'nombre del grupo']);

        $this->mensajeria->renombrarGrupo($conversacion, $peticion->user(), trim($datos['nombre']));

        return $this->comoRecurso($conversacion, $peticion->user());
    }

    /** POST /api/chat/conversaciones/{conversacion}/personas  { personas: [id, …] } */
    public function anadirPersonas(Request $peticion, Conversacion $conversacion): RecursoConversacion
    {
        $this->authorize('cambiarElGrupo', $conversacion);

        $datos = $peticion->validate([
            'personas' => ['required', 'array', 'min:1', 'max:50'],
            'personas.*' => ['uuid', Rule::exists('users', 'id')->where('activo', true)],
        ], [
            'personas.*.exists' => 'Alguna de las personas elegidas no existe o tiene la cuenta desactivada.',
        ]);

        $this->mensajeria->anadirAlGrupo($conversacion, $peticion->user(), $this->personasPorId($datos['personas']));

        return $this->comoRecurso($conversacion, $peticion->user());
    }

    /**
     * DELETE /api/chat/conversaciones/{conversacion}/personas/{usuario}
     * Sacar a alguien del grupo, o salirse uno mismo.
     */
    public function sacarPersona(Request $peticion, Conversacion $conversacion, User $usuario): JsonResponse
    {
        $this->authorize('cambiarElGrupo', $conversacion);

        if (! $conversacion->tieneDentroA($usuario)) {
            abort(404, 'Esa persona no está en este grupo.');
        }

        $this->mensajeria->sacarDelGrupo($conversacion, $peticion->user(), $usuario);

        return response()->json(['mensaje' => 'Hecho.']);
    }

    /* ------------------------------------------------------------------
     | Mensajes
     |-----------------------------------------------------------------*/

    /**
     * GET /api/chat/conversaciones/{conversacion}/mensajes
     *
     *   · sin nada        → los últimos 40.
     *   · ?antesDe=1532   → los 40 anteriores a ese (al subir en la charla).
     *   · ?despuesDe=1532 → todo lo nuevo desde ese (lo que pide el
     *                       navegador sin tiempo real, cada pocos segundos).
     *
     * Siempre del más viejo al más nuevo, que es como se pintan.
     */
    public function mensajes(Request $peticion, Conversacion $conversacion): JsonResponse
    {
        $this->authorize('view', $conversacion);

        $datos = $peticion->validate([
            'antesDe' => ['sometimes', 'integer', 'min:1'],
            'despuesDe' => ['sometimes', 'integer', 'min:0'],
        ]);

        $consulta = MensajeDeChat::query()
            ->where('conversacion_id', $conversacion->id)
            ->with('marcas.marca');

        if (isset($datos['despuesDe'])) {
            $mensajes = $consulta
                ->where('id', '>', (int) $datos['despuesDe'])
                ->orderBy('id')
                // Tope por si alguien vuelve de una semana fuera: lo que no
                // quepa llega en la vuelta siguiente, sin saltarse nada.
                ->limit(200)
                ->get();
        } else {
            $mensajes = $consulta
                ->when(isset($datos['antesDe']), fn ($anteriores) => $anteriores->where('id', '<', (int) $datos['antesDe']))
                ->orderByDesc('id')
                ->limit(self::MENSAJES_POR_TANDA)
                ->get()
                ->reverse()
                ->values();
        }

        $primero = $mensajes->first();

        $conversacion->load('participantes');
        $losDemas = $conversacion->participantes->reject(fn (User $persona): bool => $persona->id === $peticion->user()->id);

        return response()->json([
            'data' => RecursoMensajeDeChat::collection($mensajes)->resolve($peticion),
            'hayMasAntiguos' => $primero !== null && MensajeDeChat::query()
                ->where('conversacion_id', $conversacion->id)
                ->where('id', '<', $primero->id)
                ->exists(),
            'leidoPorLosDemasHasta' => (int) ($losDemas->min(fn (User $persona): int => (int) $persona->pivot->ultimo_leido_id) ?? 0),
        ]);
    }

    /** POST /api/chat/conversaciones/{conversacion}/mensajes  { cuerpo } */
    public function enviar(Request $peticion, Conversacion $conversacion): JsonResponse
    {
        $this->authorize('escribir', $conversacion);

        $datos = $peticion->validate([
            'cuerpo' => ['required', 'string', 'max:'.MensajeDeChat::LONGITUD_MAXIMA],
        ], [
            'cuerpo.required' => 'El mensaje está vacío.',
            'cuerpo.max' => 'El mensaje es demasiado largo: como mucho, :max caracteres.',
        ], [
            'cuerpo' => 'mensaje',
        ]);

        $mensaje = $this->mensajeria->enviar($conversacion, $peticion->user(), $datos['cuerpo']);

        return (new RecursoMensajeDeChat($mensaje->load('marcas.marca')))
            ->response()
            ->setStatusCode(201);
    }

    /** POST /api/chat/conversaciones/{conversacion}/leido  { hasta: id } */
    public function marcarComoLeido(Request $peticion, Conversacion $conversacion): JsonResponse
    {
        $this->authorize('view', $conversacion);

        $datos = $peticion->validate(['hasta' => ['required', 'integer', 'min:0']]);

        return response()->json([
            'leidoHasta' => $this->mensajeria->marcarComoLeido($conversacion, $peticion->user(), (int) $datos['hasta']),
        ]);
    }

    /* ------------------------------------------------------------------
     | Por dentro
     |-----------------------------------------------------------------*/

    private function comoRecurso(Conversacion $conversacion, User $lector): RecursoConversacion
    {
        $conversacion = $conversacion->fresh(['participantes', 'ultimoMensaje.marcas']);

        return new RecursoConversacion($this->conSusSinLeer(collect([$conversacion]), $lector)->first());
    }

    /**
     * Cuántos mensajes de otros hay sin leer en cada charla de una
     * persona, contados en UNA consulta para todas: todo lo que va después
     * de su `ultimo_leido_id`. Los de sistema no cuentan.
     *
     * @return array<string,int>  id de la charla → sin leer
     */
    private function sinLeerPorConversacion(User $persona): array
    {
        return DB::table('participantes_de_conversacion as participante')
            ->join('mensajes_de_chat as mensaje', function ($union): void {
                $union->on('mensaje.conversacion_id', '=', 'participante.conversacion_id')
                    ->on('mensaje.id', '>', 'participante.ultimo_leido_id');
            })
            ->where('participante.usuario_id', $persona->id)
            ->where('mensaje.tipo', MensajeDeChat::TIPO_TEXTO)
            ->where(fn ($deOtros) => $deOtros->whereNull('mensaje.autor_id')->orWhere('mensaje.autor_id', '!=', $persona->id))
            ->groupBy('participante.conversacion_id')
            ->selectRaw('participante.conversacion_id as conversacion, COUNT(*) as total')
            ->pluck('total', 'conversacion')
            ->map(fn ($total): int => (int) $total)
            ->all();
    }

    /**
     * @param  Collection<int,Conversacion>  $charlas
     * @return Collection<int,Conversacion>
     */
    private function conSusSinLeer(Collection $charlas, User $persona): Collection
    {
        $sinLeer = $this->sinLeerPorConversacion($persona);

        return $charlas->each(fn (Conversacion $charla) => $charla->setAttribute('total_sin_leer', $sinLeer[$charla->id] ?? 0));
    }

    /**
     * @param  list<string>  $ids
     * @return Collection<int,User>
     */
    private function personasPorId(array $ids): Collection
    {
        return User::query()->whereIn('id', array_values(array_unique($ids)))->where('activo', true)->get();
    }
}
