<?php

/**
 * Migración: añade la fecha de la campaña a `marcas`.
 * ---------------------------------------------------------------------
 * Con la campaña sola no se puede montar un calendario: "Azúcar la
 * Pastora · Visita presencial" no dice CUÁNDO. Esta columna guarda el día
 * en que esa acción se hace, y es lo que convierte cada marca con
 * campaña en un evento del calendario del panel.
 *
 * Va en `marcas` y no en `campanas` porque la fecha es de la acción
 * concreta sobre esa marca, no de la campaña: a una marca se la visita el
 * 10 de septiembre y a otra el 17, dentro de la misma "Visita presencial".
 *
 * Es `date` y no `datetime` a propósito: el equipo planifica por días,
 * no por horas, y guardar una hora obligaría a decidir una zona horaria
 * para algo que nadie va a mirar.
 *
 * Nullable porque las 71 marcas ya importadas no tienen campaña. En
 * adelante, el servidor exige la fecha en cuanto se asigna una campaña
 * (ver GuardarMarcaRequest); las que se queden sin campaña la dejan a
 * nulo.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('marcas', function (Blueprint $tabla) {
            $tabla->date('fecha_campana')->nullable()->after('campana_id');

            // El calendario siempre pregunta por un rango de fechas
            // ("del 8 al 14"), así que este índice es el que sostiene la
            // consulta de la vista semanal.
            $tabla->index('fecha_campana');
        });
    }

    public function down(): void
    {
        Schema::table('marcas', function (Blueprint $tabla) {
            $tabla->dropIndex(['fecha_campana']);
            $tabla->dropColumn('fecha_campana');
        });
    }
};
