<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\GuiaDeVideo;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * VideoTutorial — un vídeo de la pantalla «Vídeos».
 * ---------------------------------------------------------------------
 * Qué significa cada columna está en su migración. No se crean desde el
 * panel: los carga el comando `videos:importar` desde una carpeta del
 * servidor, con el manifiesto que sale de informes/videos.
 *
 * Quién ve cada uno lo decide la serie (`guia`) contra el rol de quien
 * pregunta, en un solo sitio: `scopeQueVe`.
 *
 * @property string $id
 * @property GuiaDeVideo $guia
 */
class VideoTutorial extends Model
{
    use HasUuids;

    protected $table = 'videos_tutoriales';

    protected $fillable = [
        'clave',
        'guia',
        'orden',
        'titulo',
        'descripcion',
        'duracion_segundos',
        'archivo_media_id',
        'portada_media_id',
    ];

    protected function casts(): array
    {
        return [
            'guia' => GuiaDeVideo::class,
            'orden' => 'integer',
            'duracion_segundos' => 'integer',
        ];
    }

    public function archivo(): BelongsTo
    {
        return $this->belongsTo(ArchivoMedia::class, 'archivo_media_id');
    }

    public function portada(): BelongsTo
    {
        return $this->belongsTo(ArchivoMedia::class, 'portada_media_id');
    }

    /** Los vídeos de las series que ve esa persona, en el orden de la pantalla. */
    public function scopeQueVe(Builder $consulta, User $persona): Builder
    {
        $guias = $persona->rol->guiasDeVideoQueVe();

        return $consulta
            ->whereIn('guia', array_map(fn (GuiaDeVideo $guia) => $guia->value, $guias))
            ->orderByRaw(self::ordenDeLasGuias())
            ->orderBy('orden')
            // Desempate: dos vídeos con el mismo puesto no deben bailar.
            ->orderBy('clave');
    }

    /** CASE con la posición de cada serie, sin depender del orden alfabético. */
    private static function ordenDeLasGuias(): string
    {
        $casos = array_map(
            fn (GuiaDeVideo $guia) => sprintf("WHEN '%s' THEN %d", $guia->value, $guia->posicion()),
            GuiaDeVideo::cases(),
        );

        return 'CASE guia '.implode(' ', $casos).' ELSE 99 END';
    }

    /**
     * Borra el vídeo y sus dos ficheros del disco.
     *
     * Como en CierreDeMes: primero la fila y luego los ficheros, para que
     * un fallo a mitad deje un fichero huérfano en una carpeta privada y
     * no un vídeo que apunta a la nada.
     */
    public function eliminarConSusArchivos(): void
    {
        $archivo = $this->archivo;
        $portada = $this->portada;

        $this->delete();

        $archivo?->eliminarConSuFichero();
        $portada?->eliminarConSuFichero();
    }
}
