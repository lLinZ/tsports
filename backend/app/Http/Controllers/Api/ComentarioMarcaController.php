<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoComentarioMarca;
use App\Models\ComentarioMarca;
use App\Models\Marca;
use App\Models\RegistroActividad;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * ComentarioMarcaController — la bitácora de cada marca.
 * ---------------------------------------------------------------------
 * Sustituye a la tabla `deal_comments` de Supabase. Es la columna
 * derecha de la ficha: quién llamó, qué contestaron, cuándo insistir.
 *
 * Quien puede ver una marca puede comentarla, aunque no pueda editarla.
 * Es deliberado: si un vendedor descubre algo de una marca que trabaja
 * otro, lo natural es que pueda avisarle por el mismo hilo.
 */
class ComentarioMarcaController extends Controller
{
    /**
     * GET /api/marcas/{marca}/comentarios
     * Hilo completo, en orden cronológico (lo más antiguo arriba, como
     * una conversación).
     */
    public function index(Marca $marca): AnonymousResourceCollection
    {
        $this->authorize('view', $marca);

        $comentariosOrdenados = $marca->comentarios()
            ->orderBy('created_at')
            ->get();

        return RecursoComentarioMarca::collection($comentariosOrdenados);
    }

    /**
     * POST /api/marcas/{marca}/comentarios
     * Añade una entrada al hilo.
     */
    public function store(Request $peticion, Marca $marca): JsonResponse
    {
        $this->authorize('comentar', $marca);

        $datos = $peticion->validate([
            'cuerpo' => ['required', 'string', 'max:4000'],
        ], [
            'cuerpo.required' => 'Escribe algo antes de comentar.',
            'cuerpo.max' => 'El comentario es demasiado largo (máximo 4000 caracteres).',
        ]);

        /** @var User $autor */
        $autor = $peticion->user();

        $comentario = $marca->comentarios()->create([
            'autor_id' => $autor->id,
            'autor_nombre' => $autor->nombreParaMostrar(),
            'cuerpo' => trim($datos['cuerpo']),
        ]);

        RegistroActividad::anotar(
            $autor,
            RegistroActividad::ACCION_COMENTO,
            'marca',
            $marca->id,
            'Comentó en '.$marca->nombre_marca,
        );

        return (new RecursoComentarioMarca($comentario))->response()->setStatusCode(201);
    }

    /**
     * DELETE /api/marcas/{marca}/comentarios/{comentario}
     * Solo el autor o un administrador pueden borrar una entrada.
     */
    public function destroy(Request $peticion, Marca $marca, ComentarioMarca $comentario): JsonResponse
    {
        $this->authorize('view', $marca);

        /** @var User $usuarioQueActua */
        $usuarioQueActua = $peticion->user();

        // Comprobación de coherencia: el comentario debe pertenecer a la
        // marca de la ruta, o alguien podría borrar el hilo de otra.
        if ($comentario->marca_id !== $marca->id) {
            return response()->json(['mensaje' => 'Ese comentario no pertenece a esta marca.'], 404);
        }

        if (! $comentario->puedeBorrarlo($usuarioQueActua)) {
            return response()->json(['mensaje' => 'Solo puedes borrar tus propios comentarios.'], 403);
        }

        $comentario->delete();

        return response()->json(['mensaje' => 'Comentario eliminado.']);
    }
}
