<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ArchivoMedia;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * MediaController — subida de imágenes al servidor.
 * ---------------------------------------------------------------------
 * Sustituye al bucket "media" de Supabase Storage. Los ficheros van al
 * disco público del propio VPS (storage/app/public, enlazado desde
 * public/storage con `php artisan storage:link`).
 *
 * Sobre seguridad: el nombre original del fichero NUNCA se usa como
 * nombre en disco. Se genera uno aleatorio y la extensión se deduce del
 * tipo MIME real detectado por PHP, no de lo que diga el nombre. Así un
 * "logo.php.png" no puede acabar siendo ejecutable en el servidor.
 */
class MediaController extends Controller
{
    /** Tamaño máximo por imagen, en kilobytes (5 MB). */
    private const TAMANO_MAXIMO_KB = 5120;

    /**
     * POST /api/media
     * Sube una imagen y devuelve la URL pública para guardarla en la
     * ficha de la marca o en el contenido de la web.
     */
    public function subir(Request $peticion): JsonResponse
    {
        $datos = $peticion->validate([
            'archivo' => [
                'required',
                'file',
                'image',
                'mimes:jpg,jpeg,png,webp,gif,svg',
                'max:'.self::TAMANO_MAXIMO_KB,
            ],
            'proposito' => [
                'nullable',
                Rule::in([
                    ArchivoMedia::PROPOSITO_LOGO_MARCA,
                    ArchivoMedia::PROPOSITO_CONTENIDO_WEB,
                    ArchivoMedia::PROPOSITO_AVATAR,
                ]),
            ],
        ], [
            'archivo.required' => 'Elige una imagen para subir.',
            'archivo.image' => 'El fichero debe ser una imagen.',
            'archivo.mimes' => 'Formatos admitidos: JPG, PNG, WebP, GIF o SVG.',
            'archivo.max' => 'La imagen no puede pesar más de 5 MB.',
        ]);

        /** @var \Illuminate\Http\UploadedFile $imagenSubida */
        $imagenSubida = $datos['archivo'];

        $propositoDeLaImagen = $datos['proposito'] ?? ArchivoMedia::PROPOSITO_CONTENIDO_WEB;

        // Nombre aleatorio + extensión deducida del contenido real.
        $extensionSegura = $imagenSubida->extension() ?: 'png';
        $nombreEnDisco = Str::uuid()->toString().'.'.$extensionSegura;

        // Carpeta por propósito y por mes: mantiene el disco ordenado y
        // evita directorios con decenas de miles de ficheros.
        $carpetaDestino = $propositoDeLaImagen.'/'.now()->format('Y-m');

        $rutaRelativa = $imagenSubida->storeAs($carpetaDestino, $nombreEnDisco, 'public');

        /** @var User $usuarioQueSube */
        $usuarioQueSube = $peticion->user();

        $registroDelArchivo = ArchivoMedia::create([
            'ruta_relativa' => $rutaRelativa,
            'nombre_original' => mb_substr($imagenSubida->getClientOriginalName(), 0, 200),
            'tipo_mime' => (string) $imagenSubida->getClientMimeType(),
            'tamano_bytes' => (int) $imagenSubida->getSize(),
            'proposito' => $propositoDeLaImagen,
            'subido_por_id' => $usuarioQueSube->id,
        ]);

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
     */
    public function destroy(Request $peticion, ArchivoMedia $archivo): JsonResponse
    {
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
