import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import * as L from 'leaflet';
import { ApiService } from '../../core/services/api.service';
import { SesionService } from '../../core/services/sesion.service';
import { SwalService } from '../../shared/services/swal.service';
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
  candidatosPorPedido = new Map<string, CandidatoGeo[]>();
  private map?: L.Map;
  private capas?: L.LayerGroup;
  private mapaListo = false;
  private paramsSub!: Subscription;

  constructor(
    private api: ApiService,
    private sesion: SesionService,
    private swal: SwalService,
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
      this.cdr.detectChanges();
      if (this.tabActiva === 'manana') this.programarMapa();
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
    this.renderizarMapa();
  }

  async restablecerOrdenes(): Promise<void> {
    const ok = await this.swal.confirmar('¿Borrar todos los números de entrega?', 'Se eliminarán los números de orden.', 'warning');
    if (ok) {
      this.rutasPlanificadas.forEach(r => r.ordenActual = '');
      this.cdr.detectChanges();
      this.renderizarMapa();
    }
  }

  private programarMapa(): void {
    this.mostrarMapa = this.rutasPlanificadas.some(r => r.lat && r.lng);
    this.cdr.detectChanges();
    if (!this.mostrarMapa) return;
    setTimeout(() => {
      this.inicializarMapa();
      this.renderizarMapa();
    }, 0);
  }

  private inicializarMapa(): void {
    const el = document.getElementById('mapaRuta');
    if (!el || (this.mapaListo && this.map)) return;

    this.map = L.map('mapaRuta', { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(this.map);
    this.capas = L.layerGroup().addTo(this.map);
    this.mapaListo = true;

    // Colocar manualmente el punto pendiente seleccionado con un clic en el mapa
    this.map.on('click', (ev: L.LeafletMouseEvent) => {
      if (!this.modoManual || !this.pendienteSeleccionado) return;
      const r = this.pendienteSeleccionado;
      r.lat = String(ev.latlng.lat);
      r.lng = String(ev.latlng.lng);
      this.ubicadasManual.add(String(r.pedido));
      this.pendienteSeleccionado = null;
      this.cdr.detectChanges();
      this.renderizarMapa();
    });

    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  /** Dibuja los puntos de entrega de la placa y la ruta; destaca el distrito filtrado. */
  renderizarMapa(): void {
    if (!this.mapaListo || !this.map || !this.capas) return;
    const capas = this.capas;
    const map = this.map;
    capas.clearLayers();

    const puntos = this.rutasPlanificadas.filter(r => r.lat && r.lng);
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

    const conOrden = [...puntos]
      .filter(r => r.ordenActual && r.ordenActual.trim() !== '')
      .sort((a, b) => (parseInt(a.ordenActual, 10) || 999) - (parseInt(b.ordenActual, 10) || 999));
    const sinOrden = puntos.filter(r => !r.ordenActual || r.ordenActual.trim() === '');

    conOrden.forEach(r => {
      const destacado = distritoSel !== 'ALL' && r.distrito === distritoSel;
      const icon = L.divIcon({
        className: 'punto-mapa' + (destacado ? ' punto-mapa--destacado' : ''),
        html: `<span>${r.ordenActual}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      const m = L.marker([parseFloat(r.lat!), parseFloat(r.lng!)], { icon }).addTo(capas);
      m.bindPopup(`<b>${r.ordenActual}. ${this.esc(r.cliente)}</b><br>Ped: ${this.esc(r.pedido)}<br>${this.esc(r.direccion)}<br>${this.esc(r.distrito)}`);
    });

    sinOrden.forEach(r => {
      const esPendiente = this.modoManual && this.pendientes.some(p => String(p.pedido) === String(r.pedido));

      if (esPendiente) {
        const ubicada = this.ubicadasManual.has(String(r.pedido));
        const icon = L.divIcon({
          className: 'punto-mapa punto-mapa--pendiente' + (ubicada ? ' punto-mapa--manual' : ''),
          html: `<span>${ubicada ? '✓' : '?'}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        const m = L.marker([parseFloat(r.lat!), parseFloat(r.lng!)], { icon, draggable: true });
        m.on('dragend', (ev: any) => {
          const ll = ev.target.getLatLng();
          r.lat = String(ll.lat);
          r.lng = String(ll.lng);
          this.ubicadasManual.add(String(r.pedido));
          this.cdr.detectChanges();
          this.renderizarMapa();
        });
        m.addTo(capas);
        m.bindPopup(`<b>${this.esc(r.cliente)}</b> — no ubicada<br>Ped: ${this.esc(r.pedido)}<br>${this.esc(r.direccion)}<br>${this.esc(r.distrito)}`);
        return;
      }

      const destacado = distritoSel !== 'ALL' && r.distrito === distritoSel;
      const icon = L.divIcon({
        className: 'punto-mapa punto-mapa--sin' + (destacado ? ' punto-mapa--destacado' : ''),
        html: '<span>·</span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });
      L.marker([parseFloat(r.lat!), parseFloat(r.lng!)], { icon }).addTo(capas);
    });

    const pts: [number, number][] = [[baseLat, baseLng], ...conOrden.map(r => [parseFloat(r.lat!), parseFloat(r.lng!)] as [number, number])];
    for (let i = 0; i < pts.length - 1; i++) {
      const destino = conOrden[i];
      const destacado = distritoSel !== 'ALL' && destino.distrito === distritoSel;
      L.polyline([pts[i], pts[i + 1]], {
        color: destacado ? '#E53935' : '#1565C0',
        weight: 3,
        opacity: 0.8
      }).addTo(capas);
    }

    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts.map(p => L.latLng(p[0], p[1]))).pad(0.1));
    } else {
      map.setView([baseLat, baseLng], 12);
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
          const d = this.haversineKm(lat, lng, parseFloat(r.lat!), parseFloat(r.lng!));
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
          const d = this.haversineKm(lat, lng, parseFloat(r.lat!), parseFloat(r.lng!));
          if (d < menor) {
            menor = d;
            mejor = i;
          }
        }
        const siguiente = pts.splice(mejor, 1)[0];
        ordenadas.push(siguiente);
        lat = parseFloat(siguiente.lat!);
        lng = parseFloat(siguiente.lng!);
      }

      grupos.delete(mejorKey);
    }
    return ordenadas;
  }

  /** Geocodifica lo que falte y genera el orden de entregas por GPS desde la base. */
  async autoRutear(): Promise<void> {
    if (this.autoRuteando) return;
    const sinUbicar = this.rutasPlanificadas.filter(r => !r.lat || !r.lng);
    let resumenGeo: any = null;

    if (sinUbicar.length > 0) {
      this.autoRuteando = true;
      this.swal.cargando(true, 'Ubicando direcciones con GPS...');
      try {
        const res = await this.api.post('geocodificar', { placa: this.placa }, this.sesion.token);
        this.swal.cargando(false);
        this.autoRuteando = false;
        if (!res?.success) {
          this.swal.error(res?.msg || 'No se pudieron ubicar las direcciones. Revisa que Maps esté autorizado en Apps Script.');
          return;
        }
        resumenGeo = res;
        await this.cargar();
      } catch {
        this.swal.cargando(false);
        this.autoRuteando = false;
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
      this.renderizarMapa();
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
    const conUbicacion = this.rutasPlanificadas.filter(r => r.lat && r.lng);
    if (conUbicacion.length === 0) {
      this.swal.error('No hay direcciones ubicadas. Verifica los datos de la ruta.');
      return;
    }

    const baseLat = parseFloat(this.baseLat) || -11.8297773;
    const baseLng = parseFloat(this.baseLng) || -77.097072;
    const ordenadas = this.ordenarPorCercania(conUbicacion, baseLat, baseLng);
    ordenadas.forEach((r, i) => { r.ordenActual = String(i + 1); });

    const sinGeo = this.rutasPlanificadas.filter(r => !r.lat || !r.lng);
    if (sinGeo.length > 0) {
      this.swal.aviso(`Auto-ruteo listo: ${ordenadas.length} entregas ordenadas. ${sinGeo.length} sin ubicación quedaron sin número.`, 'info');
    } else {
      this.swal.exito(`Auto-ruteo listo: ${ordenadas.length} entregas ordenadas desde la base.`);
    }

    this.cdr.detectChanges();
    this.renderizarMapa();
  }

  /** Guarda las ubicaciones manuales y asigna el orden. */
  async confirmarOrdenar(): Promise<void> {
    const manuales = this.pendientes
      .filter(r => r.lat && r.lng)
      .map(r => ({ filas: r.filas, lat: r.lat, lng: r.lng }));

    if (manuales.length > 0) {
      this.swal.cargando(true, 'Guardando ubicaciones...');
      try {
        const res = await this.api.post('guardar_ubicacion_manual', { placa: this.placa, manuales }, this.sesion.token);
        this.swal.cargando(false);
        if (!res?.success) {
          this.swal.error(res?.msg || 'No se pudieron guardar las ubicaciones.');
          return;
        }
        await this.cargar();
      } catch {
        this.swal.cargando(false);
        this.swal.error('Sin conexión. No se pudo guardar.');
        return;
      }
    }

    this.modoManual = false;
    this.pendientes = [];
    this.pendienteSeleccionado = null;
    this.ubicadasManual = new Set<string>();
    this.candidatosPorPedido = new Map<string, CandidatoGeo[]>();
    this.asignarOrden();
  }

  /** Asigna el orden dejando las pendientes sin ubicar sin número. */
  omitirOrdenar(): void {
    this.modoManual = false;
    this.pendientes = [];
    this.pendienteSeleccionado = null;
    this.ubicadasManual = new Set<string>();
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
    r.lat = String(cand.lat);
    r.lng = String(cand.lng);
    this.ubicadasManual.add(String(r.pedido));
    this.pendienteSeleccionado = null;
    this.cdr.detectChanges();
    this.renderizarMapa();
  }

  esCandidatoElegido(r: Ruta, c: CandidatoGeo): boolean {
    return this.ubicadaManual(r) && r.lat === String(c.lat) && r.lng === String(c.lng);
  }

  private resetearManual(): void {
    this.modoManual = false;
    this.pendientes = [];
    this.pendienteSeleccionado = null;
    this.ubicadasManual = new Set<string>();
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
    this.swal.cargando(true);
    try {
      const res = await this.api.post('guardar_orden', { token: this.sesion.token, placa: this.placa, ordenes: datos });
      this.swal.cargando(false);
      if (res.success) this.swal.exito('¡Excelente! Orden guardado correctamente.');
      else this.swal.error((res.error as string) || 'Error al guardar.');
    } catch {
      this.swal.cargando(false);
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
