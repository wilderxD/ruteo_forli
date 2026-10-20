import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import * as L from 'leaflet';
import { ApiService } from '../../core/services/api.service';
import { SesionService } from '../../core/services/sesion.service';
import { SwalService } from '../../shared/services/swal.service';
import { EstadoAdmin, EstadoPlaca, DatosAsignacion, DatosExcel, Usuario, Ruta, RutaCompleta } from '../../core/models';
import { ExcelService } from '../../shared/services/excel.service';
import { CargandoService } from '../../shared/services/cargando.service';
import { ProgresoSeccionComponent } from '../../shared/components/progreso-seccion/progreso-seccion.component';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, ProgresoSeccionComponent],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit, OnDestroy {
  estado: EstadoAdmin | null = null;
  esManana = false;
  cargando = false;
  fechaGlobal = '';
  datosAsignacion: DatosAsignacion | null = null;
  usuarios: Usuario[] = [];
  nuevoUsuario = { usuario: '', nombre: '', rol: 'chofer', password: '' };
  modalUsuariosAbierto = false;

  modalMapaAbierto = false;
  placaMapa = '';
  esMananaMapa = false;
  fechaMapa = '';
  cargandoMapa = false;
  errorMapa = '';
  rutasMapa: Ruta[] = [];
  sinCoordenadasMapa = false;
  sinOrdenMapa = false;

  private mapAdmin?: L.Map;
  private capasAdmin?: L.LayerGroup;
  private solicitudMapa = 0;
  private baseMapaLat = NaN;
  private baseMapaLng = NaN;
  private querySub?: Subscription;

  constructor(
    private api: ApiService,
    private sesion: SesionService,
    private swal: SwalService,
    private excel: ExcelService,
    private carga: CargandoService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    // Permite abrir el panel directamente en la vista PRÓX. ENTREGA
    // (por ejemplo, al volver desde el guardado de la ruta del chofer).
    this.querySub = this.route.queryParamMap.subscribe(params => {
      this.esManana = params.get('vista') === 'manana';
    });

    await this.cargarAdmin();
    await this.cargarAsignacion();
    this.fechaGlobal = this.sesion.obtener()?.fechaGlobal ?? '';
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
    this.solicitudMapa++;
    this.modalMapaAbierto = false;
    this.carga.ocultar('admin-mapa');
    this.destruirMapaRuta();
  }

  abrirModalUsuarios(): void {
    this.modalUsuariosAbierto = true;
    void this.cargarUsuarios();
    this.cdr.detectChanges();
  }

  cerrarModalUsuarios(): void {
    this.modalUsuariosAbierto = false;
    this.cdr.detectChanges();
  }

  abrirMapaRuta(placa: string, event: Event): void {
    event.stopPropagation();
    this.placaMapa = placa;
    this.esMananaMapa = this.esManana;
    this.modalMapaAbierto = true;
    this.cargandoMapa = true;
    this.errorMapa = '';
    this.fechaMapa = '';
    this.rutasMapa = [];
    this.sinCoordenadasMapa = false;
    this.sinOrdenMapa = false;
    this.baseMapaLat = NaN;
    this.baseMapaLng = NaN;
    this.destruirMapaRuta();
    this.cdr.detectChanges();
    void this.cargarMapaRuta(placa);
  }

  cerrarMapaRuta(): void {
    this.solicitudMapa++;
    this.modalMapaAbierto = false;
    this.placaMapa = '';
    this.rutasMapa = [];
    this.errorMapa = '';
    this.cargandoMapa = false;
    this.sinCoordenadasMapa = false;
    this.sinOrdenMapa = false;
    this.baseMapaLat = NaN;
    this.baseMapaLng = NaN;
    this.carga.ocultar('admin-mapa');
    this.destruirMapaRuta();
    this.cdr.detectChanges();
  }

  reintentarMapa(): void {
    if (!this.placaMapa) return;
    void this.cargarMapaRuta(this.placaMapa);
  }

  @HostListener('document:keydown.escape')
  alPresionarEscape(): void {
    if (this.modalMapaAbierto) this.cerrarMapaRuta();
  }

  get avisoMapa(): string {
    if (this.rutasMapa.length === 0) return '';
    if (this.sinCoordenadasMapa) return 'No hay coordenadas para dibujar la ruta.';
    if (this.sinOrdenMapa) return 'Los pedidos no tienen orden asignado; se muestran sin línea.';
    return '';
  }

  private async cargarMapaRuta(placa: string): Promise<void> {
    const solicitud = ++this.solicitudMapa;
    this.cargandoMapa = true;
    this.errorMapa = '';
    this.rutasMapa = [];
    this.sinCoordenadasMapa = false;
    this.sinOrdenMapa = false;
    this.baseMapaLat = NaN;
    this.baseMapaLng = NaN;
    this.destruirMapaRuta();
    this.carga.ocultar('admin-mapa');
    this.carga.mostrar('admin-mapa', 'Cargando ruta…');
    this.cdr.detectChanges();

    try {
      const res = await this.api.get('ruta_completa', { placa }, this.token);
      if (solicitud !== this.solicitudMapa || !this.modalMapaAbierto) return;

      if (!res.success) {
        this.errorMapa = (res.error as string) || 'No se pudo cargar la ruta.';
        return;
      }

      const datos = res as unknown as RutaCompleta;
      this.fechaMapa = datos.fechaGlobalTexto || '';
      this.baseMapaLat = parseFloat(datos.baseLat ?? '');
      this.baseMapaLng = parseFloat(datos.baseLng ?? '');
      this.rutasMapa = this.esMananaMapa
        ? (datos.rutasPlanificadas ?? [])
        : (datos.rutasHoy ?? []);
      this.sinCoordenadasMapa = !this.rutasMapa.some(r => this.coordValida(r));
      this.sinOrdenMapa = !this.rutasMapa.some(r => this.coordValida(r) && this.tieneOrden(r));
    } catch {
      if (solicitud === this.solicitudMapa) {
        this.errorMapa = 'No se pudo cargar la ruta. Revisa tu conexión.';
      }
    } finally {
      if (solicitud === this.solicitudMapa && this.modalMapaAbierto) {
        this.cargandoMapa = false;
        this.carga.ocultar('admin-mapa');
        this.cdr.detectChanges();
        if (!this.errorMapa) {
          setTimeout(() => this.inicializarMapaRuta(), 0);
        }
      }
    }
  }

  private inicializarMapaRuta(): void {
    if (!this.modalMapaAbierto || this.cargandoMapa || this.errorMapa) return;
    const el = document.getElementById('mapaRutaAdmin');
    if (!el) return;

    this.destruirMapaRuta();
    try {
      this.mapAdmin = L.map(el, { scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(this.mapAdmin);
      this.capasAdmin = L.layerGroup().addTo(this.mapAdmin);
      this.renderizarMapaRuta();
      setTimeout(() => this.mapAdmin?.invalidateSize(), 0);
    } catch {
      this.destruirMapaRuta();
      this.errorMapa = 'No se pudo inicializar el mapa.';
      this.cdr.detectChanges();
    }
  }

  private renderizarMapaRuta(): void {
    if (!this.mapAdmin || !this.capasAdmin) return;
    const map = this.mapAdmin;
    const capas = this.capasAdmin;
    capas.clearLayers();

    const tieneBase = Number.isFinite(this.baseMapaLat) && Number.isFinite(this.baseMapaLng);
    if (tieneBase) {
      const baseIcon = L.divIcon({
        className: 'punto-mapa-admin punto-mapa-admin--base',
        html: '<i class="fas fa-warehouse"></i>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      L.marker([this.baseMapaLat, this.baseMapaLng], { icon: baseIcon })
        .bindPopup('<b>Base / Almacén</b><br>Colchones Forli')
        .addTo(capas);
    }

    const validas = this.rutasMapa.filter(r => this.coordValida(r));
    const ordenadas = validas
      .filter(r => this.tieneOrden(r))
      .sort((a, b) => this.numeroOrden(a) - this.numeroOrden(b));
    const sinOrden = validas.filter(r => !this.tieneOrden(r));

    ordenadas.forEach(r => this.agregarMarcadorMapa(r, capas, true));
    sinOrden.forEach(r => this.agregarMarcadorMapa(r, capas, false));

    const puntos: [number, number][] = [];
    if (tieneBase) puntos.push([this.baseMapaLat, this.baseMapaLng]);
    ordenadas.forEach(r => puntos.push([parseFloat(r.lat!), parseFloat(r.lng!)]));
    if (puntos.length > 1) {
      L.polyline(puntos, { color: '#1565C0', weight: 3, opacity: 0.8 }).addTo(capas);
    }

    const boundsPts: [number, number][] = [...puntos];
    sinOrden.forEach(r => boundsPts.push([parseFloat(r.lat!), parseFloat(r.lng!)]));

    try {
      map.invalidateSize();
      if (boundsPts.length > 1) {
        map.fitBounds(L.latLngBounds(boundsPts), { padding: [30, 30], maxZoom: 15 });
      } else if (boundsPts.length === 1) {
        map.setView(boundsPts[0], 14);
      } else {
        map.setView([-12.0464, -77.0428], 11);
      }
    } catch {
      map.setView([-12.0464, -77.0428], 11);
    }

    setTimeout(() => {
      if (this.mapAdmin === map) map.invalidateSize();
    }, 150);
  }

  private agregarMarcadorMapa(r: Ruta, capas: L.LayerGroup, numerado: boolean): void {
    const etiqueta = numerado ? String(this.numeroOrden(r)) : '·';
    const icon = L.divIcon({
      className: 'punto-mapa-admin' + (numerado ? '' : ' punto-mapa-admin--sin'),
      html: `<span>${etiqueta}</span>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
    const contenido = this.contenidoMapaRuta(r);
    const marcador = L.marker([parseFloat(r.lat!), parseFloat(r.lng!)], { icon, riseOnHover: true });
    marcador.bindTooltip(contenido, {
      direction: 'top',
      offset: [0, -12],
      opacity: 1,
      className: 'tooltip-ruta-admin'
    });
    marcador.bindPopup(contenido, { maxWidth: 300 });
    marcador.addTo(capas);
  }

  private contenidoMapaRuta(r: Ruta): string {
    const titulo = this.tieneOrden(r)
      ? `${this.numeroOrden(r)}. ${this.esc(r.cliente || 'Sin cliente')}`
      : `Sin orden. ${this.esc(r.cliente || 'Sin cliente')}`;
    return `<div class="mapa-ruta-info">
      <div class="mapa-ruta-info__titulo">${titulo}</div>
      <div>${this.esc(r.direccion || 'Sin dirección')}</div>
      <div><b>Distrito:</b> ${this.esc(r.distrito || '—')}</div>
      <div><b>Pedido:</b> ${this.esc(r.pedido || '—')}</div>
      <div><b>Producto:</b> ${this.esc(r.modelo || '—')}</div>
    </div>`;
  }

  private coordValida(r: Ruta): boolean {
    return Number.isFinite(parseFloat(r.lat ?? '')) && Number.isFinite(parseFloat(r.lng ?? ''));
  }

  private numeroOrden(r: Ruta): number {
    const n = parseInt(r.ordenActual, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  private tieneOrden(r: Ruta): boolean {
    return this.numeroOrden(r) > 0;
  }

  private destruirMapaRuta(): void {
    if (this.mapAdmin) {
      try { this.mapAdmin.remove(); } catch { /* mapa ya destruido */ }
    }
    this.mapAdmin = undefined;
    this.capasAdmin = undefined;
  }

  async cargarUsuarios(): Promise<void> {
    this.carga.mostrar('admin-usuarios', 'Cargando usuarios…');
    try {
      const res = await this.api.post('usuarios_listar', {}, this.token, { reintentar: true });
      if (res.success) this.usuarios = res.usuarios as Usuario[];
      else this.usuarios = [];
      this.cdr.detectChanges();
    } catch {
      this.usuarios = [];
      this.cdr.detectChanges();
    }
    finally { this.carga.ocultar('admin-usuarios'); }
  }

  async crearUsuario(): Promise<void> {
    const u = this.nuevoUsuario;
    if (!u.usuario || !u.nombre || !u.password) return;
    this.carga.mostrar('admin-usuarios', 'Creando usuario…');
    try {
      const res = await this.api.post('usuarios_crear', u, this.token);
      if (!res.success) { this.swal.error(res.error || 'No se pudo crear el usuario.'); return; }
      this.nuevoUsuario = { usuario: '', nombre: '', rol: 'chofer', password: '' };
      await this.cargarUsuarios();
      this.swal.exito('Usuario creado.');
    } catch {
      this.swal.error('Sin conexión. No se pudo crear el usuario.');
    } finally { this.carga.ocultar('admin-usuarios'); }
  }

  async actualizarUsuario(u: Usuario): Promise<void> {
    this.carga.mostrar('admin-usuarios', 'Actualizando usuario…');
    try {
      const res = await this.api.post('usuarios_actualizar', u, this.token);
      if (!res.success) this.swal.error(res.error || 'No se pudo actualizar el usuario.');
      else await this.cargarUsuarios();
    } catch {
      this.swal.error('Sin conexión. No se pudo actualizar el usuario.');
    } finally { this.carga.ocultar('admin-usuarios'); }
  }

  async restaurarPassword(usuario: string): Promise<void> {
    const password = window.prompt(`Nueva contraseña para ${usuario} (mínimo 12 caracteres, mayúscula, minúscula y número):`);
    if (!password) return;
    this.carga.mostrar('admin-usuarios', 'Restableciendo contraseña…');
    try {
      const res = await this.api.post('usuarios_restaurarPassword', { usuario, password }, this.token);
      if (res.success) this.swal.exito('Contraseña restablecida.');
      else this.swal.error(res.error || 'No se pudo restablecer la contraseña.');
    } catch {
      this.swal.error('Sin conexión. No se pudo restablecer la contraseña.');
    } finally { this.carga.ocultar('admin-usuarios'); }
  }

  get token(): string {
    return this.sesion.token;
  }

  get estados(): [string, EstadoPlaca][] {
    const fuente = this.esManana ? this.estado?.estadoManana : this.estado?.estadoHoy;
    return fuente ? Object.entries(fuente) : [];
  }

  alternarVista(e: Event): void {
    this.esManana = (e.target as HTMLInputElement).checked;
    this.actualizarVistaUrl();
    this.cdr.detectChanges();
  }

  private actualizarVistaUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { vista: this.esManana ? 'manana' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  verRuta(placa: string): void {
    this.sesion.setPlaca(placa);
    this.router.navigate(['/chofer', placa]);
  }

  async cargarAdmin(): Promise<void> {
    this.cargando = true;
    this.carga.mostrar('admin', 'Cargando panel…');
    this.cdr.detectChanges();
    try {
      const res = await this.api.get('estado_admin', {}, this.token);
      if (res.success) this.estado = res as unknown as EstadoAdmin;
      this.cdr.detectChanges();
    } catch {
      this.swal.error('Error al cargar el panel.');
    } finally {
      this.cargando = false;
      this.carga.ocultar('admin');
      this.cdr.detectChanges();
    }
  }

  async cargarAsignacion(): Promise<void> {
    try {
      const res = await this.api.get('datos_asignacion', {}, this.token);
      if (res.success) this.datosAsignacion = res as unknown as DatosAsignacion;
      this.cdr.detectChanges();
    } catch {
      /* silencioso */
    }
  }

  porcentaje(p: EstadoPlaca): number {
    return p.total ? (p.conOrden / p.total) * 100 : 0;
  }

  colorPct(p: EstadoPlaca): string {
    const pct = this.porcentaje(p);
    return pct === 100 ? '#10b981' : pct > 0 ? '#ea580c' : '#dc2626';
  }

  async cambiarFecha(): Promise<void> {
    if (!this.fechaGlobal) return;
    this.carga.mostrar('admin', 'Guardando fecha…');
    try {
      const res = await this.api.post('guardar_fecha', { fecha: this.fechaGlobal }, this.token);
      this.carga.ocultar('admin');
      if (res.success) {
        this.sesion.actualizar({ fechaGlobal: this.fechaGlobal });
        this.swal.exito('Fecha actualizada.');
      } else this.swal.error((res.error as string) || 'Error.');
    } catch {
      this.carga.ocultar('admin');
      this.swal.error('Sin conexión.');
    }
  }

  async asignarChoferes(): Promise<void> {
    if (!this.datosAsignacion || !this.datosAsignacion.placas.length) {
      this.swal.aviso('No hay placas activas.', 'info');
      return;
    }
    const resultado: Record<string, string> = {};
    this.datosAsignacion.placas.forEach(p => {
      resultado[p] = this.datosAsignacion!.asignacionActual[p] || '';
    });

    const Swal = (await import('sweetalert2')).default;
    const html = this.datosAsignacion.placas.map(placa => {
      const opciones = ['<option value="">-- Sin Asignar --</option>']
        .concat(this.datosAsignacion!.choferes.map(c => `<option value="${this.esc(c)}" ${c === resultado[placa] ? 'selected' : ''}>${this.esc(c)}</option>`))
        .join('');
      return `<div class="flex items-center gap-3 p-2 hover:bg-[#FFF8F7] rounded-lg">
        <div class="w-24 font-medium text-sm text-slate-700"><i class="fas fa-truck mr-1 text-[#D32F2F]"></i> <span class="f-data">${this.esc(placa)}</span></div>
        <select class="flex-1 campo px-3 py-2 text-sm bg-white focus:border-[#D32F2F]" data-placa="${this.esc(placa)}">${opciones}</select>
      </div>`;
    }).join('');

    const res = await Swal.fire({
      title: '<span class="text-lg font-bold text-slate-800">Asignar Choferes</span>',
      html: `<div class="max-h-96 overflow-y-auto space-y-2">${html}</div>`,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      confirmButtonColor: '#10b981'
    });
    if (!res.isConfirmed) return;

    const pares: [string, string][] = [];
    const selects = document.querySelectorAll('.select-asignacion');
    // No usamos clase; re-leemos por data-placa
    const form = document.querySelector('.swal2-html-container');
    if (form) {
      form.querySelectorAll('select[data-placa]').forEach(sel => {
        const placaSel = sel.getAttribute('data-placa')!;
        const val = (sel as HTMLSelectElement).value;
        if (val) pares.push([placaSel, val]);
      });
    }

    this.carga.mostrar('admin', 'Guardando asignación…');
    try {
      const r = await this.api.post('guardar_asignacion', { choferes: pares }, this.token);
      this.carga.ocultar('admin');
      if (r.success) {
        this.swal.exito('Choferes asignados correctamente.');
        await this.cargarAsignacion();
        await this.cargarAdmin();
      } else this.swal.error((r.error as string) || 'Error.');
    } catch {
      this.carga.ocultar('admin');
      this.swal.error('Sin conexión.');
    }
  }

  async moverRutas(): Promise<void> {
    const ok = await this.swal.confirmar(
      '¿Confirmar Movimiento?',
      'Se moverán las rutas a HOY y se vaciará la planificación.',
      'warning',
      'Sí, mover'
    );
    if (!ok) return;
    this.carga.mostrar('admin', 'Moviendo rutas a HOY…');
    try {
      const res = await this.api.post('mover_rutas', {}, this.token);
      this.carga.ocultar('admin');
      if (res.success) {
        this.swal.exito((res.message as string) || 'Rutas movidas.');
        this.esManana = false;
        this.actualizarVistaUrl();
        await this.cargarAdmin();
      } else this.swal.error((res.error as string) || 'Error.');
    } catch {
      this.carga.ocultar('admin');
      this.swal.error('Sin conexión.');
    }
  }

  async descargarExcel(): Promise<void> {
    this.carga.mostrar('admin', 'Generando Excel…');
    try {
      const res = await this.api.get('datos_excel', { manana: this.esManana ? '1' : '0' }, this.token);
      if (res.success) {
        const datos = res as unknown as DatosExcel;
        this.excel.generarExcelExplosion(datos.rutas);
        this.excel.generarExcelRutaDelDia(datos.rutas, datos.asignacion);
      }
    } catch {
      this.swal.error('Error al generar el Excel.');
    } finally {
      this.carga.ocultar('admin');
    }
  }

  private esc(t: string): string {
    const d = document.createElement('div');
    d.textContent = t ?? '';
    return d.innerHTML;
  }
}
