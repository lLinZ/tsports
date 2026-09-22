<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoComentarioMarca;
use App\Http\Resources\RecursoPersonaMencionable;
use App\Models\ComentarioMarca;
use App\Models\Marca;
use App\Models\RegistroActividad;
use App\Models\User;
use App\Support\Notificador;
use App\Support\QuienPuedeVerLaMarca;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

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
 */
class ComentarioMarcaController extends Controller
{
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
            'cuerpo' => ['required', 'string', 'max:4000'],
            'comentarioPadreId' => ['nullable', 'uuid'],
            'menciones' => ['nullable', 'array', 'max:20'],
            'menciones.*' => ['uuid'],
        ], [
            'cuerpo.required' => 'Escribe algo antes de comentar.',
            'cuerpo.max' => 'El comentario es demasiado largo (máximo 4000 caracteres).',
            'menciones.max' => 'No se puede etiquetar a más de 20 personas en una entrada.',
        ]);

        /** @var User $autor */
        $autor = $peticion->user();

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

        $comentario = DB::transaction(function () use ($marca, $autor, $datos, $padre, $mencionados): ComentarioMarca {
            $nuevo = $marca->comentarios()->create([
                'comentario_padre_id' => $padre?->id,
                'autor_id' => $autor->id,
                'autor_nombre' => $autor->nombreParaMostrar(),
                'cuerpo' => trim($datos['cuerpo']),
            ]);

            if ($mencionados->isNotEmpty()) {
                $nuevo->mencionados()->sync($mencionados->pluck('id')->all());
            }

            return $nuevo;
        });

        RegistroActividad::anotar(
            $autor,
            RegistroActividad::ACCION_COMENTO,
            'marca',
            $marca->id,
            ($padre === null ? 'Comentó en ' : 'Respondió en ').$marca->nombre_marca,
        );

        if ($mencionados->isNotEmpty()) {
            app(Notificador::class)->avisarDeUnaMencion(
                $mencionados,
                $marca,
                $autor,
                $comentario->cuerpo,
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
            'cuerpo' => ['required', 'string', 'max:4000'],
            'menciones' => ['nullable', 'array', 'max:20'],
            'menciones.*' => ['uuid'],
        ], [
            'cuerpo.required' => 'El comentario no puede quedarse vacío.',
            'cuerpo.max' => 'El comentario es demasiado largo (máximo 4000 caracteres).',
        ]);

        $yaEstabanMencionados = $comentario->mencionados()->pluck('users.id')->all();
        $mencionados = QuienPuedeVerLaMarca::filtrar($marca, $datos['menciones'] ?? []);

        DB::transaction(function () use ($comentario, $datos, $mencionados): void {
            $comentario->update([
                'cuerpo' => trim($datos['cuerpo']),
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
                $comentario->cuerpo,
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
            'respuestas.reacciones.usuario',
            'respuestas.mencionados',
        ];
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
