<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\ContenidoWebPorDefecto;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ContenidoSitio — una versión del contenido de la web pública.
 * ---------------------------------------------------------------------
 * El panel de administración edita un documento JSON con todo lo que se
 * ve en la web (colores, imágenes, textos en dos idiomas, servicios,
 * proyectos, equipo, aliados y contacto). Cada guardado crea una fila
 * nueva y marca la anterior como no publicada, de modo que queda un
 * historial y se puede restaurar una versión previa.
 *
 * `versionPublicada()` es el único punto por el que se lee el contenido
 * vigente; devuelve siempre algo utilizable aunque la tabla esté vacía.
 */
class ContenidoSitio extends Model
{
    protected $table = 'contenido_sitio';

    /** Clave del único sitio que existe hoy. */
    public const CLAVE_PRINCIPAL = 'principal';

    protected $fillable = [
        'clave',
        'contenido',
        'es_version_publicada',
        'actualizado_por_id',
        'actualizado_por_nombre',
        'nota_de_cambio',
    ];

    protected function casts(): array
    {
        return [
            'contenido' => 'array',
            'es_version_publicada' => 'boolean',
        ];
    }

    public function actualizadoPor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actualizado_por_id');
    }

    /**
     * Devuelve la versión que está publicada ahora mismo. Si todavía no
     * se ha guardado nada (instalación recién hecha), crea sobre la
     * marcha una fila con el contenido de fábrica para que la web nunca
     * responda vacía.
     */
    public static function versionPublicada(): self
    {
        $versionVigente = self::query()
            ->where('clave', self::CLAVE_PRINCIPAL)
            ->where('es_version_publicada', true)
            ->latest('id')
            ->first();

        if ($versionVigente !== null) {
            return $versionVigente;
        }

        return self::create([
            'clave' => self::CLAVE_PRINCIPAL,
            'contenido' => ContenidoWebPorDefecto::comoArreglo(),
            'es_version_publicada' => true,
            'nota_de_cambio' => 'Contenido inicial de fábrica',
        ]);
    }

    /**
     * Guarda una versión nueva y la deja como la publicada, dejando la
     * anterior archivada en el historial.
     */
    public static function publicarNuevaVersion(
        array $contenidoCompleto,
        ?User $autor,
        ?string $notaDeCambio = null,
    ): self {
        self::query()
            ->where('clave', self::CLAVE_PRINCIPAL)
            ->where('es_version_publicada', true)
            ->update(['es_version_publicada' => false]);

        return self::create([
            'clave' => self::CLAVE_PRINCIPAL,
            'contenido' => $contenidoCompleto,
            'es_version_publicada' => true,
            'actualizado_por_id' => $autor?->id,
            'actualizado_por_nombre' => $autor?->nombreParaMostrar(),
            'nota_de_cambio' => $notaDeCambio,
        ]);
    }
}
