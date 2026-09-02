<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Propiedad;
use App\Models\User;

/**
 * PropiedadPolicy — quién puede hacer qué con un producto IOP.
 * ---------------------------------------------------------------------
 * El catálogo de propiedades es la lista de lo que la agencia vende, así
 * que se comporta como un maestro, no como el trabajo del día a día:
 *
 *   · VER      → todo el equipo. Un vendedor necesita consultar el MTP y
 *                la meta de cualquier propiedad aunque no la lleve él.
 *   · CREAR /
 *     EDITAR /
 *     BORRAR   → solo quien gestiona el catálogo comercial (admin y
 *                comercial). Es quien decide qué se vende y a qué
 *                precio; si un vendedor pudiera tocar el MTP, el forecast
 *                de toda la agencia cambiaría por una corrección suya.
 *   · OFRECER  → depende de la asignación de cada propiedad, no del rol,
 *                y por eso la responde el propio modelo.
 */
class PropiedadPolicy
{
    /** Ver el catálogo completo. */
    public function viewAny(User $usuario): bool
    {
        return $usuario->activo;
    }

    /** Abrir la ficha de una propiedad. */
    public function view(User $usuario, Propiedad $propiedad): bool
    {
        unset($propiedad); // Todo el catálogo es visible para el equipo.

        return $usuario->activo;
    }

    public function create(User $usuario): bool
    {
        return $usuario->activo && $usuario->rol->puedeGestionarElCatalogoComercial();
    }

    public function update(User $usuario, Propiedad $propiedad): bool
    {
        unset($propiedad); // El permiso depende del rol, no de la propiedad.

        return $usuario->activo && $usuario->rol->puedeGestionarElCatalogoComercial();
    }

    /**
     * Borrar la propiedad. Se lleva por delante sus líneas de checklist
     * en todas las marcas, así que la interfaz ofrece antes desactivarla,
     * que es lo que casi siempre se quiere.
     */
    public function delete(User $usuario, Propiedad $propiedad): bool
    {
        unset($propiedad);

        return $usuario->activo && $usuario->rol->puedeGestionarElCatalogoComercial();
    }

    /**
     * ¿Puede añadir esta propiedad al checklist de una marca?
     *
     * Esta es la única pregunta que no depende solo del rol: una
     * propiedad puede estar abierta a todo el equipo o reservada a
     * personas concretas.
     */
    public function ofrecer(User $usuario, Propiedad $propiedad): bool
    {
        return $usuario->activo && $propiedad->laPuedeOfrecer($usuario);
    }
}
