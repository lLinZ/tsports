<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Propiedad;
use Illuminate\Database\Seeder;

/**
 * PropiedadesIopSeeder — el catálogo de productos con el que se arranca.
 * ---------------------------------------------------------------------
 * Deja cargadas las propiedades que la agencia vende hoy, en el orden en
 * el que el equipo las nombra. No es dato de prueba: es el catálogo real,
 * así que este seeder SÍ se ejecuta en producción.
 *
 * Solo se rellena el monto total (MTP) que ya está confirmado. Las demás
 * nacen a cero para que quien gestiona el catálogo lo complete desde el
 * panel: es preferible un campo vacío y visible a una cifra inventada
 * que acabe sumando en el forecast de toda la agencia.
 *
 * La asignación también se deja abierta a todo el equipo. Repartir cada
 * propiedad entre sus prospectores es lo primero que hará quien gestione
 * el catálogo, y hacerlo desde el panel es más seguro que adivinar aquí
 * qué cuenta corresponde a cada persona.
 *
 * Es idempotente: se puede volver a ejecutar sin duplicar ni pisar nada.
 */
class PropiedadesIopSeeder extends Seeder
{
    /**
     * El catálogo, en su orden. `monto` es el MTP conocido; 0 significa
     * "todavía por confirmar con la propiedad".
     *
     * @var list<array{nombre:string,monto:float,descripcion:string}>
     */
    private const CATALOGO_INICIAL = [
        ['nombre' => 'Comité Olímpico', 'monto' => 162000.0, 'descripcion' => 'Propiedad de dirección.'],
        ['nombre' => 'Dvo. Lara', 'monto' => 0.0, 'descripcion' => ''],
        ['nombre' => 'Dvo. Táchira', 'monto' => 0.0, 'descripcion' => ''],
        ['nombre' => 'Kombat Challenge', 'monto' => 0.0, 'descripcion' => ''],
        ['nombre' => 'Megafitness', 'monto' => 0.0, 'descripcion' => ''],
        ['nombre' => 'Movewireless', 'monto' => 0.0, 'descripcion' => ''],
        ['nombre' => 'Sportbiz Venezuela', 'monto' => 0.0, 'descripcion' => ''],
    ];

    public function run(): void
    {
        $propiedadesCreadas = 0;

        foreach (self::CATALOGO_INICIAL as $posicionEnElCatalogo => $propiedadDelCatalogo) {
            $propiedadYaExistente = Propiedad::query()
                ->where('nombre', $propiedadDelCatalogo['nombre'])
                ->first();

            // Si ya está cargada no se toca: el monto y el reparto que
            // haya puesto el equipo mandan sobre esta lista de partida.
            if ($propiedadYaExistente !== null) {
                continue;
            }

            Propiedad::query()->create([
                'nombre' => $propiedadDelCatalogo['nombre'],
                'descripcion' => $propiedadDelCatalogo['descripcion'] ?: null,
                'monto_total_usd' => $propiedadDelCatalogo['monto'],
                'porcentaje_forecast' => Propiedad::PORCENTAJE_FORECAST_POR_DEFECTO,
                'asignada_a_todos' => true,
                'orden' => $posicionEnElCatalogo + 1,
                'activa' => true,
            ]);

            $propiedadesCreadas++;
        }

        $this->command?->info(
            $propiedadesCreadas === 0
                ? '· El catálogo de propiedades ya estaba cargado (no se toca)'
                : "✔ {$propiedadesCreadas} propiedades cargadas en el catálogo"
        );
    }
}
