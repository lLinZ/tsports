<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoAdjunto;
use App\Models\ArchivoMedia;
use App\Models\Marca;
use App\Models\User;
use App\Support\GuardadoDeArchivos;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * AdjuntoController — los ficheros de la bitácora: subirlos y servirlos.
 * ---------------------------------------------------------------------
 * UN ADJUNTO SE SUBE ANTES QUE SU ENTRADA. Mientras se escribe, cada
 * fichero sube por su cuenta con su barra de progreso; al publicar, la
 * entrada solo dice qué ficheros lleva (ComentarioMarcaController). Así
 * publicar es instantáneo aunque los adjuntos pesen, y si uno falla se
 * reintenta ese, no el mensaje entero.
 *
 * Lo que se sube y nunca llega a una entrada se barre solo pasadas unas
 * horas (ArchivoMedia::eliminarAdjuntosAbandonados).
 *
 * SE SIRVEN CON ENLACE FIRMADO, no desde /storage. Viven en el disco
 * privado porque son de una marca, y una marca no la ve todo el equipo
 * (regla 6). El enlace lo firma el servidor dentro de las respuestas de
 * la bitácora, que solo recibe quien puede ver la marca, y caduca en uno
 * o dos días: quien pierde la marca pierde también sus ficheros en ese
 * plazo, y una URL copiada no vale para siempre.
 */
class AdjuntoController extends Controller
{
    /**
     * POST /api/marcas/{marca}/adjuntos
     *
     * Sube un fichero para una entrada que todavía se está escribiendo.
     * Puede hacerlo quien puede comentar la marca.
     */
    public function subir(Request $peticion, Marca $marca, GuardadoDeArchivos $guardado): JsonResponse
    {
        $this->authorize('comentar', $marca);

        $datos = $peticion->validate([
            'archivo' => ['required', 'file', 'max:'.GuardadoDeArchivos::TAMANO_MAXIMO_DE_DOCUMENTO_KB],
            // Sin tope aquí: una miniatura que no sirve se descarta en
            // silencio, no tumba la subida del fichero.
            'miniatura' => ['nullable', 'file'],
        ], [
            'archivo.required' => 'Elige una foto o un PDF para adjuntar.',
            'archivo.max' => 'El fichero no puede pesar más de 20 MB.',
            'archivo.uploaded' => 'El fichero no llegó entero al servidor. Si pesa mucho, prueba a reducirlo.',
        ]);

        // Un buen momento para barrer lo que otros dejaron a medias: pasa
        // solo y a menudo, y no hace falta ninguna tarea programada.
        ArchivoMedia::eliminarAdjuntosAbandonados();

        /** @var User $quienSube */
        $quienSube = $peticion->user();

        $archivo = $guardado->guardar(
            $datos['archivo'],
            ArchivoMedia::PROPOSITO_ADJUNTO_COMENTARIO,
            $quienSube,
            $peticion->file('miniatura'),
        );

        return (new RecursoAdjunto($archivo))->response()->setStatusCode(201);
    }

    /**
     * GET /api/adjuntos/{archivo}?variante=miniatura|descarga
     *
     * Sin sesión: la etiqueta <img> que lo pide no manda el token. Lo que
     * da acceso es la firma, que comprueba el middleware `signed` antes de
     * llegar aquí.
     */
    public function ver(Request $peticion, ArchivoMedia $archivo): StreamedResponse
    {
        // La ruta sirve adjuntos y nada más. Lo demás es público o no es
        // de nadie, y ninguna de las dos cosas se pide por aquí.
        abort_unless($archivo->proposito === ArchivoMedia::PROPOSITO_ADJUNTO_COMENTARIO, 404);

        $variante = (string) $peticion->query('variante', 'original');
        $conMiniatura = $variante === 'miniatura' && $archivo->ruta_miniatura !== null;

        $ruta = $conMiniatura ? $archivo->ruta_miniatura : $archivo->ruta_relativa;
        $disco = Storage::disk($archivo->disco);

        abort_unless($disco->exists($ruta), 404);

        return $disco->response(
            $ruta,
            $archivo->nombre_original,
            [
                // El tipo se comprobó por el contenido al subirlo; se manda
                // tal cual y se prohíbe al navegador adivinar otro.
                'Content-Type' => $conMiniatura
                    ? ($disco->mimeType($ruta) ?: 'image/jpeg')
                    : $archivo->tipo_mime,
                'X-Content-Type-Options' => 'nosniff',
                // Privada: que no la guarde ningún intermediario. Un día,
                // que es lo que dura igual el enlace.
                'Cache-Control' => 'private, max-age=86400',
            ],
            $variante === 'descarga' ? 'attachment' : 'inline',
        );
    }
}
