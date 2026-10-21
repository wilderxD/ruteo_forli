import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface CargandoEstado {
  activo: boolean;
  porcentaje: number;
  texto: string;
  /** Orden de la última operación que tomó el control del overlay global. */
  prioridad: number;
}

/**
 * Estado de carga por sección (clave), consumido por el overlay global.
 * Como una petición fetch a Apps Script no expone progreso real, cuando no se
 * indica un porcentaje la barra avanza de forma simulada hasta 90% y salta a
 * 100% al ocultarse. En flujos por pasos se usa `progreso()` con el valor real.
 */
@Injectable({ providedIn: 'root' })
export class CargandoService {
  private estados = new Map<string, CargandoEstado>();
  private refs = new Map<string, number>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private subject = new BehaviorSubject<Map<string, CargandoEstado>>(new Map());
  private prioridadSeq = 0;

  readonly cambios$: Observable<Map<string, CargandoEstado>> = this.subject.asObservable();

  mostrar(clave: string, texto = 'Cargando…', porcentaje?: number): void {
    this.refs.set(clave, (this.refs.get(clave) ?? 0) + 1);
    const prev = this.estados.get(clave);
    const pct = porcentaje ?? (prev?.activo && prev.porcentaje < 100 ? Math.max(prev.porcentaje, 5) : 5);
    this.set(clave, {
      activo: true,
      porcentaje: this.limitar(pct),
      texto,
      prioridad: ++this.prioridadSeq
    });
    if (porcentaje == null) this.animar(clave);
  }

  progreso(clave: string, porcentaje: number, texto?: string): void {
    this.detenerTimer(clave);
    const prev = this.estados.get(clave);
    this.set(clave, {
      activo: true,
      porcentaje: this.limitar(porcentaje),
      texto: texto ?? prev?.texto ?? 'Cargando…',
      prioridad: prev?.prioridad ?? ++this.prioridadSeq
    });
  }

  ocultar(clave: string): void {
    const ref = (this.refs.get(clave) ?? 1) - 1;
    if (ref > 0) {
      this.refs.set(clave, ref);
      return;
    }
    this.refs.delete(clave);
    this.detenerTimer(clave);
    const prev = this.estados.get(clave);
    if (!prev?.activo) return;
    this.set(clave, { ...prev, porcentaje: 100 });
    setTimeout(() => {
      if (!this.refs.has(clave)) {
        this.estados.delete(clave);
        this.emitir();
      }
    }, 220);
  }

  private animar(clave: string): void {
    this.detenerTimer(clave);
    const timer = setInterval(() => {
      const actual = this.estados.get(clave);
      if (!actual?.activo) return;
      if (actual.porcentaje >= 90) return;
      const avance = Math.max(1, (90 - actual.porcentaje) * 0.06);
      this.set(clave, { ...actual, porcentaje: Math.min(90, actual.porcentaje + avance) });
    }, 140);
    this.timers.set(clave, timer);
  }

  private detenerTimer(clave: string): void {
    const timer = this.timers.get(clave);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(clave);
    }
  }

  private limitar(p: number): number {
    return Math.max(0, Math.min(100, Math.round(p)));
  }

  private set(clave: string, estado: CargandoEstado): void {
    this.estados.set(clave, estado);
    this.emitir();
  }

  private emitir(): void {
    this.subject.next(new Map(this.estados));
  }
}
