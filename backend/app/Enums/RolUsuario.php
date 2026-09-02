<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * RolUsuario — los tres perfiles de acceso del sistema.
 * ---------------------------------------------------------------------
 * Traduce a PHP las reglas que en Supabase vivían dispersas en políticas
 * de RLS. Tener el rol como enum permite que las políticas de Laravel
 * (App\Policies) pregunten por capacidades con nombre propio en vez de
 * comparar cadenas sueltas por todo el código.
 */
enum RolUsuario: string
{
    /** Control total: usuarios, contenido de la web y todas las marcas. */
    case Admin = 'admin';

    /** Gestiona todas las marcas y reparte el trabajo entre vendedores. */
    case Comercial = 'comercial';

    /** Ve todas las marcas, pero solo edita las que tiene asignadas. */
    case Vendedor = 'vendedor';

    /** Etiqueta legible para mostrar en la interfaz. */
    public function etiqueta(): string
    {
        return match ($this) {
            self::Admin => 'Administrador',
            self::Comercial => 'Comercial',
            self::Vendedor => 'Vendedor',
        };
    }

    /** ¿Puede administrar usuarios y el contenido de la web pública? */
    public function puedeAdministrarElSistema(): bool
    {
        return $this === self::Admin;
    }

    /**
     * ¿Puede editar cualquier marca, sin importar quién la tenga asignada?
     * Admin y comercial sí; el vendedor solo toca lo suyo.
     */
    public function puedeEditarCualquierMarca(): bool
    {
        return $this === self::Admin || $this === self::Comercial;
    }

    /** ¿Puede asignar marcas a un vendedor concreto? */
    public function puedeAsignarVendedores(): bool
    {
        return $this === self::Admin || $this === self::Comercial;
    }

    /** ¿Puede borrar marcas? El vendedor nunca borra. */
    public function puedeEliminarMarcas(): bool
    {
        return $this === self::Admin || $this === self::Comercial;
    }

    /** ¿Puede editar el contenido de la web pública? */
    public function puedeEditarLaWeb(): bool
    {
        return $this === self::Admin || $this === self::Comercial;
    }

    /**
     * ¿Puede dar de alta propiedades (los productos IOP) y campañas, y
     * repartirlas entre los prospectores?
     *
     * Es la capacidad de quien decide QUÉ se vende, distinta de la de
     * vender: un vendedor ofrece las propiedades que le han asignado,
     * pero no crea productos nuevos ni se auto-asigna ninguno.
     */
    public function puedeGestionarElCatalogoComercial(): bool
    {
        return $this === self::Admin || $this === self::Comercial;
    }

    /** Todos los valores, para poblar selectores y validaciones. */
    public static function valores(): array
    {
        return array_column(self::cases(), 'value');
    }
}
