import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { SesionService } from '../../core/services/sesion.service';
import { SwalService } from '../../shared/services/swal.service';
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
  filtroPlaca = '';
  fechaDesde = '';
  fechaHasta = '';
  detalle: RegistroEntrega | null = null;

  constructor(
    private api: ApiService,
    private sesion: SesionService,
    private swal: SwalService,
    private cdr: ChangeDetectorRef
  ) {}

  get token(): string {
    return this.sesion.token;
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.cargarPlacas(), this.cargar()]);
  }

  async cargarPlacas(): Promise<void> {
    try {
      const res = await this.api.get('datos_asignacion', {}, this.token);
      if (res.success) this.placas = (res.placas as string[]) || [];
      this.cdr.detectChanges();
    } catch { /* silencioso */ }
  }

  async cargar(): Promise<void> {
    this.swal.cargando(true);
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
      this.swal.cargando(false);
    }
  }

  estadoClase(e: string): string {
    if (e === 'ENTREGADO') return 'bg-[#2E7D32]/10 text-[#2E7D32] border-[#2E7D32]/30';
    if (e === 'RECHAZADO') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-[#FFE9E7] text-[#B25E00] border-[#E4BEBA]';
  }

  abrirDetalle(r: RegistroEntrega): void {
    this.detalle = r;
  }

  cerrarDetalle(): void {
    this.detalle = null;
  }

  abrirFoto(base64: string): void {
    window.open('data:image/jpeg;base64,' + base64, '_blank');
  }

  async descargarZip(): Promise<void> {
    this.swal.cargando(true);
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
      this.swal.cargando(false);
    }
  }
}
