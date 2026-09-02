<?php

/**
 * Migración: `comentarios_marca` — bitácora de actividad de cada marca.
 * ---------------------------------------------------------------------
 * Equivale a la tabla `deal_comments` de Supabase. Es el hilo de
 * conversación que aparece en la columna derecha de la ficha: quién
 * llamó, qué respondieron, cuándo volver a insistir.
 *
 * El nombre del autor se guarda desnormalizado junto al id para que el
 * historial siga siendo legible aunque ese usuario se dé de baja.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('comentarios_marca', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();

            // Si se borra la marca desaparece su conversación con ella.
            $tabla->foreignUuid('marca_id')
                  ->constrained('marcas')->cascadeOnDelete();

            $tabla->foreignUuid('autor_id')->nullable()
                  ->constrained('users')->nullOnDelete();
            $tabla->string('autor_nombre')->nullable();

            $tabla->text('cuerpo');

            $tabla->timestamps();

            // Se listan siempre por marca y en orden cronológico.
            $tabla->index(['marca_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('comentarios_marca');
    }
};
