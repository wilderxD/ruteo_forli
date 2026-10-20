import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { CargandoEstado, CargandoService } from '../../services/cargando.service';

@Component({
  selector: 'app-progreso-seccion',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      *ngIf="estado?.activo && !compacto"
      class="flex flex-col items-center justify-center gap-3 py-8 px-4 text-center"
    >
      <span
        class="inline-block w-9 h-9 rounded-full border-[3px] border-[#D32F2F]/20 border-t-[#D32F2F] animate-spin"
      ></span>
      <p class="text-sm font-medium text-[#5B403D]">{{ estado?.texto }}</p>
      <div class="w-full max-w-xs h-2 bg-[#F9DCD9] rounded-full overflow-hidden">
        <div
          class="h-full bg-[#D32F2F] rounded-full transition-[width] duration-200 ease-out"
          [style.width.%]="estado?.porcentaje"
        ></div>
      </div>
      <p class="text-xs font-bold tracking-wide text-[#AF101A]">
        {{ estado?.porcentaje | number: '1.0-0' }}%
      </p>
    </div>

    <div *ngIf="estado?.activo && compacto" class="flex items-center gap-2">
      <span
        class="inline-block w-3.5 h-3.5 shrink-0 rounded-full border-2 border-[#D32F2F]/20 border-t-[#D32F2F] animate-spin"
      ></span>
      <div class="flex-1 h-1.5 bg-[#F9DCD9] rounded-full overflow-hidden">
        <div
          class="h-full bg-[#D32F2F] rounded-full transition-[width] duration-200 ease-out"
          [style.width.%]="estado?.porcentaje"
        ></div>
      </div>
      <span class="text-xs font-bold text-[#AF101A] tabular-nums">
        {{ estado?.porcentaje | number: '1.0-0' }}%
      </span>
    </div>
  `
})
export class ProgresoSeccionComponent implements OnInit, OnDestroy {
  @Input({ required: true }) clave!: string;
  @Input() compacto = false;

  estado: CargandoEstado | null = null;
  private sub?: Subscription;

  constructor(private cargando: CargandoService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.sub = this.cargando.cambios$.subscribe(mapa => {
      this.estado = mapa.get(this.clave) ?? null;
      // Las continuaciones async de fetch NO disparan change detection en este
      // runtime (por eso el resto del proyecto usa cdr.detectChanges() manual).
      // Este componente es el único que depende del CD automático, así que hay
      // que forzarlo; si no, el spinner queda "pegado" en su último estado.
      try { this.cdr.detectChanges(); } catch { /* vista ya destruida */ }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
