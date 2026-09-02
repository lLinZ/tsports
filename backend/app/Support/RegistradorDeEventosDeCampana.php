<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Campana;
use App\Models\EventoDeCampana;
use App\Models\Marca;
use App\Models\User;

/**
 * RegistradorDeEventosDeCampana — anota en el historial cada acción.
 * ---------------------------------------------------------------------
 * Cuando en la ficha de una marca se asigna una campaña con su fecha,
 * eso es una acción comercial que hay que dejar registrada: "el 10 de
 * septiembre se visitó a Azúcar la Pastora". Esta clase es la que crea
 * ese registro.
 *
 * Vive aparte del controlador porque la regla la usan dos caminos (dar
 * de alta una marca y editarla) y no puede haber dos versiones de
 * "cuándo se anota un evento": si se separasen, un mismo cambio dejaría
 * rastro por un camino y no por el otro.
 *
 * LA REGLA, EN UNA FRASE
 * Se anota un evento nuevo solo cuando la acción cambia de verdad — otra
 * campaña, u otra fecha. Guardar la ficha después de corregir un
 * teléfono no debe llenar el historial de líneas repetidas.
 */
final class RegistradorDeEventosDeCampana
{
    /**
     * Registra la acción en curso de la marca si es nueva o distinta.
     *
     * Se llama DESPUÉS de guardar la marca, con sus valores ya
     * definitivos.
     *
     * @return EventoDeCampana|null El evento creado, o null si no hacía
     *                              falta anotar nada.
     */
    public static function anotarSiLaAccionEsNueva(
        Marca $marca,
        ?User $quienLoRegistra,
    ): ?EventoDeCampana {
        $idDeLaCampana = $marca->campana_id;
        $fechaDeLaAccion = $marca->fecha_campana?->toDateString();

        // Sin campaña o sin fecha no hay acción que anotar. El servidor
        // ya exige las dos juntas al guardar; esto cubre los caminos que
        // no pasan por el formulario (importación, seeders).
        if ($idDeLaCampana === null || $fechaDeLaAccion === null) {
            return null;
        }

        // ¿Ya está anotada? Se compara contra el último evento y no
        // contra todos: lo que interesa es si esto es un cambio respecto
        // a lo que había, no si alguna vez en el pasado se hizo lo mismo.
        // Repetir una visita meses después SÍ es un evento nuevo.
        $ultimoEvento = EventoDeCampana::query()
            ->where('marca_id', $marca->id)
            ->latest('created_at')
            ->first();

        if ($ultimoEvento?->describeLaMismaAccion($idDeLaCampana, $fechaDeLaAccion)) {
            return null;
        }

        // El nombre y el color se copian dentro del evento para que el
        // historial sobreviva a que la campaña se renombre o se borre.
        $campana = Campana::query()->find($idDeLaCampana);

        return EventoDeCampana::create([
            'marca_id' => $marca->id,
            'campana_id' => $idDeLaCampana,
            'campana_nombre' => $campana?->nombre ?? 'Campaña eliminada',
            'campana_color' => $campana?->color ?? '#71717a',
            'fecha' => $fechaDeLaAccion,
            'registrado_por_id' => $quienLoRegistra?->id,
            'registrado_por_nombre' => $quienLoRegistra?->nombreParaMostrar(),
        ]);
    }
}
