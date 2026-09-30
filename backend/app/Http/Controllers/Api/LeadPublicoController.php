<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\OrigenMarca;
use App\Http\Controllers\Controller;
use App\Http\Requests\CrearLeadPublicoRequest;
use App\Models\Marca;
use App\Models\Propiedad;
use App\Models\RegistroActividad;
use App\Support\Notificador;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * LeadPublicoController — el formulario de contacto de la web.
 * ---------------------------------------------------------------------
 * Es el único punto de entrada del sistema abierto a alguien sin sesión,
 * así que va con tres medidas de contención:
 *
 *   1. Limitación de peticiones por IP (se aplica en la ruta).
 *   2. Trampa para robots en el propio formulario (campo `sitioWeb`).
 *   3. La marca creada nace SIN vendedor asignado, de modo que no puede
 *      usarse para colarle trabajo falso a nadie en concreto.
 *
 * El lead aparece en el tablero marcado como "Formulario web" y el
 * primero del equipo que lo trabaje se lo queda. Al entrar, les salta un
 * aviso a quienes reparten (ver App\Support\Notificador).
 *
 * DESDE EL CATÁLOGO DE LA WEB el mensaje llega con la propiedad por la que
 * se pregunta. Entonces la marca nace con esa propiedad ya en su
 * checklist, con el pronóstico a cero: así sale al filtrar el tablero por
 * esa propiedad, que es donde la busca quien la vende. Si la propiedad ya
 * no está publicada (el visitante tenía la página abierta de antes), el
 * mensaje entra igual como un lead normal: perder el contacto por eso
 * sería absurdo.
 */
class LeadPublicoController extends Controller
{
    /**
     * POST /api/contacto  (público)
     */
    public function store(CrearLeadPublicoRequest $peticion, Notificador $notificador): JsonResponse
    {
        // Si cayó en la trampa, respondemos como si todo hubiese ido bien
        // pero no guardamos nada: al robot no se le dan pistas.
        if ($peticion->pareceUnEnvioAutomatico()) {
            return response()->json([
                'mensaje' => 'Mensaje recibido. Te responderemos muy pronto.',
            ], 201);
        }

        $datos = $peticion->validated();

        // El nombre de la empresa es lo que identifica la oportunidad; si
        // no lo dejaron, se usa el nombre de la persona para no crear una
        // ficha sin título.
        $nombreDeLaOportunidad = trim((string) ($datos['empresa'] ?? '')) !== ''
            ? trim($datos['empresa'])
            : trim($datos['nombre']);

        // Solo cuenta una propiedad que el visitante pudo ver de verdad:
        // activa y publicada. Una id cualquiera no ata nada a la marca.
        $propiedadDeInteres = isset($datos['propiedadId'])
            ? Propiedad::query()->enLaWeb()->find($datos['propiedadId'])
            : null;

        $notas = trim($datos['mensaje']);

        if ($propiedadDeInteres !== null) {
            $notas = sprintf("Escribió desde el catálogo de la web, por %s.\n\n%s", $propiedadDeInteres->nombre, $notas);
        }

        $marca = DB::transaction(function () use ($datos, $nombreDeLaOportunidad, $notas, $propiedadDeInteres): Marca {
            $nueva = Marca::create([
                'nombre_marca' => $nombreDeLaOportunidad,
                'persona_contacto' => trim($datos['nombre']),
                'email_contacto' => mb_strtolower(trim($datos['email'])),
                'telefono_contacto' => $datos['telefono'] ?? null,
                'notas' => $notas,
                'origen' => OrigenMarca::Web->value,
            ]);

            if ($propiedadDeInteres !== null) {
                $nueva->propiedadesOfrecidas()->create([
                    'propiedad_id' => $propiedadDeInteres->id,
                    'ovp_usd' => 0,
                    'nota' => 'Preguntó por ella desde la web.',
                ]);
            }

            return $nueva;
        });

        RegistroActividad::anotar(
            null,
            RegistroActividad::ACCION_CREO,
            'marca',
            $marca->id,
            $propiedadDeInteres === null
                ? 'Entró un lead por el formulario web: '.$marca->nombre_marca
                : sprintf('Entró un lead por el catálogo web (%s): %s', $propiedadDeInteres->nombre, $marca->nombre_marca),
        );

        // Sin esto un lead que entra un viernes espera al lunes a que
        // alguien abra el tablero y lo vea.
        $notificador->avisarDeUnLeadNuevo($marca, $propiedadDeInteres);

        return response()->json([
            'mensaje' => 'Mensaje recibido. Te responderemos muy pronto.',
        ], 201);
    }
}
