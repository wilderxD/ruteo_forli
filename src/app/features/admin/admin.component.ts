import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { SesionService } from '../../core/services/sesion.service';
import { SwalService } from '../../shared/services/swal.service';
import { EstadoAdmin, EstadoPlaca, DatosAsignacion, DatosExcel } from '../../core/models';
import { ExcelService } from '../../shared/services/excel.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit {
  estado: EstadoAdmin | null = null;
  esManana = false;
  fechaGlobal = '';
  datosAsignacion: DatosAsignacion | null = null;

  constructor(
    private api: ApiService,
    private sesion: SesionService,
    private swal: SwalService,
    private excel: ExcelService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.cargarAdmin();
    await this.cargarAsignacion();
    this.fechaGlobal = this.sesion.obtener()?.fechaGlobal ?? '';
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
    this.cdr.detectChanges();
  }

  verRuta(placa: string): void {
    this.sesion.setPlaca(placa);
    this.router.navigate(['/chofer', placa]);
  }

  async cargarAdmin(): Promise<void> {
    this.swal.cargando(true);
    try {
      const res = await this.api.get('estado_admin', {}, this.token);
      if (res.success) this.estado = res as unknown as EstadoAdmin;
      this.cdr.detectChanges();
    } catch {
      this.swal.error('Error al cargar el panel.');
    } finally {
      this.swal.cargando(false);
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
    this.swal.cargando(true);
    try {
      const res = await this.api.post('guardar_fecha', { fecha: this.fechaGlobal }, this.token);
      this.swal.cargando(false);
      if (res.success) {
        this.sesion.actualizar({ fechaGlobal: this.fechaGlobal });
        this.swal.exito('Fecha actualizada.');
      } else this.swal.error((res.error as string) || 'Error.');
    } catch {
      this.swal.cargando(false);
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

    this.swal.cargando(true);
    try {
      const r = await this.api.post('guardar_asignacion', { choferes: pares }, this.token);
      this.swal.cargando(false);
      if (r.success) {
        this.swal.exito('Choferes asignados correctamente.');
        await this.cargarAsignacion();
        await this.cargarAdmin();
      } else this.swal.error((r.error as string) || 'Error.');
    } catch {
      this.swal.cargando(false);
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
    this.swal.cargando(true);
    try {
      const res = await this.api.post('mover_rutas', {}, this.token);
      this.swal.cargando(false);
      if (res.success) {
        this.swal.exito((res.message as string) || 'Rutas movidas.');
        this.esManana = false;
        await this.cargarAdmin();
      } else this.swal.error((res.error as string) || 'Error.');
    } catch {
      this.swal.cargando(false);
      this.swal.error('Sin conexión.');
    }
  }

  async descargarExcel(): Promise<void> {
    this.swal.cargando(true);
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
      this.swal.cargando(false);
    }
  }

  private esc(t: string): string {
    const d = document.createElement('div');
    d.textContent = t ?? '';
    return d.innerHTML;
  }
}
