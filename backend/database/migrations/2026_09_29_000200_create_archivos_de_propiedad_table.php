<?php

/**
 * Migración: `archivos_de_propiedad` — la galería de cada propiedad.
 * ---------------------------------------------------------------------
 * Las fotos, los planos y el dossier de un producto IOP: lo que el
 * vendedor le enseña al cliente en la reunión, y lo que la web pública
 * enseña a quien todavía no ha escrito.
 *
 * Una fila por fichero. El fichero en sí es un `archivos_media` (la
 * subida segura de siempre); esta tabla dice de qué propiedad es, en qué
 * orden va y qué se cuenta de él.
 *
 *   · `titulo` no es decorativo. «Vista desde tribuna este» o «Zona VIP,
 *     aforo 200» es lo que convierte una foto en un argumento de venta.
 *   · `es_portada` — la foto que representa a la propiedad en el
 *     catálogo, en el checklist y en la web. Solo una por propiedad, y
 *     solo una imagen: un PDF no se puede pintar en una tarjeta. Lo hace
 *     cumplir el controlador.
 *   · `en_la_web` — si esta foto sale en la web pública cuando la
 *     propiedad está publicada. Nace en sí para las fotos, y se apaga en
 *     la que no deba verse fuera (un plano con precios, una foto de
 *     obra). Los documentos no salen nunca, lo diga o no esta columna.
 *
 * Al borrar la propiedad se van sus filas; los ficheros los borra el
 * controlador, porque una clave foránea no sabe tocar el disco.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('archivos_de_propiedad', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();

            $tabla->foreignUuid('propiedad_id')
                  ->constrained('propiedades')->cascadeOnDelete();

            // Un fichero es de una sola propiedad. Si se borra el fichero,
            // su sitio en la galería se va con él.
            $tabla->foreignUuid('archivo_media_id')->unique()
                  ->constrained('archivos_media')->cascadeOnDelete();

            $tabla->string('titulo', 160)->nullable();
            $tabla->text('descripcion')->nullable();

            $tabla->unsignedInteger('orden')->default(0);
            $tabla->boolean('es_portada')->default(false);
            $tabla->boolean('en_la_web')->default(true);

            $tabla->timestamps();

            // «La galería de esta propiedad, en su orden»: la consulta de
            // cada vez que se abre una propiedad o se pinta el checklist.
            $tabla->index(['propiedad_id', 'orden']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('archivos_de_propiedad');
    }
};
