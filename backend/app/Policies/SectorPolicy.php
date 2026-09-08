<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Sector;
use App\Models\User;

/**
 * SectorPolicy — quién puede tocar el catálogo de rubros.
 * ---------------------------------------------------------------------
 * Mismo reparto que las campañas y las propiedades, y por el mismo
 * motivo: clasificar una marca lo hace cualquiera del equipo, pero
 * decidir QUÉ rubros existen es una decisión de catálogo.
 *
 *   · VER            → cualquier persona con sesión. Hace falta para
 *                      pintar el selector de la ficha.
 *   · CREAR / EDITAR
 *     / BORRAR       → quien gestiona el catálogo comercial, es decir
 *                      admin y comercial.
 */
class SectorPolicy
{
    public function viewAny(User $usuario): bool
    {
        return $usuario->activo;
    }

    public function create(User $usuario): bool
    {
        return $usuario->activo && $usuario->rol->puedeGestionarElCatalogoComercial();
    }

    public function update(User $usuario, Sector $sector): bool
    {
        unset($sector); // El permiso depende del rol, no del sector.

        return $usuario->activo && $usuario->rol->puedeGestionarElCatalogoComercial();
    }

    public function delete(User $usuario, Sector $sector): bool
    {
        unset($sector);

        return $usuario->activo && $usuario->rol->puedeGestionarElCatalogoComercial();
    }
}
