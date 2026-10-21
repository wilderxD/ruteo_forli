import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import * as L from 'leaflet';
import { ApiService } from '../../core/services/api.service';
import { SesionService } from '../../core/services/sesion.service';
import { SwalService } from '../../shared/services/swal.service';
import { CargandoService } from '../../shared/services/cargando.service';
import { EstadoPlanificacion, ResultadoDistribucion, DetalleGeo, CandidatoGeo, VehiculoConfig, AsignacionVehiculo, NoAsignado, PedidoAsignado } from '../../core/models';

@Component({
  selector: 'app-planificador',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './planificador.component.html',
  styleUrls: ['./planificador.component.scss']
})
export class PlanificadorComponent implements OnInit, OnDestroy {
  estado?: EstadoPlanificacion;
  cargando = false;
  seleccionPlacas: Record<string, boolean> = {};
  resultado?: ResultadoDistribucion;
  placaMapa = '';
  geocodificando = false;
  geoProgreso = 0;
  geoTotal = 0;
asignando = false;
  combinando = false;
  destinoSeleccion: Record<string, string> = {};
  autoVehiculos = true;
  detallesGeo: DetalleGeo[] = [];
  filtroGeo: 'todas' | 'ubicada' | 'multiple' | 'centro_distrito' | 'no_encontrada' = 'todas';
  modalAbierto = false;
  modalPedido: DetalleGeo | null = null;
  modalLat: number | null = null;
  modalLng: number | null = null;
  backendVersion = '';
  vehiculosDisp: VehiculoConfig[] = [];
  modalCodigoAbierto = false;
  nuevoCodigo = '';
  nuevoCodigoUnidades = 1;
  modalVehiculoAbierto = false;
  nuevaPlaca = '';
  nuevaCapacidad = 30;
  nuevasZonas: Record<string, boolean> = {};
  zonasDisponibles = ['Zona Norte', 'Zona Sur', 'Zona Este', 'Zona Centro', 'Zona Callao', 'Zona 2'];
  modalCodigosAbierto = false;
  codigosPendientes: { codigo: string; cantidad: number; unidades: number }[] = [];
  modalRutaAbierto = false;
  modalRutaPlaca = '';
  modalAsignarAbierto = false;
  pedidoAsignar: NoAsignado | null = null;
  placaAsignar = '';
  pedidoRutaRef: PedidoAsignado | null = null;

  private map?: L.Map;
  private capas?: L.LayerGroup;
  private mapaListo = false;
  private modalMap?: L.Map;
  private modalMarker?: L.Marker;
  private marcadoresCandidatos: L.Marker[] = [];
  private candidatoSeleccionado: CandidatoGeo | null = null;
  private modalRutaMapa?: L.Map;
  private modalRutaCapas?: L.LayerGroup;
  private colores = ['#D32F2F', '#1565C0', '#2E7D32', '#F57C00', '#7B1FA2', '#00695C', '#5D4037', '#C2185B', '#00838F', '#9E9D24'];
  private static readonly BASE_LAT = -11.8297773;
  private static readonly BASE_LNG = -77.097072;

  constructor(
    private api: ApiService,
    private sesion: SesionService,
    private swal: SwalService,
    private carga: CargandoService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.cargarEstado();
    if (this.estado?.codigosSinComposicion?.length) {
      this.abrirModalCodigosPendientes();
    }
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = undefined;
      this.mapaListo = false;
    }
    try {
      if (this.modalRutaMapa) this.modalRutaMapa.remove();
    } catch {
      // ignorar
    }
    this.modalRutaMapa = undefined;
    this.cerrarModal();
  }

  get placasDisponibles(): string[] {
    if (this.vehiculosDisp.length > 0) return this.vehiculosDisp.map(v => v.placa);
    return this.estado?.placas ?? [];
  }

  get placasSeleccionadas(): string[] {
    return this.placasDisponibles.filter(p => this.seleccionPlacas[p]);
  }

  get sinCoordsNums(): string {
    return (this.estado?.sinCoordsDetalle || []).map(x => x.pedido).join(', ');
  }

  capacidadDe(placa: string): number {
    return this.vehiculosDisp.find(v => v.placa === placa)?.capacidad ?? 30;
  }

  zonasDe(placa: string): string[] {
    return this.vehiculosDisp.find(v => v.placa === placa)?.zonas ?? [];
  }

  get distritoKeys(): string[] {
    return this.estado ? Object.keys(this.estado.porDistrito || {}) : [];
  }

  get paletaColores(): string[] {
    return this.colores;
  }

  get geoFiltrados(): DetalleGeo[] {
    if (this.filtroGeo === 'todas') return this.detallesGeo;
    return this.detallesGeo.filter(d => d.estado === this.filtroGeo);
  }

  private msgApi(res: any, fallback: string): string {
    return res?.error || res?.msg || fallback;
  }

  /** Escapa HTML para los popups de Leaflet (los datos vienen de la hoja/Excel y
   *  no son confiables; evita inyección XSS almacenado). */
  private esc(t: any): string {
    const d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
  }

  async cargarEstado(): Promise<void> {
    this.cargando = true;
    this.carga.mostrar('planificador', 'Cargando estado de planificación…');
    try {
      const res = await this.api.get('planificar_estado', {}, this.sesion.token);
      if (res?.success) {
        this.estado = res as EstadoPlanificacion;
        this.backendVersion = res.backendVersion || '';
        this.vehiculosDisp = (res.vehiculos && res.vehiculos.length)
          ? res.vehiculos as VehiculoConfig[]
          : ((res.placas || []) as string[]).map(p => ({ placa: p, capacidad: 30, zonas: [] }));
        this.vehiculosDisp.forEach(v => {
          if (this.seleccionPlacas[v.placa] === undefined) this.seleccionPlacas[v.placa] = false;
        });
      } else {
        this.swal.error(this.msgApi(res, 'No se pudo cargar el estado de planificación.'));
      }
    } catch {
      this.swal.error('Sin conexión. No se pudo cargar el estado.');
    } finally {
      this.cargando = false;
      this.carga.ocultar('planificador');
      this.cdr.detectChanges();
    }
  }

  async crearHoja(): Promise<void> {
    this.carga.mostrar('planificador', 'Creando hoja "planificacion"...');
    try {
      const res = await this.api.post('planificar_crear_hoja', {}, this.sesion.token);
      this.carga.ocultar('planificador');
      if (res?.success) {
        this.swal.exito('Hoja "planificacion" creada con la estructura de "rutas".');
        await this.cargarEstado();
      } else {
        this.swal.error(this.msgApi(res, 'No se pudo crear la hoja.'));
      }
    } catch {
      this.carga.ocultar('planificador');
      this.swal.error('Sin conexión. No se pudo crear la hoja.');
    }
  }

  async crearHojaComposicion(): Promise<void> {
    this.carga.mostrar('planificador', 'Creando hoja "composicion"...');
    try {
      const res = await this.api.post('planificar_crear_hoja_composicion', {}, this.sesion.token);
      this.carga.ocultar('planificador');
      if (res?.success) {
        this.swal.exito('Hoja "composicion" creada (CODIGO | UNIDADES).');
        await this.cargarEstado();
      } else {
        this.swal.error(this.msgApi(res, 'No se pudo crear la hoja.'));
      }
    } catch {
      this.carga.ocultar('planificador');
      this.swal.error('Sin conexión.');
    }
  }

  async crearHojaVehiculos(): Promise<void> {
    this.carga.mostrar('planificador', 'Creando hoja "vehiculos"...');
    try {
      const res = await this.api.post('planificar_crear_hoja_vehiculos', {}, this.sesion.token);
      this.carga.ocultar('planificador');
      if (res?.success) {
        this.swal.exito('Hoja "vehiculos" creada (PLACA | CAPACIDAD | ZONAS).');
        await this.cargarEstado();
      } else {
        this.swal.error(this.msgApi(res, 'No se pudo crear la hoja.'));
      }
    } catch {
      this.carga.ocultar('planificador');
      this.swal.error('Sin conexión.');
    }
  }

  abrirModalCodigo(): void {
    this.modalCodigoAbierto = true;
    this.nuevoCodigo = '';
    this.nuevoCodigoUnidades = 1;
    this.cdr.detectChanges();
  }

  cerrarModalCodigo(): void {
    this.modalCodigoAbierto = false;
    this.cdr.detectChanges();
  }

  async guardarCodigo(): Promise<void> {
    const codigo = this.nuevoCodigo.trim();
    if (!codigo) {
      this.swal.aviso('Ingresa el código del producto.', 'warning');
      return;
    }
    this.carga.mostrar('planificador', 'Guardando producto...');
    try {
      const res = await this.api.post('planificar_guardar_codigo', { codigo, unidades: this.nuevoCodigoUnidades }, this.sesion.token);
      this.carga.ocultar('planificador');
      if (res?.success) {
        this.cerrarModalCodigo();
        this.swal.exito('Producto registrado.');
        await this.cargarEstado();
      } else {
        this.swal.error(this.msgApi(res, 'No se pudo guardar.'));
      }
    } catch {
      this.carga.ocultar('planificador');
      this.swal.error('Sin conexión.');
    }
  }

  abrirModalVehiculo(placa?: string): void {
    this.modalVehiculoAbierto = true;
    const v = placa ? this.vehiculosDisp.find(x => x.placa === placa) : undefined;
    this.nuevaPlaca = v ? v.placa : '';
    this.nuevaCapacidad = v ? v.capacidad : 30;
    this.nuevasZonas = {};
    this.zonasDisponibles.forEach(z => this.nuevasZonas[z] = v ? v.zonas.includes(z) : false);
    this.cdr.detectChanges();
  }

  cerrarModalVehiculo(): void {
    this.modalVehiculoAbierto = false;
    this.cdr.detectChanges();
  }

  async guardarVehiculo(): Promise<void> {
    const placa = this.nuevaPlaca.trim().toUpperCase();
    if (!placa) {
      this.swal.aviso('Ingresa la placa.', 'warning');
      return;
    }
    const zonas = this.zonasDisponibles.filter(z => this.nuevasZonas[z]);
    this.carga.mostrar('planificador', 'Guardando vehículo...');
    try {
      const res = await this.api.post('planificar_guardar_vehiculo', { placa, capacidad: this.nuevaCapacidad, zonas }, this.sesion.token);
      this.carga.ocultar('planificador');
      if (res?.success) {
        this.cerrarModalVehiculo();
        this.swal.exito('Vehículo registrado.');
        await this.cargarEstado();
      } else {
        this.swal.error(this.msgApi(res, 'No se pudo guardar.'));
      }
    } catch {
      this.carga.ocultar('planificador');
      this.swal.error('Sin conexión.');
    }
  }

  abrirModalCodigosPendientes(): void {
    this.codigosPendientes = (this.estado?.codigosSinComposicion || []).map(c => ({
      codigo: c.codigo,
      cantidad: c.cantidad,
      unidades: 1
    }));
    if (this.codigosPendientes.length === 0) {
      this.swal.aviso('No hay códigos pendientes de composición.', 'info');
      return;
    }
    this.modalCodigosAbierto = true;
    this.cdr.detectChanges();
  }

  cerrarModalCodigosPendientes(): void {
    this.modalCodigosAbierto = false;
    this.codigosPendientes = [];
    this.cdr.detectChanges();
  }

  async guardarCodigosPendientes(): Promise<void> {
    const pend = this.codigosPendientes.filter(p => (p.unidades || 1) >= 1);
    if (pend.length === 0) {
      this.swal.aviso('No hay códigos para guardar.', 'warning');
      return;
    }
    this.carga.mostrar('planificador', 'Guardando productos...');
    try {
      for (const p of pend) {
        await this.api.post('planificar_guardar_codigo', { codigo: p.codigo, unidades: p.unidades || 1 }, this.sesion.token);
      }
      this.carga.ocultar('planificador');
      await this.cargarEstado();
      const restantes = this.estado?.codigosSinComposicion || [];
      if (restantes.length === 0) {
        this.cerrarModalCodigosPendientes();
        this.swal.exito('Productos registrados.');
      } else {
        this.codigosPendientes = restantes.map(c => ({ codigo: c.codigo, cantidad: c.cantidad, unidades: 1 }));
        this.cdr.detectChanges();
        this.swal.aviso('Quedan ' + restantes.length + ' código(s) por registrar.', 'info');
      }
    } catch {
      this.carga.ocultar('planificador');
      this.swal.error('Sin conexión.');
    }
  }

  vehiculoDeResultado(placa: string): AsignacionVehiculo | undefined {
    return this.resultado?.vehiculos.find(v => v.placa === placa);
  }

  abrirModalRuta(placa: string): void {
    this.modalRutaPlaca = placa;
    this.modalRutaAbierto = true;
    this.cdr.detectChanges();
    setTimeout(() => this.inicializarMapaRuta(), 0);
  }

  cerrarModalRuta(): void {
    this.modalRutaAbierto = false;
    this.modalRutaPlaca = '';
    this.cdr.detectChanges();
    const m = this.modalRutaMapa;
    this.modalRutaMapa = undefined;
    this.modalRutaCapas = undefined;
    if (m) {
      setTimeout(() => {
        try {
          m.remove();
        } catch {
          // ignorar
        }
      }, 0);
    }
  }

  private inicializarMapaRuta(): void {
    const el = document.getElementById('mapaRutaPlaca');
    if (!el) return;
    if (this.modalRutaMapa) {
      this.modalRutaMapa.remove();
      this.modalRutaMapa = undefined;
    }
    this.modalRutaMapa = L.map(el, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(this.modalRutaMapa);
    this.modalRutaCapas = L.layerGroup().addTo(this.modalRutaMapa);
    this.renderizarMapaRuta();
    setTimeout(() => this.modalRutaMapa?.invalidateSize(), 0);
  }

  private renderizarMapaRuta(): void {
    if (!this.modalRutaMapa || !this.modalRutaCapas) return;
    const capas = this.modalRutaCapas;
    capas.clearLayers();

    const v = this.vehiculoDeResultado(this.modalRutaPlaca);
    if (!v) return;
    const baseLat = this.resultado?.base?.lat || PlanificadorComponent.BASE_LAT;
    const baseLng = this.resultado?.base?.lng || PlanificadorComponent.BASE_LNG;
    const color = this.colores[0];

    const baseIcon = L.divIcon({
      className: 'punto-mapa punto-mapa--base',
      html: '<i class="fas fa-warehouse"></i>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
    L.marker([baseLat, baseLng], { icon: baseIcon }).addTo(capas)
      .bindPopup('<b>Base / Almacén</b>');

    const ordenados = [...v.pedidos].filter(p => isFinite(parseFloat(p.lat)) && isFinite(parseFloat(p.lng)))
      .sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const pts: [number, number][] = [[baseLat, baseLng]];
    ordenados.forEach(p => {
      const icon = L.divIcon({
        className: '',
        html: `<span class="punto-mapa" style="background:${color}">${p.orden}</span>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      L.marker([parseFloat(p.lat), parseFloat(p.lng)], { icon }).addTo(capas)
        .bindPopup(`<b>${p.orden}. ${this.esc(p.cliente)}</b><br>Ped: ${this.esc(p.pedido)}<br>${this.esc(p.direccion)}`);
      pts.push([parseFloat(p.lat), parseFloat(p.lng)]);
    });

    if (pts.length > 1) {
      L.polyline(pts, { color, weight: 3, opacity: 0.8 }).addTo(capas);
    }
    try {
      if (pts.length > 1) {
        this.modalRutaMapa.fitBounds(L.latLngBounds(pts.map(p => L.latLng(p[0], p[1]))).pad(0.1));
      } else {
        this.modalRutaMapa.setView([baseLat, baseLng], 12);
      }
    } catch {
      this.modalRutaMapa.setView([baseLat, baseLng], 12);
    }
  }

  invertirRuta(): void {
    const v = this.vehiculoDeResultado(this.modalRutaPlaca);
    if (!v || !Array.isArray(v.pedidos)) return;
    v.pedidos.reverse();
    v.pedidos.forEach((p, i) => { p.orden = i + 1; });
    this.renderizarMapaRuta();
    this.renderizarMapa();
    this.cdr.detectChanges();
  }

  async onArchivoSeleccionado(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' }) as unknown[][];

      if (filas.length <= 1) {
        this.swal.aviso('El archivo no tiene datos (solo cabecera).', 'info');
        input.value = '';
        return;
      }

      const cabecera = (filas[0] as unknown[]).map(c => String(c).toUpperCase().trim());
      const mapaCol = (nombres: string[]): number => cabecera.findIndex(c => nombres.includes(c));

      const idxMap = {
        tienda: mapaCol(['TIENDA']),
        tipo: mapaCol(['TIPO', 'MODELOL', 'MODELO']),
        cliente: mapaCol(['CLIENTE']),
        direccion: mapaCol(['DIRECCION', 'DIRECCIÓN']),
        referencia: mapaCol(['REFERENCIA']),
        distrito: mapaCol(['DISTRITO']),
        telefono: mapaCol(['TELEFONO', 'TELÉFONO']),
        codigo: mapaCol(['CODIGO', 'CÓDIGO']),
        modelo: mapaCol(['MODELO', 'MODELOL']),
        cantidad: mapaCol(['CANTIDAD']),
        pedido: mapaCol(['PEDIDO', 'N° PEDIDO', 'N°PEDIDO', 'N.PEDIDO']),
        observaciones: mapaCol(['OBSERVACIONES', 'OBSERVACIONES PEDIDO']),
        placas: mapaCol(['PLACAS', 'PLACA']),
        orden: mapaCol(['ORDEN', 'ORDEN_ENTREGA.', 'ORDEN ENTREGA']),
        estado: mapaCol(['ESTADO']),
        lat: mapaCol(['LAT', 'LATITUD']),
        lng: mapaCol(['LNG', 'LONGITUD'])
      };

      const filasNorm: unknown[][] = filas
        .slice(1)
        .filter((f: unknown[]) => Array.isArray(f) && f.some((c: unknown) => String(c).trim() !== ''))
        .map((f: unknown[]) => {
          const out: unknown[] = [];
          for (let c = 0; c < 17; c++) out.push('');
          const get = (idx: number) => (idx >= 0 && idx < f.length ? f[idx] : '');
          out[0] = get(idxMap.tienda);
          out[1] = get(idxMap.tipo);
          out[2] = get(idxMap.cliente);
          out[3] = get(idxMap.direccion);
          out[4] = get(idxMap.referencia);
          out[5] = get(idxMap.distrito);
          out[6] = get(idxMap.telefono);
          out[7] = get(idxMap.codigo);
          out[8] = get(idxMap.modelo);
          out[9] = get(idxMap.cantidad);
          out[10] = get(idxMap.pedido);
          out[11] = get(idxMap.observaciones);
          out[12] = get(idxMap.placas);
          out[13] = get(idxMap.orden);
          out[14] = get(idxMap.estado);
          out[15] = get(idxMap.lat);
          out[16] = get(idxMap.lng);
          return out;
        });

      if (filasNorm.length === 0) {
        this.swal.aviso('No se encontraron filas con datos en el archivo.', 'info');
        input.value = '';
        return;
      }

      this.carga.mostrar('planificador', 'Cargando ' + filasNorm.length + ' filas a la hoja "planificacion"...');
      const res = await this.api.post('planificar_subir_datos', { filas: filasNorm }, this.sesion.token);
      this.carga.ocultar('planificador');
      if (res?.success) {
        this.swal.exito('Datos cargados: ' + res.filas + ' filas.');
        this.detallesGeo = [];
        this.resultado = undefined;
        await this.cargarEstado();
      } else {
        this.swal.error(this.msgApi(res, 'No se pudieron cargar los datos.'));
      }
      input.value = '';
    } catch {
      this.carga.ocultar('planificador');
      this.swal.error('No se pudo leer el archivo.');
    }
  }

  async geocodificar(): Promise<void> {
    if (this.geocodificando || !this.estado || this.estado.sinCoords === 0) return;
    this.geocodificando = true;
    this.geoTotal = this.estado.sinCoords;
    this.geoProgreso = 0;

    this.carga.mostrar('planificador', 'Geolocalizando... 0 / ' + this.geoTotal, 0);

    try {
      let restantes = this.geoTotal;
      while (restantes > 0) {
        const res = await this.api.post('planificar_geocodificar', {}, this.sesion.token);
        if (!res?.success) {
          this.carga.ocultar('planificador');
          this.geocodificando = false;
          this.cdr.detectChanges();
          this.swal.error(this.msgApi(res, 'Error al geolocalizar.'));
          return;
        }
        this.geoProgreso += res.procesadas || 0;
        restantes = res.restantes || 0;
        if (Array.isArray(res.detalles)) this.detallesGeo = res.detalles as DetalleGeo[];
        this.cdr.detectChanges();
        const pct = this.geoTotal ? (this.geoProgreso / this.geoTotal) * 100 : 0;
        this.carga.progreso('planificador', pct, 'Geolocalizando... ' + this.geoProgreso + ' / ' + this.geoTotal);
      }
      this.carga.ocultar('planificador');
      this.geocodificando = false;
      await this.cargarEstado();
      const mult = this.detallesGeo.filter(d => d.estado === 'multiple').length;
      const centro = this.detallesGeo.filter(d => d.estado === 'centro_distrito').length;
      const noEncontradas = this.detallesGeo.filter(d => d.estado === 'no_encontrada').length;
      if (mult > 0 || centro > 0 || noEncontradas > 0) {
        this.swal.aviso(
          'Geolocalización terminada. Múltiples: ' + mult + ', centro de distrito: ' + centro + ', no encontradas: ' + noEncontradas + '. Revisa la tabla y resuélvelas.',
          'warning'
        );
      } else {
        this.swal.exito('Geolocalización completa. Todos los pedidos tienen coordenadas.');
      }
    } catch {
      this.carga.ocultar('planificador');
      this.geocodificando = false;
      this.cdr.detectChanges();
      this.swal.error('Sin conexión. No se pudo geolocalizar.');
    }
  }

  estadoGeoInfo(d: DetalleGeo): { texto: string; clase: string } {
    switch (d.estado) {
      case 'ubicada':
        return { texto: '✓ Ubicada', clase: 'bg-[#2E7D32]/10 text-[#2E7D32] border-[#2E7D32]/30' };
      case 'multiple':
        return { texto: '⚠ Múltiples (' + (d.candidatos?.length || 2) + ')', clase: 'bg-[#FFF4E5] text-[#B25E00] border-[#F3C677]' };
      case 'centro_distrito':
        return { texto: '🏙 Centro de distrito', clase: 'bg-sky-50 text-[#1565C0] border-[#BBDEFB]' };
      default:
        return { texto: '✗ No encontrada', clase: 'bg-red-50 text-red-700 border-red-200' };
    }
  }

  contarGeo(estado: string): number {
    if (estado === 'todas') return this.detallesGeo.length;
    return this.detallesGeo.filter(d => d.estado === estado).length;
  }

  setFiltroGeo(f: string): void {
    this.filtroGeo = f as 'todas' | 'ubicada' | 'multiple' | 'centro_distrito' | 'no_encontrada';
  }

  async elegirCandidato(d: DetalleGeo, c: CandidatoGeo): Promise<void> {
    if (!d.pedido) {
      this.swal.error('El pedido no tiene número registrado en la hoja "planificacion".');
      return;
    }
    this.carga.mostrar('planificador', 'Guardando ubicación...');
    try {
      const res = await this.api.post('planificar_set_coord', { pedido: d.pedido, lat: c.lat, lng: c.lng }, this.sesion.token);
      this.carga.ocultar('planificador');
      if (res?.success) {
        d.lat = String(c.lat);
        d.lng = String(c.lng);
        d.estado = 'ubicada';
        d.candidatos = [];
        this.swal.exito('Coincidencia elegida.');
        await this.cargarEstado();
      } else {
        this.swal.error(this.msgApi(res, 'No se pudo guardar.'));
      }
    } catch {
      this.carga.ocultar('planificador');
      this.swal.error('Sin conexión.');
    }
  }

  abrirModalSenalizar(d: DetalleGeo): void {
    this.pedidoRutaRef = null;
    this.modalPedido = d;
    this.modalLat = d.lat && d.lng ? parseFloat(d.lat) : null;
    this.modalLng = d.lat && d.lng ? parseFloat(d.lng) : null;
    this.candidatoSeleccionado = null;
    this.marcadoresCandidatos = [];
    this.modalAbierto = true;
    this.cdr.detectChanges();
    setTimeout(() => this.inicializarMapaModal(), 0);
  }

  abrirModalSenalizarRuta(p: PedidoAsignado): void {
    const d: DetalleGeo = {
      pedido: p.pedido,
      filas: p.filas || [],
      cliente: p.cliente,
      direccion: p.direccion,
      referencia: p.referencia,
      distrito: p.distrito,
      lat: p.lat,
      lng: p.lng,
      estado: 'ubicada',
      candidatos: [],
      queryUsado: '',
      distritoOk: true
    };
    this.pedidoRutaRef = p;
    this.abrirModalSenalizar(d);
  }

  esCandidatoModalSeleccionado(c: CandidatoGeo): boolean {
    return this.candidatoSeleccionado === c;
  }

  seleccionarCandidatoModal(c: CandidatoGeo): void {
    this.candidatoSeleccionado = c;
    this.modalLat = c.lat;
    this.modalLng = c.lng;
    this.colocarMarcadorModal();
    this.resaltarCandidatoSeleccionado();
    this.cdr.detectChanges();
  }

  private resaltarCandidatoSeleccionado(): void {
    if (!this.modalMap) return;
    this.marcadoresCandidatos.forEach(m => {
      const icon = m.getIcon() as L.DivIcon;
      const seleccionado = this.candidatoSeleccionado && m.getLatLng().lat === this.candidatoSeleccionado.lat && m.getLatLng().lng === this.candidatoSeleccionado.lng;
      const idx = this.marcadoresCandidatos.indexOf(m);
      const nuevo = L.divIcon({
        className: 'punto-mapa punto-mapa--candidato' + (seleccionado ? ' punto-mapa--candidato-sel' : ''),
        html: `<span>${idx + 1}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      m.setIcon(nuevo);
    });
  }

  private colocarCandidatosModal(): void {
    const d = this.modalPedido;
    if (!this.modalMap || !d || !d.candidatos?.length) return;
    if (d.estado !== 'multiple' && d.distritoOk !== false) return;
    d.candidatos.forEach((c, i) => {
      const icon = L.divIcon({
        className: 'punto-mapa punto-mapa--candidato',
        html: `<span>${i + 1}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      const m = L.marker([c.lat, c.lng], { icon }).addTo(this.modalMap!);
      m.bindPopup(`Opción ${i + 1}<br>${this.esc(c.direccion)}`);
      m.on('click', (ev: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(ev.originalEvent);
        this.seleccionarCandidatoModal(c);
      });
      this.marcadoresCandidatos.push(m);
    });
  }

  private inicializarMapaModal(): void {
    const el = document.getElementById('mapaModal');
    if (!el) return;
    try {
      if (this.modalMap) {
        this.modalMap.remove();
        this.modalMap = undefined;
      }
      this.modalMap = L.map('mapaModal', { scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(this.modalMap);

      const center: [number, number] = this.modalLat !== null && this.modalLng !== null
        ? [this.modalLat, this.modalLng]
        : [PlanificadorComponent.BASE_LAT, PlanificadorComponent.BASE_LNG];
      this.modalMap.setView(center, 15);

      this.modalMap.on('click', (ev: L.LeafletMouseEvent) => {
        this.candidatoSeleccionado = null;
        this.modalLat = ev.latlng.lat;
        this.modalLng = ev.latlng.lng;
        this.colocarMarcadorModal();
        this.resaltarCandidatoSeleccionado();
        this.cdr.detectChanges();
      });

      this.colocarCandidatosModal();
      if (this.modalLat !== null && this.modalLng !== null) this.colocarMarcadorModal();
      setTimeout(() => this.modalMap?.invalidateSize(), 0);
    } catch {
      // Si el mapa no se puede inicializar, el modal igual se puede cerrar
    }
  }

  private colocarMarcadorModal(): void {
    if (!this.modalMap || this.modalLat === null || this.modalLng === null) return;
    if (this.modalMarker) this.modalMarker.remove();
    const icon = L.divIcon({
      className: 'punto-mapa punto-mapa--modal',
      html: '<i class="fas fa-map-pin"></i>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
    this.modalMarker = L.marker([this.modalLat, this.modalLng], { icon }).addTo(this.modalMap);
  }

  cerrarModal(): void {
    this.modalAbierto = false;
    this.modalPedido = null;
    this.modalLat = null;
    this.modalLng = null;
    this.candidatoSeleccionado = null;
    this.marcadoresCandidatos = [];
    this.cdr.detectChanges();
    const m = this.modalMap;
    this.modalMap = undefined;
    this.modalMarker = undefined;
    if (m) {
      setTimeout(() => {
        try {
          m.remove();
        } catch {
          // ignorar
        }
      }, 0);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.modalAbierto) this.cerrarModal();
  }

  async guardarSenalizacion(): Promise<void> {
    if (!this.modalPedido || this.modalLat === null || this.modalLng === null) return;
    const d = this.modalPedido;
    if (!d.pedido) {
      this.swal.error('El pedido no tiene número registrado en la hoja "planificacion".');
      return;
    }
    this.carga.mostrar('planificador', 'Guardando ubicación...');
    try {
      const res = await this.api.post('planificar_set_coord', { pedido: d.pedido, lat: this.modalLat, lng: this.modalLng }, this.sesion.token);
      this.carga.ocultar('planificador');
      if (res?.success) {
        d.lat = String(this.modalLat);
        d.lng = String(this.modalLng);
        d.estado = 'ubicada';
        d.candidatos = [];
        if (this.pedidoRutaRef) {
          this.pedidoRutaRef.lat = String(this.modalLat);
          this.pedidoRutaRef.lng = String(this.modalLng);
        }
        this.cerrarModal();
        if (this.pedidoRutaRef && this.modalRutaAbierto) {
          this.renderizarMapaRuta();
          this.swal.exito('Ubicación actualizada en la ruta. Re-optimiza para recalcular km/orden.');
        } else {
          this.swal.exito('Ubicación guardada.');
        }
        await this.cargarEstado();
      } else {
        this.swal.error(this.msgApi(res, 'No se pudo guardar.'));
      }
    } catch {
      this.carga.ocultar('planificador');
      this.swal.error('Sin conexión.');
    }
  }

  async distribuir(): Promise<void> {
    const placas = this.placasSeleccionadas;
    if (!this.autoVehiculos && placas.length === 0) {
      this.swal.aviso('Selecciona al menos un vehículo o activa "Auto (según necesidad)".', 'warning');
      return;
    }
    if (this.asignando) return;
    this.asignando = true;
    this.carga.mostrar('planificador', 'Optimizando distribución por distancia total...');
    try {
      const res = await this.api.post('planificar_distribuir', { vehiculos: this.autoVehiculos ? [] : placas }, this.sesion.token);
      this.carga.ocultar('planificador');
      this.asignando = false;
      this.cdr.detectChanges();
      if (res?.success) {
        this.resultado = res as ResultadoDistribucion;
        this.placaMapa = res.vehiculos?.[0]?.placa || '';
        this.sincronizarDestinosBajaCarga();
        if (this.autoVehiculos && Array.isArray(res.autoSeleccion)) {
          res.autoSeleccion.forEach((p: string) => this.seleccionPlacas[p] = true);
        }
        const sin = res.sinUbicar || 0;
        const sinDetalle = Array.isArray(res.sinUbicarDetalle) ? res.sinUbicarDetalle : [];
        const sinPlaca = (res.noAsignados || []).length;
        const faltantes = (res.advertencias || []).length;
        const partes: string[] = [];
        partes.push('Distribución lista: ' + res.distribuidos + ' pedidos en ' + res.vehiculos.length + ' vehículos, ' + res.kmTotal + ' km.');
        if (sin > 0) {
          const nums = sinDetalle.slice(0, 10).map((x: { pedido: string }) => x.pedido).join(', ');
          partes.push(sin + ' sin ubicar (sin coordenadas): ' + (nums || 'ver tabla.'));
        }
        if (sinPlaca > 0) partes.push(sinPlaca + ' sin placa por capacidad/zona (revisa abajo).');
        if (faltantes > 0) partes.push(faltantes + ' código(s) sin composición (cuentan 1 ud).');
        // Se pintan las tarjetas del resultado ANTES del aviso, para que ya estén
        // listas detrás del popup (antes quedaban en blanco hasta cerrarlo).
        this.cdr.detectChanges();
        await this.swal.aviso(partes.join('\n'), sinPlaca > 0 || faltantes > 0 ? 'warning' : 'info');
        // El mapa se inicializa DESPUÉS de cerrar la alerta para evitar tamaño 0/overlay
        this.programarMapa();
      } else {
        this.cdr.detectChanges();
        this.swal.error(this.msgApi(res, 'No se pudo distribuir.'));
      }
    } catch {
      this.carga.ocultar('planificador');
      this.asignando = false;
      this.cdr.detectChanges();
      this.swal.error('Sin conexión. No se pudo distribuir.');
    }
  }

  async aplicar(): Promise<void> {
    if (!this.resultado) return;
    const ok = await this.swal.confirmar(
      '¿Aplicar a la hoja "rutas"?',
      'Se reemplazará TODO el contenido de PRÓXIMA (rutas) con estos ' + this.resultado.distribuidos + ' pedidos y se limpiará la hoja "planificacion".',
      'warning',
      'Sí, aplicar'
    );
    if (!ok) return;

    this.carga.mostrar('planificador', 'Aplicando a la hoja "rutas"...');
    try {
      const res = await this.api.post('planificar_aplicar', { asignacion: this.resultado.vehiculos }, this.sesion.token);
      this.carga.ocultar('planificador');
      if (res?.success) {
        this.swal.exito(res.msg || 'Planificación aplicada.');
        this.resultado = undefined;
        this.placaMapa = '';
        this.detallesGeo = [];
        this.removerMapa();
        await this.cargarEstado();
      } else {
        this.swal.error(this.msgApi(res, 'No se pudo aplicar.'));
      }
    } catch {
      this.carga.ocultar('planificador');
      this.swal.error('Sin conexión. No se pudo aplicar.');
    }
  }

  abrirModalAsignar(n: NoAsignado): void {
    this.pedidoAsignar = n;
    this.placaAsignar = this.resultado?.vehiculos?.[0]?.placa || '';
    this.modalAsignarAbierto = true;
    this.cdr.detectChanges();
  }

  cerrarModalAsignar(): void {
    this.modalAsignarAbierto = false;
    this.pedidoAsignar = null;
    this.placaAsignar = '';
    this.cdr.detectChanges();
  }

  restantePlaca(placa: string): number {
    const v = this.resultado?.vehiculos.find(x => x.placa === placa);
    return v ? v.capacidad - v.unidades : 0;
  }

  async asignarPedidoManual(): Promise<void> {
    const n = this.pedidoAsignar;
    if (!n || !this.resultado) return;
    const placa = this.placaAsignar.trim().toUpperCase();
    const v = this.resultado.vehiculos.find(x => x.placa === placa);
    if (!v) {
      this.swal.error('Selecciona una placa.');
      return;
    }
    const excede = n.unidades > (v.capacidad - v.unidades);
    if (excede) {
      const ok = await this.swal.confirmar(
        'Excede la capacidad',
        'La placa ' + placa + ' tiene ' + (v.capacidad - v.unidades) + ' uds libres y el pedido requiere ' + n.unidades + ' uds. ¿Asignar igualmente?',
        'warning',
        'Sí, asignar'
      );
      if (!ok) return;
    }
    const nuevo: PedidoAsignado = {
      pedido: n.pedido,
      filas: n.filas || [],
      cliente: n.cliente,
      distrito: n.distrito || '',
      direccion: n.direccion || '',
      referencia: n.referencia || '',
      observaciones: n.observaciones || '',
      lat: '',
      lng: '',
      orden: v.pedidos.length + 1,
      unidades: n.unidades
    };
    v.pedidos.push(nuevo);
    v.unidades += n.unidades;
    v.bajaCarga = v.capacidad > 0 && v.unidades / v.capacidad < 0.5;
    if (n.distrito && !v.distritos.includes(n.distrito)) v.distritos.push(n.distrito);
    this.resultado.noAsignados = (this.resultado.noAsignados || []).filter(x => x.pedido !== n.pedido);
    this.resultado.distribuidos += 1;
    this.sincronizarDestinosBajaCarga();
    this.cerrarModalAsignar();
    this.swal.exito('Pedido ' + n.pedido + ' asignado a ' + placa + '. Nota: al no tener coordenadas no se muestra en el mapa.');
    this.cdr.detectChanges();
    this.programarMapa();
  }

  cambiarPlacaMapa(): void {
    this.cdr.detectChanges();
    this.renderizarMapa();
  }

  get vehiculosBajaCarga(): AsignacionVehiculo[] {
    return (this.resultado?.vehiculos || []).filter(v => v.unidades > 0 && v.capacidad > 0 && v.unidades / v.capacidad < 0.5);
  }

  unidadesDePlaca(placa: string): number {
    const v = this.resultado?.vehiculos.find(x => x.placa === placa);
    return v ? v.unidades : 0;
  }

  private sincronizarDestinosBajaCarga(): void {
    const nuevos: Record<string, string> = {};
    this.vehiculosBajaCarga.forEach(v => {
      const opciones = this.destinosPosibles(v.placa);
      if (!opciones.length) return;
      const actual = this.destinoSeleccion[v.placa];
      nuevos[v.placa] = (actual && opciones.some(o => o.placa === actual)) ? actual : opciones[0].placa;
    });
    this.destinoSeleccion = nuevos;
  }

  destinosPosibles(origen: string): AsignacionVehiculo[] {
    const udsOrigen = this.unidadesDePlaca(origen);
    return this.vehiculosBajaCarga.filter(v =>
      v.placa !== origen &&
      v.unidades + udsOrigen <= v.capacidad
    );
  }

  async combinarVehiculos(origen: string, destino: string): Promise<void> {
    if (!this.resultado || this.combinando) return;
    if (!destino) { this.swal.error('No hay otro vehículo de baja carga con espacio para combinar.'); return; }
    this.combinando = true;
    this.carga.mostrar('planificador', 'Combinando ' + origen + ' → ' + destino + '...');
    try {
      const res = await this.api.post('planificar_combinar', {
        vehiculos: this.resultado.vehiculos,
        origen,
        destino
      }, this.sesion.token);
      this.carga.ocultar('planificador');
      this.combinando = false;
      if (res?.success) {
        this.resultado.vehiculos = (res.vehiculos || []) as AsignacionVehiculo[];
        this.resultado.kmTotal = res.kmTotal ?? this.resultado.kmTotal;
        if (this.placaMapa === origen) this.placaMapa = destino;
        this.sincronizarDestinosBajaCarga();
        this.cdr.detectChanges();
        this.programarMapa();
        this.swal.exito('Combinado. ' + origen + ' quedó como vehículo vacío.');
      } else {
        this.cdr.detectChanges();
        this.swal.error(this.msgApi(res, 'No se pudo combinar.'));
      }
    } catch {
      this.carga.ocultar('planificador');
      this.combinando = false;
      this.cdr.detectChanges();
      this.swal.error('Sin conexión. No se pudo combinar.');
    }
  }

  private programarMapa(): void {
    this.cdr.detectChanges();
    setTimeout(() => {
      this.inicializarMapa();
      this.renderizarMapa();
    }, 0);
  }

  private removerMapa(): void {
    if (this.map) {
      this.map.remove();
      this.map = undefined;
      this.mapaListo = false;
      this.capas = undefined;
    }
  }

  private inicializarMapa(): void {
    const el = document.getElementById('mapaPlanificador');
    if (!el) return;
    if (this.map) {
      // Si el contenedor actual del mapa ya no es el mismo del DOM (p.ej. fue
      // recreado por *ngIf tras "Aplicar"), eliminar el mapa huérfano y recrearlo.
      if (this.map.getContainer() === el) return;
      this.map.remove();
      this.map = undefined;
      this.mapaListo = false;
      this.capas = undefined;
    }

    this.map = L.map(el, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(this.map);
    this.capas = L.layerGroup().addTo(this.map);
    this.mapaListo = true;
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  renderizarMapa(): void {
    if (!this.mapaListo || !this.map || !this.capas || !this.resultado) {
      return;
    }
    const capas = this.capas;
    capas.clearLayers();

    const baseLat = this.resultado.base?.lat || PlanificadorComponent.BASE_LAT;
    const baseLng = this.resultado.base?.lng || PlanificadorComponent.BASE_LNG;

    const baseIcon = L.divIcon({
      className: 'punto-mapa punto-mapa--base',
      html: '<i class="fas fa-warehouse"></i>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
    L.marker([baseLat, baseLng], { icon: baseIcon }).addTo(capas)
      .bindPopup('<b>Base / Almacén</b><br>Colchones Forli');

    const pts: [number, number][] = [[baseLat, baseLng]];

    this.resultado.vehiculos.forEach((v, vi) => {
      if (!Array.isArray(v.pedidos)) return;
      const color = this.colores[vi % this.colores.length];
      const ordenados = [...v.pedidos]
        .filter(p => isFinite(parseFloat(p.lat)) && isFinite(parseFloat(p.lng)))
        .sort((a, b) => (a.orden || 0) - (b.orden || 0));

      ordenados.forEach(p => {
        const icon = L.divIcon({
          className: '',
          html: `<span class="punto-mapa" style="background:${color}">${p.orden}</span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        const m = L.marker([parseFloat(p.lat), parseFloat(p.lng)], { icon });
        m.bindPopup(`<b>${this.esc(v.placa)}</b> — ${p.orden}. ${this.esc(p.cliente)}<br>Ped: ${this.esc(p.pedido)}<br>${this.esc(p.distrito)}`);
        m.addTo(capas);
        pts.push([parseFloat(p.lat), parseFloat(p.lng)]);
      });

      if (v.placa === this.placaMapa && ordenados.length > 0) {
        const linea: [number, number][] = [[baseLat, baseLng]];
        ordenados.forEach(p => linea.push([parseFloat(p.lat), parseFloat(p.lng)]));
        L.polyline(linea, { color, weight: 3, opacity: 0.8 }).addTo(capas);
      }
    });

    // Fuerza a Leaflet a medir el tamaño real del contenedor antes de calcular
    // el zoom (evita la vista mundial cuando fitBounds corre con tamaño 0).
    this.map.invalidateSize();
    try {
      if (pts.length > 1) {
        this.map.fitBounds(L.latLngBounds(pts.map(p => L.latLng(p[0], p[1]))).pad(0.1));
      } else {
        this.map.setView([baseLat, baseLng], 12);
      }
    } catch {
      this.map.setView([baseLat, baseLng], 12);
    }
    setTimeout(() => this.map?.invalidateSize(), 150);
  }
}