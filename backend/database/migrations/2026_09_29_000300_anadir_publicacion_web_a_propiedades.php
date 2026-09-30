<?php

/**
 * Migración: qué propiedades salen en la web pública, y con qué texto.
 * ---------------------------------------------------------------------
 * El catálogo de la web se alimenta del catálogo del CRM, pero NO lo
 * vuelca entero. Una propiedad sale fuera solo si alguien lo decide:
 *
 *   · `publicada_en_la_web` nace en falso. Publicar todo lo activo de
 *     golpe pondría en la portada propiedades todavía sin fotos, y
 *     descripciones escritas para el equipo, no para un patrocinador.
 *   · `texto_web_es` / `texto_web_en` — lo que lee el visitante, en los
 *     dos idiomas de la web. Van aparte de `descripcion` a propósito:
 *     esa es la nota interna del catálogo, y nada de lo que se escribe
 *     para dentro tiene que acabar fuera sin que nadie lo elija.
 *
 * La web enseña además solo las propiedades ACTIVAS: una desactivada
 * deja de salir aunque siga marcada como publicada, y vuelve sola al
 * reactivarla.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('propiedades', function (Blueprint $tabla) {
            $tabla->boolean('publicada_en_la_web')->default(false)->after('activa');
            $tabla->text('texto_web_es')->nullable()->after('publicada_en_la_web');
            $tabla->text('texto_web_en')->nullable()->after('texto_web_es');
        });
    }

    public function down(): void
    {
        Schema::table('propiedades', function (Blueprint $tabla) {
            $tabla->dropColumn(['publicada_en_la_web', 'texto_web_es', 'texto_web_en']);
        });
    }
};
