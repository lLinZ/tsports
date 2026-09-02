<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\TemaInterfaz;
use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoUsuario;
use App\Models\RegistroActividad;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * MiPerfilController — los datos y la apariencia de la propia cuenta.
 * ---------------------------------------------------------------------
 * Equivale a la antigua página `perfil.html`, pero con una diferencia
 * importante: las preferencias visuales (tema claro/oscuro y color de
 * acento) se guardan en el servidor, no en el navegador.
 *
 * Esa decisión es la que hace que el tema sea de verdad "persistente por
 * usuario": si alguien entra desde otro ordenador, o desde el móvil, se
 * encuentra su sistema tal y como lo dejó. El navegador solo mantiene
 * una copia en localStorage para poder pintar el tema correcto antes de
 * que React arranque y evitar el destello blanco al recargar.
 *
 * El rol y la zona NO se pueden cambiar desde aquí: son competencia de
 * un administrador (ver UsuarioController y UserPolicy).
 */
class MiPerfilController extends Controller
{
    /**
     * GET /api/mi-perfil
     */
    public function show(Request $peticion): RecursoUsuario
    {
        /** @var User $usuario */
        $usuario = $peticion->user();

        return new RecursoUsuario($usuario);
    }

    /**
     * PUT /api/mi-perfil
     * Nombre, correo de acceso y avatar. La contraseña tiene su propio
     * endpoint porque exige confirmar la actual.
     */
    public function update(Request $peticion): RecursoUsuario
    {
        /** @var User $usuario */
        $usuario = $peticion->user();

        $datos = $peticion->validate([
            'nombre' => ['sometimes', 'string', 'max:120'],
            'email' => [
                'sometimes',
                'email:filter',
                'max:180',
                Rule::unique('users', 'email')->ignore($usuario->id),
            ],
            'urlAvatar' => ['nullable', 'string', 'max:2048'],
        ], [
            'email.unique' => 'Ese correo ya lo usa otra cuenta.',
            'email.email' => 'Ese correo no tiene un formato válido.',
        ]);

        if (array_key_exists('nombre', $datos)) {
            $usuario->name = trim($datos['nombre']);
        }

        if (array_key_exists('email', $datos)) {
            $usuario->email = mb_strtolower(trim($datos['email']));
        }

        if (array_key_exists('urlAvatar', $datos)) {
            $usuario->url_avatar = $datos['urlAvatar'];
        }

        $usuario->save();

        RegistroActividad::anotar(
            $usuario,
            RegistroActividad::ACCION_ACTUALIZO,
            'usuario',
            $usuario->id,
            'Actualizó sus datos de perfil',
        );

        return new RecursoUsuario($usuario->fresh());
    }

    /**
     * PUT /api/mi-perfil/apariencia
     * Tema y color de acento.
     *
     * Va aparte del resto del perfil porque se llama con mucha más
     * frecuencia (cada vez que alguien pulsa el interruptor de tema) y
     * conviene que sea una petición pequeña y sin validaciones caras.
     */
    public function actualizarApariencia(Request $peticion): RecursoUsuario
    {
        /** @var User $usuario */
        $usuario = $peticion->user();

        $datos = $peticion->validate([
            'tema' => ['sometimes', Rule::in(TemaInterfaz::valores())],
            // Hexadecimal de 6 dígitos: es lo que el frontend convierte a
            // la rampa completa de color de HeroUI.
            'colorAcento' => ['sometimes', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ], [
            'tema.in' => 'El tema debe ser claro, oscuro o automático.',
            'colorAcento.regex' => 'El color debe ser un hexadecimal de 6 dígitos, por ejemplo #1b9aaa.',
        ]);

        if (array_key_exists('tema', $datos)) {
            $usuario->tema = TemaInterfaz::from($datos['tema']);
        }

        if (array_key_exists('colorAcento', $datos)) {
            $usuario->color_acento = mb_strtolower($datos['colorAcento']);
        }

        $usuario->save();

        return new RecursoUsuario($usuario->fresh());
    }
}
