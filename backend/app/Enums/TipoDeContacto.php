<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * TipoDeContacto — cómo se habló con una marca.
 * ---------------------------------------------------------------------
 * Lo elige quien pulsa «Contacté» en la tarjeta del tablero, y se guarda
 * en la entrada de la bitácora que deja (`comentarios_marca.tipo_de_contacto`).
 * Una entrada escrita a mano en la bitácora no lleva ninguno.
 *
 * Desde el 2026-10-07 también dice qué toca en un recordatorio
 * (`recordatorios.tipo`): lo que se HIZO y lo que se VA A HACER se
 * cuentan con la misma lista.
 *
 * Va en una columna y no escrito dentro del texto para que el hilo pueda
 * enseñarlo como etiqueta y, el día que se quiera, contar cuántas
 * llamadas hizo cada quien sin leer frases.
 */
enum TipoDeContacto: string
{
    case Llamada = 'llamada';
    case Whatsapp = 'whatsapp';
    case Reunion = 'reunion';
    case Correo = 'correo';

    /** Lo que se lee en la etiqueta de la bitácora. */
    public function etiqueta(): string
    {
        return match ($this) {
            self::Llamada => 'Llamada',
            self::Whatsapp => 'WhatsApp',
            self::Reunion => 'Reunión',
            self::Correo => 'Correo',
        };
    }

    /** Para la auditoría: «Anotó una llamada con Pepsi». */
    public function conArticulo(): string
    {
        return match ($this) {
            self::Llamada => 'una llamada',
            self::Whatsapp => 'un WhatsApp',
            self::Reunion => 'una reunión',
            self::Correo => 'un correo',
        };
    }

    /**
     * La nota del recordatorio que deja «Contacté», cuando no se escribe
     * otra. Sin nada, el panel diría solo «Hoy · Pepsi» y habría que abrir
     * la ficha para saber qué tocaba.
     *
     * Desde el 2026-10-07 sale del tipo del SIGUIENTE paso, no del contacto
     * que se acaba de anotar: después de una llamada se puede agendar una
     * reunión, y entonces lo que toca es la reunión.
     */
    public function notaDelSiguientePaso(): string
    {
        return match ($this) {
            self::Llamada => 'Volver a llamar',
            self::Whatsapp => 'Volver a escribir por WhatsApp',
            self::Reunion => 'Reunión de seguimiento',
            self::Correo => 'Volver a escribir',
        };
    }
}
