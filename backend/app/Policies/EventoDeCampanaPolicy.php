<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\EventoDeCampana;
use App\Models\User;

/**
 * EventoDeCampanaPolicy — quién corrige el historial de acciones.
 * ---------------------------------------------------------------------
 * Los eventos se crean solos al asignar una campaña con su fecha, pero
 * la realidad cambia: una visita se aplaza, una invitación se cancela,
 * alguien se equivoca de día al anotarla. Sin poder corregirlos, el
 * calendario acabaría enseñando cosas que no van a pasar.
 *
 * Las reglas siguen las de las marcas (regla 6 del CLAUDE.md), porque un
 * evento es trabajo sobre una marca:
 *
 *   · EDITAR  → admin y comercial siempre; el vendedor, solo los de las
 *               marcas que tiene asignadas. Mover de día una visita
 *               propia es parte de su trabajo.
 *   · BORRAR  → solo admin y comercial. El vendedor no borra, igual que
 *               no borra marcas: el historial es un registro, y quien lo
 *               ejecuta no debería poder hacer desaparecer lo que hizo.
 */
class EventoDeCampanaPolicy
{
    /**
     * Corregir la campaña, la fecha o la nota de un evento.
     */
    public function update(User $usuario, EventoDeCampana $evento): bool
    {
        if (! $usuario->activo) {
            return false;
        }

        $laMarcaDelEvento = $evento->marca;

        // Un evento cuya marca ya no existe no lo toca nadie: no queda
        // contexto contra el que decidir el permiso.
        if ($laMarcaDelEvento === null) {
            return false;
        }

        return $usuario->puedeEditarLaMarca($laMarcaDelEvento);
    }

    /**
     * Borrar un evento del historial.
     *
     * Más restrictivo que editar a propósito: corregir una fecha
     * equivocada deja rastro de lo que se hizo; borrarla lo hace
     * desaparecer.
     */
    public function delete(User $usuario, EventoDeCampana $evento): bool
    {
        unset($evento); // El permiso depende solo del rol.

        return $usuario->activo && $usuario->rol->puedeEliminarMarcas();
    }
}
