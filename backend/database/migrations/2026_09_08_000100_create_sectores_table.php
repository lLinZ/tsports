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
 *
 * LOS DOCE SECTORES SE INSERTAN AQUÍ, y no en un sembrador, porque el
 * sistema no funciona con la tabla vacía: la validación de la ficha solo
 * admite sectores del catálogo, así que una tabla vacía haría que NINGUNA
 * marca se pudiera guardar —todas tienen rubro— y que el selector saliera
 * en blanco. El guion de despliegue aplica migraciones pero no siembra,
 * de modo que dejarlo en un sembrador era confiar en que alguien se
 * acordase de ejecutarlo a mano justo después de publicar.
 *
 * Los nombres son EXACTAMENTE los que había en el código, letra por
 * letra: las marcas guardan el sector como texto y una tilde distinta
 * dejaría huérfanas a las marcas de ese rubro. Van escritos aquí y no
 * leídos de `CatalogosDelCrm` a propósito: una migración es un hecho
 * histórico y tiene que seguir haciendo lo mismo dentro de dos años,
 * aunque esa constante haya cambiado o desaparecido.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    /** Los rubros con los que arranca el catálogo, en su orden. */
    private const SECTORES_DE_PARTIDA = [
        'Alimentos',
        'Bebidas',
        'Telecomunicaciones',
        'Banca y finanzas',
        'Retail',
        'Automotriz',
        'Tecnología',
        'Salud',
        'Educación',
        'Deportes',
        'Entretenimiento',
        'Otro',
    ];

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

        $ahora = now();

        DB::table('sectores')->insert(
            array_map(
                static fn (string $nombre, int $posicion): array => [
                    'id' => (string) Str::orderedUuid(),
                    'nombre' => $nombre,
                    'orden' => $posicion,
                    'activo' => true,
                    'created_at' => $ahora,
                    'updated_at' => $ahora,
                ],
                self::SECTORES_DE_PARTIDA,
                array_keys(self::SECTORES_DE_PARTIDA),
            ),
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('sectores');
    }
};
