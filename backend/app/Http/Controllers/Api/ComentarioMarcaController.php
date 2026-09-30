<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoComentarioMarca;
use App\Http\Resources\RecursoPersonaMencionable;
use App\Models\ArchivoMedia;
use App\Models\ComentarioMarca;
use App\Models\Marca;
use App\Models\RegistroActividad;
use App\Models\User;
use App\Support\Notificador;
use App\Support\QuienPuedeVerLaMarca;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * ComentarioMarcaController — la bitácora de cada marca.
 * ---------------------------------------------------------------------
 * Sustituye a la tabla `deal_comments` de Supabase. Es la columna
 * derecha de la ficha: quién llamó, qué contestaron, cuándo insistir. Y
 * desde la Etapa 5, una conversación de verdad: se responde, se
 * reacciona y se etiqueta a quien tiene que enterarse.
 *
 * Quien puede ver una marca puede comentarla, aunque no pueda editarla.
 * Es deliberado: si un vendedor descubre algo de una marca que trabaja
 * otro, lo natural es que pueda avisarle por el mismo hilo.
 *
 * LAS DOS REGLAS QUE SE COMPRUEBAN AQUÍ Y NO EN LA INTERFAZ
 *
 *   1. A QUIÉN SE PUEDE ETIQUETAR. Sale de los permisos sobre la marca
 *      (`QuienPuedeVerLaMarca`), no de «el equipo». El selector ya ofrece
 *      solo a esas personas, pero el selector se salta escribiendo la
 *      petición a mano: aquí se vuelve a filtrar, y esta vez es la que
 *      cuenta. Sin ello, etiquetar a un agente en una marca ajena le
 *      filtraría su nombre por la notificación (regla 6).
 *
 *   2. UN SOLO NIVEL DE RESPUESTAS. Una respuesta cuelga siempre de una
 *      entrada raíz de la misma marca; responder a una respuesta se
 *      rechaza.
 *
 * Y los ADJUNTOS: se suben antes, por AdjuntoController, y aquí la
 * entrada solo dice cuáles lleva. Solo puede colgar ficheros que subió
 * la misma persona y que no estén ya en otra entrada; si no, bastaría
 * con saber el id de un fichero ajeno para pegarlo en un hilo propio.
 */
class ComentarioMarcaController extends Controller
{
    /** Con más de diez ficheros la entrada deja de leerse de corrido. */
    private const MAXIMO_DE_ADJUNTOS_POR_ENTRADA = 10;

    /**
     * GET /api/marcas/{marca}/comentarios
     *
     * Hilo completo, en orden cronológico (lo más antiguo arriba, como
     * una conversación). Incluye las entradas eliminadas, que salen sin
     * texto y diciendo quién las quitó: un registro del que desaparecen
     * entradas sin rastro no vale como registro.
     */
    public function index(Marca $marca): AnonymousResourceCollection
    {
        $this->authorize('view', $marca);

        $hilo = $marca->comentarios()
            ->raices()
            ->with($this->loQueAcompanaAlComentario())
            ->orderBy('created_at')
            ->get();

        return RecursoComentarioMarca::collection($hilo);
    }

    /**
     * GET /api/marcas/{marca}/comentarios/mencionables
     *
     * A quién se puede etiquetar en esta bitácora. Es la lista que
     * alimenta el selector, y sale de quién puede ver ESTA marca.
     */
    public function mencionables(Marca $marca): AnonymousResourceCollection
    {
        $this->authorize('comentar', $marca);

        return RecursoPersonaMencionable::collection(QuienPuedeVerLaMarca::lista($marca));
    }

    /**
     * POST /api/marcas/{marca}/comentarios
     *
     * Añade una entrada al hilo, o una respuesta a una entrada.
     */
    public function store(Request $peticion, Marca $marca): JsonResponse
    {
        $this->authorize('comentar', $marca);

        $datos = $peticion->validate([
            'cuerpo' => ['nullable', 'string', 'max:4000'],
            'comentarioPadreId' => ['nullable', 'uuid'],
            'menciones' => ['nullable', 'array', 'max:20'],
            'menciones.*' => ['uuid'],
            'adjuntos' => ['nullable', 'array', 'max:'.self::MAXIMO_DE_ADJUNTOS_POR_ENTRADA],
            'adjuntos.*' => ['uuid', 'distinct'],
        ], [
            'cuerpo.max' => 'El comentario es demasiado largo (máximo 4000 caracteres).',
            'menciones.max' => 'No se puede etiquetar a más de 20 personas en una entrada.',
            'adjuntos.max' => 'Una entrada lleva como mucho '.self::MAXIMO_DE_ADJUNTOS_POR_ENTRADA.' adjuntos.',
        ]);

        /** @var User $autor */
        $autor = $peticion->user();

        $texto = trim((string) ($datos['cuerpo'] ?? ''));
        $adjuntos = $this->adjuntosQuePuedeColgar($autor, $datos['adjuntos'] ?? []);

        // Un fichero solo, sin texto, también es una entrada: «el dossier
        // que se mandó» se entiende por sí mismo. Lo que no vale es nada.
        if ($texto === '' && $adjuntos->isEmpty()) {
            throw ValidationException::withMessages([
                'cuerpo' => 'Escribe algo antes de comentar.',
            ]);
        }

        $padre = null;

        if (($datos['comentarioPadreId'] ?? null) !== null) {
            $padre = ComentarioMarca::find($datos['comentarioPadreId']);

            // Una respuesta cuelga de una entrada raíz de ESTA marca. Se
            // comprueban las dos cosas: sin la primera se mezclarían
            // hilos de marcas distintas —y eso sería leer la bitácora de
            // una marca ajena—, y sin la segunda el hilo se anidaría sin
            // fin y sería ilegible en tres semanas.
            if ($padre === null
                || $padre->marca_id !== $marca->id
                || $padre->esUnaRespuesta()) {
                return response()->json([
                    'mensaje' => 'No se puede responder a esa entrada.',
                ], 422);
            }
        }

        $mencionados = QuienPuedeVerLaMarca::filtrar($marca, $datos['menciones'] ?? []);

        $comentario = DB::transaction(function () use ($marca, $autor, $texto, $padre, $mencionados, $adjuntos): ComentarioMarca {
            $nuevo = $marca->comentarios()->create([
                'comentario_padre_id' => $padre?->id,
                'autor_id' => $autor->id,
                'autor_nombre' => $autor->nombreParaMostrar(),
                'cuerpo' => $texto,
            ]);

            if ($mencionados->isNotEmpty()) {
                $nuevo->mencionados()->sync($mencionados->pluck('id')->all());
            }

            if ($adjuntos->isNotEmpty()) {
                $nuevo->adjuntos()->attach(
                    $adjuntos->values()->mapWithKeys(
                        fn (ArchivoMedia $adjunto, int $posicion): array => [$adjunto->id => ['orden' => $posicion]],
                    )->all(),
                );
            }

            return $nuevo;
        });

        RegistroActividad::anotar(
            $autor,
            RegistroActividad::ACCION_COMENTO,
            'marca',
            $marca->id,
            ($padre === null ? 'Comentó en ' : 'Respondió en ').$marca->nombre_marca
                .match ($adjuntos->count()) {
                    0 => '',
                    1 => ' con un adjunto',
                    default => ' con '.$adjuntos->count().' adjuntos',
                },
        );

        if ($mencionados->isNotEmpty()) {
            app(Notificador::class)->avisarDeUnaMencion(
                $mencionados,
                $marca,
                $autor,
                $this->textoParaElAviso($comentario->cuerpo, $adjuntos),
            );
        }

        $comentario->load($this->loQueAcompanaAlComentario());

        return (new RecursoComentarioMarca($comentario))->response()->setStatusCode(201);
    }

    /**
     * PATCH /api/marcas/{marca}/comentarios/{comentario}
     *
     * Corregir lo propio. Queda marcado como editado: sin esa marca,
     * cambiar una frase a los tres meses deja el hilo diciendo algo que
     * nadie dijo ese día.
     *
     * Las menciones se pueden ajustar al editar, y quien se añada recibe
     * su aviso; a quien ya estaba no se le vuelve a avisar.
     */
    public function update(Request $peticion, Marca $marca, ComentarioMarca $comentario): JsonResponse
    {
        $this->authorize('view', $marca);

        if (($error = $this->siNoEsDeEstaMarca($comentario, $marca)) !== null) {
            return $error;
        }

        /** @var User $quienEdita */
        $quienEdita = $peticion->user();

        if (! $comentario->puedeEditarlo($quienEdita)) {
            return response()->json([
                // Ni un administrador: cambiar las palabras de otro en un
                // registro que se exporta es peor que no poder corregir
                // una errata. Eliminar sí puede, y eso deja rastro.
                'mensaje' => 'Solo puedes editar tus propios comentarios.',
            ], 403);
        }

        $datos = $peticion->validate([
            'cuerpo' => ['nullable', 'string', 'max:4000'],
            'menciones' => ['nullable', 'array', 'max:20'],
            'menciones.*' => ['uuid'],
        ], [
            'cuerpo.max' => 'El comentario es demasiado largo (máximo 4000 caracteres).',
        ]);

        $texto = trim((string) ($datos['cuerpo'] ?? ''));

        // Una entrada que lleva un fichero puede quedarse sin texto; una
        // que no lleva nada más que texto, no.
        if ($texto === '' && ! $comentario->adjuntos()->exists()) {
            throw ValidationException::withMessages([
                'cuerpo' => 'El comentario no puede quedarse vacío.',
            ]);
        }

        $yaEstabanMencionados = $comentario->mencionados()->pluck('users.id')->all();
        $mencionados = QuienPuedeVerLaMarca::filtrar($marca, $datos['menciones'] ?? []);

        DB::transaction(function () use ($comentario, $texto, $mencionados): void {
            $comentario->update([
                'cuerpo' => $texto,
                'editado_en' => now(),
            ]);

            $comentario->mencionados()->sync($mencionados->pluck('id')->all());
        });

        $losQueNoEstaban = $mencionados->reject(
            fn (User $persona): bool => in_array($persona->id, $yaEstabanMencionados, true),
        );

        if ($losQueNoEstaban->isNotEmpty()) {
            app(Notificador::class)->avisarDeUnaMencion(
                $losQueNoEstaban,
                $marca,
                $quienEdita,
                $this->textoParaElAviso($comentario->cuerpo, $comentario->adjuntos()->get()),
            );
        }

        $comentario->load($this->loQueAcompanaAlComentario());

        // ->response() para que salga envuelto en `data`, igual que el
        // alta y el listado: dos formas distintas obligarian a la
        // interfaz a mirar de donde vino cada respuesta.
        return (new RecursoComentarioMarca($comentario))->response();
    }

    /**
     * DELETE /api/marcas/{marca}/comentarios/{comentario}
     *
     * Solo el autor o un administrador. NO borra la fila: la marca como
     * eliminada y deja el hueco en el hilo con quién y cuándo.
     */
    public function destroy(Request $peticion, Marca $marca, ComentarioMarca $comentario): JsonResponse
    {
        $this->authorize('view', $marca);

        if (($error = $this->siNoEsDeEstaMarca($comentario, $marca)) !== null) {
            return $error;
        }

        /** @var User $usuarioQueActua */
        $usuarioQueActua = $peticion->user();

        if (! $comentario->puedeBorrarlo($usuarioQueActua)) {
            return response()->json(['mensaje' => 'Solo puedes borrar tus propios comentarios.'], 403);
        }

        $comentario->eliminarDejandoRastro($usuarioQueActua);

        return response()->json(['mensaje' => 'Comentario eliminado.']);
    }

    /**
     * PUT /api/marcas/{marca}/comentarios/{comentario}/reacciones
     *
     * Pone o quita la reacción de quien la pide. Es un interruptor: la
     * misma reacción dos veces la quita, que es lo que espera cualquiera
     * que haya usado un chat.
     */
    public function reaccionar(Request $peticion, Marca $marca, ComentarioMarca $comentario): JsonResponse
    {
        $this->authorize('comentar', $marca);

        if (($error = $this->siNoEsDeEstaMarca($comentario, $marca)) !== null) {
            return $error;
        }

        if ($comentario->estaEliminado()) {
            return response()->json(['mensaje' => 'Esa entrada se eliminó.'], 422);
        }

        $datos = $peticion->validate([
            // Los emoji ocupan varios bytes; el límite va en caracteres.
            'emoji' => ['required', 'string', 'min:1', 'max:16'],
        ], [
            'emoji.required' => 'Elige una reacción.',
        ]);

        /** @var User $quienReacciona */
        $quienReacciona = $peticion->user();

        $yaPuesta = $comentario->reacciones()
            ->where('usuario_id', $quienReacciona->id)
            ->where('emoji', $datos['emoji'])
            ->first();

        if ($yaPuesta !== null) {
            $yaPuesta->delete();
        } else {
            $comentario->reacciones()->create([
                'usuario_id' => $quienReacciona->id,
                'emoji' => $datos['emoji'],
            ]);
        }

        $comentario->load($this->loQueAcompanaAlComentario());

        // ->response() para que salga envuelto en `data`, igual que el
        // alta y el listado: dos formas distintas obligarian a la
        // interfaz a mirar de donde vino cada respuesta.
        return (new RecursoComentarioMarca($comentario))->response();
    }

    /**
     * Lo que se carga junto a cada entrada del hilo.
     *
     * En un solo sitio para que el listado, el alta, la edición y la
     * reacción devuelvan exactamente la misma forma: si una de ellas se
     * dejara las reacciones fuera, la interfaz las vería desaparecer al
     * pulsar y volver al recargar.
     *
     * @return list<string>
     */
    private function loQueAcompanaAlComentario(): array
    {
        // `reacciones.usuario` hace falta para poder decir QUIÉNES
        // reaccionaron al pasar por encima. Sin cargarlo aquí salta el
        // aviso de carga perezosa, que en este proyecto está apagada a
        // propósito para que estos descuidos no lleguen a producción
        // convertidos en una consulta por fila.
        return [
            'reacciones.usuario',
            'mencionados',
            'adjuntos',
            'respuestas.reacciones.usuario',
            'respuestas.mencionados',
            'respuestas.adjuntos',
        ];
    }

    /**
     * Los ficheros que esta persona puede colgar de su entrada, en el
     * orden en que los adjuntó.
     *
     * Solo sirven los que subió ELLA y que no están en otra entrada. Si
     * alguno no cumple, se rechaza la entrada entera en vez de publicarla
     * sin él: quien escribe cree que el fichero va dentro, y publicarla
     * incompleta sería peor que avisar.
     *
     * @param  list<string>  $idsPedidos
     * @return Collection<int,ArchivoMedia>
     */
    private function adjuntosQuePuedeColgar(User $autor, array $idsPedidos): Collection
    {
        if ($idsPedidos === []) {
            return collect();
        }

        $disponibles = ArchivoMedia::query()
            ->adjuntosSueltosDe($autor)
            ->whereIn('id', $idsPedidos)
            ->get()
            ->keyBy('id');

        if ($disponibles->count() !== count($idsPedidos)) {
            throw ValidationException::withMessages([
                'adjuntos' => 'Alguno de los archivos ya no está disponible. Quítalo y vuelve a adjuntarlo.',
            ]);
        }

        return collect($idsPedidos)->map(fn (string $id): ArchivoMedia => $disponibles->get($id));
    }

    /**
     * Lo que dice el aviso de una mención. Con texto, el adelanto del
     * texto; con solo un fichero, qué fichero es: un aviso que dijera
     * «Ana: «»» no le serviría a nadie.
     *
     * @param  Collection<int,ArchivoMedia>  $adjuntos
     */
    private function textoParaElAviso(string $texto, Collection $adjuntos): string
    {
        if (trim($texto) !== '' || $adjuntos->isEmpty()) {
            return $texto;
        }

        return $adjuntos->count() === 1
            ? 'Adjuntó '.$adjuntos->first()->nombre_original
            : 'Adjuntó '.$adjuntos->count().' archivos';
    }

    /**
     * Comprobación de coherencia: el comentario tiene que ser de la
     * marca de la ruta, o alguien podría tocar el hilo de otra.
     */
    private function siNoEsDeEstaMarca(ComentarioMarca $comentario, Marca $marca): ?JsonResponse
    {
        return $comentario->marca_id === $marca->id
            ? null
            : response()->json(['mensaje' => 'Ese comentario no pertenece a esta marca.'], 404);
    }
}
