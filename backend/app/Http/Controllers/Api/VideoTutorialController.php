<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoVideoTutorial;
use App\Models\User;
use App\Models\VideoTutorial;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * VideoTutorialController — la lista de la pantalla «Vídeos».
 * ---------------------------------------------------------------------
 * GET /api/videos devuelve los tutoriales de las series que ve quien
 * pregunta, ya ordenados: el agente, los suyos; el comercial, los del
 * agente y los suyos; el administrador, todos (RolUsuario::
 * guiasDeVideoQueVe). La interfaz no filtra nada: pinta lo que llega.
 *
 * Solo lectura: los vídeos los carga `php artisan videos:importar`.
 */
class VideoTutorialController extends Controller
{
    public function index(Request $peticion): AnonymousResourceCollection
    {
        /** @var User $persona */
        $persona = $peticion->user();

        $videos = VideoTutorial::query()
            ->with(['archivo', 'portada'])
            ->queVe($persona)
            ->get();

        return RecursoVideoTutorial::collection($videos);
    }
}
