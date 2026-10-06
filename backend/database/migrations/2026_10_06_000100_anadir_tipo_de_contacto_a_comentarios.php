<?php

/**
 * Migración: de qué tipo fue el contacto que anota una entrada.
 * ---------------------------------------------------------------------
 * El botón «Contacté» de la tarjeta deja una entrada en la bitácora y
 * dice cómo fue: llamada, WhatsApp, reunión o correo
 * (App\Enums\TipoDeContacto). Las entradas escritas a mano, y todas las
 * que ya existían, se quedan con la columna vacía: no se sabe qué fueron
 * y no se inventa.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('comentarios_marca', function (Blueprint $tabla) {
            $tabla->string('tipo_de_contacto', 20)->nullable()->after('cuerpo');
        });
    }

    public function down(): void
    {
        Schema::table('comentarios_marca', function (Blueprint $tabla) {
            $tabla->dropColumn('tipo_de_contacto');
        });
    }
};
