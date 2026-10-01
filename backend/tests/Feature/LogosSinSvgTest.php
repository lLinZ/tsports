<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\ArchivoMedia;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Un logo o un avatar no puede ser un SVG.
 * ---------------------------------------------------------------------
 * Los logos van al disco público y se sirven desde /storage, en el mismo
 * origen que el panel. Un SVG con un <script> dentro, abierto como
 * página, corre con la sesión de quien lo abre: un agente podría subirlo
 * como logo de una de sus marcas y pasarle el enlace a un administrador
 * por el chat. Ver GuardadoDeArchivos.
 */
class LogosSinSvgTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_agente_no_sube_un_svg_como_logo(): void
    {
        Storage::fake('public');

        $agente = User::create([
            'name' => 'Agente',
            'email' => 'agente@test.test',
            'password' => 'clave-de-prueba',
            'rol' => RolUsuario::Vendedor->value,
            'activo' => true,
        ]);

        $svg = UploadedFile::fake()->createWithContent(
            'logo.svg',
            '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        );

        foreach ([ArchivoMedia::PROPOSITO_LOGO_MARCA, ArchivoMedia::PROPOSITO_AVATAR] as $proposito) {
            $this->actingAs($agente)
                ->post('/api/media', ['archivo' => $svg, 'proposito' => $proposito], ['Accept' => 'application/json'])
                ->assertUnprocessable();
        }

        $this->assertSame(0, ArchivoMedia::query()->count());
        $this->assertSame([], Storage::disk('public')->allFiles());
    }
}
