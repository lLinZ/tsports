<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * TemaInterfaz — preferencia de apariencia guardada por usuario.
 * ---------------------------------------------------------------------
 * Se persiste en el servidor (columna `tema` de `users`) y no solo en el
 * navegador, para que la elección acompañe a la persona aunque entre
 * desde otro equipo. El frontend la refleja además en localStorage para
 * poder pintar el tema correcto antes de que React arranque.
 */
enum TemaInterfaz: string
{
    case Claro = 'claro';
    case Oscuro = 'oscuro';

    /** Sigue la configuración del sistema operativo del usuario. */
    case Sistema = 'sistema';

    public function etiqueta(): string
    {
        return match ($this) {
            self::Claro => 'Claro',
            self::Oscuro => 'Oscuro',
            self::Sistema => 'Automático',
        };
    }

    public static function valores(): array
    {
        return array_column(self::cases(), 'value');
    }
}
