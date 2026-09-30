<?php

namespace Tests;

use App\Events\CambioEnLosDatos;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Event;

/**
 * Base de todas las pruebas.
 * ---------------------------------------------------------------------
 * El aviso de «cambiaron los datos» (CambiosEnVivo, regla 22) sale al
 * terminar CADA petición en la que se guardó algo, y las pruebas que
 * encienden Reverb crean cuentas y marcas antes de pedir nada. Sin esto,
 * cada una de esas pruebas intentaba conectarse a un Reverb que no
 * existe y esperaba un par de segundos a que fallara. Se intercepta
 * siempre: las pruebas que miran a quién le llega (CambiosEnVivoTest) lo
 * leen de aquí mismo con Event::assertDispatched.
 *
 * Ojo: una prueba que llame a Event::fake([...]) por su cuenta SUSTITUYE
 * esta intercepción. Tiene que llevar CambioEnLosDatos en su lista; si
 * no, sigue pasando, pero vuelve a esperar a Reverb.
 */
abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Event::fake([CambioEnLosDatos::class]);
    }
}
