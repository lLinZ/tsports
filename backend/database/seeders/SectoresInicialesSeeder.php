<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Sector;
use App\Support\CatalogosDelCrm;
use Illuminate\Database\Seeder;

/**
 * SectoresInicialesSeeder — los rubros con los que arranca el catálogo.
 * ---------------------------------------------------------------------
 * No son datos de prueba: son exactamente los doce sectores que el
 * sistema ha usado desde el principio, así que este seeder SÍ se ejecuta
 * en producción. Los nombres son los mismos, letra por letra, porque las
 * marcas guardan el sector como texto: cambiar aquí una tilde dejaría
 * huérfanas las marcas de ese rubro.
 *
 * Es idempotente: se puede volver a ejecutar sin duplicar ni pisar nada.
 * Si el equipo renombra un sector desde el panel, al volver a sembrar se
 * creará de nuevo el original —igual que pasa con las campañas—, así que
 * no conviene ejecutarlo por costumbre después de la puesta en marcha.
 */
class SectoresInicialesSeeder extends Seeder
{
    public function run(): void
    {
        foreach (CatalogosDelCrm::SECTORES_INICIALES as $posicion => $nombre) {
            Sector::query()->firstOrCreate(
                ['nombre' => $nombre],
                ['orden' => $posicion, 'activo' => true],
            );
        }

        $this->command?->info('✔ Sectores del catálogo: '.Sector::query()->count());
    }
}
