import { CommonModule, DOCUMENT } from '@angular/common';
import { ChangeDetectorRef, Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { CargandoEstado, CargandoService } from '../../services/cargando.service';

@Component({
  selector: 'app-carga-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      *ngIf="estado"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 cursor-wait backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-atomic="true"
    >
      <div class="w-full max-w-xs rounded-xl bg-white p-5 text-center shadow-2xl ring-1 ring-black/5">
        <span
          class="mx-auto mb-4 block h-10 w-10 animate-spin rounded-full border-[3px] border-[#D32F2F]/20 border-t-[#D32F2F]"
        ></span>
        <p class="text-sm font-medium text-[#5B403D]">{{ estado.texto }}</p>
        <div class="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#F9DCD9]">
          <div
            class="h-full rounded-full bg-[#D32F2F] transition-[width] duration-200 ease-out"
            [style.width.%]="estado.porcentaje"
          ></div>
        </div>
        <p class="mt-1 text-xs font-bold tracking-wide text-[#AF101A]">
          {{ estado.porcentaje | number: '1.0-0' }}%
        </p>
      </div>
    </div>
  `
})
export class CargaOverlayComponent implements OnInit, OnDestroy {
  estado: CargandoEstado | null = null;
  private sub?: Subscription;

  constructor(
    private cargando: CargandoService,
    private cdr: ChangeDetectorRef,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit(): void {
    this.sub = this.cargando.cambios$.subscribe(mapa => {
      this.estado = this.seleccionar(mapa);
      this.document.body.classList.toggle('carga-overlay-activa', !!this.estado);
      try { this.cdr.detectChanges(); } catch { /* vista ya destruida */ }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.document.body.classList.remove('carga-overlay-activa');
  }

  private seleccionar(mapa: Map<string, CargandoEstado>): CargandoEstado | null {
    const activos = Array.from(mapa.values()).filter(e => e.activo);
    if (activos.length === 0) return null;

    // Si una operación ya está terminando (100%) pero otra sigue en curso,
    // el overlay debe mostrar la que realmente sigue trabajando.
    const enCurso = activos.filter(e => e.porcentaje < 100);
    const candidatos = enCurso.length > 0 ? enCurso : activos;
    return candidatos.reduce((a, b) => (b.prioridad >= a.prioridad ? b : a));
  }
}
