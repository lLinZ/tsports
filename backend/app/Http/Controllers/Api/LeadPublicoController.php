<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\OrigenMarca;
use App\Http\Controllers\Controller;
use App\Http\Requests\CrearLeadPublicoRequest;
use App\Models\Marca;
use App\Models\RegistroActividad;
use Illuminate\Http\JsonResponse;

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
 * primero del equipo que lo trabaje se lo queda.
 */
class LeadPublicoController extends Controller
{
    /**
     * POST /api/contacto  (público)
     */
    public function store(CrearLeadPublicoRequest $peticion): JsonResponse
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

        $marca = Marca::create([
            'nombre_marca' => $nombreDeLaOportunidad,
            'persona_contacto' => trim($datos['nombre']),
            'email_contacto' => mb_strtolower(trim($datos['email'])),
            'telefono_contacto' => $datos['telefono'] ?? null,
            'notas' => trim($datos['mensaje']),
            'origen' => OrigenMarca::Web->value,
        ]);

        RegistroActividad::anotar(
            null,
            RegistroActividad::ACCION_CREO,
            'marca',
            $marca->id,
            'Entró un lead por el formulario web: '.$marca->nombre_marca,
        );

        return response()->json([
            'mensaje' => 'Mensaje recibido. Te responderemos muy pronto.',
        ], 201);
    }
}
