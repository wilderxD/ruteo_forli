import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import {
  AsignacionVehiculo,
  DatosRuteoManual,
  PedidoAsignado,
  PedidoManual,
  ResultadoDistribucion
} from '../../../core/models';
import { SwalService } from '../../../shared/services/swal.service';

interface ParadaManual {
  pedido: PedidoManual;
  orden: number;
}

/**
 * Ruteo manual web. Fase 2: selección de placa, asignación por clic,
 * numeración por orden de clic, colores por placa y línea de la ruta
 * seleccionada. La edición avanzada queda para la siguiente fase.
 */
@Component({
  selector: 'app-ruteo-manual',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ruteo-manual.component.html',
  styleUrls: ['./ruteo-manual.component.scss']
})
export class RuteoManualComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) datos!: DatosRuteoManual;
  @Input() borradorKey = '';
  @Output() salir = new EventEmitter<void>();
  @Output() aplicar = new EventEmitter<ResultadoDistribucion>();

  @ViewChild('mapaContainer', { static: true })
  private mapaContainer!: ElementRef<HTMLDivElement>;

  placaSeleccionada = '';
  borradorRestaurado = false;
  readonly colores = ['#D32F2F', '#1565C0', '#2E7D32', '#F57C00', '#7B1FA2', '#00695C', '#5D4037', '#C2185B', '#00838F', '#9E9D24'];

  private map: L.Map | null = null;
  private capas: L.LayerGroup | null = null;
  private readonly rutas = new Map<string, string[]>();
  private readonly pedidosPorId = new Map<string, PedidoManual>();
  private readonly historial: Record<string, string[]>[] = [];
  private static readonly MAX_HISTORIAL = 50;

  constructor(
    private cdr: ChangeDetectorRef,
    private swal: SwalService
  ) {}

  get pedidosUbicados(): PedidoManual[] {
    return (this.datos?.pedidos || []).filter(p => this.coordenada(p) !== null);
  }

  get sinCoordsCount(): number {
    return Math.max(0, (this.datos?.pedidos?.length || 0) - this.pedidosUbicados.length);
  }

  get totalUnidades(): number {
    return this.pedidosUbicados.reduce((total, p) => total + (Number(p.unidades) || 0), 0);
  }

  get totalAsignados(): number {
    let total = 0;
    this.rutas.forEach(ids => { total += ids.length; });
    return total;
  }

  get unidadesAsignadas(): number {
    let total = 0;
    this.rutas.forEach(ids => {
      ids.forEach(id => {
        const p = this.pedidosPorId.get(id);
        if (p) total += Number(p.unidades) || 0;
      });
    });
    return total;
  }

  get puedeDeshacer(): boolean {
    return this.historial.length > 0;
  }

  get hayAsignaciones(): boolean {
    return this.totalAsignados > 0;
  }

  get paradasSeleccionadas(): ParadaManual[] {
    const ids = this.rutas.get(this.placaSeleccionada) || [];
    return ids
      .map((id, index) => {
        const pedido = this.pedidosPorId.get(id);
        return pedido ? { pedido, orden: index + 1 } : null;
      })
      .filter((x): x is ParadaManual => x !== null);
  }

  ngAfterViewInit(): void {
    (this.datos?.pedidos || []).forEach(p => {
      const id = this.clavePedido(p);
      if (id) this.pedidosPorId.set(id, p);
    });
    (this.datos?.vehiculos || []).forEach(v => {
      if (!this.rutas.has(v.placa)) this.rutas.set(v.placa, []);
    });

    this.placaSeleccionada = this.datos?.vehiculos?.[0]?.placa || '';
    this.cargarBorrador();
    this.inicializarMapa();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.capas = null;
    }
  }

  colorDePlaca(placa: string): string {
    const index = (this.datos?.vehiculos || []).findIndex(v => v.placa === placa);
    return this.colores[(index >= 0 ? index : 0) % this.colores.length];
  }

  capacidadDe(placa: string): number {
    const v = (this.datos?.vehiculos || []).find(x => x.placa === placa);
    return v?.capacidad || 30;
  }

  zonasDe(placa: string): string[] {
    return (this.datos?.vehiculos || []).find(x => x.placa === placa)?.zonas || [];
  }

  excedeCapacidad(placa: string): boolean {
    return this.unidadesDePlaca(placa) > this.capacidadDe(placa);
  }

  fueraDeZona(p: PedidoManual, placa: string): boolean {
    const zonas = this.zonasDe(placa);
    return zonas.length > 0 && !!p.zona && !zonas.includes(p.zona);
  }

  formatearUnidades(valor: number): string {
    if (!Number.isFinite(valor)) return '0';
    return Number.isInteger(valor) ? String(valor) : String(Math.round(valor * 100) / 100);
  }

  paradasDe(placa: string): number {
    return (this.rutas.get(placa) || []).length;
  }

  unidadesDePlaca(placa: string): number {
    return (this.rutas.get(placa) || []).reduce((total, id) => {
      const p = this.pedidosPorId.get(id);
      return total + (p ? Number(p.unidades) || 0 : 0);
    }, 0);
  }

  resumenProductos(p: PedidoManual): string {
    const items = p.items?.length ? p.items : [{ codigo: '', modelo: p.modelo || '', cantidad: p.cantidad || '' }];
    return items.map(it => {
      const nombre = it.modelo || p.modelo || 'Producto';
      const cantidad = it.cantidad ? ' x' + it.cantidad : '';
      return nombre + cantidad;
    }).join(' · ');
  }

  seleccionarPlaca(placa: string): void {
    this.placaSeleccionada = placa;
    this.cdr.detectChanges();
    this.renderizarMapa(false);
  }

  volver(): void {
    this.salir.emit();
  }

  private async agregarPedido(p: PedidoManual): Promise<void> {
    const placa = this.placaSeleccionada;
    if (!placa) {
      void this.swal.aviso('Selecciona una placa antes de agregar pedidos.', 'info');
      return;
    }

    const id = this.clavePedido(p);
    if (!id) return;

    const placaActual = this.placaDePedido(id);
    if (placaActual) {
      if (placaActual === placa) {
        this.quitarPedido(id);
        return;
      }
      void this.swal.aviso('Este pedido ya está asignado a ' + placaActual + '.', 'info');
      return;
    }

    const unidadesNuevas = this.unidadesDePlaca(placa) + (Number(p.unidades) || 0);
    const excede = unidadesNuevas > this.capacidadDe(placa);
    const zonaInvalida = this.fueraDeZona(p, placa);

    if (excede || zonaInvalida) {
      const partes: string[] = [];
      if (excede) {
        partes.push('La placa ' + placa + ' tiene ' + this.formatearUnidades(this.capacidadDe(placa))
          + ' uds de capacidad y quedaría en ' + this.formatearUnidades(unidadesNuevas) + ' uds.');
      }
      if (zonaInvalida) {
        partes.push('El pedido es de ' + (p.zona || 'otra zona') + ' y la placa permite: '
          + this.zonasDe(placa).join(', ') + '.');
      }
      const continuar = await this.swal.confirmar(
        'Advertencia de asignación',
        partes.join('\n\n') + '\n\n¿Agregar igualmente?',
        'warning',
        'Sí, agregar'
      );
      if (!continuar) return;

      // La espera del diálogo permite que otro clic haya asignado el pedido.
      if (this.placaDePedido(id)) {
        void this.swal.aviso('El pedido ya fue asignado mientras se mostraba la advertencia.', 'info');
        return;
      }
    }

    this.guardarHistorial();
    const ruta = this.rutas.get(placa) || [];
    ruta.push(id);
    this.rutas.set(placa, ruta);
    this.guardarBorrador();

    this.cdr.detectChanges();
    this.renderizarMapa(false);
  }

  quitarPedido(id: string): void {
    const pedidoId = String(id ?? '').trim();
    const placa = this.placaDePedido(pedidoId);
    if (!placa) return;
    const ruta = this.rutas.get(placa);
    if (!ruta) return;
    const indice = ruta.indexOf(pedidoId);
    if (indice < 0) return;

    this.guardarHistorial();
    ruta.splice(indice, 1);
    this.guardarBorrador();
    this.cdr.detectChanges();
    this.renderizarMapa(false);
  }

  moverParada(id: string, delta: number): void {
    const pedidoId = String(id ?? '').trim();
    const placa = this.placaSeleccionada;
    const ruta = this.rutas.get(placa);
    if (!ruta) return;
    const indice = ruta.indexOf(pedidoId);
    const destino = indice + delta;
    if (indice < 0 || destino < 0 || destino >= ruta.length) return;

    this.guardarHistorial();
    const [movido] = ruta.splice(indice, 1);
    ruta.splice(destino, 0, movido);
    this.guardarBorrador();
    this.cdr.detectChanges();
    this.renderizarMapa(false);
  }

  async limpiarPlaca(): Promise<void> {
    const placa = this.placaSeleccionada;
    const ruta = this.rutas.get(placa);
    if (!placa || !ruta || ruta.length === 0) return;

    const ok = await this.swal.confirmar(
      'Limpiar ruta',
      'Se quitarán ' + ruta.length + ' parada(s) de la placa ' + placa + '.',
      'warning',
      'Sí, limpiar'
    );
    if (!ok) return;

    this.guardarHistorial();
    ruta.length = 0;
    this.guardarBorrador();
    this.cdr.detectChanges();
    this.renderizarMapa(false);
  }

  async reiniciarTodo(): Promise<void> {
    if (!this.hayAsignaciones) return;
    const ok = await this.swal.confirmar(
      'Reiniciar ruteo manual',
      'Se quitarán todas las paradas asignadas a todas las placas.',
      'warning',
      'Sí, reiniciar'
    );
    if (!ok) return;

    this.guardarHistorial();
    this.rutas.forEach(ruta => { ruta.length = 0; });
    this.guardarBorrador();
    this.cdr.detectChanges();
    this.renderizarMapa(false);
  }

  deshacer(): void {
    const anterior = this.historial.pop();
    if (!anterior) return;
    this.rutas.clear();
    Object.keys(anterior).forEach(placa => {
      this.rutas.set(placa, anterior[placa].slice());
    });
    this.guardarBorrador();
    this.cdr.detectChanges();
    this.renderizarMapa(false);
  }

  aplicarRuteo(): void {
    if (!this.hayAsignaciones) {
      void this.swal.aviso('Agrega al menos una parada antes de aplicar.', 'info');
      return;
    }

    const base = this.datos.base || { lat: -11.8297773, lng: -77.097072 };
    const vehiculos: AsignacionVehiculo[] = this.datos.vehiculos.map(v => {
      const ids = this.rutas.get(v.placa) || [];
      const pedidos: PedidoAsignado[] = [];

      ids.forEach((id, index) => {
        const p = this.pedidosPorId.get(id);
        if (!p) return;
        pedidos.push({
          pedido: p.pedido,
          filas: p.filas || [],
          cliente: p.cliente,
          distrito: p.distrito || '',
          direccion: p.direccion || '',
          referencia: p.referencia || '',
          observaciones: p.observaciones || '',
          lat: p.lat,
          lng: p.lng,
          orden: index + 1,
          unidades: Number(p.unidades) || 0,
          modelo: p.modelo,
          cantidad: p.cantidad,
          zona: p.zona,
          items: p.items
        });
      });

      const unidades = pedidos.reduce((total, p) => total + (Number(p.unidades) || 0), 0);
      const distritos = Array.from(new Set(pedidos.map(p => p.distrito).filter(d => !!d)));

      return {
        placa: v.placa,
        capacidad: v.capacidad,
        unidades,
        zonas: v.zonas || [],
        km: this.kmRuta(ids),
        distritos,
        bajaCarga: unidades > 0 && v.capacidad > 0 && unidades / v.capacidad < 0.5,
        pedidos
      };
    });

    const kmTotal = Math.round(vehiculos.reduce((total, v) => total + v.km, 0) * 10) / 10;
    const resultado: ResultadoDistribucion = {
      success: true,
      vehiculos,
      kmTotal,
      distribuidos: this.totalAsignados,
      sinUbicar: this.sinCoordsCount,
      sinUbicarDetalle: this.datos.sinCoordsDetalle || [],
      noAsignados: [],
      base,
      sinAsignar: Math.max(0, this.pedidosUbicados.length - this.totalAsignados)
    };
    this.aplicar.emit(resultado);
  }

  private guardarHistorial(): void {
    const copia: Record<string, string[]> = {};
    this.rutas.forEach((ids, placa) => {
      copia[placa] = ids.slice();
    });
    this.historial.push(copia);
    if (this.historial.length > RuteoManualComponent.MAX_HISTORIAL) {
      this.historial.shift();
    }
  }

  private kmRuta(ids: string[]): number {
    const base = this.datos.base || { lat: -11.8297773, lng: -77.097072 };
    let lat = base.lat;
    let lng = base.lng;
    let total = 0;

    ids.forEach(id => {
      const p = this.pedidosPorId.get(id);
      const coord = p ? this.coordenada(p) : null;
      if (!coord) return;
      total += this.haversineKm(lat, lng, coord.lat, coord.lng);
      lat = coord.lat;
      lng = coord.lng;
    });

    return Math.round(total * 10) / 10;
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const radio = 6371;
    const toRad = (grados: number) => grados * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * radio * Math.asin(Math.sqrt(a));
  }

  private guardarBorrador(): void {
    if (!this.borradorKey) return;
    if (this.totalAsignados === 0) this.borradorRestaurado = false;
    const rutas: Record<string, string[]> = {};
    this.rutas.forEach((ids, placa) => {
      rutas[placa] = ids.slice();
    });
    try {
      localStorage.setItem(this.borradorKey, JSON.stringify({ rutas, guardado: Date.now() }));
    } catch {
      /* localStorage no disponible o cuota llena */
    }
  }

  private cargarBorrador(): void {
    if (!this.borradorKey) return;

    try {
      const raw = localStorage.getItem(this.borradorKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { rutas?: Record<string, unknown> };
      const guardadas = parsed?.rutas;
      if (!guardadas || typeof guardadas !== 'object') return;

      this.rutas.forEach((_, placa) => { this.rutas.set(placa, []); });
      const usados = new Set<string>();

      Object.keys(guardadas).forEach(placa => {
        if (!this.rutas.has(placa)) return;
        const crudas = Array.isArray(guardadas[placa]) ? guardadas[placa] as unknown[] : [];
        const ids: string[] = [];
        crudas.forEach(idRaw => {
          const id = String(idRaw ?? '').trim();
          if (!id || !this.pedidosPorId.has(id) || usados.has(id)) return;
          usados.add(id);
          ids.push(id);
        });
        this.rutas.set(placa, ids);
      });

      this.borradorRestaurado = this.totalAsignados > 0;
    } catch {
      /* borrador inválido o localStorage no disponible */
    }
  }

  private placaDePedido(id: string): string {
    for (const [placa, ids] of this.rutas) {
      if (ids.includes(id)) return placa;
    }
    return '';
  }

  private ordenDePedido(id: string): number {
    for (const ids of this.rutas.values()) {
      const index = ids.indexOf(id);
      if (index >= 0) return index + 1;
    }
    return 0;
  }

  private clavePedido(p: PedidoManual): string {
    return String(p.pedido ?? '').trim();
  }

  private inicializarMapa(): void {
    const el = this.mapaContainer?.nativeElement;
    if (!el) return;

    this.map = L.map(el, {
      scrollWheelZoom: true,
      wheelDebounceTime: 40,
      wheelPxPerZoomLevel: 120
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(this.map);
    this.capas = L.layerGroup().addTo(this.map);

    this.renderizarMapa(true);
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  private renderizarMapa(ajustarVista: boolean): void {
    if (!this.map || !this.capas || !this.datos) return;

    const capas = this.capas;
    capas.clearLayers();

    const base = this.datos.base || { lat: -11.8297773, lng: -77.097072 };
    const puntos: [number, number][] = [[base.lat, base.lng]];

    const baseIcon = L.divIcon({
      className: '',
      html: '<span class="punto-manual punto-manual--base"><i class="fas fa-warehouse"></i></span>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
    L.marker([base.lat, base.lng], { icon: baseIcon })
      .addTo(capas)
      .bindTooltip('<b>Base / Almacén</b><br>Colchones Forli', {
        direction: 'top',
        opacity: 1,
        className: 'tooltip-ruteo-manual'
      });

    this.pedidosUbicados.forEach(p => {
      const coord = this.coordenada(p);
      if (!coord) return;

      const id = this.clavePedido(p);
      const placa = this.placaDePedido(id);
      const orden = this.ordenDePedido(id);
      const esPlacaSeleccionada = placa === this.placaSeleccionada;
      const color = placa ? this.colorDePlaca(placa) : '#6B7280';

      const html = placa
        ? '<span class="punto-manual punto-manual--asignado" style="background:' + color
          + ';opacity:' + (esPlacaSeleccionada ? '1' : '0.45') + '"><span>' + orden + '</span></span>'
        : '<span class="punto-manual"></span>';

      const icon = L.divIcon({
        className: '',
        html,
        iconSize: placa ? [24, 24] : [18, 18],
        iconAnchor: placa ? [12, 12] : [9, 9]
      });

      const marker = L.marker([coord.lat, coord.lng], { icon });
      marker.on('click', () => { void this.agregarPedido(p); });
      marker.bindTooltip(this.tooltipHtml(p), {
        sticky: true,
        direction: 'top',
        opacity: 1,
        className: 'tooltip-ruteo-manual'
      });
      marker.addTo(capas);
      puntos.push([coord.lat, coord.lng]);
    });

    const paradas = this.paradasSeleccionadas;
    if (paradas.length > 0) {
      const linea: [number, number][] = [[base.lat, base.lng]];
      paradas.forEach(parada => {
        const coord = this.coordenada(parada.pedido);
        if (coord) linea.push([coord.lat, coord.lng]);
      });
      if (linea.length > 1) {
        L.polyline(linea, {
          color: this.colorDePlaca(this.placaSeleccionada),
          weight: 4,
          opacity: 0.85
        }).addTo(capas);
      }
    }

    this.map.invalidateSize();
    if (ajustarVista) {
      try {
        if (puntos.length > 1) {
          this.map.fitBounds(L.latLngBounds(puntos.map(p => L.latLng(p[0], p[1]))).pad(0.1));
        } else {
          this.map.setView([base.lat, base.lng], 12);
        }
      } catch {
        this.map.setView([base.lat, base.lng], 12);
      }
    }
    setTimeout(() => this.map?.invalidateSize(), 150);
  }

  private coordenada(p: PedidoManual): { lat: number; lng: number } | null {
    const lat = Number.parseFloat(String(p.lat ?? '').replace(',', '.'));
    const lng = Number.parseFloat(String(p.lng ?? '').replace(',', '.'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  private esc(valor: unknown): string {
    const div = document.createElement('div');
    div.textContent = valor == null ? '' : String(valor);
    return div.innerHTML;
  }

  private tooltipHtml(p: PedidoManual): string {
    const items = (p.items?.length ? p.items : [{
      codigo: '',
      modelo: p.modelo || '',
      cantidad: p.cantidad || ''
    }]);

    const productos = items.map(it => {
      const nombre = it.modelo || p.modelo || 'Producto sin nombre';
      const codigo = it.codigo ? ' <span class="tooltip-ruteo-codigo">(' + this.esc(it.codigo) + ')</span>' : '';
      const cantidad = it.cantidad ? '<div class="tooltip-ruteo-cantidad">Cantidad: ' + this.esc(it.cantidad) + '</div>' : '';
      return '<div class="tooltip-ruteo-producto-item">'
        + '<div class="tooltip-ruteo-producto">' + this.esc(nombre) + codigo + '</div>'
        + cantidad
        + '</div>';
    }).join('');

    const id = this.clavePedido(p);
    const placa = this.placaDePedido(id);
    const asignacion = placa
      ? '<div class="tooltip-ruteo-asignado" style="color:' + this.colorDePlaca(placa) + '">'
        + '<i class="fas fa-check-circle"></i> ' + this.esc(placa) + ' · parada ' + this.ordenDePedido(id)
        + '</div>'
      : '<div class="tooltip-ruteo-sin-asignar"><i class="fas fa-circle"></i> Sin asignar</div>';

    return '<div class="tooltip-ruteo">'
      + '<div class="tooltip-ruteo-cliente">' + this.esc(p.cliente) + '</div>'
      + '<div class="tooltip-ruteo-meta">Pedido ' + this.esc(p.pedido) + ' · ' + this.esc(p.unidades) + ' uds</div>'
      + productos
      + '<div class="tooltip-ruteo-direccion"><i class="fas fa-map-marker-alt"></i> ' + this.esc(p.direccion) + '</div>'
      + '<div class="tooltip-ruteo-distrito">' + this.esc(p.distrito) + (p.zona ? ' · ' + this.esc(p.zona) : '') + '</div>'
      + asignacion
      + '</div>';
  }
}
