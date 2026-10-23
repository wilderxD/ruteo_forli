import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import * as L from 'leaflet';
import { ApiService } from '../../core/services/api.service';
import { SesionService } from '../../core/services/sesion.service';
import { SwalService } from '../../shared/services/swal.service';
import { CargandoService } from '../../shared/services/cargando.service';
import { Ruta, RutaCompleta, CandidatoGeo } from '../../core/models';

@Component({
  selector: 'app-chofer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chofer.component.html',
  styleUrls: ['./chofer.component.scss']
})
export class ChoferComponent implements OnInit, OnDestroy {
  rutasHoy: Ruta[] = [];
  rutasPlanificadas: Ruta[] = [];
  fechaGlobalTexto = '';
  tabActiva: 'hoy' | 'manana' = 'hoy';
  distritoHoy = 'ALL';
  distritoManana = 'ALL';
  opcionesDistritoHoy: string[] = [];
  opcionesDistritoManana: string[] = [];
  cargando = false;
  baseLat = '';
  baseLng = '';
  autoRuteando = false;
  mostrarMapa = false;
  modoManual = false;
  pendientes: Ruta[] = [];
  pendienteSeleccionado: Ruta | null = null;
  ubicadasManual = new Set<string>();
  seleccionManual = new Set<string>();
  candidatosPorPedido = new Map<string, CandidatoGeo[]>();
  private map?: L.Map;
  private capas?: L.LayerGroup;
  private mapaListo = false;
  private paramsSub!: Subscription;
  private coordsOriginales = new Map<string, { lat: string; lng: string }>();

  constructor(
    private api: ApiService,
    private sesion: SesionService,
    private swal: SwalService,
    private carga: CargandoService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  /** Escapa HTML para los popups de Leaflet (los datos vienen de la hoja/Excel y
   *  no son confiables; evita inyección XSS almacenado). */
  private esc(t: any): string {
    const d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
  }

  /** Convierte una coordenada a número, tolerando coma decimal. El backend
   *  ya entrega siempre el valor normalizado con punto. */
  private coordNumero(v: string | null | undefined): number {
    if (v == null || v === '') return NaN;
    const s = String(v).trim().replace(',', '.');
    const n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  private tieneCoordenada(r: Ruta): boolean {
    return Number.isFinite(this.coordNumero(r.lat)) && Number.isFinite(this.coordNumero(r.lng));
  }

  get placa(): string {
    return this.sesion.placa;
  }

  set placa(v: string) {
    this.sesion.setPlaca(v);
  }

  get placas(): string[] {
    return this.sesion.obtener()?.placas ?? [];
  }

  get esAdmin(): boolean {
    return this.sesion.rol === 'admin';
  }

  get fechaHoy(): string {
    const d = new Date();
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return dias[d.getDay()] + ' ' + this.fechaFormateada(d);
  }

  private fechaFormateada(f: Date): string {
    const dd = String(f.getDate()).padStart(2, '0');
    const mm = String(f.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${f.getFullYear()}`;
  }

  async ngOnInit(): Promise<void> {
    this.paramsSub = this.route.params.subscribe(async params => {
      const placaParam = params['placa'];
      if (placaParam) {
        this.sesion.setPlaca(placaParam);
      }
      this.resetearManual();
      await this.cargar();
    });
  }

  ngOnDestroy(): void {
    if (this.paramsSub) this.paramsSub.unsubscribe();
    if (this.map) {
      this.map.remove();
      this.map = undefined;
      this.mapaListo = false;
    }
  }

  volverAdmin(): void {
    this.router.navigate(['/admin']);
  }

  cambiarTab(tab: 'hoy' | 'manana'): void {
    this.tabActiva = tab;
    if (tab === 'manana') this.programarMapa();
  }

  async cambiarPlaca(): Promise<void> {
    this.resetearManual();
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    this.carga.mostrar('chofer', 'Cargando ruta…');
    try {
      const res = await this.api.get('ruta_completa', { placa: this.placa }, this.sesion.token);
      if (res.success) {
        const datos = res as unknown as RutaCompleta;
        this.rutasHoy = datos.rutasHoy ?? [];
        this.rutasPlanificadas = datos.rutasPlanificadas ?? [];
        this.fechaGlobalTexto = datos.fechaGlobalTexto ?? '';
        this.baseLat = datos.baseLat ?? '';
        this.baseLng = datos.baseLng ?? '';
        this.opcionesDistritoHoy = [...new Set(this.rutasHoy.map(r => r.distrito).filter(Boolean))];
        this.opcionesDistritoManana = [...new Set(this.rutasPlanificadas.map(r => r.distrito).filter(Boolean))];
      }
    } catch {
      this.swal.error('Sin conexión. No se pudo cargar la ruta.');
    } finally {
      this.cargando = false;
      this.carga.ocultar('chofer');
      this.cdr.detectChanges();
      if (this.tabActiva === 'manana') {
        try {
          this.programarMapa();
        } catch {
          /* un error del mapa nunca debe bloquear la carga de datos */
        }
      }
    }
  }

  filtrarHoy(): Ruta[] {
    if (this.distritoHoy === 'ALL') return this.rutasHoy;
    return this.rutasHoy.filter(r => r.distrito === this.distritoHoy);
  }

  estadoInfo(r: Ruta): { texto: string; clase: string } {
    const e = (r.estado || '').trim().toUpperCase();
    if (e === '1' || e === 'ENTREGADO') return { texto: '✓ Entregado', clase: 'bg-[#2E7D32]/10 text-[#2E7D32] border-[#2E7D32]/30' };
    if (e === '2' || e === 'RECHAZADO') return { texto: 'Rechazado', clase: 'bg-red-50 text-red-700 border-red-200' };
    if (e === '3' || e === 'NO ENTREGADO') return { texto: 'No entregado', clase: 'bg-[#FFE9E7] text-[#B25E00] border-[#E4BEBA]' };
    return { texto: 'Pendiente', clase: 'bg-slate-100 text-slate-500 border-slate-200' };
  }

  filtrarManana(): Ruta[] {
    const lista = this.distritoManana === 'ALL' ? this.rutasPlanificadas : this.rutasPlanificadas.filter(r => r.distrito === this.distritoManana);
    return [...lista].sort((a, b) => {
      const oa = parseInt(a.ordenActual) || 999;
      const ob = parseInt(b.ordenActual) || 999;
      return oa - ob;
    });
  }

  get enModoSeleccion(): boolean {
    return this.modoManual || this.seleccionManual.size > 0;
  }

  /** Pedidos con ubicación por señalizar/confirmar: los inciertos del auto-ruteo + los elegidos a mano. */
  get pedidosSeleccion(): Ruta[] {
    const vistos = new Set<string>();
    const lista: Ruta[] = [];
    const agregar = (r: Ruta) => {
      const k = String(r.pedido);
      if (vistos.has(k)) return;
      vistos.add(k);
      lista.push(r);
    };
    this.pendientes.forEach(agregar);
    this.rutasPlanificadas.forEach(r => { if (this.seleccionManual.has(String(r.pedido))) agregar(r); });
    return lista;
  }

  esSeleccionManual(r: Ruta): boolean {
    return this.seleccionManual.has(String(r.pedido));
  }

  esPendienteAuto(r: Ruta): boolean {
    return this.pendientes.some(p => String(p.pedido) === String(r.pedido));
  }

  /** Guarda las coordenadas previas para poder descartar un ajuste no aplicado. */
  private recordarCoordenadas(r: Ruta): void {
    const k = String(r.pedido);
    if (!this.coordsOriginales.has(k)) {
      this.coordsOriginales.set(k, { lat: r.lat ?? '', lng: r.lng ?? '' });
    }
  }

  /** Quita la selección y devuelve el pedido a su ubicación anterior. */
  private restaurarSeleccion(r: Ruta): void {
    const k = String(r.pedido);
    const original = this.coordsOriginales.get(k);
    if (original) {
      r.lat = original.lat;
      r.lng = original.lng;
    }
    this.coordsOriginales.delete(k);
    this.ubicadasManual.delete(k);
    this.seleccionManual.delete(k);
    if (this.pendienteSeleccionado === r) this.pendienteSeleccionado = null;
  }

  /** Descarta todos los ajustes manuales que aún no se guardaron. */
  private descartarCambiosManuales(): void {
    this.coordsOriginales.forEach((coords, pedido) => {
      const r = this.rutasPlanificadas.find(x => String(x.pedido) === pedido);
      if (r) {
        r.lat = coords.lat;
        r.lng = coords.lng;
      }
    });
    this.coordsOriginales.clear();
  }

  /** Alterna la selección manual de un pedido (aunque ya esté auto-ubicado). */
  seleccionarPedido(r: Ruta): void {
    const k = String(r.pedido);
    if (this.seleccionManual.has(k)) {
      this.restaurarSeleccion(r);
    } else {
      this.recordarCoordenadas(r);
      this.seleccionManual.add(k);
      this.pendienteSeleccionado = r;
      if (!this.mostrarMapa) {
        this.mostrarMapa = true;
        setTimeout(() => { this.inicializarMapa(); this.renderizarMapa(true); }, 0);
      }
    }
    this.cdr.detectChanges();
    this.renderizarMapa(false);
  }

  quitarSeleccion(r: Ruta): void {
    this.restaurarSeleccion(r);
    this.cdr.detectChanges();
    this.renderizarMapa(false);
  }

  setOrden(r: Ruta, valor: string): void {
    const total = this.rutasPlanificadas.length;
    const n = parseInt(valor);
    if (!n || n < 1 || n > total) {
      r.ordenActual = '';
      this.swal.aviso(`Debe ser entre 1 y ${total}`);
      return;
    }
    const repetido = this.rutasPlanificadas.some(x => x !== r && x.ordenActual && parseInt(x.ordenActual) === n);
    if (repetido) {
      r.ordenActual = '';
      this.swal.error('Este número ya fue asignado.');
      return;
    }
    r.ordenActual = String(n);
    this.cdr.detectChanges();
    this.renderizarMapa(false);
  }

  async restablecerOrdenes(): Promise<void> {
    const ok = await this.swal.confirmar('¿Borrar todos los números de entrega?', 'Se eliminarán los números de orden.', 'warning');
    if (ok) {
      this.rutasPlanificadas.forEach(r => r.ordenActual = '');
      this.cdr.detectChanges();
      this.renderizarMapa(false);
    }
  }

  /** Indica si hay una ruta numerada que se pueda invertir. */
  get puedeInvertirRuta(): boolean {
    if (this.cargando || this.autoRuteando || this.enModoSeleccion) return false;
    return this.rutasPlanificadas.filter(r => parseInt(r.ordenActual, 10) > 0).length >= 2;
  }

  /** Invierte el orden de los pedidos ya numerados y los renumera 1..N. */
  invertirRuta(): void {
    if (!this.puedeInvertirRuta) return;

    const ordenadas = this.rutasPlanificadas
      .filter(r => parseInt(r.ordenActual, 10) > 0)
      .sort((a, b) => parseInt(a.ordenActual, 10) - parseInt(b.ordenActual, 10));

    ordenadas.reverse().forEach((r, i) => { r.ordenActual = String(i + 1); });
    this.cdr.detectChanges();
    this.renderizarMapa(false);
  }

  private programarMapa(): void {
    this.mostrarMapa = this.rutasPlanificadas.some(r => this.tieneCoordenada(r));
    this.cdr.detectChanges();
    if (!this.mostrarMapa) return;
    setTimeout(() => {
      this.inicializarMapa();
      this.renderizarMapa(true);
    }, 0);
  }

  private inicializarMapa(): void {
    const el = document.getElementById('mapaRuta');
    if (!el) return;

    // Al cambiar de pestaña Angular destruye y recrea el contenedor del mapa.
    // Si el mapa anterior quedó vivo, hay que descartarlo antes de inicializar
    // el nuevo; de lo contrario Leaflet sigue dibujando sobre un nodo huérfano.
    if (this.map && this.map.getContainer() === el) return;
    if (this.map) {
      this.map.remove();
      this.map = undefined;
      this.capas = undefined;
      this.mapaListo = false;
    }

    this.map = L.map(el, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(this.map);
    this.capas = L.layerGroup().addTo(this.map);
    this.mapaListo = true;

    // Colocar manualmente el punto pendiente seleccionado con un clic en el mapa
    this.map.on('click', (ev: L.LeafletMouseEvent) => {
      if (!this.enModoSeleccion || !this.pendienteSeleccionado) return;
      const r = this.pendienteSeleccionado;
      this.recordarCoordenadas(r);
      r.lat = String(Number(ev.latlng.lat));
      r.lng = String(Number(ev.latlng.lng));
      this.ubicadasManual.add(String(r.pedido));
      this.seleccionManual.add(String(r.pedido));
      this.pendienteSeleccionado = null;
      this.cdr.detectChanges();
      // No mover la vista: el usuario debe seguir viendo el punto que acaba de colocar.
      this.renderizarMapa(false);
    });

    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  /** Dibuja los puntos de entrega de la placa y la ruta; destaca el distrito filtrado.
   *  `ajustarVista` debe ser false al arrastrar/colocar un pin para no devolver
   *  el mapa a la base después de cada ajuste manual. */
  renderizarMapa(ajustarVista = false): void {
    if (!this.mapaListo || !this.map || !this.capas) return;
    const capas = this.capas;
    const map = this.map;
    capas.clearLayers();

    const puntos = this.rutasPlanificadas.filter(r => this.tieneCoordenada(r));
    const baseLat = parseFloat(this.baseLat) || -11.8297773;
    const baseLng = parseFloat(this.baseLng) || -77.097072;
    const distritoSel = this.distritoManana;

    const baseIcon = L.divIcon({
      className: 'punto-mapa punto-mapa--base',
      html: '<i class="fas fa-warehouse"></i>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
    const baseMarker = L.marker([baseLat, baseLng], { icon: baseIcon }).addTo(capas);
    baseMarker.bindPopup('<b>Base / Almacén</b><br>Colchones Forli');

    const esManual = (r: Ruta) => (this.modoManual && this.pendientes.some(p => String(p.pedido) === String(r.pedido)))
      || this.seleccionManual.has(String(r.pedido));

    const ordenados = [...puntos]
      .filter(r => r.ordenActual && r.ordenActual.trim() !== '')
      .sort((a, b) => (parseInt(a.ordenActual, 10) || 999) - (parseInt(b.ordenActual, 10) || 999));
    const manuales = puntos.filter(esManual);
    const sinOrden = puntos.filter(r => (!r.ordenActual || r.ordenActual.trim() === '') && !esManual(r));

    ordenados.filter(r => !esManual(r)).forEach(r => {
      const destacado = distritoSel !== 'ALL' && r.distrito === distritoSel;
      const icon = L.divIcon({
        className: 'punto-mapa' + (destacado ? ' punto-mapa--destacado' : ''),
        html: `<span>${r.ordenActual}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      const m = L.marker([this.coordNumero(r.lat), this.coordNumero(r.lng)], { icon }).addTo(capas);
      m.bindPopup(`<b>${r.ordenActual}. ${this.esc(r.cliente)}</b><br>Ped: ${this.esc(r.pedido)}<br>${this.esc(r.direccion)}<br>${this.esc(r.distrito)}`);
    });

    manuales.forEach(r => {
      const ubicada = this.ubicadasManual.has(String(r.pedido));
      const etiqueta = r.ordenActual && r.ordenActual.trim() !== '' ? r.ordenActual : (ubicada ? '✓' : '?');
      const icon = L.divIcon({
        className: 'punto-mapa punto-mapa--pendiente' + (ubicada ? ' punto-mapa--manual' : ''),
        html: `<span>${etiqueta}</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      const m = L.marker([this.coordNumero(r.lat), this.coordNumero(r.lng)], { icon, draggable: true });
      m.on('dragend', (ev: any) => {
        const ll = ev.target.getLatLng();
        this.recordarCoordenadas(r);
        r.lat = String(Number(ll.lat));
        r.lng = String(Number(ll.lng));
        this.ubicadasManual.add(String(r.pedido));
        this.seleccionManual.add(String(r.pedido));
        this.cdr.detectChanges();
        // Conservar el centro y zoom actuales para poder revisar el punto
        // recién soltado (antes se hacía fitBounds/setView a la base).
        this.renderizarMapa(false);
      });
      m.addTo(capas);
      m.bindPopup(`<b>${this.esc(r.cliente)}</b><br>Ped: ${this.esc(r.pedido)}<br>${this.esc(r.direccion)}<br>${this.esc(r.distrito)}`);
    });

    sinOrden.forEach(r => {
      const destacado = distritoSel !== 'ALL' && r.distrito === distritoSel;
      const icon = L.divIcon({
        className: 'punto-mapa punto-mapa--sin' + (destacado ? ' punto-mapa--destacado' : ''),
        html: '<span>·</span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });
      L.marker([this.coordNumero(r.lat), this.coordNumero(r.lng)], { icon }).addTo(capas);
    });

    const pts: [number, number][] = [[baseLat, baseLng], ...ordenados.map(r => [this.coordNumero(r.lat), this.coordNumero(r.lng)] as [number, number])];
    for (let i = 0; i < pts.length - 1; i++) {
      const destino = ordenados[i];
      const destacado = distritoSel !== 'ALL' && destino.distrito === distritoSel;
      L.polyline([pts[i], pts[i + 1]], {
        color: destacado ? '#E53935' : '#1565C0',
        weight: 3,
        opacity: 0.8
      }).addTo(capas);
    }

    if (ajustarVista) {
      // Para calcular la vista se incluyen también los pines manuales, no
      // solo los pedidos ya numerados. Si no, al haber un único pin manual
      // el mapa se centraba de nuevo en la base.
      const ptsVista: [number, number][] = [[baseLat, baseLng]];
      puntos.forEach(r => {
        const la = this.coordNumero(r.lat);
        const lo = this.coordNumero(r.lng);
        if (isFinite(la) && isFinite(lo)) ptsVista.push([la, lo]);
      });
      if (ptsVista.length > 1) {
        map.fitBounds(L.latLngBounds(ptsVista.map(p => L.latLng(p[0], p[1]))).pad(0.1));
      } else {
        map.setView([baseLat, baseLng], 12);
      }
    }
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const toRad = (d: number) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /** Ordena por distrito (termina todo un distrito antes de pasar al siguiente), encadenando
   *  los distritos desde el último punto visitado; dentro de cada distrito usa el vecino más cercano. */
  private ordenarPorCercania(rutas: Ruta[], baseLat: number, baseLng: number): Ruta[] {
    const grupos = new Map<string, Ruta[]>();
    rutas.forEach(r => {
      const dist = (r.distrito || 'SIN DISTRITO').trim().toUpperCase() || 'SIN DISTRITO';
      if (!grupos.has(dist)) grupos.set(dist, []);
      grupos.get(dist)!.push(r);
    });

    const ordenadas: Ruta[] = [];
    let lat = baseLat;
    let lng = baseLng;

    while (grupos.size > 0) {
      let mejorKey: string | null = null;
      let mejorDist = Infinity;
      for (const key of grupos.keys()) {
        grupos.get(key)!.forEach(r => {
          const d = this.haversineKm(lat, lng, this.coordNumero(r.lat), this.coordNumero(r.lng));
          if (d < mejorDist) {
            mejorDist = d;
            mejorKey = key;
          }
        });
      }
      if (!mejorKey) break;

      const pts = grupos.get(mejorKey)!;
      while (pts.length > 0) {
        let mejor = 0;
        let menor = Infinity;
        for (let i = 0; i < pts.length; i++) {
          const r = pts[i];
          const d = this.haversineKm(lat, lng, this.coordNumero(r.lat), this.coordNumero(r.lng));
          if (d < menor) {
            menor = d;
            mejor = i;
          }
        }
        const siguiente = pts.splice(mejor, 1)[0];
        ordenadas.push(siguiente);
        lat = this.coordNumero(siguiente.lat);
        lng = this.coordNumero(siguiente.lng);
      }

      grupos.delete(mejorKey);
    }
    return ordenadas;
  }

  /** Geocodifica lo que falte y genera el orden de entregas por GPS desde la base. */
  async autoRutear(): Promise<void> {
    if (this.autoRuteando) return;
    // Un auto-ruteo parte de las ubicaciones del backend; descarta ajustes
    // manuales que aún no se aplicaron para no mezclar estados.
    this.resetearManual();
    const sinUbicar = this.rutasPlanificadas.filter(r => !this.tieneCoordenada(r));
    let resumenGeo: any = null;

    if (sinUbicar.length > 0) {
      this.autoRuteando = true;
      this.carga.mostrar('chofer', 'Ubicando direcciones con GPS…');
      try {
        const res = await this.api.post('geocodificar', { placa: this.placa }, this.sesion.token);
        this.carga.ocultar('chofer');
        this.autoRuteando = false;
        this.cdr.detectChanges();
        if (!res?.success) {
          this.swal.error(res?.msg || 'No se pudieron ubicar las direcciones. Revisa que Maps esté autorizado en Apps Script.');
          return;
        }
        resumenGeo = res;
        await this.cargar();
      } catch {
        this.carga.ocultar('chofer');
        this.autoRuteando = false;
        this.cdr.detectChanges();
        this.swal.error('Sin conexión. No se pudo geocodificar.');
        return;
      }
    }

    // Direcciones que el backend no pudo ubicar con certeza (estado !== 'ubicada')
    const noEncontradas = (resumenGeo?.detalles || []).filter((d: any) =>
      d.estado ? d.estado !== 'ubicada' : !d.encontrada
    );
    this.pendientes = noEncontradas.length > 0
      ? this.rutasPlanificadas.filter(r => noEncontradas.some((d: any) => String(d.pedido) === String(r.pedido)))
      : [];

    // Candidatos de las direcciones con múltiples coincidencias
    this.candidatosPorPedido = new Map<string, CandidatoGeo[]>();
    noEncontradas
      .filter((d: any) => d.estado === 'multiple' && Array.isArray(d.candidatos))
      .forEach((d: any) => {
        this.candidatosPorPedido.set(String(d.pedido), d.candidatos as CandidatoGeo[]);
      });

    // Fase de señalización manual: NO se asigna el orden hasta confirmar
    if (this.pendientes.length > 0) {
      this.modoManual = true;
      this.pendienteSeleccionado = null;
      this.ubicadasManual = new Set<string>();
      this.cdr.detectChanges();
      this.renderizarMapa(true);
      this.swal.aviso(
        `${this.pendientes.length} dirección(es) con geolocalización incierta. Elige una coincidencia, arrastra el marcador o usa "Ubicar" y haz clic en el mapa. Luego confirma para asignar el orden.`,
        'warning'
      );
      return;
    }

    this.modoManual = false;
    this.asignarOrden();
  }

  /** Ordena por cercanía desde la base y asigna el número de orden 1..N. */
  private asignarOrden(): void {
    const conUbicacion = this.rutasPlanificadas.filter(r => this.tieneCoordenada(r));
    if (conUbicacion.length === 0) {
      this.swal.error('No hay direcciones ubicadas. Verifica los datos de la ruta.');
      return;
    }

    const baseLat = parseFloat(this.baseLat) || -11.8297773;
    const baseLng = parseFloat(this.baseLng) || -77.097072;
    const ordenadas = this.ordenarPorCercania(conUbicacion, baseLat, baseLng);
    ordenadas.forEach((r, i) => { r.ordenActual = String(i + 1); });

    const sinGeo = this.rutasPlanificadas.filter(r => !this.tieneCoordenada(r));
    if (sinGeo.length > 0) {
      this.swal.aviso(`Auto-ruteo listo: ${ordenadas.length} entregas ordenadas. ${sinGeo.length} sin ubicación quedaron sin número.`, 'info');
    } else {
      this.swal.exito(`Auto-ruteo listo: ${ordenadas.length} entregas ordenadas desde la base.`);
    }

    this.cdr.detectChanges();
    try {
      this.renderizarMapa(true);
    } catch {
      /* ignorar errores de render del mapa */
    }
  }

  /** Guarda las ubicaciones manuales (pendientes + seleccionadas a mano) y asigna el orden. */
  async confirmarOrdenar(): Promise<void> {
    const seleccion = this.pedidosSeleccion.filter(r =>
      Number.isFinite(this.coordNumero(r.lat)) && Number.isFinite(this.coordNumero(r.lng))
    );
    // Se envían números reales, no strings, para que el backend/Sheets no
    // reinterprete el punto decimal según la configuración regional.
    const manuales = seleccion.map(r => ({
      filas: r.filas,
      lat: this.coordNumero(r.lat),
      lng: this.coordNumero(r.lng)
    }));
    // Snapshot para re-aplicar tras la recarga: la hoja puede devolver datos cacheados
    // (ScriptCache 120 s) o descartar coords fuera de rango, dejando los manuales sin ruta.
    const snapshot = seleccion.map(r => ({
      pedido: String(r.pedido),
      lat: String(this.coordNumero(r.lat)),
      lng: String(this.coordNumero(r.lng))
    }));

    if (manuales.length > 0) {
      this.carga.mostrar('chofer', 'Guardando ubicaciones…');
      try {
        const res = await this.api.post('guardar_ubicacion_manual', { placa: this.placa, manuales }, this.sesion.token);
        this.carga.ocultar('chofer');
        if (!res?.success) {
          this.swal.error(res?.msg || 'No se pudieron guardar las ubicaciones.');
          return;
        }
        if (res?.invalidas > 0) {
          this.swal.aviso(`${res.invalidas} ubicación(es) no se guardaron porque la coordenada no es válida.`, 'warning');
        }
        await this.cargar();
        this.reaplicarManuales(snapshot);
      } catch {
        this.carga.ocultar('chofer');
        this.swal.error('Sin conexión. No se pudo guardar.');
        return;
      }
    }

    this.modoManual = false;
    this.pendientes = [];
    this.pendienteSeleccionado = null;
    this.ubicadasManual = new Set<string>();
    this.seleccionManual = new Set<string>();
    this.candidatosPorPedido = new Map<string, CandidatoGeo[]>();
    this.coordsOriginales.clear();
    this.asignarOrden();
  }

  /** Restaura las coordenadas manuales sobre las filas recargadas (por pedido). */
  private reaplicarManuales(coords: { pedido: string; lat: string; lng: string }[]): void {
    coords.forEach(c => {
      const r = this.rutasPlanificadas.find(x => String(x.pedido) === c.pedido);
      if (r) {
        r.lat = c.lat;
        r.lng = c.lng;
      }
    });
  }

  /** Asigna el orden dejando las pendientes sin ubicar sin número. */
  omitirOrdenar(): void {
    this.descartarCambiosManuales();
    this.modoManual = false;
    this.pendientes = [];
    this.pendienteSeleccionado = null;
    this.ubicadasManual = new Set<string>();
    this.seleccionManual = new Set<string>();
    this.candidatosPorPedido = new Map<string, CandidatoGeo[]>();
    this.asignarOrden();
  }

  ubicadaManual(r: Ruta): boolean {
    return this.ubicadasManual.has(String(r.pedido));
  }

  seleccionarParaUbicar(r: Ruta): void {
    this.pendienteSeleccionado = this.pendienteSeleccionado === r ? null : r;
  }

  candidatosDe(r: Ruta): CandidatoGeo[] {
    return this.candidatosPorPedido.get(String(r.pedido)) ?? [];
  }

  elegirCandidato(r: Ruta, cand: CandidatoGeo): void {
    this.recordarCoordenadas(r);
    r.lat = String(Number(cand.lat));
    r.lng = String(Number(cand.lng));
    this.ubicadasManual.add(String(r.pedido));
    this.seleccionManual.add(String(r.pedido));
    this.pendienteSeleccionado = null;
    this.cdr.detectChanges();
    this.renderizarMapa(false);
  }

  esCandidatoElegido(r: Ruta, c: CandidatoGeo): boolean {
    return this.ubicadaManual(r) && r.lat === String(c.lat) && r.lng === String(c.lng);
  }

  private resetearManual(): void {
    this.descartarCambiosManuales();
    this.modoManual = false;
    this.pendientes = [];
    this.pendienteSeleccionado = null;
    this.ubicadasManual = new Set<string>();
    this.seleccionManual = new Set<string>();
    this.candidatosPorPedido = new Map<string, CandidatoGeo[]>();
  }

  async guardar(): Promise<void> {
    const datos = this.rutasPlanificadas
      .filter(r => r.ordenActual && r.ordenActual !== '')
      .map(r => ({ filas: r.filas, orden: r.ordenActual }));
    if (datos.length === 0) {
      this.swal.aviso('No hay órdenes para guardar.', 'info');
      return;
    }
    const ok = await this.swal.confirmar('¿Guardar ordenamiento?', 'Se registrará este orden en el sistema.', 'info', 'Sí, guardar');
    if (!ok) return;
    this.carga.mostrar('chofer', 'Guardando orden…');
    try {
      const res = await this.api.post('guardar_orden', { token: this.sesion.token, placa: this.placa, ordenes: datos });
      this.carga.ocultar('chofer');
      if (res.success) {
        this.swal.exito('¡Excelente! Orden guardado correctamente.');
        if (this.esAdmin) {
          void this.router.navigate(['/admin'], { queryParams: { vista: 'manana' } });
        }
      } else this.swal.error((res.error as string) || 'Error al guardar.');
    } catch {
      this.carga.ocultar('chofer');
      this.swal.error('Sin conexión. No se pudo guardar.');
    }
  }

  numerosWsp(num: string): { tel: string; wsp: string }[] {
    if (!num) return [];
    const numeros = String(num).replace(/[^\d]/g, ' ').split(/\s+/).filter(t => t.length >= 7);
    return numeros.map(n => ({
      tel: n,
      wsp: (n.length === 9 && n.startsWith('9')) ? '51' + n : n
    }));
  }

  mensajeWsp(r: Ruta): string {
    const msg = `Estimado/a ${r.cliente},\nTenemos programada la entrega de su pedido N° ${r.pedido} el día ${this.fechaGlobalTexto} a la dirección ${r.direccion}. Por favor, compártanos su ubicación.`;
    return encodeURIComponent(msg);
  }
}
