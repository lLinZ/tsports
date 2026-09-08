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

    /**
     * Trabaja su propia cartera: ve y edita las marcas que tiene
     * asignadas, y ninguna más.
     *
     * En la interfaz se llama AGENTE. El valor guardado sigue siendo
     * "vendedor" a propósito: está escrito en la columna `rol` de las
     * cuentas que ya existen, y renombrarlo obligaría a una migración de
     * datos para cambiar una palabra que nadie ve. La etiqueta visible la
     * da `etiqueta()`, que es justo para esto.
     */
    case Vendedor = 'vendedor';

    /** Etiqueta legible para mostrar en la interfaz. */
    public function etiqueta(): string
    {
        return match ($this) {
            self::Admin => 'Administrador',
            self::Comercial => 'Comercial',
            self::Vendedor => 'Agente',
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

    /**
     * ¿Ve TODAS las marcas del tablero, o solo las suyas?
     *
     * Quien reparte el trabajo necesita el tablero entero: no se puede
     * asignar lo que no se ve. El agente trabaja su cartera, y las marcas
     * de sus compañeros no le hacen falta para eso.
     *
     * El corte lo hace el SERVIDOR, no la interfaz: las marcas ajenas no
     * llegan al navegador. Esconderlas al pintar habría dejado los datos
     * de toda la cartera viajando en cada respuesta, legibles desde el
     * inspector.
     *
     * Consecuencia buscada: los leads que entran por la web nacen sin
     * dueño y un agente ya no los ve, así que dejan de adoptarse solos.
     * Ahora es el comercial quien los reparte, que es justo lo que el
     * equipo pidió al decidir esto.
     */
    public function veTodasLasMarcas(): bool
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

    /**
     * ¿Ve las cifras de TODA la empresa, o solo las suyas?
     *
     * Es la que decide la forma del panel de resumen y del calendario.
     * Admin y comercial necesitan el cuadro completo —el pipeline entero,
     * el reparto por zona, cuánto pronostica cada persona— porque es con
     * lo que reparten el trabajo. El agente no: lo suyo es su cartera, y
     * el total de la agencia no le dice nada sobre su día.
     *
     * No es solo cuestión de enseñar menos. El servidor deja de calcular
     * y de ENVIAR esas cifras: si únicamente se escondieran en la
     * interfaz, seguirían viajando en la respuesta y cualquiera podría
     * leerlas desde el inspector del navegador.
     */
    public function veLasCifrasDeTodaLaEmpresa(): bool
    {
        return $this === self::Admin || $this === self::Comercial;
    }

    /** Todos los valores, para poblar selectores y validaciones. */
    public static function valores(): array
    {
        return array_column(self::cases(), 'value');
    }
}
