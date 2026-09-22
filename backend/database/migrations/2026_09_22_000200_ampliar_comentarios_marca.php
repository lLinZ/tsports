<?php

/**
 * Migración: la bitácora pasa de lista de notas a conversación.
 * ---------------------------------------------------------------------
 * Añade a `comentarios_marca` lo que hace falta para responder, editar
 * y borrar sin perder el hilo.
 *
 * UN SOLO NIVEL DE RESPUESTAS. `comentario_padre_id` apunta siempre a
 * una entrada raíz, nunca a otra respuesta, y eso lo comprueba el
 * servidor al guardar. Anidar sin límite hace la bitácora ilegible en
 * tres semanas, y existe justamente para leerse de corrido dentro de
 * seis meses.
 *
 * EL BORRADO PASA A SER SUAVE, y no es un detalle de comodidad: desde el
 * momento en que este histórico se exporta, un registro del que se
 * pueden quitar entradas sin dejar rastro no vale como registro. Se
 * guarda CUÁNDO y QUIÉN, y el nombre de quien borró se desnormaliza por
 * el mismo motivo que el del autor: si esa persona se da de baja, el
 * historial tiene que seguir diciendo quién fue.
 *
 * `editado_en` distingue lo que se escribió de lo que se reescribió
 * después. Sin esa marca, corregir una frase a los tres meses deja el
 * hilo diciendo algo que nadie dijo ese día.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('comentarios_marca', function (Blueprint $tabla) {
            // Al borrar la entrada raíz se van sus respuestas: colgarían
            // de nada. El borrado normal es suave, así que esto solo
            // salta si alguna vez se borra una fila de verdad.
            $tabla->foreignUuid('comentario_padre_id')->nullable()->after('marca_id')
                  ->constrained('comentarios_marca')->cascadeOnDelete();

            $tabla->timestamp('editado_en')->nullable()->after('cuerpo');

            $tabla->timestamp('eliminado_en')->nullable()->after('editado_en');
            $tabla->foreignUuid('eliminado_por_id')->nullable()->after('eliminado_en')
                  ->constrained('users')->nullOnDelete();
            $tabla->string('eliminado_por_nombre')->nullable()->after('eliminado_por_id');

            // «Dame las respuestas de esta entrada», que es lo que se
            // pregunta una vez por cada entrada raíz del hilo.
            $tabla->index('comentario_padre_id');
        });
    }

    public function down(): void
    {
        Schema::table('comentarios_marca', function (Blueprint $tabla) {
            $tabla->dropConstrainedForeignId('comentario_padre_id');
            $tabla->dropConstrainedForeignId('eliminado_por_id');
            $tabla->dropColumn(['editado_en', 'eliminado_en', 'eliminado_por_nombre']);
        });
    }
};
