<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Marca;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoMarca — cómo se ve una marca desde el frontend.
 * ---------------------------------------------------------------------
 * Además de traducir las columnas a camelCase, este recurso añade tres
 * cosas calculadas que el cliente necesitaría recomputar si no vinieran
 * ya resueltas del servidor:
 *
 *   · `etapa`            → la fase resumida para colorear la tarjeta.
 *   · `datosQueFaltan`   → qué le falta para cerrar la prospección, con
 *                          las mismas palabras que usa el backend.
 *   · `puedeEditarla` /
 *     `puedeEliminarla`  → si el usuario que pregunta puede tocarla.
 *
 * Desde la segunda etapa lleva además el checklist de propiedades (los
 * productos IOP que se le están ofreciendo) con su pronóstico de venta
 * ya convertido a porcentaje del valor de cada propiedad.
 *
 * Lo último es importante: la interfaz desactiva los botones con esas
 * banderas en vez de deducir permisos por su cuenta. Es lo que evita el
 * error clásico de la versión anterior, donde el panel decía "Guardado"
 * de una marca que la base de datos había rechazado en silencio.
 *
 * @mixin Marca
 */
class RecursoMarca extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        $usuarioQueConsulta = $peticion->user();

        return [
            'id' => $this->id,

            // --- Identificación ---
            'nombreMarca' => $this->nombre_marca,
            'sector' => $this->sector,
            'logoUrl' => $this->logo_url,
            'zona' => $this->zona,
            'invierteActualmente' => $this->invierte_actualmente->value,
            'invierteEtiqueta' => $this->invierte_actualmente->etiqueta(),
            'viaProspeccion' => $this->via_prospeccion,

            // --- Campaña comercial ---
            // El nombre y el color se leen de la relación y no de una
            // copia en la marca: una campaña se renombra, y una copia
            // vieja haría que la ficha y el catálogo no coincidiesen.
            'campanaId' => $this->campana_id,
            'campanaNombre' => $this->whenLoaded('campana', fn () => $this->campana?->nombre),
            'campanaColor' => $this->whenLoaded('campana', fn () => $this->campana?->color),
            // Solo la fecha, sin hora ni zona horaria: es el día en que
            // se hace la acción, y es lo que la sitúa en el calendario.
            'fechaCampana' => $this->fecha_campana?->format('Y-m-d'),
            // El historial completo de acciones, solo cuando se pide la
            // ficha: en el listado del tablero serían 71 consultas de
            // algo que ahí no se enseña.
            'historialDeCampanas' => $this->whenLoaded(
                'eventosDeCampana',
                fn () => $this->eventosDeCampana->map(fn ($evento): array => [
                    'id' => $evento->id,
                    // El id de la campaña hace falta para poder
                    // preseleccionarla al corregir el evento.
                    'campanaId' => $evento->campana_id,
                    'campanaNombre' => $evento->campana_nombre,
                    'campanaColor' => $evento->campana_color,
                    'fecha' => $evento->fecha->format('Y-m-d'),
                    'nota' => $evento->nota,
                    'registradoPorNombre' => $evento->registrado_por_nombre,
                    'registradoEn' => $evento->created_at?->toIso8601String(),
                    // Banderas ya resueltas: la interfaz esconde los
                    // botones con esto en vez de comparar roles.
                    'puedoEditarlo' => $usuarioQueConsulta?->can('update', $evento) ?? false,
                    'puedoEliminarlo' => $usuarioQueConsulta?->can('delete', $evento) ?? false,
                ])->values(),
            ),

            // --- Contacto ---
            'personaContacto' => $this->persona_contacto,
            'cargoContacto' => $this->cargo_contacto,
            'emailContacto' => $this->email_contacto,
            'telefonoContacto' => $this->telefono_contacto,
            'notas' => $this->notas,

            // --- Avance del proceso comercial ---
            'faseProspeccionCompletada' => $this->fase_prospeccion_completada,
            'faseAproximacionCompletada' => $this->fase_aproximacion_completada,
            'viaAproximacion' => $this->via_aproximacion,
            'fasePropuestaCompletada' => $this->fase_propuesta_completada,
            'descripcionPropuesta' => $this->descripcion_propuesta,
            'valorAnualUsd' => (float) $this->valor_anual_usd,

            // Calculados en el servidor para que cliente y servidor
            // cuenten siempre lo mismo.
            'etapa' => $this->etapaResumida(),
            'datosQueFaltan' => $this->datosQueFaltanParaProspeccion(),

            // --- Checklist de propiedades (los productos IOP) ---
            // Cada línea trae ya el MTP de su propiedad y el porcentaje
            // que representa el pronóstico, para que la barra se pinte
            // sin cruzar el catálogo en el navegador.
            'propiedadesOfrecidas' => RecursoPropiedadDeMarca::collection(
                $this->whenLoaded('propiedadesOfrecidas'),
            ),
            'ovpTotalUsd' => $this->whenLoaded(
                'propiedadesOfrecidas',
                fn (): float => $this->ovpTotal(),
            ),

            // --- Responsables ---
            'registradaPorId' => $this->registrada_por_id,
            'registradaPorNombre' => $this->registrada_por_nombre,
            'vendedorAsignadoId' => $this->vendedor_asignado_id,
            'vendedorAsignadoNombre' => $this->vendedor_asignado_nombre,
            'estaSinDuenio' => $this->estaSinDuenio(),

            'origen' => $this->origen->value,
            'origenEtiqueta' => $this->origen->etiqueta(),

            // --- Permisos del usuario que hace la petición ---
            'puedeEditarla' => $usuarioQueConsulta?->can('update', $this->resource) ?? false,
            'puedeEliminarla' => $usuarioQueConsulta?->can('delete', $this->resource) ?? false,

            // Número de comentarios, solo si la relación se cargó antes
            // (evita una consulta por tarjeta en el listado).
            'totalComentarios' => $this->whenCounted('comentarios'),
            'comentarios' => RecursoComentarioMarca::collection($this->whenLoaded('comentarios')),

            'creadaEn' => $this->created_at?->toIso8601String(),
            'actualizadaEn' => $this->updated_at?->toIso8601String(),
        ];
    }
}
