<?php

/**
 * Migración: los vídeos tutoriales del panel.
 * ---------------------------------------------------------------------
 * Desde el 2026-10-20 el panel tiene una pantalla «Vídeos» con los
 * tutoriales grabados para cada rol. Cada fila es un vídeo:
 *
 *   · `clave` es el nombre estable del vídeo («agente-03»): con ella el
 *     comando `videos:importar` sabe si un vídeo ya estaba y lo sustituye
 *     en vez de duplicarlo cuando se vuelve a grabar.
 *   · `guia` es la serie (GuiaDeVideo) y decide quién lo ve
 *     (RolUsuario::guiasDeVideoQueVe). `orden` es el puesto dentro de ella.
 *   · El vídeo y su portada viven en `archivos_media`, en el disco
 *     PRIVADO, y se sirven con enlace firmado como los adjuntos de la
 *     bitácora (regla 21): servidos por /storage, cualquiera con la
 *     dirección vería los de otro rol.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('videos_tutoriales', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();
            $tabla->string('clave', 80)->unique();
            $tabla->string('guia', 20);
            $tabla->unsignedSmallInteger('orden')->default(0);
            $tabla->string('titulo', 160);
            $tabla->text('descripcion')->nullable();
            $tabla->unsignedInteger('duracion_segundos')->default(0);
            $tabla->foreignUuid('archivo_media_id')->constrained('archivos_media')->cascadeOnDelete();
            $tabla->foreignUuid('portada_media_id')->nullable()->constrained('archivos_media')->nullOnDelete();
            $tabla->timestamps();

            $tabla->index(['guia', 'orden']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('videos_tutoriales');
    }
};
