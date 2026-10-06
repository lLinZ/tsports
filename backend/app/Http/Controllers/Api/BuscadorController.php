<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Campana;
use App\Models\Marca;
use App\Models\Propiedad;
use App\Models\Sector;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * BuscadorController — el buscador único de la barra superior.
 * ---------------------------------------------------------------------
 * Un solo cuadro que encuentra marcas, propiedades, campañas, sectores y
 * personas. Cada resultado trae ya resuelto a dónde lleva (`enlace`): la
 * interfaz no compone rutas, igual que con los avisos.
 *
 * CADA QUIEN ENCUENTRA SOLO LO QUE YA PUEDE VER:
 *
 *   · Marcas → las de `quePuedeVer`, como el tablero. Si un agente
 *     encontrara marcas ajenas tecleando letras, el buscador abriría la
 *     cartera que la regla 6 le cierra.
 *   · Propiedades, campañas y sectores → el catálogo, que ve todo el
 *     equipo. Llevan al tablero filtrado, donde cada quien ve sus marcas.
 *   · Personas → el equipo activo, que el chat ya enseña a todos
 *     (regla 20). Solo quien reparte el trabajo recibe el enlace a la
 *     cartera de cada una; el resto le escribe por el chat.
 *
 * Primero lo que EMPIEZA por lo escrito, que es lo que se busca al
 * teclear las primeras letras de un nombre.
 */
class BuscadorController extends Controller
{
    /** Por debajo de esto casi todo coincide y la lista no ayuda. */
    private const LETRAS_MINIMAS = 2;

    private const MARCAS_COMO_MUCHO = 8;

    private const DE_LO_DEMAS_COMO_MUCHO = 5;

    /**
     * GET /api/buscar?q=pep
     */
    public function buscar(Request $peticion): JsonResponse
    {
        $this->authorize('viewAny', Marca::class);

        /** @var User $quienBusca */
        $quienBusca = $peticion->user();

        $texto = trim((string) $peticion->query('q', ''));

        if (mb_strlen($texto) < self::LETRAS_MINIMAS) {
            return response()->json(['texto' => $texto, 'resultados' => $this->sinResultados()]);
        }

        $contiene = '%'.$texto.'%';
        $empiezaPor = $texto.'%';
        $veLasCarteras = $quienBusca->can('asignarVendedor', Marca::class);

        return response()->json([
            'texto' => $texto,
            'resultados' => [
                'marcas' => $this->marcas($quienBusca, $texto, $empiezaPor),
                'propiedades' => $this->propiedades($contiene, $empiezaPor),
                'campanas' => $this->campanas($contiene, $empiezaPor),
                'sectores' => $this->sectores($contiene, $empiezaPor),
                'personas' => $this->personas($contiene, $empiezaPor, $veLasCarteras),
            ],
        ]);
    }

    /** @return list<array<string,mixed>> */
    private function marcas(User $quienBusca, string $texto, string $empiezaPor): array
    {
        return Marca::query()
            ->quePuedeVer($quienBusca)
            // Nombre, contacto o correo: lo mismo que busca el tablero.
            ->buscarTexto($texto)
            ->orderByRaw('CASE WHEN nombre_marca LIKE ? THEN 0 ELSE 1 END', [$empiezaPor])
            ->orderBy('nombre_marca')
            ->orderBy('id')
            ->limit(self::MARCAS_COMO_MUCHO)
            ->get(['id', 'nombre_marca', 'logo_url', 'sector', 'zona', 'persona_contacto', 'vendedor_asignado_nombre'])
            ->map(fn (Marca $marca): array => [
                'id' => $marca->id,
                'titulo' => $marca->nombre_marca,
                'detalle' => $this->unir([$marca->sector, $marca->zona, $marca->persona_contacto]),
                'imagenUrl' => $marca->logo_url,
                'enlace' => '/marcas?abrir='.$marca->id,
            ])
            ->values()
            ->all();
    }

    /** @return list<array<string,mixed>> */
    private function propiedades(string $contiene, string $empiezaPor): array
    {
        return $this->primeroLoQueEmpieza(Propiedad::query(), 'nombre', $contiene, $empiezaPor)
            ->get(['id', 'nombre', 'logo_url', 'activa'])
            ->map(fn (Propiedad $propiedad): array => [
                'id' => $propiedad->id,
                'titulo' => $propiedad->nombre,
                'detalle' => $propiedad->activa ? 'Ver las marcas que la tienen' : 'Desactivada',
                'imagenUrl' => $propiedad->logo_url,
                // El ranking de esa propiedad, como «Ver las marcas» del
                // catálogo y del resumen.
                'enlace' => '/marcas?propiedad='.$propiedad->id.'&orden=ovp_propiedad',
            ])
            ->values()
            ->all();
    }

    /** @return list<array<string,mixed>> */
    private function campanas(string $contiene, string $empiezaPor): array
    {
        return $this->primeroLoQueEmpieza(Campana::query(), 'nombre', $contiene, $empiezaPor)
            ->get(['id', 'nombre', 'color', 'activa'])
            ->map(fn (Campana $campana): array => [
                'id' => $campana->id,
                'titulo' => $campana->nombre,
                'detalle' => $campana->activa ? 'Las marcas que la tienen o la tuvieron' : 'Desactivada',
                'color' => $campana->color,
                'enlace' => '/marcas?campana='.$campana->id,
            ])
            ->values()
            ->all();
    }

    /** @return list<array<string,mixed>> */
    private function sectores(string $contiene, string $empiezaPor): array
    {
        return $this->primeroLoQueEmpieza(Sector::query(), 'nombre', $contiene, $empiezaPor)
            ->get(['id', 'nombre', 'activo'])
            ->map(fn (Sector $sector): array => [
                'id' => $sector->id,
                'titulo' => $sector->nombre,
                'detalle' => $sector->activo ? 'Las marcas de este sector' : 'Sector desactivado',
                // La marca guarda el sector como texto (regla 15): se filtra
                // por el nombre.
                'enlace' => '/marcas?sector='.rawurlencode($sector->nombre),
            ])
            ->values()
            ->all();
    }

    /** @return list<array<string,mixed>> */
    private function personas(string $contiene, string $empiezaPor, bool $veLasCarteras): array
    {
        return $this->primeroLoQueEmpieza(User::query()->where('activo', true), 'name', $contiene, $empiezaPor)
            ->get()
            ->map(fn (User $persona): array => [
                'id' => $persona->id,
                'titulo' => $persona->nombreParaMostrar(),
                'detalle' => $this->unir([$persona->rol->etiqueta(), $persona->zona]),
                'imagenUrl' => $persona->url_avatar,
                // Sin enlace, la interfaz abre una charla con ella.
                'enlace' => $veLasCarteras ? '/marcas?vendedor='.$persona->id : null,
            ])
            ->values()
            ->all();
    }

    /**
     * Las que coinciden, primero las que empiezan por lo escrito.
     *
     * @template TModelo of \Illuminate\Database\Eloquent\Model
     *
     * @param  Builder<TModelo>  $consulta
     * @return Builder<TModelo>
     */
    private function primeroLoQueEmpieza(Builder $consulta, string $columna, string $contiene, string $empiezaPor): Builder
    {
        return $consulta
            ->where($columna, 'like', $contiene)
            ->orderByRaw("CASE WHEN {$columna} LIKE ? THEN 0 ELSE 1 END", [$empiezaPor])
            ->orderBy($columna)
            ->limit(self::DE_LO_DEMAS_COMO_MUCHO);
    }

    /** @param  list<?string>  $partes */
    private function unir(array $partes): string
    {
        return implode(' · ', array_filter($partes, fn (?string $parte): bool => trim((string) $parte) !== ''));
    }

    /** @return array<string, list<never>> */
    private function sinResultados(): array
    {
        return ['marcas' => [], 'propiedades' => [], 'campanas' => [], 'sectores' => [], 'personas' => []];
    }
}
