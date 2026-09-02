<?php

/**
 * Migración: `contenido_sitio` — el CMS de la web pública.
 * ---------------------------------------------------------------------
 * Reemplaza a la tabla `site_content` de Supabase. Todo el contenido
 * editable del sitio (colores, imágenes, textos en español e inglés,
 * servicios, proyectos, equipo, aliados y datos de contacto) vive en una
 * única fila con un documento JSON.
 *
 * ¿Por qué un JSON y no veinte tablas? Porque el contenido de una web de
 * una sola página cambia de forma como cambia el diseño, y normalizarlo
 * obligaría a una migración cada vez que se añade un campo. Con un JSON,
 * el panel añade la clave y el frontend la lee; el esquema lo valida la
 * capa de aplicación (App\Support\EsquemaContenidoSitio).
 *
 * Se guarda historial: cada guardado crea una fila nueva y la vigente es
 * la que tiene `es_version_publicada` en verdadero. Así se puede volver
 * atrás si alguien borra media página por accidente.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contenido_sitio', function (Blueprint $tabla) {
            $tabla->id();

            // Permite tener en el futuro varios sitios o entornos.
            $tabla->string('clave')->default('principal');

            // El documento completo del contenido de la web.
            $tabla->json('contenido');

            // Solo una fila por clave está publicada a la vez.
            $tabla->boolean('es_version_publicada')->default(true);

            $tabla->foreignUuid('actualizado_por_id')->nullable()
                  ->constrained('users')->nullOnDelete();
            $tabla->string('actualizado_por_nombre')->nullable();

            // Nota corta de qué se cambió, para leer el historial.
            $tabla->string('nota_de_cambio')->nullable();

            $tabla->timestamps();

            $tabla->index(['clave', 'es_version_publicada']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contenido_sitio');
    }
};
