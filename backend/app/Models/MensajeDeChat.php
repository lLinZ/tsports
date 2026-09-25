<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * MensajeDeChat — una línea de una charla.
 * ---------------------------------------------------------------------
 * Su id es un número que crece, no un UUID: ordena sin empates y sirve de
 * cursor («lo nuevo desde el 1532»). El porqué, en la migración.
 *
 * LAS MARCAS ETIQUETADAS van dentro del texto como `[[marca:<id>]]`, en
 * el sitio exacto donde se nombraron, y además como filas en
 * `marcas_en_mensajes` con el nombre copiado. El texto dice DÓNDE va
 * cada etiqueta; la fila dice QUÉ marca era y cómo se llamaba cuando se
 * escribió. La interfaz cambia cada marca de texto por su chip.
 *
 * Los mensajes de SISTEMA («Ana añadió a Pedro») los escribe el propio
 * chat al cambiar un grupo. No cuentan como sin leer: nadie espera que
 * le suene el teléfono porque cambió el nombre de un grupo.
 */
class MensajeDeChat extends Model
{
    public const TIPO_TEXTO = 'texto';

    public const TIPO_SISTEMA = 'sistema';

    /**
     * Cómo se escribe una marca etiquetada dentro del texto. Un UUID
     * entre dobles corchetes: no hay forma de que salga por casualidad
     * al escribir un mensaje normal.
     */
    public const PATRON_DE_MARCA = '/\[\[marca:([0-9a-fA-F-]{36})\]\]/';

    /** Hasta dónde puede llegar un mensaje. Un chat no es un correo. */
    public const LONGITUD_MAXIMA = 4000;

    protected $table = 'mensajes_de_chat';

    protected $fillable = [
        'conversacion_id',
        'autor_id',
        'autor_nombre',
        'tipo',
        'cuerpo',
    ];

    public function conversacion(): BelongsTo
    {
        return $this->belongsTo(Conversacion::class, 'conversacion_id');
    }

    public function autor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'autor_id');
    }

    public function marcas(): HasMany
    {
        return $this->hasMany(MarcaEnMensaje::class, 'mensaje_id');
    }

    public function esDeSistema(): bool
    {
        return $this->tipo === self::TIPO_SISTEMA;
    }

    /**
     * Los ids de las marcas etiquetadas en un texto, sin repetir.
     *
     * @return list<string>
     */
    public static function idsDeMarcasEn(string $texto): array
    {
        preg_match_all(self::PATRON_DE_MARCA, $texto, $coincidencias);

        return array_values(array_unique(array_map('strtolower', $coincidencias[1])));
    }

    /**
     * El mensaje en texto corrido, con cada marca como «#Nombre».
     *
     * Es lo que sale en la lista de charlas y en el aviso del móvil. Usa
     * el nombre COPIADO al escribir, no el actual de la marca: el aviso le
     * llega también a quien no puede verla, y a esa persona se le cuenta
     * lo que quien escribió decidió contarle.
     */
    public function textoPlano(): string
    {
        $nombres = $this->marcas
            ->mapWithKeys(fn (MarcaEnMensaje $etiqueta): array => [
                strtolower((string) $etiqueta->marca_id) => $etiqueta->nombre_marca,
            ]);

        return (string) preg_replace_callback(
            self::PATRON_DE_MARCA,
            fn (array $coincidencia): string => '#'.($nombres->get(strtolower($coincidencia[1])) ?? 'marca'),
            $this->cuerpo,
        );
    }
}
