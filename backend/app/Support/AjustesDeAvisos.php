<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\RolUsuario;
use App\Models\AjusteDeAviso;
use App\Models\Notificacion;
use App\Models\PreferenciaDeAviso;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * AjustesDeAvisos — qué avisos salen y a quién, según el administrador.
 * ---------------------------------------------------------------------
 * Desde el 2026-11-05 (propuesta «Panel de avisos»). Es el catálogo de
 * los seis avisos que manda el sistema y la lectura de lo que decidió el
 * administrador en la pantalla «Avisos»:
 *
 *   · Cada aviso se puede APAGAR entero. Apagado, Notificador no crea la
 *     fila y no sale por ningún canal.
 *   · En los dos AVISOS DE GRUPO se elige a quién le llegan: el lead de
 *     la web (administración, comercial) y el comentario en la bitácora
 *     (administración, comercial, quien lleva la marca). Los demás van a
 *     la persona de la que se trata y no tienen nada que elegir.
 *
 * NADIE RECIBE LO QUE NO PUEDE VER (regla 6). Un agente no está entre
 * los destinatarios del lead —no ve los leads sin dueño— y no hay forma
 * de ponerlo: la casilla no existe. Los roles que se eligen ven todas las
 * marcas, así que ningún aviso les filtra una ajena.
 *
 * DE FÁBRICA, lo de siempre (regla 17): el lead a administración y
 * comercial; el comentario a administración y a quien lleva la marca,
 * no al comercial. Sin fila en `ajustes_de_avisos`, eso.
 *
 * Lo que elige cada persona para sí (móvil, sonido) va aparte, en
 * `preferencias_de_avisos`, y se lee con `preferenciasDe()`.
 */
final class AjustesDeAvisos
{
    /** Los mensajes del chat: no van a la campanita, pero se ajustan igual. */
    public const CHAT = 'mensaje_de_chat';

    public const ADMINISTRACION = 'administracion';

    public const COMERCIAL = 'comercial';

    public const QUIEN_LLEVA_LA_MARCA = 'quienLlevaLaMarca';

    /** Los avisos que manda el sistema, en el orden de la pantalla. */
    public const TIPOS = [
        Notificacion::TIPO_LEAD_NUEVO,
        Notificacion::TIPO_MARCA_ASIGNADA,
        Notificacion::TIPO_MENCION,
        Notificacion::TIPO_COMENTARIO,
        Notificacion::TIPO_RECORDATORIOS_DEL_DIA,
        self::CHAT,
    ];

    /** Los destinatarios que se pueden elegir, con lo que traen de fábrica. */
    private const DESTINATARIOS_DE_FABRICA = [
        Notificacion::TIPO_LEAD_NUEVO => [
            self::ADMINISTRACION => true,
            self::COMERCIAL => true,
        ],
        Notificacion::TIPO_COMENTARIO => [
            self::ADMINISTRACION => true,
            self::COMERCIAL => false,
            self::QUIEN_LLEVA_LA_MARCA => true,
        ],
    ];

    /** @param  Collection<string, AjusteDeAviso>  $ajustes */
    private function __construct(private readonly Collection $ajustes) {}

    public static function vigentes(): self
    {
        return new self(AjusteDeAviso::query()->get()->keyBy('tipo'));
    }

    public static function existe(string $tipo): bool
    {
        return in_array($tipo, self::TIPOS, true);
    }

    public function estaActivo(string $tipo): bool
    {
        return $this->ajustes->get($tipo)?->activo ?? true;
    }

    /**
     * Los destinatarios elegibles de un aviso de grupo, con lo elegido.
     * Un aviso personal devuelve un arreglo vacío.
     *
     * @return array<string, bool>
     */
    public function destinatarios(string $tipo): array
    {
        $deFabrica = self::DESTINATARIOS_DE_FABRICA[$tipo] ?? [];
        $elegidos = $this->ajustes->get($tipo)?->destinatarios ?? [];

        $resultado = [];
        foreach ($deFabrica as $clave => $valorDeFabrica) {
            $resultado[$clave] = array_key_exists($clave, $elegidos) ? (bool) $elegidos[$clave] : $valorDeFabrica;
        }

        return $resultado;
    }

    public function llegaA(string $tipo, string $destinatario): bool
    {
        return $this->destinatarios($tipo)[$destinatario] ?? false;
    }

    /**
     * ¿Le llega a esta persona, por su rol, un aviso de grupo? Solo
     * administración y comercial se eligen por rol; el agente, nunca.
     */
    public function llegaAlRol(string $tipo, RolUsuario $rol): bool
    {
        return match ($rol) {
            RolUsuario::Admin => $this->llegaA($tipo, self::ADMINISTRACION),
            RolUsuario::Comercial => $this->llegaA($tipo, self::COMERCIAL),
            default => false,
        };
    }

    /** @return list<string> */
    public static function destinatariosElegibles(string $tipo): array
    {
        return array_keys(self::DESTINATARIOS_DE_FABRICA[$tipo] ?? []);
    }

    /** Lo último que se decidió de ese aviso y quién, para la pantalla. */
    public function ajusteDe(string $tipo): ?AjusteDeAviso
    {
        return $this->ajustes->get($tipo);
    }

    /* ------------------------------------------------------------------
     | Lo que elige cada persona
     |-----------------------------------------------------------------*/

    /**
     * Lo que eligieron esas personas para un tipo de aviso, por id. Quien
     * no eligió nada no sale: para ella, móvil y sonido encendidos.
     *
     * @param  iterable<User>  $personas
     * @return Collection<string, PreferenciaDeAviso>
     */
    public static function preferenciasDe(iterable $personas, string $tipo): Collection
    {
        $ids = collect($personas)->pluck('id')->all();

        return $ids === []
            ? collect()
            : PreferenciaDeAviso::query()->whereIn('usuario_id', $ids)->where('tipo', $tipo)->get()->keyBy('usuario_id');
    }

    /* ------------------------------------------------------------------
     | Cómo se dice cada cosa en la pantalla
     |-----------------------------------------------------------------*/

    public static function nombre(string $tipo): string
    {
        return match ($tipo) {
            Notificacion::TIPO_LEAD_NUEVO => 'Nuevo lead desde la web',
            Notificacion::TIPO_MARCA_ASIGNADA => 'Te asignaron una marca',
            Notificacion::TIPO_MENCION => 'Te etiquetaron en la bitácora',
            Notificacion::TIPO_COMENTARIO => 'Comentario nuevo en la bitácora',
            Notificacion::TIPO_RECORDATORIOS_DEL_DIA => 'Recordatorios del día',
            self::CHAT => 'Mensaje en el chat',
            default => $tipo,
        };
    }

    public static function cuandoSalta(string $tipo): string
    {
        return match ($tipo) {
            Notificacion::TIPO_LEAD_NUEVO => 'Alguien escribe desde el formulario de la web. La marca entra sin dueño.',
            Notificacion::TIPO_MARCA_ASIGNADA => 'Alguien le pone una marca a otra persona: al darla de alta, en la ficha o en el tablero.',
            Notificacion::TIPO_MENCION => 'Alguien te nombra con @ en un comentario. Sustituye al aviso de comentario.',
            Notificacion::TIPO_COMENTARIO => 'Alguien escribe o responde en la bitácora de una marca, también al darle a «Contacté».',
            Notificacion::TIPO_RECORDATORIOS_DEL_DIA => 'Cada mañana a las 08:00, un solo aviso con lo que toca hoy y lo vencido.',
            self::CHAT => 'Alguien te escribe en una charla. No va a la campanita: se ve en el propio chat.',
            default => '',
        };
    }

    /** A quién va un aviso personal. Null en los de grupo, que se eligen. */
    public static function aQuienVa(string $tipo): ?string
    {
        return match ($tipo) {
            Notificacion::TIPO_MARCA_ASIGNADA => 'A quien se la asignan',
            Notificacion::TIPO_MENCION => 'A quien etiquetan',
            Notificacion::TIPO_RECORDATORIOS_DEL_DIA => 'A cada persona, lo suyo',
            self::CHAT => 'A quien está en la charla',
            default => null,
        };
    }

    public static function etiquetaDelDestinatario(string $clave): string
    {
        return match ($clave) {
            self::ADMINISTRACION => 'Administración',
            self::COMERCIAL => 'Comercial',
            self::QUIEN_LLEVA_LA_MARCA => 'Quien lleva la marca',
            default => $clave,
        };
    }

    /** Los mensajes del chat se leen en el chat, no en la campanita. */
    public static function vaALaCampanita(string $tipo): bool
    {
        return $tipo !== self::CHAT;
    }
}
