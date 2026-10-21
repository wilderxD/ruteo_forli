import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { SesionService } from '../../core/services/sesion.service';
import { SwalService } from '../../shared/services/swal.service';
import { CargandoService } from '../../shared/services/cargando.service';
import { RegistroEntrega } from '../../core/models';

@Component({
  selector: 'app-entregas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './entregas.component.html',
  styleUrls: ['./entregas.component.scss']
})
export class EntregasComponent implements OnInit {
  registros: RegistroEntrega[] = [];
  placas: string[] = [];
  cargando = false;
  filtroPlaca = '';
  fechaDesde = '';
  fechaHasta = '';
  detalle: RegistroEntrega | null = null;

  constructor(
    private api: ApiService,
    private sesion: SesionService,
    private swal: SwalService,
    private carga: CargandoService,
    private cdr: ChangeDetectorRef
  ) {}

  get token(): string {
    return this.sesion.token;
  }

  async ngOnInit(): Promise<void> {
    const hoy = this.hoyISO();
    this.fechaDesde = hoy;
    this.fechaHasta = hoy;
    await Promise.all([this.cargarPlacas(), this.cargar()]);
  }

  private hoyISO(): string {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  private static readonly DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  private static readonly MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  /** Fecha de registro en español, formato largo y 12 horas: "viernes, 14 de agosto de 2026, 11:32 p.m.". */
  formatearFecha(valor: string): string {
    const s = String(valor || '').trim();
    if (!s) return '';
    let d = new Date(s);
    if (isNaN(d.getTime())) d = new Date(s.replace(' ', 'T'));
    if (isNaN(d.getTime())) return s;
    const dia = EntregasComponent.DIAS[d.getDay()];
    const mes = EntregasComponent.MESES[d.getMonth()];
    let h = d.getHours();
    const ampm = h >= 12 ? 'p.m.' : 'a.m.';
    h = h % 12; if (h === 0) h = 12;
    const min = String(d.getMinutes()).padStart(2, '0');
    return dia + ', ' + d.getDate() + ' de ' + mes + ' de ' + d.getFullYear() + ', ' + h + ':' + min + ' ' + ampm;
  }

  async cargarPlacas(): Promise<void> {
    try {
      const res = await this.api.get('datos_asignacion', {}, this.token);
      if (res.success) this.placas = (res.placas as string[]) || [];
      this.cdr.detectChanges();
    } catch { /* silencioso */ }
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    this.carga.mostrar('entregas', 'Cargando entregas…');
    this.cdr.detectChanges();
    try {
      const res = await this.api.get('entregas_admin', {
        placa: this.filtroPlaca,
        desde: this.fechaDesde,
        hasta: this.fechaHasta
      }, this.token);
      if (res.success) {
        this.registros = (res.registros as RegistroEntrega[]) || [];
        this.cdr.detectChanges();
      }
      else this.swal.error((res.msg as string) || 'Error al cargar entregas.');
    } catch {
      this.swal.error('Sin conexión.');
    } finally {
      this.cargando = false;
      this.carga.ocultar('entregas');
      this.cdr.detectChanges();
    }
  }

  estadoClase(e: string): string {
    if (e === 'ENTREGADO') return 'bg-[#2E7D32]/10 text-[#2E7D32] border-[#2E7D32]/30';
    if (e === 'RECHAZADO') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-[#FFE9E7] text-[#B25E00] border-[#E4BEBA]';
  }

  abrirDetalle(r: RegistroEntrega): void {
    this.detalle = r;
    this.cdr.detectChanges();
  }

  cerrarDetalle(): void {
    this.detalle = null;
    this.cdr.detectChanges();
  }

  abrirFoto(base64: string): void {
    window.open('data:image/jpeg;base64,' + base64, '_blank');
  }

  async descargarZip(): Promise<void> {
    this.carga.mostrar('entregas', 'Generando ZIP de fotos…');
    try {
      const res = await this.api.get('fotos_zip', {
        placa: this.filtroPlaca,
        desde: this.fechaDesde,
        hasta: this.fechaHasta
      }, this.token);
      if (res.success) {
        const base64 = res.base64 as string;
        const nombre = res.nombre as string;
        const bytes = atob(base64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        const blob = new Blob([arr], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        a.click();
        URL.revokeObjectURL(url);
        this.swal.exito('ZIP de fotos descargado.');
      } else {
        this.swal.aviso((res.msg as string) || 'No se generó el ZIP.', 'warning');
      }
    } catch {
      this.swal.error('Sin conexión.');
    } finally {
      this.carga.ocultar('entregas');
    }
  }
}
