<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\InversionEnPatrocinios;
use App\Models\Propiedad;
use App\Support\CatalogosDelCrm;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * GuardarMarcaRequest — validación al crear o editar una marca.
 * ---------------------------------------------------------------------
 * Recoge las reglas que el cliente pidió y que antes estaban escritas a
 * mano dentro del manejador del formulario:
 *
 *   · La marca siempre lleva nombre.
 *   · Si se marca APROXIMACIÓN hay que decir por qué vía se hizo; si no,
 *     el indicador no significa nada.
 *   · Si se marca PROPUESTA hay que describir qué se le envió a la
 *     marca; sin eso no se puede auditar el pipeline.
 *   · En el checklist de propiedades, el pronóstico (OVP) de una
 *     propiedad no puede pasar de su monto total (MTP): sería estimar
 *     vender más de lo que la propiedad entera vale, y la barra de
 *     porcentaje pasaría del 100 %.
 *
 * Las tres últimas son condicionales, así que se resuelven en
 * `withValidator` y no en el arreglo de reglas.
 */
class GuardarMarcaRequest extends FormRequest
{
    /** La autorización la resuelve la política, no la petición. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string,mixed>
     */
    public function rules(): array
    {
        return [
            // --- Identificación de la marca ---
            'nombreMarca' => ['required', 'string', 'max:180'],
            'sector' => ['nullable', 'string', Rule::in(CatalogosDelCrm::SECTORES)],
            'logoUrl' => ['nullable', 'string', 'max:2048'],
            'zona' => ['nullable', 'string', Rule::in(CatalogosDelCrm::ZONAS)],
            'invierteActualmente' => ['nullable', Rule::in(InversionEnPatrocinios::valores())],
            'viaProspeccion' => ['nullable', 'string', Rule::in(CatalogosDelCrm::VIAS_DE_PROSPECCION)],

            // --- Campaña dentro de la que se trabaja la marca ---
            'campanaId' => ['nullable', 'uuid', 'exists:campanas,id'],
            'fechaCampana' => ['nullable', 'date_format:Y-m-d'],

            // --- Checklist de propiedades (productos IOP) ---
            // Solo se toca el checklist si el cuerpo trae la clave: así
            // una petición que no sepa de propiedades no lo borra sin
            // querer (ver `traeElChecklistDePropiedades`).
            'propiedades' => ['array', 'max:50'],
            'propiedades.*.propiedadId' => ['required', 'uuid', 'exists:propiedades,id'],
            'propiedades.*.ovpUsd' => ['nullable', 'numeric', 'min:0', 'max:99999999999'],
            'propiedades.*.nota' => ['nullable', 'string', 'max:500'],

            // --- Persona de contacto ---
            'personaContacto' => ['nullable', 'string', 'max:180'],
            'cargoContacto' => ['nullable', 'string', 'max:180'],
            'emailContacto' => ['nullable', 'email:filter', 'max:180'],
            'telefonoContacto' => ['nullable', 'string', 'max:60'],
            'notas' => ['nullable', 'string', 'max:5000'],

            // --- Avance del proceso ---
            'faseAproximacionCompletada' => ['boolean'],
            'viaAproximacion' => ['nullable', 'string', Rule::in(CatalogosDelCrm::VIAS_DE_APROXIMACION)],
            'fasePropuestaCompletada' => ['boolean'],
            'descripcionPropuesta' => ['nullable', 'string', 'max:5000'],
            'valorAnualUsd' => ['nullable', 'numeric', 'min:0', 'max:99999999999'],

            // --- Asignación (solo la aplica quien tiene permiso) ---
            'vendedorAsignadoId' => ['nullable', 'uuid', 'exists:users,id'],
        ];
    }

    /**
     * Reglas que dependen de otros campos del formulario.
     */
    public function withValidator(Validator $validador): void
    {
        $validador->after(function (Validator $validador): void {
            $seMarcoLaAproximacion = $this->boolean('faseAproximacionCompletada');
            $viaDeAproximacion = trim((string) $this->input('viaAproximacion'));

            if ($seMarcoLaAproximacion && $viaDeAproximacion === '') {
                $validador->errors()->add(
                    'viaAproximacion',
                    'Indica por qué vía se hizo la aproximación (Conocido, WhatsApp u otra).',
                );
            }

            $seMarcoLaPropuesta = $this->boolean('fasePropuestaCompletada');
            $descripcionDeLaPropuesta = trim((string) $this->input('descripcionPropuesta'));

            if ($seMarcoLaPropuesta && $descripcionDeLaPropuesta === '') {
                $validador->errors()->add(
                    'descripcionPropuesta',
                    'Para marcar la propuesta describe qué se le envió a la marca.',
                );
            }

            // Una campaña sin fecha no se puede colocar en el calendario:
            // sabríamos QUÉ se va a hacer con la marca pero no CUÁNDO, y
            // el evento no aparecería en ninguna semana.
            $seAsignoUnaCampana = trim((string) $this->input('campanaId')) !== '';
            $fechaDeLaCampana = trim((string) $this->input('fechaCampana'));

            if ($seAsignoUnaCampana && $fechaDeLaCampana === '') {
                $validador->errors()->add(
                    'fechaCampana',
                    'Indica el día en que se hace esta acción de campaña.',
                );
            }

            $this->comprobarElChecklistDePropiedades($validador);
        });
    }

    /**
     * Revisa el checklist de propiedades: ni repetidas ni pronósticos
     * mayores que el valor de la propiedad.
     *
     * Las propiedades se leen de una sola consulta y no una por línea:
     * un checklist con quince propiedades haría quince viajes a la base
     * de datos por cada guardado de una ficha.
     */
    private function comprobarElChecklistDePropiedades(Validator $validador): void
    {
        $lineasDelChecklist = (array) $this->input('propiedades', []);

        if ($lineasDelChecklist === []) {
            return;
        }

        $idsDeLasPropiedades = array_filter(array_map(
            static fn ($linea): ?string => is_array($linea) ? ($linea['propiedadId'] ?? null) : null,
            $lineasDelChecklist,
        ));

        if (count($idsDeLasPropiedades) !== count(array_unique($idsDeLasPropiedades))) {
            $validador->errors()->add(
                'propiedades',
                'Hay una propiedad repetida en el checklist; cada una se ofrece una sola vez.',
            );

            return;
        }

        $propiedadesPorId = Propiedad::query()
            ->whereIn('id', $idsDeLasPropiedades)
            ->get()
            ->keyBy('id');

        foreach ($lineasDelChecklist as $posicion => $linea) {
            if (! is_array($linea)) {
                continue;
            }

            $propiedad = $propiedadesPorId->get($linea['propiedadId'] ?? '');

            if ($propiedad === null) {
                continue; // La regla `exists` ya se habrá quejado.
            }

            $montoTotalDeLaPropiedad = (float) $propiedad->monto_total_usd;
            $pronosticoDeVenta = (float) ($linea['ovpUsd'] ?? 0);

            // Con el MTP todavía sin cargar no se compara nada: bloquear
            // el pronóstico por un dato que aún no ha puesto nadie del
            // equipo dejaría la ficha sin poder guardarse.
            if ($montoTotalDeLaPropiedad > 0 && $pronosticoDeVenta > $montoTotalDeLaPropiedad) {
                $validador->errors()->add(
                    "propiedades.{$posicion}.ovpUsd",
                    sprintf(
                        'El pronóstico de %s no puede pasar de su monto total (%s USD).',
                        $propiedad->nombre,
                        number_format($montoTotalDeLaPropiedad, 0, ',', '.'),
                    ),
                );
            }
        }
    }

    /**
     * Mensajes en el idioma del equipo, para que el error se entienda sin
     * traducir mentalmente el nombre del campo.
     *
     * @return array<string,string>
     */
    public function messages(): array
    {
        return [
            'nombreMarca.required' => 'Ponle nombre a la marca.',
            'emailContacto.email' => 'El correo del contacto no tiene un formato válido.',
            'sector.in' => 'Ese sector no está en la lista de sectores permitidos.',
            'zona.in' => 'Esa zona no está en la lista de zonas permitidas.',
            'vendedorAsignadoId.exists' => 'El agente que intentas asignar ya no existe.',
            'fechaCampana.date_format' => 'La fecha de la campaña no tiene un formato válido.',
        ];
    }

    /**
     * Traduce el cuerpo camelCase que envía el frontend a las columnas
     * snake_case del modelo. Se hace en un solo sitio para que el
     * controlador reciba los datos ya listos para `fill()`.
     *
     * @return array<string,mixed>
     */
    public function datosParaElModelo(): array
    {
        $datosValidados = $this->validated();

        $atributos = [
            'nombre_marca' => trim((string) $datosValidados['nombreMarca']),
            'sector' => $datosValidados['sector'] ?? null,
            'logo_url' => $datosValidados['logoUrl'] ?? null,
            'zona' => $datosValidados['zona'] ?? null,
            'campana_id' => $datosValidados['campanaId'] ?? null,
            'fecha_campana' => $datosValidados['fechaCampana'] ?? null,
            'invierte_actualmente' => $datosValidados['invierteActualmente'] ?? InversionEnPatrocinios::Desconocido->value,
            'via_prospeccion' => $datosValidados['viaProspeccion'] ?? null,

            'persona_contacto' => $datosValidados['personaContacto'] ?? null,
            'cargo_contacto' => $datosValidados['cargoContacto'] ?? null,
            'email_contacto' => $datosValidados['emailContacto'] ?? null,
            'telefono_contacto' => $datosValidados['telefonoContacto'] ?? null,
            'notas' => $datosValidados['notas'] ?? null,

            'fase_aproximacion_completada' => $this->boolean('faseAproximacionCompletada'),
            'via_aproximacion' => $datosValidados['viaAproximacion'] ?? null,
            'fase_propuesta_completada' => $this->boolean('fasePropuestaCompletada'),
            'descripcion_propuesta' => $datosValidados['descripcionPropuesta'] ?? null,
            'valor_anual_usd' => (float) ($datosValidados['valorAnualUsd'] ?? 0),
        ];

        // Si la aproximación no está marcada, la vía sobra: se limpia para
        // que no queden datos huérfanos que confundan al leer la ficha.
        if (! $atributos['fase_aproximacion_completada']) {
            $atributos['via_aproximacion'] = null;
        }

        // Lo mismo con la fecha: al quitarle la campaña a una marca, la
        // fecha deja de significar nada. Si se quedara guardada y luego
        // se le asignase otra campaña, aparecería en el calendario con
        // una fecha vieja que nadie eligió para esa acción.
        if ($atributos['campana_id'] === null) {
            $atributos['fecha_campana'] = null;
        }

        return $atributos;
    }

    /**
     * ¿La petición trae el checklist de propiedades?
     *
     * La distinción importa: un cuerpo SIN la clave `propiedades` deja el
     * checklist como estaba, y uno con la clave vacía lo vacía. Sin esta
     * diferencia, cualquier cliente que no supiera de propiedades borraría
     * el trabajo de prospección al guardar la ficha.
     */
    public function traeElChecklistDePropiedades(): bool
    {
        return $this->has('propiedades');
    }

    /**
     * El checklist ya normalizado: una entrada por propiedad, con su
     * pronóstico convertido a número y su nota limpia.
     *
     * @return array<string,array{ovp_usd:float,nota:string|null}>
     */
    public function checklistDePropiedades(): array
    {
        $checklistNormalizado = [];

        foreach ((array) $this->input('propiedades', []) as $linea) {
            if (! is_array($linea) || ! isset($linea['propiedadId'])) {
                continue;
            }

            $checklistNormalizado[(string) $linea['propiedadId']] = [
                'ovp_usd' => (float) ($linea['ovpUsd'] ?? 0),
                'nota' => trim((string) ($linea['nota'] ?? '')) ?: null,
            ];
        }

        return $checklistNormalizado;
    }
}
