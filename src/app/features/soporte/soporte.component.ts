import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { SesionService } from '../../core/services/sesion.service';
import { SwalService } from '../../shared/services/swal.service';
import { ExcelService } from '../../shared/services/excel.service';
import { DatosSoporte, RegistroSoporte } from '../../core/models';

@Component({
  selector: 'app-soporte',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './soporte.component.html',
  styleUrls: ['./soporte.component.scss']
})
export class SoporteComponent implements OnInit {
  datos: DatosSoporte | null = null;
  registros: RegistroSoporte[] = [];
  query = '';
  filtroPlaca = 'ALL';
  filtroDistrito = 'ALL';

  // Edición en modal
  editando: RegistroSoporte | null = null;
  edPlaca = '';
  edChofer = '';
  edAtc = '';
  edMotivo = '';
  edObs = '';

  constructor(
    private api: ApiService,
    private sesion: SesionService,
    private swal: SwalService,
    private excel: ExcelService
  ) {}

  get token(): string {
    return this.sesion.token;
  }

  get placas(): string[] {
    return this.datos?.placas ?? [];
  }

  get choferes(): string[] {
    return this.datos?.choferes ?? [];
  }

  get motivos(): string[] {
    return this.datos?.motivos ?? [];
  }

  get distritos(): string[] {
    return [...new Set((this.datos?.registros ?? []).map(r => r.distrito).filter(Boolean))];
  }

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.swal.cargando(true);
    try {
      const res = await this.api.get('soporte', {}, this.token);
      if (res.success) {
        this.datos = res as unknown as DatosSoporte;
        this.registros = this.datos.registros;
      } else {
        this.swal.error(this.datos?.msg ?? 'Error al cargar soporte.');
      }
    } catch {
      this.swal.error('Sin conexión.');
    } finally {
      this.swal.cargando(false);
    }
  }

  filtrar(): RegistroSoporte[] {
    const q = this.query.trim().toLowerCase();
    return this.registros.filter(r => {
      const valCliente = (r.cliente || '').toLowerCase();
      const valPedido = (r.pedido || '').toLowerCase();
      const matchQ = !q || valCliente.includes(q) || valPedido.includes(q);
      const matchP = this.filtroPlaca === 'ALL' || r.placa.trim().toUpperCase() === this.filtroPlaca;
      const matchD = this.filtroDistrito === 'ALL' || r.distrito.trim().toUpperCase() === this.filtroDistrito.toUpperCase();
      return matchQ && matchP && matchD;
    });
  }

  abrirDetalle(r: RegistroSoporte): void {
    this.editando = r;
    this.edPlaca = r.placa;
    this.edChofer = r.chofer;
    this.edAtc = r.codigoAtc;
    this.edMotivo = r.motivo;
    this.edObs = r.observacionesSoporte;
  }

  cerrarDetalle(): void {
    this.editando = null;
  }

  numerosWsp(num: string): string[] {
    if (!num) return [];
    return String(num).replace(/[^\d]/g, ' ').split(/\s+/).filter(t => t.length >= 7).map(n => n.length === 9 && n.startsWith('9') ? '51' + n : n);
  }

  async guardar(): Promise<void> {
    if (!this.editando) return;
    this.swal.cargando(true);
    try {
      const res = await this.api.post('guardar_soporte', {
        fila: this.editando.fila,
        placa: this.edPlaca,
        chofer: this.edChofer,
        atc: this.edAtc,
        obs: this.edObs,
        motivo: this.edMotivo
      }, this.token);
      this.swal.cargando(false);
      if (res.success) {
        this.swal.exito('Soporte de atención guardado de forma exitosa.');
        this.cerrarDetalle();
        await this.cargar();
      } else this.swal.error((res.error as string) || 'Error al guardar.');
    } catch {
      this.swal.cargando(false);
      this.swal.error('Sin conexión.');
    }
  }

  descargarReporte(): void {
    const filtrados = this.registros.filter(r => r.observacionesSoporte && r.observacionesSoporte !== '');
    if (filtrados.length === 0) {
      this.swal.aviso('No existen registros con Observaciones de Soporte cargadas.', 'info');
      return;
    }
    this.excel.reporteSoporte(filtrados);
  }
}
