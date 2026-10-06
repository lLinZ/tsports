<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * MotivoDeMovimiento — qué fue lo último que movió una marca.
 * ---------------------------------------------------------------------
 * Son las cosas que, según la propuesta aceptada, vuelven a calentar una
 * marca. La lista es cerrada a propósito: corregir el teléfono, el logo o
 * la persona de contacto NO está, y por eso esas ediciones no tocan
 * `marcas.ultimo_movimiento_en`. Hasta el plan de trabajo decía «el
 * updated_at de la marca», y eso habría calentado una marca por corregirle
 * una coma.
 *
 * Quién anota cada motivo:
 *
 *   · Alta, Fase, Valor   → el propio modelo Marca al guardarse.
 *   · Comentario          → ComentarioMarca al crearse (entrada o respuesta).
 *   · Contacto            → lo mismo, cuando la entrada la dejó «Contacté»
 *                           (lleva tipo de contacto). Es un comentario de
 *                           la bitácora con nombre propio, no un motivo
 *                           nuevo: la tarjeta dice «Contacto con la
 *                           marca» en vez de «Comentario en la bitácora».
 *   · AccionDeCampana     → EventoDeCampana al crearse.
 */
enum MotivoDeMovimiento: string
{
    case Alta = 'alta';
    case Fase = 'fase';
    case Valor = 'valor';
    case Comentario = 'comentario';
    case Contacto = 'contacto';
    case AccionDeCampana = 'accion_de_campana';

    /** Lo que se lee en la tarjeta debajo de «hace N días». */
    public function etiqueta(): string
    {
        return match ($this) {
            self::Alta => 'Se registró la marca',
            self::Fase => 'Cambio de fase',
            self::Valor => 'Cambió el valor de la propuesta',
            self::Comentario => 'Comentario en la bitácora',
            self::Contacto => 'Contacto con la marca',
            self::AccionDeCampana => 'Acción de campaña',
        };
    }
}
