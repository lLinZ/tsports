<?php

/**
 * Migración: `archivos_media` aprende dos cosas nuevas.
 * ---------------------------------------------------------------------
 * Hasta aquí todo lo subido era una imagen pública: logos, fotos de la
 * web y avatares, servidos por nginx desde storage/app/public. La Fase 3
 * trae dos tipos de fichero que no encajan del todo en eso:
 *
 *   · `disco` — dónde vive el fichero. Los adjuntos de la bitácora NO
 *     van al disco público: son de una marca, y una marca no la ve todo
 *     el mundo (regla 6). Viven en storage/app/private y solo se sirven
 *     con un enlace firmado que caduca (ver AdjuntoController). Todo lo
 *     que ya existía es público, y por eso ese es el valor de partida.
 *
 *   · `ruta_miniatura` — una copia pequeña de la foto, que la galería y
 *     la web pintan en las rejillas. Una foto de móvil pesa 3 o 4 MB, y
 *     una rejilla de doce son cincuenta megas para ver sellos de correo.
 *     La hace el navegador al subirla; si no pudo, queda vacía y se usa
 *     la foto entera.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('archivos_media', function (Blueprint $tabla) {
            $tabla->string('disco', 20)->default('public')->after('ruta_relativa');
            $tabla->string('ruta_miniatura')->nullable()->after('disco');
        });
    }

    public function down(): void
    {
        Schema::table('archivos_media', function (Blueprint $tabla) {
            $tabla->dropColumn(['disco', 'ruta_miniatura']);
        });
    }
};
