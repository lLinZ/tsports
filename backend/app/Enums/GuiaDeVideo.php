<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * GuiaDeVideo — la serie a la que pertenece un vídeo tutorial.
 * ---------------------------------------------------------------------
 * Los vídeos se grabaron en tres series, una por rol, como las guías en
 * PDF: la del agente, la del comercial y la del administrador. Cada rol
 * ve la suya y las de debajo (RolUsuario::guiasDeVideoQueVe), porque el
 * comercial también trabaja marcas y el administrador hace de todo.
 *
 * El orden de los casos es el de la pantalla: primero lo de todos.
 */
enum GuiaDeVideo: string
{
    case Agente = 'agente';
    case Comercial = 'comercial';
    case Administrador = 'administrador';

    public function etiqueta(): string
    {
        return match ($this) {
            self::Agente => 'Guía del agente',
            self::Comercial => 'Guía del comercial',
            self::Administrador => 'Guía del administrador',
        };
    }

    /** Para ordenar en la base de datos sin depender del texto. */
    public function posicion(): int
    {
        return array_search($this, self::cases(), true);
    }

    /** @return list<string> */
    public static function valores(): array
    {
        return array_column(self::cases(), 'value');
    }
}
