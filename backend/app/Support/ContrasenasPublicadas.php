<?php

declare(strict_types=1);

namespace App\Support;

use Closure;

/**
 * ContrasenasPublicadas — las contraseñas que nadie puede volver a usar.
 * ---------------------------------------------------------------------
 * Son las que este repositorio ha escrito en algún sitio: la temporal
 * del importador de Supabase y del seeder (estuvo en `.env.example`
 * hasta el 2026-10-01) y la de los datos de prueba. Lo que se escribe en
 * un repositorio se lee: son las primeras que prueba cualquiera.
 *
 * Se guardan como HUELLA (sha256) y no en claro, para no volver a
 * escribirlas en el código. Una contraseña nueva que se publique se
 * añade con su huella: `printf '%s' 'la-clave' | sha256sum`.
 *
 * Las semillas no pasan por aquí, a propósito: en local se entra con la
 * de prueba (CLAUDE.md, sección 8) y nunca se siembran en producción.
 */
final class ContrasenasPublicadas
{
    private const HUELLAS = [
        // La temporal del importador y del seeder hasta el 2026-10-01.
        'ed5e254969677e4f6f9aa33e2722efe444acbe4401ac82488502558c4ce37eb3',
        // La de los usuarios de prueba de las semillas.
        '51459c23ca91ebce271449dd8b5c26751c99039c2ae4c628067898ca0e104039',
    ];

    public const MENSAJE = 'Esa contraseña está escrita en la documentación del sistema. Elige otra.';

    public static function esUnaDeEllas(string $contrasena): bool
    {
        return in_array(hash('sha256', $contrasena), self::HUELLAS, true);
    }

    /** Regla de validación para el campo de la contraseña nueva. */
    public static function regla(): Closure
    {
        return static function (string $atributo, mixed $valor, Closure $fallar): void {
            if (is_string($valor) && self::esUnaDeEllas($valor)) {
                $fallar(self::MENSAJE);
            }
        };
    }
}
