<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Campana;
use App\Models\User;

/**
 * CampanaPolicy — quién puede hacer qué con una campaña.
 * ---------------------------------------------------------------------
 * Mismas reglas que el catálogo de propiedades, y por el mismo motivo:
 * la campaña la define quien organiza el trabajo, y el vendedor se
 * limita a elegir una desde la ficha de la marca.
 *
 *   · VER    → todo el equipo (hace falta para el selector de la ficha).
 *   · CREAR / EDITAR / BORRAR → admin y comercial.
 */
class CampanaPolicy
{
    public function viewAny(User $usuario): bool
    {
        return $usuario->activo;
    }

    public function view(User $usuario, Campana $campana): bool
    {
        unset($campana); // Todas las campañas son visibles para el equipo.

        return $usuario->activo;
    }

    public function create(User $usuario): bool
    {
        return $usuario->activo && $usuario->rol->puedeGestionarElCatalogoComercial();
    }

    public function update(User $usuario, Campana $campana): bool
    {
        unset($campana); // El permiso depende del rol, no de la campaña.

        return $usuario->activo && $usuario->rol->puedeGestionarElCatalogoComercial();
    }

    /**
     * Borrar la campaña. Las marcas que pertenecían a ella NO se borran:
     * se quedan sin campaña (`nullOnDelete`). Perder la etiqueta es
     * asumible; perder el trabajo comercial, no.
     */
    public function delete(User $usuario, Campana $campana): bool
    {
        unset($campana);

        return $usuario->activo && $usuario->rol->puedeGestionarElCatalogoComercial();
    }
}
