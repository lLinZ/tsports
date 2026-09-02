<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Campana;
use Illuminate\Database\Seeder;

/**
 * CampanasInicialesSeeder — las campañas con las que arranca el equipo.
 * ---------------------------------------------------------------------
 * No son datos de prueba: son las acciones comerciales que TS Sports
 * está trabajando hoy, así que este seeder SÍ se ejecuta en producción,
 * igual que el catálogo de propiedades.
 *
 * Cada campaña de esta lista es un TIPO DE ACCIÓN sobre la marca (una
 * visita, un envío, una invitación), no un periodo del año. Por eso
 * ninguna lleva fechas: no empiezan ni terminan en un día concreto, se
 * hacen cuando toca. El modelo ya contempla ese caso — una campaña sin
 * fechas se considera vigente mientras esté activa.
 *
 * El color no es decorativo: es lo que permite distinguirlas de un
 * vistazo en el tablero y en el reparto del resumen. Se eligen bien
 * separados entre sí para que no se confundan dos campañas parecidas.
 *
 * Es idempotente: se puede volver a ejecutar sin duplicar ni pisar nada.
 * Si el equipo renombra una campaña desde el panel, al volver a sembrar
 * se creará de nuevo la original; renombrar aquí y allí a la vez es la
 * única forma de mantenerlas en sintonía.
 */
class CampanasInicialesSeeder extends Seeder
{
    /**
     * Las campañas de partida, en el orden en el que el equipo las
     * nombra. `orden` sale de la posición en esta lista.
     *
     * @var list<array{nombre:string,color:string,descripcion:string}>
     */
    private const CAMPANAS_INICIALES = [
        [
            'nombre' => 'Visita presencial',
            'color' => '#2563eb',
            'descripcion' => 'Se visitó a la marca en sus oficinas.',
        ],
        [
            'nombre' => 'Envió material pop',
            'color' => '#f59e0b',
            'descripcion' => 'Se le hizo llegar material POP a la marca.',
        ],
        [
            'nombre' => 'Invitación a nuestros medios',
            'color' => '#7c3aed',
            'descripcion' => 'Se invitó a la marca a participar en los medios de la agencia.',
        ],
        [
            'nombre' => 'Invitación a evento enamorados del marketing deportivo',
            'color' => '#db2777',
            'descripcion' => 'Se invitó a la marca al evento Enamorados del Marketing Deportivo.',
        ],
        [
            'nombre' => 'Invitación a evento Sportbiz',
            'color' => '#16c79a',
            'descripcion' => 'Se invitó a la marca al evento Sportbiz.',
        ],
    ];

    public function run(): void
    {
        $campanasCreadas = 0;

        foreach (self::CAMPANAS_INICIALES as $posicionEnLaLista => $campanaDeLaLista) {
            $campanaYaExistente = Campana::query()
                ->where('nombre', $campanaDeLaLista['nombre'])
                ->first();

            // Si ya está cargada no se toca: lo que el equipo haya
            // ajustado desde el panel (color, descripción, si está
            // activa) manda sobre esta lista de partida.
            if ($campanaYaExistente !== null) {
                continue;
            }

            Campana::create([
                'nombre' => $campanaDeLaLista['nombre'],
                'descripcion' => $campanaDeLaLista['descripcion'],
                'color' => $campanaDeLaLista['color'],
                // El orden respeta la posición de la lista, con hueco
                // entre medias por si luego se intercala alguna.
                'orden' => ($posicionEnLaLista + 1) * 10,
                'activa' => true,
            ]);

            $campanasCreadas++;
        }

        if ($campanasCreadas > 0) {
            $this->command?->info("✔ Campañas iniciales creadas: {$campanasCreadas}");
        } else {
            $this->command?->info('· Las campañas iniciales ya estaban cargadas');
        }
    }
}
