<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Foundation\Validation\ValidatesRequests;

/**
 * Controller — clase base de todos los controladores de la aplicación.
 * ---------------------------------------------------------------------
 * Desde Laravel 11 la clase base viene vacía, así que los ayudantes que
 * usamos en casi todos los controladores hay que incorporarlos aquí:
 *
 *   · AuthorizesRequests → habilita $this->authorize(...), que consulta
 *     las políticas de App\Policies y lanza un 403 si no hay permiso.
 *   · ValidatesRequests  → habilita $this->validate(...) para las
 *     validaciones cortas que no merecen un FormRequest propio.
 */
abstract class Controller
{
    use AuthorizesRequests;
    use ValidatesRequests;
}
