<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoArchivoDePropiedad;
use App\Models\ArchivoDePropiedad;
use App\Models\ArchivoMedia;
use App\Models\Propiedad;
use App\Models\RegistroActividad;
use App\Models\User;
use App\Support\GuardadoDeArchivos;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * GaleriaDePropiedadController — las fotos, planos y dossier de una
 * propiedad.
 * ---------------------------------------------------------------------
 * Es el material de venta: lo que el vendedor abre delante del cliente
 * desde la ficha de la marca, y lo que la web enseña a quien todavía no
 * ha escrito.
 *
 * VERLA la ve todo el equipo (viaja con la propiedad, ver
 * RecursoPropiedad). TOCARLA —subir, ordenar, elegir portada, borrar— es
 * editar la propiedad, y eso lo decide PropiedadPolicy::update: quien
 * gestiona el catálogo. No hay permiso nuevo que inventar.
 *
 * LA PORTADA la lleva este controlador, porque es la única regla de la
 * galería que cruza varias filas: una sola por propiedad, siempre una
 * foto, la estrena la primera foto que se sube y, si se borra, la hereda
 * la siguiente.
 */
class GaleriaDePropiedadController extends Controller
{
    /**
     * POST /api/propiedades/{propiedad}/galeria
     *
     * Sube UNA pieza. La interfaz manda varias a la vez como peticiones
     * separadas: así cada una tiene su barra de progreso, y si una falla
     * no arrastra a las demás.
     */
    public function subir(Request $peticion, Propiedad $propiedad, GuardadoDeArchivos $guardado): JsonResponse
    {
        $this->authorize('update', $propiedad);

        $datos = $peticion->validate([
            'archivo' => ['required', 'file', 'max:'.GuardadoDeArchivos::TAMANO_MAXIMO_DE_DOCUMENTO_KB],
            // Sin tope aquí a propósito: una miniatura que no sirve se
            // descarta en silencio, no tumba la subida de la foto.
            'miniatura' => ['nullable', 'file'],
            'titulo' => ['nullable', 'string', 'max:160'],
        ], [
            'archivo.required' => 'Elige una foto o un PDF para subir.',
            'archivo.max' => 'El fichero no puede pesar más de 20 MB.',
            'archivo.uploaded' => 'El fichero no llegó entero al servidor. Si pesa mucho, prueba a reducirlo.',
        ]);

        /** @var User $quienSube */
        $quienSube = $peticion->user();

        $archivo = $guardado->guardar(
            $datos['archivo'],
            ArchivoMedia::PROPOSITO_GALERIA_PROPIEDAD,
            $quienSube,
            $peticion->file('miniatura'),
        );

        try {
            $pieza = DB::transaction(function () use ($propiedad, $archivo, $datos): ArchivoDePropiedad {
                $yaTienePortada = $this->piezasDe($propiedad)->where('es_portada', true)->exists();
                $ultimoOrden = (int) $this->piezasDe($propiedad)->max('orden');

                return ArchivoDePropiedad::create([
                    'propiedad_id' => $propiedad->id,
                    'archivo_media_id' => $archivo->id,
                    'titulo' => self::textoONulo($datos['titulo'] ?? null),
                    'orden' => $ultimoOrden + 1,
                    'es_portada' => $archivo->esImagen() && ! $yaTienePortada,
                    'en_la_web' => true,
                ]);
            });
        } catch (Throwable $fallo) {
            // El fichero ya está en el disco: sin su fila no lo encontraría
            // nadie nunca más.
            $archivo->eliminarConSuFichero();

            throw $fallo;
        }

        RegistroActividad::anotar(
            $quienSube,
            RegistroActividad::ACCION_ACTUALIZO,
            'propiedad',
            $propiedad->id,
            sprintf('Subió «%s» a la galería de %s', $archivo->nombre_original, $propiedad->nombre),
        );

        return (new RecursoArchivoDePropiedad($pieza->setRelation('archivo', $archivo)))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * PATCH /api/propiedades/{propiedad}/galeria/{archivoDePropiedad}
     *
     * El título, la descripción y si sale en la web. Solo se toca lo que
     * llega: la interfaz manda un campo cada vez.
     */
    public function actualizar(
        Request $peticion,
        Propiedad $propiedad,
        ArchivoDePropiedad $archivoDePropiedad,
    ): RecursoArchivoDePropiedad|JsonResponse {
        $this->authorize('update', $propiedad);

        if (($error = $this->siNoEsDeEstaPropiedad($archivoDePropiedad, $propiedad)) !== null) {
            return $error;
        }

        $datos = $peticion->validate([
            'titulo' => ['sometimes', 'nullable', 'string', 'max:160'],
            'descripcion' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'enLaWeb' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('titulo', $datos)) {
            $archivoDePropiedad->titulo = self::textoONulo($datos['titulo']);
        }

        if (array_key_exists('descripcion', $datos)) {
            $archivoDePropiedad->descripcion = self::textoONulo($datos['descripcion']);
        }

        if (array_key_exists('enLaWeb', $datos)) {
            $archivoDePropiedad->en_la_web = (bool) $datos['enLaWeb'];
        }

        $archivoDePropiedad->save();

        return new RecursoArchivoDePropiedad($archivoDePropiedad->load('archivo'));
    }

    /**
     * PUT /api/propiedades/{propiedad}/galeria/orden
     *
     * El orden nuevo de TODA la galería, de una vez. Tienen que venir
     * exactamente las piezas que hay: si alguien subió o borró una
     * mientras otra persona ordenaba, se rechaza en vez de dejar una
     * pieza fuera del orden.
     */
    public function reordenar(Request $peticion, Propiedad $propiedad): AnonymousResourceCollection|JsonResponse
    {
        $this->authorize('update', $propiedad);

        $datos = $peticion->validate([
            'ids' => ['required', 'array'],
            'ids.*' => ['uuid', 'distinct'],
        ]);

        $enviadas = $datos['ids'];
        $actuales = $this->piezasDe($propiedad)->pluck('id')->all();

        $ordenadasEnviadas = $enviadas;
        sort($ordenadasEnviadas);
        sort($actuales);

        if ($ordenadasEnviadas !== $actuales) {
            return response()->json([
                'mensaje' => 'La galería cambió mientras la ordenabas. Vuelve a abrirla e inténtalo otra vez.',
            ], 422);
        }

        DB::transaction(function () use ($enviadas): void {
            foreach ($enviadas as $posicion => $idDeLaPieza) {
                ArchivoDePropiedad::query()->whereKey($idDeLaPieza)->update(['orden' => $posicion + 1]);
            }
        });

        return $this->galeriaActual($propiedad);
    }

    /**
     * PUT /api/propiedades/{propiedad}/galeria/{archivoDePropiedad}/portada
     */
    public function elegirPortada(
        Propiedad $propiedad,
        ArchivoDePropiedad $archivoDePropiedad,
    ): AnonymousResourceCollection|JsonResponse {
        $this->authorize('update', $propiedad);

        if (($error = $this->siNoEsDeEstaPropiedad($archivoDePropiedad, $propiedad)) !== null) {
            return $error;
        }

        if (! $archivoDePropiedad->load('archivo')->esImagen()) {
            return response()->json(['mensaje' => 'La portada tiene que ser una foto.'], 422);
        }

        DB::transaction(function () use ($propiedad, $archivoDePropiedad): void {
            $this->piezasDe($propiedad)->update(['es_portada' => false]);
            $archivoDePropiedad->forceFill(['es_portada' => true])->save();
        });

        return $this->galeriaActual($propiedad);
    }

    /**
     * DELETE /api/propiedades/{propiedad}/galeria/{archivoDePropiedad}
     *
     * Borra la pieza y su fichero. Si era la portada, la hereda la
     * siguiente foto: una propiedad con fotos no se queda sin portada
     * porque se borrara la que la tenía.
     */
    public function eliminar(
        Request $peticion,
        Propiedad $propiedad,
        ArchivoDePropiedad $archivoDePropiedad,
    ): AnonymousResourceCollection|JsonResponse {
        $this->authorize('update', $propiedad);

        if (($error = $this->siNoEsDeEstaPropiedad($archivoDePropiedad, $propiedad)) !== null) {
            return $error;
        }

        $archivo = $archivoDePropiedad->archivo;
        $eraLaPortada = $archivoDePropiedad->es_portada;
        $nombreDelFichero = $archivo->nombre_original;

        // Borra el fichero y su fila; la pieza se va en cascada con ella.
        $archivo->eliminarConSuFichero();

        if ($eraLaPortada) {
            $siguienteFoto = $this->piezasDe($propiedad)
                ->with('archivo')
                ->orderBy('orden')
                ->orderBy('id')
                ->get()
                ->first(fn (ArchivoDePropiedad $pieza): bool => $pieza->esImagen());

            $siguienteFoto?->forceFill(['es_portada' => true])->save();
        }

        RegistroActividad::anotar(
            $peticion->user(),
            RegistroActividad::ACCION_ACTUALIZO,
            'propiedad',
            $propiedad->id,
            sprintf('Quitó «%s» de la galería de %s', $nombreDelFichero, $propiedad->nombre),
        );

        return $this->galeriaActual($propiedad);
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    /**
     * Las piezas de la propiedad, sin el orden que trae la relación. Es
     * para escribir en ellas: un UPDATE con ORDER BY no lo acepta SQLite,
     * que es la base de las pruebas.
     *
     * @return \Illuminate\Database\Eloquent\Builder<ArchivoDePropiedad>
     */
    private function piezasDe(Propiedad $propiedad)
    {
        return ArchivoDePropiedad::query()->where('propiedad_id', $propiedad->id);
    }

    /** La galería entera tal como queda, que es lo que pinta la interfaz. */
    private function galeriaActual(Propiedad $propiedad): AnonymousResourceCollection
    {
        return RecursoArchivoDePropiedad::collection(
            $propiedad->galeria()->with('archivo')->get(),
        );
    }

    /**
     * Comprobación de coherencia: la pieza tiene que ser de la propiedad
     * de la ruta, o alguien podría tocar la galería de otra.
     */
    private function siNoEsDeEstaPropiedad(ArchivoDePropiedad $pieza, Propiedad $propiedad): ?JsonResponse
    {
        return $pieza->propiedad_id === $propiedad->id
            ? null
            : response()->json(['mensaje' => 'Ese fichero no es de esta propiedad.'], 404);
    }

    private static function textoONulo(?string $texto): ?string
    {
        $limpio = trim((string) $texto);

        return $limpio === '' ? null : $limpio;
    }
}
