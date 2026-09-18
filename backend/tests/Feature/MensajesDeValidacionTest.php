<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Lang;
use Tests\TestCase;

/**
 * Pruebas de los mensajes de validación: que nunca salga una clave.
 * ---------------------------------------------------------------------
 * El 2026-09-18 el equipo vio «validation.max.string» al crear una
 * propiedad. El sistema corre en español y no había mensajes de
 * validación en español, así que cualquier regla sin mensaje propio
 * enseñaba su clave en el aviso. Aquí se fijan tres cosas:
 *
 *   · Cada regla de Laravel tiene su frase en lang/es/validation.php. Si
 *     una versión nueva de Laravel trae una regla más, la primera prueba
 *     dice cuál.
 *   · El caso real: un logo pegado como data:image/…;base64 explica qué
 *     hacer, en vez de contar caracteres.
 *   · El resumen de varios errores sale entero en español, sin el
 *     «(and 1 more error)» que Laravel añade en inglés.
 */
class MensajesDeValidacionTest extends TestCase
{
    use RefreshDatabase;

    public function test_cada_regla_de_laravel_tiene_su_mensaje_en_espanol(): void
    {
        $mensajesDeFabrica = require base_path(
            'vendor/laravel/framework/src/Illuminate/Translation/lang/en/validation.php',
        );

        // Solo las reglas: `custom` y `attributes` son propias de cada proyecto.
        $clavesDeLasReglas = array_keys(
            Arr::dot(Arr::except($mensajesDeFabrica, ['custom', 'attributes'])),
        );

        // Sin tirar del idioma de reserva: se pregunta por el español y
        // solo por el español, aunque algún día la reserva sea el inglés.
        $clavesSinTraducir = array_values(array_filter(
            $clavesDeLasReglas,
            fn (string $clave): bool => ! Lang::has("validation.{$clave}", 'es', false),
        ));

        $this->assertSame(
            [],
            $clavesSinTraducir,
            'Reglas sin mensaje en lang/es/validation.php: '.implode(', ', $clavesSinTraducir),
        );
    }

    public function test_un_logo_pegado_como_imagen_incrustada_explica_que_hacer(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        // Lo que da «Copiar dirección de la imagen» en Google Imágenes: la
        // imagen entera escrita en base64, con miles de caracteres.
        $imagenPegadaComoTexto = 'data:image/png;base64,'.str_repeat('iVBORw0KGgo', 400);

        $mensajeEsperado =
            'Esa dirección de imagen es demasiado larga para guardarla. Sube la imagen con «Subir imagen».';

        $this->actingAs($comercial)
            ->postJson('/api/propiedades', [
                'nombre' => 'Liga de prueba',
                'logoUrl' => $imagenPegadaComoTexto,
                'asignadaATodos' => true,
            ])
            ->assertStatus(422)
            ->assertJsonPath('errores.logoUrl.0', $mensajeEsperado)
            ->assertJsonPath('mensaje', $mensajeEsperado);

        $this->assertDatabaseCount('propiedades', 0);
    }

    public function test_varios_errores_se_resumen_en_espanol(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial);

        // Dos fallos sin mensaje propio en GuardarPropiedadRequest: el texto
        // sale entero de lang/es, con el nombre legible de cada campo.
        $this->actingAs($comercial)
            ->postJson('/api/propiedades', [
                'nombre' => str_repeat('n', 181),
                'descripcion' => str_repeat('d', 2001),
                'asignadaATodos' => true,
            ])
            ->assertStatus(422)
            ->assertJsonPath('errores.nombre.0', 'El campo nombre no puede tener más de 180 caracteres.')
            ->assertJsonPath('errores.descripcion.0', 'El campo descripción no puede tener más de 2000 caracteres.')
            ->assertJsonPath('mensaje', 'El campo nombre no puede tener más de 180 caracteres. (y 1 error más)');
    }

    private function crearUsuario(RolUsuario $rol): User
    {
        return User::create([
            'name' => 'Usuario de prueba',
            'email' => 'prueba-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            'zona' => null,
            'activo' => true,
        ]);
    }
}
