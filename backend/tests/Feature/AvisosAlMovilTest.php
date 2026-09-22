<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\RolUsuario;
use App\Jobs\EnviarAvisoPush;
use App\Models\Marca;
use App\Models\Notificacion;
use App\Models\SuscripcionPush;
use App\Models\User;
use App\Support\Notificador;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * Los avisos al móvil con el panel cerrado.
 * ---------------------------------------------------------------------
 * Aquí se fijan las cuatro reglas que sostienen el push:
 *
 *   1. La libreta de direcciones es de cada quien. Nadie registra ni
 *      borra el dispositivo de otro.
 *   2. Un dispositivo pertenece a QUIEN LO ESTÁ USANDO. Si en el mismo
 *      ordenador entra otra persona, la suscripción se reasigna en vez
 *      de duplicarse; si no, al siguiente en entrar le sonarían los
 *      avisos del anterior.
 *   3. El envío va POR LA COLA, nunca dentro de la petición. Cada push
 *      es un viaje de red a un servidor de otro, por dispositivo.
 *   4. Sin claves VAPID no se encola nada, y aun así el aviso se guarda
 *      igual: el push es una salida más de la campanita, nunca la única.
 */
class AvisosAlMovilTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Por defecto, el push encendido. Las claves son inventadas: en
        // estas pruebas nunca se llega a firmar nada, solo se comprueba
        // que el trabajo se encola y a nombre de quién.
        config([
            'push.vapid.clave_publica' => 'clave-publica-de-prueba',
            'push.vapid.clave_privada' => 'clave-privada-de-prueba',
        ]);
    }

    /* ------------------------------------------------------------------
     | La libreta de direcciones
     |-----------------------------------------------------------------*/

    public function test_cada_quien_registra_su_dispositivo(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);

        $this->actingAs($agente)
            ->postJson('/api/push/suscripciones', $this->datosDelNavegador())
            ->assertOk();

        $this->assertDatabaseHas('suscripciones_push', [
            'usuario_id' => $agente->id,
            'endpoint' => 'https://fcm.googleapis.com/fcm/send/el-movil-del-agente',
        ]);
    }

    /**
     * El caso del ordenador compartido de la oficina.
     *
     * El endpoint identifica al NAVEGADOR, no a la persona. Si se
     * guardara una fila por cada quien, a la segunda persona que entrase
     * le llegarían también los avisos de la primera —nombres de marcas
     * incluidos—, que es justo lo que la regla 6 no permite.
     */
    public function test_el_mismo_navegador_cambia_de_dueno_al_entrar_otra_persona(): void
    {
        $primera = $this->crearUsuario(RolUsuario::Vendedor, 'Primera');
        $segunda = $this->crearUsuario(RolUsuario::Vendedor, 'Segunda');

        $this->actingAs($primera)
            ->postJson('/api/push/suscripciones', $this->datosDelNavegador())
            ->assertOk();

        $this->actingAs($segunda)
            ->postJson('/api/push/suscripciones', $this->datosDelNavegador())
            ->assertOk();

        $this->assertSame(1, SuscripcionPush::query()->count());

        $this->assertDatabaseHas('suscripciones_push', [
            'usuario_id' => $segunda->id,
        ]);

        $this->assertDatabaseMissing('suscripciones_push', [
            'usuario_id' => $primera->id,
        ]);
    }

    public function test_nadie_da_de_baja_el_dispositivo_de_otro(): void
    {
        $dueno = $this->crearUsuario(RolUsuario::Vendedor, 'Dueño');
        $ajeno = $this->crearUsuario(RolUsuario::Vendedor, 'Ajeno');

        $this->actingAs($dueno)
            ->postJson('/api/push/suscripciones', $this->datosDelNavegador())
            ->assertOk();

        // Conoce la dirección y aun así no puede quitarla.
        $this->actingAs($ajeno)
            ->deleteJson('/api/push/suscripciones', [
                'endpoint' => 'https://fcm.googleapis.com/fcm/send/el-movil-del-agente',
            ])
            ->assertOk();

        $this->assertSame(1, SuscripcionPush::query()->count());

        // El dueño sí.
        $this->actingAs($dueno)
            ->deleteJson('/api/push/suscripciones', [
                'endpoint' => 'https://fcm.googleapis.com/fcm/send/el-movil-del-agente',
            ])
            ->assertOk();

        $this->assertSame(0, SuscripcionPush::query()->count());
    }

    public function test_sin_sesion_no_se_registra_ningun_dispositivo(): void
    {
        $this->postJson('/api/push/suscripciones', $this->datosDelNavegador())
            ->assertUnauthorized();
    }

    /**
     * Un endpoint que no es https se rechaza.
     *
     * Los servicios de entrega solo dan direcciones https. Admitir otra
     * cosa sería dejar que alguien apuntase los avisos de su propia
     * cuenta a un servidor suyo para leerlos con calma.
     */
    public function test_la_direccion_de_entrega_tiene_que_ser_segura(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);

        $this->actingAs($agente)
            ->postJson('/api/push/suscripciones', [
                ...$this->datosDelNavegador(),
                'endpoint' => 'http://servidor-de-alguien.test/recoger',
            ])
            ->assertStatus(422)
            // La forma del error es la de la casa (ver bootstrap/app.php):
            // `errores`, no el `errors` de fábrica de Laravel.
            ->assertJsonStructure(['errores' => ['endpoint']]);
    }

    /* ------------------------------------------------------------------
     | El envío
     |-----------------------------------------------------------------*/

    public function test_el_aviso_al_movil_sale_por_la_cola(): void
    {
        Queue::fake();

        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Agente');

        $marca = $this->crearMarca('Marca para asignar');

        app(Notificador::class)->avisarSiCambioElAgente(
            tap($marca)->update(['vendedor_asignado_id' => $agente->id]),
            null,
            $comercial,
        );

        // La notificación ya está guardada ANTES de que la cola haga
        // nada: es lo que garantiza que el aviso no se pierde aunque no
        // haya trabajador.
        $this->assertSame(1, Notificacion::query()->where('destinatario_id', $agente->id)->count());

        Queue::assertPushed(EnviarAvisoPush::class, 1);
    }

    /**
     * Sin claves VAPID no se encola nada.
     *
     * La tabla `jobs` no se llena de trabajos que solo van a comprobar
     * que el push está apagado y devolverse a sí mismos. Y, sobre todo,
     * el aviso se guarda igual.
     */
    public function test_con_el_push_apagado_el_aviso_se_guarda_pero_no_se_encola(): void
    {
        Queue::fake();

        config(['push.vapid.clave_publica' => '', 'push.vapid.clave_privada' => '']);

        $comercial = $this->crearUsuario(RolUsuario::Comercial);
        $agente = $this->crearUsuario(RolUsuario::Vendedor, 'Agente');

        $marca = $this->crearMarca('Marca para asignar');

        app(Notificador::class)->avisarSiCambioElAgente(
            tap($marca)->update(['vendedor_asignado_id' => $agente->id]),
            null,
            $comercial,
        );

        $this->assertSame(1, Notificacion::query()->where('destinatario_id', $agente->id)->count());

        Queue::assertNothingPushed();
    }

    /**
     * El trabajo no hace sonar un teléfono por un aviso ya leído.
     *
     * Entre encolar y enviar pasa un rato. Si la persona tenía el panel
     * abierto, ya lo vio en la campanita y el aviso llega tarde y de más.
     */
    public function test_no_se_empuja_un_aviso_que_ya_se_leyo(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);

        SuscripcionPush::create([
            'usuario_id' => $agente->id,
            'endpoint' => 'https://fcm.googleapis.com/fcm/send/el-movil-del-agente',
            'clave_p256dh' => 'clave-de-cifrado',
            'clave_auth' => 'clave-de-autenticacion',
        ]);

        $notificacion = Notificacion::create([
            'destinatario_id' => $agente->id,
            'tipo' => Notificacion::TIPO_MARCA_ASIGNADA,
            'titulo' => 'Te asignaron una marca',
            'cuerpo' => 'Ya la habías visto.',
            'leida_en' => now(),
        ]);

        // Si intentara enviar, saltaría al firmar con unas claves
        // inventadas. Que termine sin error es la prueba de que ni lo
        // intentó.
        (new EnviarAvisoPush($notificacion->id))->handle();

        $this->assertSame(1, SuscripcionPush::query()->count());
    }

    public function test_el_trabajo_no_falla_si_la_notificacion_ya_no_existe(): void
    {
        (new EnviarAvisoPush('una-notificacion-que-se-borro'))->handle();

        $this->assertTrue(true);
    }

    /* ------------------------------------------------------------------
     | Configuración
     |-----------------------------------------------------------------*/

    public function test_la_interfaz_sabe_si_el_push_esta_encendido(): void
    {
        $agente = $this->crearUsuario(RolUsuario::Vendedor);

        $this->actingAs($agente)
            ->getJson('/api/push')
            ->assertOk()
            ->assertJsonPath('activo', true)
            ->assertJsonPath('clavePublica', 'clave-publica-de-prueba');

        config(['push.vapid.clave_publica' => '', 'push.vapid.clave_privada' => '']);

        // Apagado no se filtra ninguna clave, y la interfaz no llega a
        // pedir permiso para unos avisos que nunca llegarían.
        $this->actingAs($agente)
            ->getJson('/api/push')
            ->assertOk()
            ->assertJsonPath('activo', false)
            ->assertJsonPath('clavePublica', null);
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    /**
     * @return array<string,string>
     */
    private function datosDelNavegador(): array
    {
        return [
            'endpoint' => 'https://fcm.googleapis.com/fcm/send/el-movil-del-agente',
            'p256dh' => 'clave-de-cifrado-del-navegador',
            'auth' => 'clave-de-autenticacion-del-navegador',
            'dispositivo' => 'Chrome en Android',
        ];
    }

    private function crearMarca(string $nombre): Marca
    {
        return Marca::create([
            'nombre_marca' => $nombre,
            'zona' => 'Caracas',
        ]);
    }

    private function crearUsuario(RolUsuario $rol, string $nombre = 'Persona de prueba'): User
    {
        return User::create([
            'name' => $nombre,
            'email' => $rol->value.'-'.uniqid().'@test.test',
            'password' => 'clave-de-prueba',
            'rol' => $rol->value,
            'zona' => null,
            'activo' => true,
        ]);
    }
}
