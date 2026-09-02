<?php

/**
 * Migración: `archivos_media` — inventario de imágenes subidas.
 * ---------------------------------------------------------------------
 * Sustituye al bucket "media" de Supabase Storage. Los ficheros se
 * guardan en el disco público del propio servidor (storage/app/public)
 * y esta tabla lleva el registro de qué hay, quién lo subió y cuánto
 * ocupa, para poder limpiar lo que ya no se usa.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('archivos_media', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();

            // Ruta relativa dentro del disco público, p. ej. "logos/xxx.png".
            $tabla->string('ruta_relativa');
            $tabla->string('nombre_original');
            $tabla->string('tipo_mime', 100);
            $tabla->unsignedBigInteger('tamano_bytes');

            // Para qué se subió: 'logo_marca', 'contenido_web' o 'avatar'.
            $tabla->string('proposito')->default('contenido_web');

            $tabla->foreignUuid('subido_por_id')->nullable()
                  ->constrained('users')->nullOnDelete();

            $tabla->timestamps();

            $tabla->index('proposito');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('archivos_media');
    }
};
