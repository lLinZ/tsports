<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * OrigenMarca — de dónde salió el registro de una marca.
 * ---------------------------------------------------------------------
 * Distinguir el origen importa porque las marcas que entran solas por el
 * formulario público nacen sin dueño: cualquiera las puede "adoptar", y
 * al hacerlo quedan a su nombre.
 */
enum OrigenMarca: string
{
    /** La cargó una persona del equipo desde el CRM. */
    case Manual = 'manual';

    /** Llegó por el formulario de contacto de la web pública. */
    case Web = 'web';

    public function etiqueta(): string
    {
        return match ($this) {
            self::Manual => 'Registro manual',
            self::Web => 'Formulario web',
        };
    }
}
