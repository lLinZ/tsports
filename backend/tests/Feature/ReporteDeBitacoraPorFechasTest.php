<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Models\ComentarioMarca;
use App\Models\Marca;
use App\Models\RegistroActividad;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * El reporte de bitácora por fechas: lo que se escribió entre dos días,
 * agrupado por marca.
 * ---------------------------------------------------------------------
 * Tres cosas que tienen que cumplirse siempre:
 *
 *   · Un día es un día DE QUIEN MIRA. Lo comentado a las nueve de la
 *     noche en Caracas ya es el día siguiente en UTC, que es como se
 *     guarda, y no puede saltar de día en el reporte.
 *   · Sin marcas elegidas es la bitácora de toda la agencia, y eso solo
 *     lo saca el administrador (regla 19). Con marcas, quien pueda verlas
 *     todas; una ajena rechaza la petición entera.
 *   · Sacarlo queda anotado en la auditoría.
 */
class ReporteDeBitacoraPorFechasTest extends TestCase
{
    use RefreshDatabase;

    public function test_el_dia_se_cuenta_en_la_zona_horaria_de_quien_mira(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin, 'Admin');
        $marca = Marca::create(['nombre_marca' => 'Leti']);

        // 25 de septiembre a las 21:00 en Caracas = 26 a la 01:00 en UTC.
        $this->comentarEn($marca, $administrador, 'Llamada de la noche', '2026-09-26 01:00:00');
        // Y una del 24 por la tarde, fuera del rango.
        $this->comentarEn($marca, $administrador, 'Del día anterior', '2026-09-24 18:00:00');

        $this->actingAs($administrador)
            ->getJson('/api/bitacora/reporte?desde=2026-09-25&hasta=2026-09-25&zona=America/Caracas')
            ->assertOk()
            ->assertJsonPath('resumen.totalEntradas', 1)
            ->assertJsonPath('marcas.0.entradas.0.cuerpo', 'Llamada de la noche');

        // Leído en UTC, ese mismo comentario es del 26.
        $this->actingAs($administrador)
            ->getJson('/api/bitacora/reporte?desde=2026-09-25&hasta=2026-09-25&zona=UTC')
            ->assertOk()
            ->assertJsonPath('resumen.totalEntradas', 0);
    }

    public function test_sin_marcas_elegidas_solo_lo_saca_el_administrador(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'Comercial');
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Agente');

        $this->actingAs($comercial)
            ->getJson('/api/bitacora/reporte?desde=2026-09-01&hasta=2026-09-30')
            ->assertForbidden();

        $this->actingAs($agente)
            ->getJson('/api/bitacora/reporte?desde=2026-09-01&hasta=2026-09-30')
            ->assertForbidden();
    }

    public function test_con_marcas_elegidas_cada_una_tiene_que_ser_visible(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Agente');
        $otroAgente = $this->crearUsuario(RolUsuario::Vendedor, 'Otro agente');

        $suya = Marca::create(['nombre_marca' => 'Suya', 'vendedor_asignado_id' => $agente->id]);
        $ajena = Marca::create(['nombre_marca' => 'Ajena', 'vendedor_asignado_id' => $otroAgente->id]);

        $this->comentarEn($suya, $agente, 'Lo mío', '2026-09-10 15:00:00');
        $this->comentarEn($ajena, $otroAgente, 'Lo de otro', '2026-09-10 15:00:00');

        $this->actingAs($agente)
            ->getJson("/api/bitacora/reporte?desde=2026-09-01&hasta=2026-09-30&marcas[]={$suya->id}")
            ->assertOk()
            ->assertJsonPath('alcance', 'seleccion')
            ->assertJsonPath('resumen.totalEntradas', 1)
            ->assertJsonPath('marcas.0.marcaNombre', 'Suya');

        // Colar una ajena entre las suyas no devuelve «las que sí»: se
        // rechaza entera, sin decir cuál sobraba.
        $this->actingAs($agente)
            ->getJson("/api/bitacora/reporte?desde=2026-09-01&hasta=2026-09-30&marcas[]={$suya->id}&marcas[]={$ajena->id}")
            ->assertForbidden();
    }

    public function test_agrupa_por_marca_y_cuelga_cada_respuesta_de_su_entrada(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin, 'Ana Admin');
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'Carlos Comercial');

        $leti = Marca::create(['nombre_marca' => 'Leti']);
        $polar = Marca::create(['nombre_marca' => 'Polar']);

        // Polar tiene más movimiento en el periodo: sale primero.
        $pregunta = $this->comentarEn($polar, $administrador, '¿Mandamos la propuesta?', '2026-09-10 14:00:00');
        $this->comentarEn($polar, $comercial, 'Otra cosa de Polar', '2026-09-10 16:00:00');
        $this->comentarEn($polar, $comercial, 'Sí, hoy mismo', '2026-09-10 15:00:00', $pregunta);
        $this->comentarEn($leti, $comercial, 'Primer contacto', '2026-09-11 14:00:00');

        // Una respuesta a una entrada de ANTES del periodo.
        $vieja = $this->comentarEn($leti, $administrador, 'Pedir el catálogo', '2026-08-20 14:00:00');
        $this->comentarEn($leti, $comercial, 'Ya lo mandaron', '2026-09-12 14:00:00', $vieja);

        $respuesta = $this->actingAs($administrador)
            ->getJson('/api/bitacora/reporte?desde=2026-09-01&hasta=2026-09-30&zona=UTC')
            ->assertOk()
            ->assertJsonPath('resumen.totalEntradas', 5)
            ->assertJsonPath('resumen.totalMarcas', 2)
            ->assertJsonPath('marcas.0.marcaNombre', 'Polar')
            ->assertJsonPath('marcas.1.marcaNombre', 'Leti');

        // La respuesta va justo debajo de su pregunta, antes que lo que se
        // escribió entre medias.
        $this->assertSame(
            ['¿Mandamos la propuesta?', 'Sí, hoy mismo', 'Otra cosa de Polar'],
            array_column($respuesta->json('marcas.0.entradas'), 'cuerpo'),
        );
        $this->assertTrue($respuesta->json('marcas.0.entradas.1.esRespuesta'));

        // La que responde a algo de agosto sale con su contexto.
        $this->assertSame('Ya lo mandaron', $respuesta->json('marcas.1.entradas.1.cuerpo'));
        $this->assertSame('Ana Admin', $respuesta->json('marcas.1.entradas.1.respondeA.autorNombre'));
        $this->assertSame('Pedir el catálogo', $respuesta->json('marcas.1.entradas.1.respondeA.extracto'));
    }

    public function test_una_entrada_eliminada_sale_sin_texto_y_con_quien_la_quito(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin, 'Admin');
        $marca = Marca::create(['nombre_marca' => 'Leti']);

        $entrada = $this->comentarEn($marca, $administrador, 'Algo incómodo', '2026-09-10 14:00:00');
        $entrada->eliminarDejandoRastro($administrador);

        $this->actingAs($administrador)
            ->getJson('/api/bitacora/reporte?desde=2026-09-01&hasta=2026-09-30')
            ->assertOk()
            ->assertJsonPath('resumen.totalEntradas', 1)
            ->assertJsonPath('marcas.0.entradas.0.eliminado', true)
            ->assertJsonPath('marcas.0.entradas.0.cuerpo', '')
            ->assertJsonPath('marcas.0.entradas.0.eliminadoPorNombre', 'Admin');
    }

    public function test_sacar_el_reporte_queda_en_la_auditoria(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin, 'Admin');

        $this->actingAs($administrador)
            ->getJson('/api/bitacora/reporte?desde=2026-09-01&hasta=2026-09-30')
            ->assertOk();

        $anotacion = RegistroActividad::query()->latest('created_at')->first();

        $this->assertNotNull($anotacion);
        $this->assertSame(RegistroActividad::ACCION_EXPORTO, $anotacion->accion);
        $this->assertStringContainsString('01/09/2026 al 30/09/2026', $anotacion->descripcion);
    }

    public function test_la_fecha_final_no_puede_ser_anterior_a_la_inicial(): void
    {
        $administrador = $this->crearUsuario(RolUsuario::Admin, 'Admin');

        $this->actingAs($administrador)
            ->getJson('/api/bitacora/reporte?desde=2026-09-30&hasta=2026-09-01')
            ->assertUnprocessable()
            ->assertJsonPath('errores.hasta.0', 'La fecha final no puede ser anterior a la inicial.');
    }

    private function comentarEn(
        Marca $marca,
        User $autor,
        string $texto,
        string $fechaUtc,
        ?ComentarioMarca $respondiendoA = null,
    ): ComentarioMarca {
        $this->travelTo(CarbonImmutable::parse($fechaUtc, 'UTC'));

        $comentario = ComentarioMarca::create([
            'marca_id' => $marca->id,
            'comentario_padre_id' => $respondiendoA?->id,
            'autor_id' => $autor->id,
            'autor_nombre' => $autor->nombreParaMostrar(),
            'cuerpo' => $texto,
        ]);

        $this->travelBack();

        return $comentario;
    }

    private function crearUsuario(RolUsuario $rol, string $nombre): User
    {
        return User::create([
            'name' => $nombre,
            'email' => strtolower(str_replace(' ', '.', $nombre)).'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            'zona' => null,
            'activo' => true,
        ]);
    }
}
