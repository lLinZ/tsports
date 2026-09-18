<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

/**
 * FalloDelTiempoReal — un aviso que no ha podido salir hacia Reverb.
 * ---------------------------------------------------------------------
 * Su mensaje ya viene en español y dice qué revisar, porque lo enseñan
 * tal cual dos sitios muy distintos: la consola (`tiempo-real:probar`)
 * y la pantalla de pruebas del administrador. Así el diagnóstico se
 * escribe una sola vez, en TiempoReal::enviarAvisoDePrueba().
 */
final class FalloDelTiempoReal extends RuntimeException
{
}
