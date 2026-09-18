<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Exceptions\FalloDelTiempoReal;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\ConexionesEnVivo;
use App\Support\TiempoReal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * TiempoRealController — el WebSocket visto desde la API.
 * ---------------------------------------------------------------------
 * Dos usos distintos:
 *
 *   1. Lo que el navegador necesita para conectarse (cualquier sesión).
 *      La clave de Reverb se entrega desde aquí y NO va compilada dentro
 *      del frontend (con una variable VITE_), por dos motivos:
 *        · Vive en un solo sitio, backend/.env. Compilada, habría que
 *          escribirla dos veces y mantener las dos iguales a mano, y el
 *          síntoma de que no coinciden es un WebSocket que se cierra sin
 *          explicar nada.
 *        · El mismo build sirve para producción y para test.tsports.tech,
 *          que tienen cada uno su propio Reverb con su propia clave.
 *      Host y puerto no hacen falta: el navegador abre el WebSocket
 *      contra el mismo origen de la página y nginx (o Vite) lo reenvía.
 *
 *   2. La pantalla de pruebas del administrador: quién está conectado
 *      ahora y mandar avisos de prueba. Solo admin (UserPolicy), porque
 *      un aviso a «todo el equipo» le aparece en pantalla a cada persona.
 */
class TiempoRealController extends Controller
{
    /**
     * GET /api/tiempo-real
     */
    public function configuracion(): JsonResponse
    {
        return response()->json([
            'activo' => TiempoReal::estaActivo(),
            'clave' => TiempoReal::clavePublica(),
        ]);
    }

    /**
     * GET /api/admin/tiempo-real
     *
     * El equipo con quién tiene ahora mismo el panel abierto. La
     * interfaz lo consulta cada pocos segundos mientras la pantalla está
     * abierta: es una llamada a Reverb dentro de la máquina, barata.
     */
    public function panel(ConexionesEnVivo $conexiones): JsonResponse
    {
        $this->authorize('probarTiempoReal', User::class);

        $idsConectados = $conexiones->idsDeLasPersonasConectadas();

        $personas = User::query()
            ->where('activo', true)
            ->orderBy('name')
            ->get()
            ->map(fn (User $persona): array => [
                'id' => $persona->id,
                'nombre' => $persona->nombreParaMostrar(),
                'rolEtiqueta' => $persona->rol->etiqueta(),
                'conectada' => $idsConectados !== null && in_array($persona->id, $idsConectados, true),
            ])
            ->values();

        return response()->json([
            'activo' => TiempoReal::estaActivo(),
            // Falso con Reverb parado: entonces «conectada» no significa
            // nada, y la interfaz lo dice en vez de pintar a todos en gris.
            'seSabeQuienEstaConectado' => $idsConectados !== null,
            'personas' => $personas,
        ]);
    }

    /**
     * POST /api/admin/tiempo-real/prueba
     *
     * `destinatario` es el id de una persona o `todos` (el equipo activo).
     * Título y mensaje son opcionales: sin ellos, la interfaz enseña el
     * texto de siempre del aviso de prueba.
     */
    public function enviarPrueba(Request $peticion): JsonResponse
    {
        $this->authorize('probarTiempoReal', User::class);

        $datos = $peticion->validate(
            [
                'destinatario' => ['required', 'string'],
                'titulo' => ['nullable', 'string', 'max:80'],
                'mensaje' => ['nullable', 'string', 'max:300'],
            ],
            [
                'destinatario.required' => 'Elige a quién mandar el aviso.',
                'titulo.max' => 'El título no puede pasar de 80 caracteres.',
                'mensaje.max' => 'El mensaje no puede pasar de 300 caracteres.',
            ],
        );

        $consulta = User::query()->where('activo', true);

        if ($datos['destinatario'] !== 'todos') {
            $consulta->whereKey($datos['destinatario']);
        }

        $destinatarios = $consulta->get()->all();

        if ($destinatarios === []) {
            throw ValidationException::withMessages([
                'destinatario' => 'No hay ninguna cuenta activa con ese destinatario.',
            ]);
        }

        /** @var User $remitente */
        $remitente = $peticion->user();

        try {
            TiempoReal::enviarAvisoDePrueba(
                $destinatarios,
                filled($datos['titulo'] ?? null) ? trim($datos['titulo']) : null,
                filled($datos['mensaje'] ?? null) ? trim($datos['mensaje']) : null,
                $remitente,
            );
        } catch (FalloDelTiempoReal $fallo) {
            // 503: el sistema está bien, lo que no está es el servicio de
            // tiempo real. El mensaje ya dice qué revisar.
            return response()->json(['mensaje' => $fallo->getMessage()], 503);
        }

        $cantidad = count($destinatarios);

        return response()->json([
            'enviados' => $cantidad,
            'mensaje' => $cantidad === 1
                ? 'Aviso enviado a '.$destinatarios[0]->nombreParaMostrar().'.'
                : "Aviso enviado a {$cantidad} personas.",
        ]);
    }
}
