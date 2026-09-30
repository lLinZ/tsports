<?php

/**
 * Migración: `adjuntos_de_comentario` — lo que se envió, junto a lo que
 * se habló.
 * ---------------------------------------------------------------------
 * Une una entrada de la bitácora con los ficheros que lleva: el dossier
 * que se mandó, la foto de la activación, el contrato escaneado. Así la
 * propuesta enviada queda fechada y en su sitio dentro de la
 * conversación, sin una caja de documentos aparte en la ficha.
 *
 * Tabla puente y nada más: la clave es la pareja. `archivo_media_id` es
 * además único, porque un fichero subido para una entrada es de esa
 * entrada y de ninguna otra.
 *
 * Los ficheros van al disco PRIVADO, no al público: una marca no la ve
 * todo el equipo (regla 6), y un enlace público a su contrato seguiría
 * abriéndose aunque la marca cambiara de manos. Se sirven con enlace
 * firmado y caducado, que solo recibe quien puede ver la marca.
 *
 * Al borrar la entrada (borrado suave, ver ComentarioMarca) se borran
 * también sus ficheros: eliminar tiene que eliminar de verdad lo
 * enviado, igual que se vacía el texto.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('adjuntos_de_comentario', function (Blueprint $tabla) {
            $tabla->foreignUuid('comentario_id')
                  ->constrained('comentarios_marca')->cascadeOnDelete();

            $tabla->foreignUuid('archivo_media_id')->unique()
                  ->constrained('archivos_media')->cascadeOnDelete();

            // El orden en que se adjuntaron, que es el que se enseña.
            $tabla->unsignedSmallInteger('orden')->default(0);

            $tabla->timestamps();

            $tabla->primary(['comentario_id', 'archivo_media_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('adjuntos_de_comentario');
    }
};
