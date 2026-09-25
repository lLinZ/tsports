<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Events\CambioEnElChat;
use App\Jobs\EnviarMensajeDeChatAlMovil;
use App\Models\Conversacion;
use App\Models\Marca;
use App\Models\MensajeDeChat;
use App\Models\User;
use App\Support\Mensajeria;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * El chat interno: quién lee qué, qué cuenta como sin leer y qué pasa
 * con una marca etiquetada delante de quien no la puede ver.
 * ---------------------------------------------------------------------
 * Las reglas que sostienen el chat, cada una con su prueba:
 *
 *   · Lo de una charla es de quien está dentro. Ni un administrador lee
 *     las de otros.
 *   · Con una persona hay UNA charla directa, la pidas las veces que la
 *     pidas.
 *   · Sin leer = mensajes de otros después de lo último leído. Lo propio
 *     y las líneas de sistema no cuentan.
 *   · Solo se etiquetan marcas que uno puede ver. Quien recibe una que no
 *     ve, recibe el nombre y nada más (regla 6).
 *   · El móvil solo le suena a quien no está delante del panel.
 */
class ChatInternoTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------------
     | Charlas
     |-----------------------------------------------------------------*/

    public function test_con_una_persona_hay_una_sola_charla_directa(): void
    {
        $ana = $this->crearUsuario(RolUsuario::Comercial, 'Ana');
        $pedro = $this->crearUsuario(RolUsuario::Vendedor, 'Pedro');

        $primera = $this->actingAs($ana)
            ->postJson('/api/chat/directas', ['persona' => $pedro->id])
            ->assertOk()
            ->assertJsonPath('data.nombre', 'Pedro')
            ->json('data.id');

        // La misma, la pida quien la pida.
        $this->actingAs($ana)->postJson('/api/chat/directas', ['persona' => $pedro->id])
            ->assertJsonPath('data.id', $primera);
        $this->actingAs($pedro)->postJson('/api/chat/directas', ['persona' => $ana->id])
            ->assertJsonPath('data.id', $primera)
            ->assertJsonPath('data.nombre', 'Ana');

        $this->assertSame(1, Conversacion::query()->count());
    }

    public function test_no_se_abre_charla_con_uno_mismo_ni_con_una_cuenta_desactivada(): void
    {
        $ana = $this->crearUsuario(RolUsuario::Comercial, 'Ana');
        $desactivada = $this->crearUsuario(RolUsuario::Vendedor, 'Ya no está');
        $desactivada->update(['activo' => false]);

        $this->actingAs($ana)->postJson('/api/chat/directas', ['persona' => $ana->id])
            ->assertUnprocessable();

        $this->actingAs($ana)->postJson('/api/chat/directas', ['persona' => $desactivada->id])
            ->assertUnprocessable();
    }

    public function test_solo_quien_esta_dentro_lee_y_escribe_ni_siquiera_un_administrador(): void
    {
        $ana = $this->crearUsuario(RolUsuario::Comercial, 'Ana');
        $pedro = $this->crearUsuario(RolUsuario::Vendedor, 'Pedro');
        $administrador = $this->crearUsuario(RolUsuario::Admin, 'Jefa');

        $charla = $this->abrirDirecta($ana, $pedro);
        $this->escribir($ana, $charla, 'Algo entre nosotros');

        $this->actingAs($administrador)
            ->getJson("/api/chat/conversaciones/{$charla}/mensajes")
            ->assertForbidden();

        $this->actingAs($administrador)
            ->postJson("/api/chat/conversaciones/{$charla}/mensajes", ['cuerpo' => 'Me cuelo'])
            ->assertForbidden();

        // Y ni aparece en su lista.
        $this->actingAs($administrador)
            ->getJson('/api/chat/conversaciones')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    /* ------------------------------------------------------------------
     | Sin leer y leído
     |-----------------------------------------------------------------*/

    public function test_lo_nuevo_de_otros_cuenta_como_sin_leer_hasta_que_se_lee(): void
    {
        $ana = $this->crearUsuario(RolUsuario::Comercial, 'Ana');
        $pedro = $this->crearUsuario(RolUsuario::Vendedor, 'Pedro');

        $charla = $this->abrirDirecta($ana, $pedro);
        $this->escribir($ana, $charla, 'Hola');
        $ultimo = $this->escribir($ana, $charla, '¿Llamaste a Leti?');

        // A quien escribe no le cuenta lo suyo.
        $this->actingAs($ana)->postJson('/api/chat/latido', ['visible' => true])
            ->assertJsonPath('sinLeer', 0);

        $this->actingAs($pedro)->postJson('/api/chat/latido', ['visible' => true])
            ->assertJsonPath('sinLeer', 2)
            ->assertJsonPath('ultimoMensajeId', $ultimo);

        $this->actingAs($pedro)->getJson('/api/chat/conversaciones')
            ->assertJsonPath('data.0.sinLeer', 2)
            ->assertJsonPath('data.0.ultimoMensaje.texto', '¿Llamaste a Leti?');

        // Hasta que Pedro no lo lee, Ana no ve el doble check.
        $this->actingAs($ana)->getJson("/api/chat/conversaciones/{$charla}/mensajes")
            ->assertJsonPath('leidoPorLosDemasHasta', 0);

        $this->actingAs($pedro)
            ->postJson("/api/chat/conversaciones/{$charla}/leido", ['hasta' => $ultimo])
            ->assertJsonPath('leidoHasta', $ultimo);

        $this->actingAs($pedro)->postJson('/api/chat/latido')->assertJsonPath('sinLeer', 0);
        $this->actingAs($ana)->getJson("/api/chat/conversaciones/{$charla}/mensajes")
            ->assertJsonPath('leidoPorLosDemasHasta', $ultimo);
    }

    public function test_leido_nunca_va_hacia_atras_ni_mas_alla_del_ultimo_mensaje(): void
    {
        $ana = $this->crearUsuario(RolUsuario::Comercial, 'Ana');
        $pedro = $this->crearUsuario(RolUsuario::Vendedor, 'Pedro');

        $charla = $this->abrirDirecta($ana, $pedro);
        $primero = $this->escribir($ana, $charla, 'Uno');
        $segundo = $this->escribir($ana, $charla, 'Dos');

        // Un número inventado no deja leído lo que aún no ha llegado.
        $this->actingAs($pedro)
            ->postJson("/api/chat/conversaciones/{$charla}/leido", ['hasta' => 999999])
            ->assertJsonPath('leidoHasta', $segundo);

        // Una pestaña vieja que avisa de algo anterior no lo deshace.
        $this->actingAs($pedro)
            ->postJson("/api/chat/conversaciones/{$charla}/leido", ['hasta' => $primero])
            ->assertJsonPath('leidoHasta', $segundo);

        $tercero = $this->escribir($ana, $charla, 'Tres');

        $this->actingAs($pedro)->postJson('/api/chat/latido')->assertJsonPath('sinLeer', 1);
        $this->assertGreaterThan($segundo, $tercero);
    }

    public function test_se_pide_solo_lo_nuevo_y_lo_anterior_sin_saltarse_nada(): void
    {
        $ana = $this->crearUsuario(RolUsuario::Comercial, 'Ana');
        $pedro = $this->crearUsuario(RolUsuario::Vendedor, 'Pedro');

        $charla = $this->abrirDirecta($ana, $pedro);

        // Por el servicio y no por la ruta: la ruta tiene un tope de 40
        // mensajes por minuto, que es justo lo que no se prueba aquí.
        $ids = [];
        for ($numero = 1; $numero <= 45; $numero++) {
            $conversacion = Conversacion::query()->findOrFail($charla);
            $ids[] = app(Mensajeria::class)->enviar($conversacion, $ana, "Mensaje {$numero}")->id;
        }

        // Los últimos 40, del más viejo al más nuevo.
        $ultimos = $this->actingAs($pedro)->getJson("/api/chat/conversaciones/{$charla}/mensajes")
            ->assertJsonPath('hayMasAntiguos', true);
        $this->assertSame(array_slice($ids, 5), array_column($ultimos->json('data'), 'id'));

        // Al subir, los cinco que faltaban y ninguno más.
        $anteriores = $this->actingAs($pedro)->getJson("/api/chat/conversaciones/{$charla}/mensajes?antesDe={$ids[5]}")
            ->assertJsonPath('hayMasAntiguos', false);
        $this->assertSame(array_slice($ids, 0, 5), array_column($anteriores->json('data'), 'id'));

        // Lo nuevo desde uno concreto.
        $nuevos = $this->actingAs($pedro)->getJson("/api/chat/conversaciones/{$charla}/mensajes?despuesDe={$ids[42]}");
        $this->assertSame(array_slice($ids, 43), array_column($nuevos->json('data'), 'id'));
    }

    /* ------------------------------------------------------------------
     | Marcas etiquetadas
     |-----------------------------------------------------------------*/

    public function test_un_agente_no_puede_etiquetar_una_marca_que_no_ve(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Agente');
        $otroAgente = $this->crearUsuario(RolUsuario::Vendedor, 'Otro agente');

        $ajena = Marca::create(['nombre_marca' => 'Ajena', 'vendedor_asignado_id' => $otroAgente->id]);

        $charla = $this->abrirDirecta($agente, $otroAgente);

        $this->actingAs($agente)
            ->postJson("/api/chat/conversaciones/{$charla}/mensajes", ['cuerpo' => "Mira [[marca:{$ajena->id}]]"])
            ->assertUnprocessable()
            ->assertJsonPath('errores.cuerpo.0', 'Una de las marcas etiquetadas no existe o no la puedes ver.');

        $this->assertSame(0, MensajeDeChat::query()->count());
    }

    public function test_quien_no_ve_la_marca_recibe_el_nombre_sin_logo_ni_enlace(): void
    {
        $comercial = $this->crearUsuario(RolUsuario::Comercial, 'Comercial');
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Agente');

        $marca = Marca::create([
            'nombre_marca' => 'Polar',
            'logo_url' => '/storage/logos/polar.png',
            'vendedor_asignado_id' => null,
        ]);

        $charla = $this->abrirDirecta($comercial, $agente);
        $this->escribir($comercial, $charla, "¿Te encargas de [[marca:{$marca->id}]]?");

        // Quien la ve: logo y enlace a la ficha.
        $this->actingAs($comercial)->getJson("/api/chat/conversaciones/{$charla}/mensajes")
            ->assertJsonPath('data.0.marcas.0.nombre', 'Polar')
            ->assertJsonPath('data.0.marcas.0.logoUrl', '/storage/logos/polar.png')
            ->assertJsonPath('data.0.marcas.0.enlace', "/marcas?abrir={$marca->id}");

        // El agente no la ve (no es suya): solo el nombre que le contaron.
        $marca->update(['nombre_marca' => 'Polar renombrada']);

        $this->actingAs($agente)->getJson("/api/chat/conversaciones/{$charla}/mensajes")
            ->assertJsonPath('data.0.marcas.0.nombre', 'Polar')
            ->assertJsonPath('data.0.marcas.0.logoUrl', null)
            ->assertJsonPath('data.0.marcas.0.enlace', null);

        // En la lista de charlas, la marca sale como «#Nombre».
        $this->actingAs($agente)->getJson('/api/chat/conversaciones')
            ->assertJsonPath('data.0.ultimoMensaje.texto', '¿Te encargas de #Polar?');
    }

    public function test_el_buscador_de_marcas_solo_ofrece_las_que_uno_ve(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Agente');
        $otroAgente = $this->crearUsuario(RolUsuario::Vendedor, 'Otro agente');

        Marca::create(['nombre_marca' => 'Leti mía', 'vendedor_asignado_id' => $agente->id]);
        Marca::create(['nombre_marca' => 'Leti ajena', 'vendedor_asignado_id' => $otroAgente->id]);

        $this->actingAs($agente)->getJson('/api/marcas/sugerencias?q=leti')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.nombre', 'Leti mía');
    }

    /* ------------------------------------------------------------------
     | Grupos
     |-----------------------------------------------------------------*/

    public function test_un_grupo_se_crea_se_amplia_y_se_vacia(): void
    {
        $ana = $this->crearUsuario(RolUsuario::Comercial, 'Ana');
        $pedro = $this->crearUsuario(RolUsuario::Vendedor, 'Pedro');
        $luisa = $this->crearUsuario(RolUsuario::Vendedor, 'Luisa');

        $grupo = $this->actingAs($ana)
            ->postJson('/api/chat/grupos', ['nombre' => 'Zona Centro', 'personas' => [$pedro->id]])
            ->assertCreated()
            ->assertJsonPath('data.esGrupo', true)
            ->assertJsonPath('data.nombre', 'Zona Centro')
            ->assertJsonCount(2, 'data.participantes')
            ->json('data.id');

        $this->escribir($ana, $grupo, 'Bienvenidos');

        // Quien entra después ve lo anterior, pero no le sale como pendiente.
        $this->actingAs($pedro)
            ->postJson("/api/chat/conversaciones/{$grupo}/personas", ['personas' => [$luisa->id]])
            ->assertOk()
            ->assertJsonCount(3, 'data.participantes');

        $this->actingAs($luisa)->postJson('/api/chat/latido')->assertJsonPath('sinLeer', 0);
        $mensajesDeLuisa = $this->actingAs($luisa)->getJson("/api/chat/conversaciones/{$grupo}/mensajes")->json('data');
        $this->assertContains('Bienvenidos', array_column($mensajesDeLuisa, 'cuerpo'));
        $this->assertContains('Pedro añadió a Luisa', array_column($mensajesDeLuisa, 'cuerpo'));

        // Salirse uno mismo; y el último que sale se lleva el grupo.
        $this->actingAs($luisa)->deleteJson("/api/chat/conversaciones/{$grupo}/personas/{$luisa->id}")->assertOk();
        $this->actingAs($luisa)->getJson("/api/chat/conversaciones/{$grupo}/mensajes")->assertForbidden();

        $this->actingAs($ana)->deleteJson("/api/chat/conversaciones/{$grupo}/personas/{$pedro->id}")->assertOk();
        $this->actingAs($ana)->deleteJson("/api/chat/conversaciones/{$grupo}/personas/{$ana->id}")->assertOk();

        $this->assertNull(Conversacion::query()->find($grupo));
    }

    public function test_un_grupo_sin_nombre_se_llama_como_quienes_estan(): void
    {
        $ana = $this->crearUsuario(RolUsuario::Comercial, 'Ana Torres');
        $pedro = $this->crearUsuario(RolUsuario::Vendedor, 'Pedro Gil');
        $luisa = $this->crearUsuario(RolUsuario::Vendedor, 'Luisa Mar');

        // Quien lo crea primero; los demás, por orden alfabético.
        $this->actingAs($ana)
            ->postJson('/api/chat/grupos', ['personas' => [$pedro->id, $luisa->id]])
            ->assertCreated()
            ->assertJsonPath('data.nombre', 'Ana, Luisa y Pedro');

        $this->actingAs($ana)
            ->postJson('/api/chat/grupos', ['nombre' => '   ', 'personas' => [$pedro->id]])
            ->assertCreated()
            ->assertJsonPath('data.nombre', 'Ana y Pedro');

        $masGente = collect(['Beto', 'Carla', 'Dani', 'Eva'])
            ->map(fn (string $nombre): string => $this->crearUsuario(RolUsuario::Vendedor, $nombre)->id);

        $this->actingAs($ana)
            ->postJson('/api/chat/grupos', ['personas' => $masGente->push($pedro->id)->all()])
            ->assertCreated()
            ->assertJsonPath('data.nombre', 'Ana, Beto, Carla y 3 más');
    }

    public function test_una_charla_directa_no_se_renombra_ni_se_amplia(): void
    {
        $ana = $this->crearUsuario(RolUsuario::Comercial, 'Ana');
        $pedro = $this->crearUsuario(RolUsuario::Vendedor, 'Pedro');
        $luisa = $this->crearUsuario(RolUsuario::Vendedor, 'Luisa');

        $charla = $this->abrirDirecta($ana, $pedro);

        $this->actingAs($ana)->patchJson("/api/chat/conversaciones/{$charla}", ['nombre' => 'Otro'])
            ->assertForbidden();
        $this->actingAs($ana)->postJson("/api/chat/conversaciones/{$charla}/personas", ['personas' => [$luisa->id]])
            ->assertForbidden();
    }

    /* ------------------------------------------------------------------
     | Presencia, tiempo real y móvil
     |-----------------------------------------------------------------*/

    public function test_en_linea_mientras_el_panel_esta_a_la_vista(): void
    {
        $ana = $this->crearUsuario(RolUsuario::Comercial, 'Ana');
        $pedro = $this->crearUsuario(RolUsuario::Vendedor, 'Pedro');

        $this->actingAs($pedro)->postJson('/api/chat/latido', ['visible' => true]);

        $this->actingAs($ana)->getJson('/api/chat/personas')
            ->assertJsonPath('data.0.nombre', 'Pedro')
            ->assertJsonPath('data.0.enLinea', true);

        // Al esconder la pestaña se despide, y deja de estar en el acto.
        $this->actingAs($pedro)->postJson('/api/chat/latido', ['visible' => false]);

        $this->actingAs($ana)->getJson('/api/chat/personas')
            ->assertJsonPath('data.0.enLinea', false);

        // Y si deja de avisar, caduca solo.
        $this->actingAs($pedro)->postJson('/api/chat/latido', ['visible' => true]);
        $this->travel(2)->minutes();

        $this->actingAs($ana)->getJson('/api/chat/personas')
            ->assertJsonPath('data.0.enLinea', false);
    }

    public function test_con_tiempo_real_cada_mensaje_se_avisa_a_toda_la_charla(): void
    {
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'clave-de-prueba',
        ]);
        Event::fake([CambioEnElChat::class]);

        $ana = $this->crearUsuario(RolUsuario::Comercial, 'Ana');
        $pedro = $this->crearUsuario(RolUsuario::Vendedor, 'Pedro');

        $charla = $this->abrirDirecta($ana, $pedro);
        $this->escribir($ana, $charla, 'Hola');

        Event::assertDispatched(
            CambioEnElChat::class,
            fn (CambioEnElChat $aviso): bool => $aviso->tipo === CambioEnElChat::TIPO_MENSAJE
                && $aviso->idDeLaConversacion === $charla
                && count(array_intersect($aviso->idsDeDestinatarios, [$ana->id, $pedro->id])) === 2,
        );
    }

    public function test_el_movil_solo_le_suena_a_quien_no_esta_delante(): void
    {
        config([
            'push.vapid.clave_publica' => 'clave-publica-de-prueba',
            'push.vapid.clave_privada' => 'clave-privada-de-prueba',
        ]);
        Queue::fake();

        $ana = $this->crearUsuario(RolUsuario::Comercial, 'Ana');
        $pedro = $this->crearUsuario(RolUsuario::Vendedor, 'Pedro');
        $luisa = $this->crearUsuario(RolUsuario::Vendedor, 'Luisa');

        $grupo = $this->actingAs($ana)
            ->postJson('/api/chat/grupos', ['nombre' => 'Equipo', 'personas' => [$pedro->id, $luisa->id]])
            ->json('data.id');

        // Pedro está con el panel delante; Luisa no.
        $this->actingAs($pedro)->postJson('/api/chat/latido', ['visible' => true]);

        $idDelMensaje = $this->escribir($ana, $grupo, 'Reunión a las tres');

        // Las líneas de sistema («Ana creó el grupo») no se encolan.
        Queue::assertPushed(EnviarMensajeDeChatAlMovil::class, 1);

        $mensaje = MensajeDeChat::query()->findOrFail($idDelMensaje);

        $this->assertSame([$luisa->id], (new EnviarMensajeDeChatAlMovil($idDelMensaje))->aQuienesLesSuena($mensaje));
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function abrirDirecta(User $una, User $otra): string
    {
        return (string) $this->actingAs($una)
            ->postJson('/api/chat/directas', ['persona' => $otra->id])
            ->assertOk()
            ->json('data.id');
    }

    private function escribir(User $autor, string $idDeLaCharla, string $texto): int
    {
        return (int) $this->actingAs($autor)
            ->postJson("/api/chat/conversaciones/{$idDeLaCharla}/mensajes", ['cuerpo' => $texto])
            ->assertCreated()
            ->json('data.id');
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
