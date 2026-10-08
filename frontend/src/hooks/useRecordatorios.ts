/**
 * hooks/useRecordatorios.ts
 * ---------------------------------------------------------------------
 * Leer y escribir recordatorios de seguimiento.
 *
 * Las claves cuelgan de las que ya se refrescan con los cambios en vivo
 * (ProveedorCambiosEnVivo), y no es casualidad:
 *
 *   · los de una marca, de su ficha (`["marcas","ficha",id,…]`), que se
 *     pide otra vez cuando alguien cambia algo de esa marca;
 *   · los míos, del panel (`["panel",…]`), que se pide otra vez con
 *     cualquier cambio en una marca que veo.
 *
 * Así un recordatorio que me deja el comercial me aparece sin recargar,
 * sin que el servidor tenga que avisar de nada nuevo.
 * ---------------------------------------------------------------------
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  anotarContacto,
  cambiarRecordatorio,
  crearRecordatorio,
  eliminarRecordatorio,
  listarMisRecordatorios,
  listarRecordatoriosDeLaMarca,
} from "@/api/recordatorios";
import { clavesDeMarcas } from "@/hooks/useMarcas";
import type {
  CambiosDeRecordatorio,
  DatosDeContacto,
  DatosDeRecordatorio,
  MisRecordatorios,
  Recordatorio,
} from "@/tipos/modelos";

export const clavesDeRecordatorios = {
  deLaMarca: (idDeLaMarca: string) => [...clavesDeMarcas.ficha(idDeLaMarca), "recordatorios"] as const,
  mios: ["panel", "recordatorios"] as const,
};

export function useRecordatoriosDeLaMarca(idDeLaMarca: string | null) {
  return useQuery<Recordatorio[]>({
    queryKey: clavesDeRecordatorios.deLaMarca(idDeLaMarca ?? ""),
    queryFn: () => listarRecordatoriosDeLaMarca(idDeLaMarca as string),
    enabled: idDeLaMarca !== null,
  });
}

/** Lo vencido, lo de hoy y lo de esta semana de quien mira el panel. */
export function useMisRecordatorios() {
  return useQuery<MisRecordatorios>({
    queryKey: clavesDeRecordatorios.mios,
    queryFn: listarMisRecordatorios,
  });
}

/**
 * Después de cualquier cambio se piden otra vez las marcas (la tarjeta
 * enseña mi próximo recordatorio, la ficha los suyos) y el panel.
 */
function useInvalidarRecordatorios() {
  const clienteDeConsultas = useQueryClient();

  return () => {
    void clienteDeConsultas.invalidateQueries({ queryKey: clavesDeMarcas.todas });
    void clienteDeConsultas.invalidateQueries({ queryKey: ["panel"] });
  };
}

export function useCrearRecordatorio(idDeLaMarca: string) {
  const invalidar = useInvalidarRecordatorios();

  return useMutation({
    mutationFn: (datos: DatosDeRecordatorio) => crearRecordatorio(idDeLaMarca, datos),
    onSuccess: invalidar,
  });
}

/** Cumplirlo, deshacerlo o pasarlo a otro día. */
export function useCambiarRecordatorio() {
  const invalidar = useInvalidarRecordatorios();

  return useMutation({
    mutationFn: ({
      idDelRecordatorio,
      cambios,
    }: {
      idDelRecordatorio: string;
      cambios: CambiosDeRecordatorio;
    }) => cambiarRecordatorio(idDelRecordatorio, cambios),
    onSuccess: invalidar,
  });
}

export function useEliminarRecordatorio() {
  const invalidar = useInvalidarRecordatorios();

  return useMutation({
    mutationFn: eliminarRecordatorio,
    onSuccess: invalidar,
  });
}

/**
 * «Contacté». Refresca lo mismo que un recordatorio, que ya incluye la
 * bitácora de la ficha (cuelga de `["marcas", …]`), la tarjeta (su estado
 * y su próximo recordatorio) y las cifras del panel.
 */
export function useAnotarContacto(idDeLaMarca: string) {
  const invalidar = useInvalidarRecordatorios();

  return useMutation({
    mutationFn: (datos: DatosDeContacto) => anotarContacto(idDeLaMarca, datos),
    onSuccess: invalidar,
  });
}
