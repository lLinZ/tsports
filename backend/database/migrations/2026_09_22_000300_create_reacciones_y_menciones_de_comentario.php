<?php

/**
 * Migración: reacciones y menciones de la bitácora.
 * ---------------------------------------------------------------------
 * Dos tablas pequeñas que cuelgan de `comentarios_marca`.
 *
 * REACCIONES. Una fila por persona, comentario y emoji, con índice único
 * de los tres: reaccionar dos veces con el mismo emoji es quitar la
 * reacción, no sumar dos. El emoji se guarda como TEXTO y no como una
 * lista cerrada en el código, porque la lista que ofrece la interfaz es
 * una decisión de diseño que cambiará, y una columna con un enum
 * obligaría a una migración cada vez.
 *
 * Ojo: los emoji ocupan cuatro bytes. La base ya está en utf8mb4
 * (comprobado en producción el 2026-09-18), que es lo que permite
 * guardarlos; en latin1 esto fallaría con un error que no se entiende.
 *
 * MENCIONES. Podrían deducirse leyendo el texto del comentario, y sería
 * un error: el texto se puede editar después, y entonces el aviso que
 * ya se mandó apuntaría a alguien que ya no está mencionado —o al revés,
 * alguien quedaría mencionado sin haber recibido nada—. La fila es el
 * hecho: a esta persona se la etiquetó en esta entrada.
 *
 * Y son la razón por la que el servidor comprueba a quién se puede
 * mencionar. Un agente solo ve sus marcas (regla 6); si se pudiera
 * etiquetar a cualquiera, mencionar a alguien en una marca ajena le
 * filtraría el nombre de esa marca por la notificación.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reacciones_de_comentario', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();

            $tabla->foreignUuid('comentario_id')
                  ->constrained('comentarios_marca')->cascadeOnDelete();

            // Si la cuenta se borra, su reacción se va: no hay nada que
            // conservar en un pulgar hacia arriba sin dueño.
            $tabla->foreignUuid('usuario_id')
                  ->constrained('users')->cascadeOnDelete();

            // 16 caracteres: un emoji con modificadores de tono y de
            // unión cabe de sobra.
            $tabla->string('emoji', 16);

            $tabla->timestamps();

            $tabla->unique(['comentario_id', 'usuario_id', 'emoji']);
            $tabla->index('comentario_id');
        });

        // Tabla puente y nada más: sin id propio. La clave es la pareja,
        // que además deja dicho que mencionar dos veces a la misma
        // persona en una entrada es mencionarla una vez.
        Schema::create('menciones_de_comentario', function (Blueprint $tabla) {
            $tabla->foreignUuid('comentario_id')
                  ->constrained('comentarios_marca')->cascadeOnDelete();

            $tabla->foreignUuid('usuario_id')
                  ->constrained('users')->cascadeOnDelete();

            $tabla->timestamps();

            $tabla->primary(['comentario_id', 'usuario_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('menciones_de_comentario');
        Schema::dropIfExists('reacciones_de_comentario');
    }
};
