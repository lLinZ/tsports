<?php

/**
 * Migración: `notificaciones` — los avisos que el sistema le da a cada
 * persona.
 * ---------------------------------------------------------------------
 * «Entró un lead por la web», «te asignaron una marca». Cada fila es un
 * aviso para UNA persona: si un lead avisa a tres, son tres filas, porque
 * cada una lo lee (o no) por su cuenta.
 *
 * LA FILA ES LO QUE CUENTA, NO EL WEBSOCKET
 * El tiempo real solo EMPUJA la notificación a quien tenga el panel
 * abierto. Si Reverb está parado, o la persona no está conectada, el
 * aviso sigue aquí y lo verá en la campanita al entrar. Por eso se
 * guarda primero y se empuja después, nunca al revés.
 *
 * El título y el cuerpo se guardan YA REDACTADOS, como el nombre de la
 * campaña en `eventos_de_campana`: si la marca se renombra, el aviso
 * sigue diciendo lo que pasó cuando pasó.
 *
 * `entidad_tipo` + `entidad_id` dicen a qué se refiere el aviso, para
 * poder llevar a la ficha al pulsarlo. No es clave foránea a propósito:
 * hoy solo apunta a marcas, pero los avisos de las próximas etapas
 * (menciones, recordatorios) apuntarán a otras cosas.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notificaciones', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();

            // Si la cuenta se borra, sus avisos no le sirven a nadie más.
            $tabla->foreignUuid('destinatario_id')
                  ->constrained('users')->cascadeOnDelete();

            $tabla->string('tipo', 40);
            $tabla->string('titulo', 160);
            $tabla->text('cuerpo')->nullable();

            $tabla->string('entidad_tipo', 40)->nullable();
            $tabla->uuid('entidad_id')->nullable();

            $tabla->timestamp('leida_en')->nullable();

            $tabla->timestamps();

            // Las dos preguntas que se hacen a cada rato: «¿cuántas tengo
            // sin leer?» y «dame las mías, las últimas primero».
            $tabla->index(['destinatario_id', 'leida_en']);
            $tabla->index(['destinatario_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notificaciones');
    }
};
