<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Marca;
use App\Models\User;

/**
 * MarcaPolicy — quién puede hacer qué con una marca.
 * ---------------------------------------------------------------------
 * Aquí vive, traducido a PHP, lo que en Supabase eran las políticas de
 * Row Level Security de la tabla `deals`. Tenerlo en un solo fichero
 * (en vez de repartido en reglas SQL) hace que las condiciones se puedan
 * leer, probar y cambiar sin tocar la base de datos.
 *
 * Resumen de las reglas:
 *   · VER      → cualquier persona con sesión ve todas las marcas. Se
 *                decidió así para que un vendedor pueda consultar qué
 *                marcas están ya trabajadas y no duplicar esfuerzo.
 *   · CREAR    → cualquier persona con sesión.
 *   · EDITAR   → admin y comercial, siempre. El vendedor, solo las que
 *                tiene asignadas o las que aún no tienen dueño (las que
 *                entran por el formulario web y él "adopta" al tocarlas).
 *   · ELIMINAR → solo admin y comercial. El vendedor nunca borra.
 *   · ASIGNAR  → solo admin y comercial reparten trabajo.
 */
class MarcaPolicy
{
    /** Ver el listado completo del tablero. */
    public function viewAny(User $usuario): bool
    {
        return $usuario->activo;
    }

    /** Abrir la ficha de una marca concreta. */
    public function view(User $usuario, Marca $marca): bool
    {
        unset($marca); // Todas las marcas son visibles para todo el equipo.

        return $usuario->activo;
    }

    /** Dar de alta una marca nueva. */
    public function create(User $usuario): bool
    {
        return $usuario->activo;
    }

    /**
     * Editar la ficha. La regla concreta vive en el modelo User porque
     * también la consulta el controlador para decidir si "adoptar" un
     * lead sin dueño al guardarlo.
     */
    public function update(User $usuario, Marca $marca): bool
    {
        return $usuario->activo && $usuario->puedeEditarLaMarca($marca);
    }

    /** Borrar la marca y, en cascada, toda su bitácora. */
    public function delete(User $usuario, Marca $marca): bool
    {
        unset($marca); // El permiso depende solo del rol, no de la marca.

        return $usuario->activo && $usuario->rol->puedeEliminarMarcas();
    }

    /** Cambiar a qué vendedor está asignada la marca. */
    public function asignarVendedor(User $usuario): bool
    {
        return $usuario->activo && $usuario->rol->puedeAsignarVendedores();
    }

    /**
     * Escribir en la bitácora. Si puede ver la marca, puede comentarla:
     * la bitácora es justamente el sitio donde se avisa a quien la
     * trabaja de algo que uno ha averiguado.
     */
    public function comentar(User $usuario, Marca $marca): bool
    {
        return $this->view($usuario, $marca);
    }
}
