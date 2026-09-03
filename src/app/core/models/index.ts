export interface Ruta {
  filas?: number[];
  tienda: string;
  cliente: string;
  direccion: string;
  referencia: string;
  distrito: string;
  telefono: string;
  modelo: string;
  pedido: string;
  observaciones: string;
  cantidad: string;
  estado: string;
  ordenActual: string;
  lat?: string;
  lng?: string;
}

export interface RutaCompleta {
  rutasHoy: Ruta[];
  rutasPlanificadas: Ruta[];
  fechaGlobalTexto: string;
  baseLat?: string;
  baseLng?: string;
}

export interface EstadoPlaca {
  total: number;
  conOrden: number;
  chofer: string;
  zonas: string[];
}

export interface EstadoAdmin {
  estadoHoy: Record<string, EstadoPlaca>;
  estadoManana: Record<string, EstadoPlaca>;
}

export interface DatosAsignacion {
  choferes: string[];
  placas: string[];
  asignacionActual: Record<string, string>;
}

export interface RegistroSoporte {
  fila: number;
  cliente: string;
  pedido: string;
  distrito: string;
  telefono: string;
  respuesta: string;
  situacion: string;
  observacionPedido: string;
  seriePedido: string;
  chofer: string;
  placa: string;
  codigoAtc: string;
  motivo: string;
  observacionesSoporte: string;
  direccion: string;
}

export interface DatosSoporte {
  success: boolean;
  msg?: string;
  registros: RegistroSoporte[];
  placas: string[];
  choferes: string[];
  motivos: string[];
}

export interface RegistroEntrega {
  fila: number;
  fechaRegistro: string;
  placa: string;
  dniChofer: string;
  nombreChofer: string;
  pedido: string;
  cliente: string;
  tienda: string;
  direccion: string;
  referencia: string;
  distrito: string;
  telefono: string;
  modelo: string;
  cantidad: string;
  ordenEntrega: string;
  estado: string;
  motivo: string;
  observaciones: string;
  gpsLat: string;
  gpsLng: string;
  gpsLink: string;
  horaLlegada: string;
  horaSalida: string;
  kilometraje: string;
  fotos: string[];
}

export interface DatosEntregas {
  success: boolean;
  msg?: string;
  registros: RegistroEntrega[];
}

export interface DatosExcel {
  rutas: unknown[][];
  asignacion: unknown[][];
}

export interface EstadoPlanificacion {
  success: boolean;
  hojaLista: boolean;
  total: number;
  sinCoords: number;
  sinCoordsDetalle?: { pedido: string; cliente: string; filas: number[] }[];
  porDistrito: Record<string, number>;
  placas: string[];
  vehiculos?: VehiculoConfig[];
  codigosSinComposicion?: { codigo: string; cantidad: number }[];
  backendVersion?: string;
}

export interface VehiculoConfig {
  placa: string;
  capacidad: number;
  zonas: string[];
}

export interface PedidoAsignado {
  pedido: string;
  filas: number[];
  cliente: string;
  distrito: string;
  direccion: string;
  referencia: string;
  observaciones: string;
  lat: string;
  lng: string;
  orden: number;
  unidades: number;
}

export interface AsignacionVehiculo {
  placa: string;
  capacidad: number;
  unidades: number;
  zonas: string[];
  km: number;
  distritos: string[];
  bajaCarga?: boolean;
  pedidos: PedidoAsignado[];
}

export interface NoAsignado {
  pedido: string;
  cliente: string;
  unidades: number;
  motivo: string;
  distrito?: string;
  distritoRaw?: string;
  zona?: string;
  direccion?: string;
  referencia?: string;
  observaciones?: string;
  filas?: number[];
}

export interface ResultadoDistribucion {
  success: boolean;
  vehiculos: AsignacionVehiculo[];
  kmTotal: number;
  distribuidos: number;
  sinUbicar: number;
  sinUbicarDetalle?: { pedido: string; cliente: string }[];
  autoSeleccion?: string[];
  noAsignados?: NoAsignado[];
  advertencias?: { codigo: string; cantidad: number }[];
  base: { lat: number; lng: number };
}

export interface CandidatoGeo {
  lat: number;
  lng: number;
  direccion: string;
}

export interface DetalleGeo {
  pedido: string;
  filas: number[];
  cliente: string;
  direccion: string;
  referencia: string;
  distrito: string;
  lat: string;
  lng: string;
  estado: 'ubicada' | 'multiple' | 'centro_distrito' | 'no_encontrada';
  candidatos: CandidatoGeo[];
  queryUsado?: string;
  distritoOk?: boolean;
}
