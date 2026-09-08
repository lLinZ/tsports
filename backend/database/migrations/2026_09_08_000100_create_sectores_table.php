<?php

/**
 * Migración: `sectores` — el rubro al que pertenece cada marca.
 * ---------------------------------------------------------------------
 * Hasta ahora los sectores eran una lista escrita en el código
 * (`CatalogosDelCrm::SECTORES`), así que añadir uno nuevo obligaba a
 * tocar el repositorio y volver a desplegar. El equipo pidió poder
 * gestionarlos desde el panel, que es lo que hace esta tabla.
 *
 * La marca sigue guardando el sector como TEXTO en `marcas.sector`, no
 * como una relación. Se deja así a propósito:
 *
 *   · No hay que migrar las 102 marcas que ya existen ni arriesgarse a
 *     dejar alguna sin rubro por el camino.
 *   · Los informes del panel agrupan por ese texto y siguen funcionando
 *     igual.
 *
 * A cambio, renombrar un sector tiene que arrastrar el cambio a las
 * marcas que lo llevan; de eso se encarga `SectorController`, y por eso
 * el renombrado va dentro de una transacción.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sectores', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();

            // Único: dos sectores con el mismo nombre serían el mismo
            // rubro partido en dos, y el reparto del resumen los
            // enseñaría como filas separadas.
            $tabla->string('nombre')->unique();

            $tabla->unsignedSmallInteger('orden')->default(0);

            // Igual que campañas y propiedades: un sector que ya no se
            // trabaja se desactiva en vez de borrarse, para no perder el
            // rubro de las marcas que lo llevan.
            $tabla->boolean('activo')->default(true);

            $tabla->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sectores');
    }
};
