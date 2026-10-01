<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ArchivoMedia;
use App\Models\User;
use App\Support\GuardadoDeArchivos;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * MediaController — subida de imágenes sueltas: logos, web y avatares.
 * ---------------------------------------------------------------------
 * Sustituye al bucket "media" de Supabase Storage. Es la subida de lo que
 * después se guarda como una URL en otro sitio: el logo de una marca o de
 * una propiedad, una foto de la web, un avatar.
 *
 * La galería de las propiedades y los adjuntos de la bitácora NO pasan
 * por aquí: tienen sus propias rutas, porque cada fichero queda colgado
 * de algo con permisos propios (la propiedad, la marca). Las reglas de
 * cómo se guarda un fichero son las mismas para todos y viven en
 * App\Support\GuardadoDeArchivos.
 */
class MediaController extends Controller
{
    /** Los propósitos que se suben por esta ruta. */
    private const PROPOSITOS_DE_ESTA_RUTA = [
        ArchivoMedia::PROPOSITO_LOGO_MARCA,
        ArchivoMedia::PROPOSITO_CONTENIDO_WEB,
        ArchivoMedia::PROPOSITO_AVATAR,
    ];

    /**
     * POST /api/media
     * Sube una imagen y devuelve la URL pública para guardarla en la
     * ficha de la marca o en el contenido de la web.
     */
    public function subir(Request $peticion, GuardadoDeArchivos $guardado): JsonResponse
    {
        $datos = $peticion->validate([
            'archivo' => [
                'required',
                'file',
                'image',
                'mimes:jpg,jpeg,png,webp,gif',
                'max:'.GuardadoDeArchivos::TAMANO_MAXIMO_DE_IMAGEN_KB,
            ],
            'proposito' => ['nullable', Rule::in(self::PROPOSITOS_DE_ESTA_RUTA)],
        ], [
            'archivo.required' => 'Elige una imagen para subir.',
            'archivo.image' => 'El fichero debe ser una imagen.',
            'archivo.mimes' => 'Formatos admitidos: JPG, PNG, WebP o GIF.',
            'archivo.max' => 'La imagen no puede pesar más de 5 MB.',
        ]);

        /** @var User $usuarioQueSube */
        $usuarioQueSube = $peticion->user();

        $registroDelArchivo = $guardado->guardar(
            $datos['archivo'],
            $datos['proposito'] ?? ArchivoMedia::PROPOSITO_CONTENIDO_WEB,
            $usuarioQueSube,
        );

        return response()->json([
            'id' => $registroDelArchivo->id,
            'url' => $registroDelArchivo->url_publica,
            'nombreOriginal' => $registroDelArchivo->nombre_original,
            'tamanoBytes' => $registroDelArchivo->tamano_bytes,
        ], 201);
    }

    /**
     * DELETE /api/media/{archivo}
     * Borra la imagen del disco y su registro.
     *
     * Solo la puede borrar quien la subió o un administrador: así nadie
     * deja sin logo la marca de otro por error.
     *
     * Y solo lo que se subió por esta misma ruta. Una foto de la galería
     * se borra desde su propiedad y un adjunto no se borra suelto nunca
     * (se va con su entrada): si esta ruta los aceptara, serviría para
     * saltarse los permisos de las dos y para vaciar una entrada de la
     * bitácora sin dejar rastro.
     */
    public function destroy(Request $peticion, ArchivoMedia $archivo): JsonResponse
    {
        if (! in_array($archivo->proposito, self::PROPOSITOS_DE_ESTA_RUTA, true)) {
            return response()->json([
                'mensaje' => 'Ese fichero se gestiona desde la galería o la bitácora a la que pertenece.',
            ], 403);
        }

        /** @var User $usuarioQueActua */
        $usuarioQueActua = $peticion->user();

        $puedeBorrarla = $usuarioQueActua->esAdministrador()
            || $archivo->subido_por_id === $usuarioQueActua->id;

        if (! $puedeBorrarla) {
            return response()->json(['mensaje' => 'Solo puedes borrar las imágenes que subiste tú.'], 403);
        }

        $archivo->eliminarConSuFichero();

        return response()->json(['mensaje' => 'Imagen eliminada.']);
    }
}
