<?php

/**
 * Migración: qué toca y a qué hora, en cada recordatorio.
 * ---------------------------------------------------------------------
 * Desde el 2026-10-07. Hasta ahora un recordatorio era un día y una
 * nota («Volver a llamar»), y para la agenda del equipo eso no basta:
 * el administrador quiere saber qué hay planificado la semana que viene
 * («tres reuniones y ocho llamadas»), y una reunión tiene hora.
 *
 *   · `tipo` es la misma lista cerrada que el contacto de la bitácora
 *     (llamada, WhatsApp, reunión o correo: App\Enums\TipoDeContacto).
 *     Vacío es un recordatorio sin más («mandar el dossier»).
 *   · `hora` es opcional: la mayoría de las cosas se hacen «ese día», y
 *     obligar a ponerla haría que se inventara.
 *
 * Lo ya guardado se queda sin tipo ni hora: no se puede saber qué era.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('recordatorios', function (Blueprint $tabla) {
            $tabla->string('tipo', 20)->nullable()->after('nota');
            $tabla->time('hora')->nullable()->after('fecha');
        });
    }

    public function down(): void
    {
        Schema::table('recordatorios', function (Blueprint $tabla) {
            $tabla->dropColumn(['tipo', 'hora']);
        });
    }
};
