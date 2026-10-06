/**
 * componentes/crm/VentanaDeContacto.tsx
 * ---------------------------------------------------------------------
 * «Contacté»: la ventana que se abre desde la tarjeta del tablero
 * después de hablar con una marca.
 *
 * Junta en un solo gesto lo que antes eran dos sitios: la entrada en la
 * bitácora (cómo fue y qué se habló) y el siguiente paso (cuándo se
 * retoma, que deja un recordatorio con su aviso de las 08:00). El
 * segundo es lo que se olvidaba, y una marca sin siguiente paso es una
 * marca que nadie va a volver a tocar.
 *
 * Por eso «¿Cuándo lo retomas?» no trae nada elegido: hay que contestar,
 * aunque sea «No hace falta». El tipo sí sale puesto en «Llamada», que
 * es lo más habitual.
 *
 * Los botones «en N días» mandan el número, no una fecha: el día lo
 * cuenta el servidor con el calendario de Caracas (regla 27). Solo «Otro
 * día» manda una fecha, y el servidor la vuelve a validar.
 *
 * Arriba, si la ficha tiene teléfono o correo, los enlaces para hablar
 * con la persona de contacto ahí mismo. Pulsar uno deja elegido su tipo.
 *
 * Y si quien anota tenía un recordatorio de hoy (o vencido) con esta
 * marca, se propone darlo por cumplido: casi siempre es justo la llamada
 * que se acaba de hacer, y si no se cumple se queda en «Para hoy».
 * ---------------------------------------------------------------------
 */
import {
  Button,
  Checkbox,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Textarea,
} from "@heroui/react";
import { Mail, MessageCircle, Phone, PhoneCall, Users } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { BarraDeScrollDibujada } from "@/componentes/comunes/BarraDeScrollDibujada";
import { useAnotarContacto } from "@/hooks/useRecordatorios";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import {
  diaLocalDentroDe,
  enlaceDeWhatsapp,
  formatearDiaAgendado,
  numeroParaWhatsapp,
} from "@/utilidades/formato";
import type { Marca, TipoDeContacto } from "@/tipos/modelos";

/** Los tipos de contacto, con su icono y la nota que deja si no se escribe otra. */
const TIPOS_DE_CONTACTO: Array<{
  valor: TipoDeContacto;
  etiqueta: string;
  icono: ReactNode;
  /** La misma que pone el servidor (TipoDeContacto::notaDelSiguientePaso). */
  notaPorDefecto: string;
}> = [
  { valor: "llamada", etiqueta: "Llamada", icono: <Phone className="size-3.5" />, notaPorDefecto: "Volver a llamar" },
  {
    valor: "whatsapp",
    etiqueta: "WhatsApp",
    icono: <MessageCircle className="size-3.5" />,
    notaPorDefecto: "Volver a escribir por WhatsApp",
  },
  { valor: "reunion", etiqueta: "Reunión", icono: <Users className="size-3.5" />, notaPorDefecto: "Seguimiento de la reunión" },
  { valor: "correo", etiqueta: "Correo", icono: <Mail className="size-3.5" />, notaPorDefecto: "Volver a escribir" },
];

/**
 * Cuándo se retoma. Un número son «N días desde hoy» (los cuenta el
 * servidor); `otro` abre el campo de fecha y `ninguno` es «No hace falta».
 */
type SiguientePaso = 1 | 3 | 7 | 14 | "otro" | "ninguno";

const OPCIONES_DEL_SIGUIENTE_PASO: Array<{ valor: SiguientePaso; etiqueta: string }> = [
  { valor: 1, etiqueta: "Mañana" },
  { valor: 3, etiqueta: "En 3 días" },
  { valor: 7, etiqueta: "En una semana" },
  { valor: 14, etiqueta: "En 2 semanas" },
  { valor: "otro", etiqueta: "Otro día" },
  { valor: "ninguno", etiqueta: "No hace falta" },
];

interface PropiedadesDeVentanaDeContacto {
  /** La marca con la que se habló; null mientras la ventana está cerrada. */
  marca: Marca | null;
  alCerrar: () => void;
}

export function VentanaDeContacto({ marca, alCerrar }: PropiedadesDeVentanaDeContacto) {
  return (
    <Modal
      // Barra de scroll siempre a la vista, como en todas las ventanas de
      // alta y edición (ver BarraDeScrollDibujada).
      classNames={{ body: "barra-de-scroll-fija" }}
      isOpen={marca !== null}
      radius="lg"
      scrollBehavior="inside"
      size="lg"
      onOpenChange={(abierta) => {
        if (!abierta) alCerrar();
      }}
    >
      <ModalContent>
        {/* Se monta de nuevo con cada marca: lo escrito para una no se
            queda puesto al abrir la siguiente. */}
        {marca !== null && <FormularioDeContacto key={marca.id} marca={marca} alTerminar={alCerrar} />}
      </ModalContent>
    </Modal>
  );
}

function FormularioDeContacto({ marca, alTerminar }: { marca: Marca; alTerminar: () => void }) {
  const anotar = useAnotarContacto(marca.id);
  const cuerpoDeLaVentana = useRef<HTMLDivElement>(null);

  const [tipo, establecerTipo] = useState<TipoDeContacto>("llamada");
  const [texto, establecerTexto] = useState("");
  const [siguientePaso, establecerSiguientePaso] = useState<SiguientePaso | null>(null);
  const [otroDia, establecerOtroDia] = useState("");
  const [nota, establecerNota] = useState("");

  // Mi próximo recordatorio en esta marca, si ya tocaba (hoy o vencido).
  const recordatorioQueTocaba =
    marca.miProximoRecordatorio && marca.miProximoRecordatorio.cuando !== "proximo"
      ? marca.miProximoRecordatorio
      : null;
  const [cumplirElQueTocaba, establecerCumplirElQueTocaba] = useState(true);

  // Los avisos de lo que falta salen al intentar guardar, no antes: con
  // la ventana recién abierta, todo en rojo solo asusta.
  const [seIntentoGuardar, establecerSeIntentoGuardar] = useState(false);

  const faltaElTexto = texto.trim() === "";
  const faltaElPaso = siguientePaso === null || (siguientePaso === "otro" && otroDia === "");

  const tipoElegido = TIPOS_DE_CONTACTO.find((opcion) => opcion.valor === tipo) ?? TIPOS_DE_CONTACTO[0];
  const numeroDeWhatsapp = numeroParaWhatsapp(marca.telefonoContacto);

  function guardar() {
    establecerSeIntentoGuardar(true);

    if (faltaElTexto || faltaElPaso) return;

    anotar.mutate(
      {
        tipo,
        cuerpo: texto.trim(),
        retomarEnDias: typeof siguientePaso === "number" ? siguientePaso : null,
        retomarEl: siguientePaso === "otro" ? otroDia : null,
        notaDelSiguientePaso: siguientePaso === "ninguno" ? null : nota.trim() || null,
        recordatorioCumplidoId: recordatorioQueTocaba !== null && cumplirElQueTocaba ? recordatorioQueTocaba.id : null,
      },
      {
        onSuccess: ({ recordatorio }) => {
          // El día lo dice el servidor («mañana», «el 20 oct»), no el
          // reloj de este ordenador.
          avisarDeExito(
            recordatorio === null
              ? "Contacto anotado en la bitácora"
              : `Contacto anotado · lo retomas ${formatearDiaAgendado(recordatorio.fecha, recordatorio.diasHasta)}`,
          );
          alTerminar();
        },
        onError: (error) => avisarDeError(error, "No se pudo anotar el contacto"),
      },
    );
  }

  return (
    <>
      <ModalHeader className="flex flex-col gap-0.5">
        <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <PhoneCall className="size-5 text-primary" />
          <span className="truncate">Contacto con {marca.nombreMarca}</span>
        </span>

        {marca.personaContacto && (
          <span className="text-xs font-normal text-default-500">
            {marca.personaContacto}
            {marca.cargoContacto && ` · ${marca.cargoContacto}`}
          </span>
        )}
      </ModalHeader>

      <ModalBody ref={cuerpoDeLaVentana} className="gap-5 pb-2">
        {/* Hablar con la persona desde aquí, si la ficha tiene cómo. */}
        {(numeroDeWhatsapp !== null || marca.telefonoContacto || marca.emailContacto) && (
          <div className="flex flex-wrap gap-2">
            {numeroDeWhatsapp !== null && (
              <Button
                as="a"
                href={enlaceDeWhatsapp(numeroDeWhatsapp)}
                radius="lg"
                rel="noopener noreferrer"
                size="sm"
                startContent={<MessageCircle className="size-3.5" />}
                target="_blank"
                variant="flat"
                onPress={() => establecerTipo("whatsapp")}
              >
                Abrir WhatsApp
              </Button>
            )}

            {marca.telefonoContacto && (
              <Button
                as="a"
                href={`tel:${marca.telefonoContacto.replace(/[^\d+]/g, "")}`}
                radius="lg"
                size="sm"
                startContent={<Phone className="size-3.5" />}
                variant="flat"
                onPress={() => establecerTipo("llamada")}
              >
                Llamar
              </Button>
            )}

            {marca.emailContacto && (
              <Button
                as="a"
                href={`mailto:${marca.emailContacto}`}
                radius="lg"
                size="sm"
                startContent={<Mail className="size-3.5" />}
                variant="flat"
                onPress={() => establecerTipo("correo")}
              >
                Escribir un correo
              </Button>
            )}
          </div>
        )}

        <Apartado titulo="¿Cómo fue?">
          <GrupoDeOpciones etiqueta="Cómo fue el contacto">
            {TIPOS_DE_CONTACTO.map((opcion) => (
              <Opcion
                key={opcion.valor}
                elegida={tipo === opcion.valor}
                icono={opcion.icono}
                alElegir={() => establecerTipo(opcion.valor)}
              >
                {opcion.etiqueta}
              </Opcion>
            ))}
          </GrupoDeOpciones>
        </Apartado>

        <Apartado titulo="¿Qué se habló?">
          <Textarea
            aria-label="Qué se habló"
            autoFocus
            errorMessage="Escribe en una línea qué se habló."
            isInvalid={seIntentoGuardar && faltaElTexto}
            maxLength={4000}
            minRows={2}
            placeholder="Ej.: Le interesa Kombat Challenge; pidió el dossier."
            radius="lg"
            value={texto}
            variant="bordered"
            onValueChange={establecerTexto}
          />
          <p className="mt-1 text-[11px] text-default-400">Queda en la bitácora de la marca, con la etiqueta «{tipoElegido.etiqueta}».</p>
        </Apartado>

        <Apartado titulo="¿Cuándo lo retomas?">
          <GrupoDeOpciones etiqueta="Cuándo se retoma">
            {OPCIONES_DEL_SIGUIENTE_PASO.map((opcion) => (
              <Opcion
                key={String(opcion.valor)}
                elegida={siguientePaso === opcion.valor}
                alElegir={() => establecerSiguientePaso(opcion.valor)}
              >
                {opcion.etiqueta}
              </Opcion>
            ))}
          </GrupoDeOpciones>

          {siguientePaso === "otro" && (
            <Input
              aria-label="Día en que se retoma"
              className="mt-2 max-w-48"
              // Solo es la pista del selector; el servidor rechaza un día
              // pasado con el calendario de Caracas.
              min={diaLocalDentroDe(0)}
              radius="lg"
              size="sm"
              type="date"
              value={otroDia}
              variant="bordered"
              onValueChange={establecerOtroDia}
            />
          )}

          {siguientePaso !== null && siguientePaso !== "ninguno" && (
            <Input
              aria-label="Qué toca entonces"
              className="mt-2"
              maxLength={300}
              placeholder={`Qué toca entonces (si no, «${tipoElegido.notaPorDefecto}»)`}
              radius="lg"
              size="sm"
              value={nota}
              variant="bordered"
              onValueChange={establecerNota}
            />
          )}

          <p
            className={[
              "mt-1.5 text-[11px]",
              seIntentoGuardar && faltaElPaso ? "text-danger" : "text-default-400",
            ].join(" ")}
          >
            {seIntentoGuardar && faltaElPaso
              ? siguientePaso === "otro"
                ? "Elige el día."
                : "Elige cuándo lo retomas, o «No hace falta»."
              : siguientePaso === null
                ? "Te quedará un recordatorio para ese día, con el aviso de las 8:00."
                : siguientePaso === "ninguno"
                  ? "La marca saldrá en «Sin siguiente paso» del resumen hasta que alguien le deje uno."
                  : "Te queda un recordatorio para ese día, con el aviso de las 8:00."}
          </p>
        </Apartado>

        {recordatorioQueTocaba !== null && (
          <Checkbox
            isSelected={cumplirElQueTocaba}
            radius="md"
            size="sm"
            onValueChange={establecerCumplirElQueTocaba}
          >
            <span className="text-xs text-default-600">
              Dar por cumplido el recordatorio{" "}
              {recordatorioQueTocaba.cuando === "hoy"
                ? "de hoy"
                : `vencido ${formatearDiaAgendado(recordatorioQueTocaba.fecha, recordatorioQueTocaba.diasHasta)}`}
              {recordatorioQueTocaba.nota && <strong className="font-semibold text-foreground"> «{recordatorioQueTocaba.nota}»</strong>}
            </span>
          </Checkbox>
        )}
      </ModalBody>

      <BarraDeScrollDibujada zona={cuerpoDeLaVentana} />

      <ModalFooter>
        <Button isDisabled={anotar.isPending} radius="lg" variant="light" onPress={alTerminar}>
          Cancelar
        </Button>
        <Button color="primary" isLoading={anotar.isPending} radius="lg" onPress={guardar}>
          Guardar
        </Button>
      </ModalFooter>
    </>
  );
}

/* ==================================================================== */
/* Piezas                                                               */
/* ==================================================================== */

function Apartado({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold text-foreground">{titulo}</h3>
      {children}
    </section>
  );
}

/**
 * Una fila de botones de los que se elige uno. Con `aria-pressed` en cada
 * botón: un lector de pantalla dice cuál está puesto.
 */
function GrupoDeOpciones({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div aria-label={etiqueta} className="flex flex-wrap gap-1.5" role="group">
      {children}
    </div>
  );
}

function Opcion({
  elegida,
  icono,
  alElegir,
  children,
}: {
  elegida: boolean;
  icono?: ReactNode;
  alElegir: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      aria-pressed={elegida}
      color={elegida ? "primary" : "default"}
      radius="full"
      size="sm"
      startContent={icono}
      variant={elegida ? "solid" : "flat"}
      onPress={alElegir}
    >
      {children}
    </Button>
  );
}
