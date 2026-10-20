import { Injectable } from '@angular/core';

export interface Sesion {
  token: string;
  nombre: string;
  dni: string;
  placas: string[];
  rol: string;
  fechaGlobal?: string;
  placa?: string;
}

const CLAVE = 'reparto_session_angular';

@Injectable({ providedIn: 'root' })
export class SesionService {
  private sesion: Sesion | null = null;
  private persistente = false;

  constructor() {
    this.cargar();
  }

  private cargar(): void {
    try {
      const raw = localStorage.getItem(CLAVE);
      if (raw) {
        this.sesion = JSON.parse(raw) as Sesion;
        this.persistente = true;
        return;
      }
    } catch {
      /* localStorage no disponible o dato inválido */
    }

    try {
      const raw = sessionStorage.getItem(CLAVE);
      this.sesion = raw ? (JSON.parse(raw) as Sesion) : null;
      this.persistente = false;
    } catch {
      this.sesion = null;
      this.persistente = false;
    }
  }

  guardar(s: Sesion, recordar = false): void {
    this.sesion = s;
    this.persistente = recordar;
    try {
      if (recordar) {
        localStorage.setItem(CLAVE, JSON.stringify(s));
        sessionStorage.removeItem(CLAVE);
      } else {
        sessionStorage.setItem(CLAVE, JSON.stringify(s));
        localStorage.removeItem(CLAVE);
      }
    } catch {
      // Si localStorage falla (modo privado, cuota), se conserva la sesión
      // únicamente durante la pestaña actual.
      this.persistente = false;
      try {
        sessionStorage.setItem(CLAVE, JSON.stringify(s));
      } catch {
        /* sin persistencia; la sesión sigue en memoria */
      }
    }
  }

  actualizar(parcial: Partial<Sesion>): void {
    if (!this.sesion) return;
    this.sesion = { ...this.sesion, ...parcial };
    try {
      const storage = this.persistente ? localStorage : sessionStorage;
      storage.setItem(CLAVE, JSON.stringify(this.sesion));
    } catch {
      /* conservar la sesión en memoria */
    }
  }

  obtener(): Sesion | null {
    return this.sesion;
  }

  get token(): string {
    return this.sesion?.token ?? '';
  }

  get rol(): string {
    return this.sesion?.rol ?? '';
  }

  get placa(): string {
    return this.sesion?.placa ?? '';
  }

  setPlaca(placa: string): void {
    this.actualizar({ placa });
  }

  estaLogueado(): boolean {
    return !!this.sesion && !!this.sesion.token;
  }

  esRol(roles: string[]): boolean {
    return roles.includes(this.rol);
  }

  limpiar(): void {
    this.sesion = null;
    this.persistente = false;
    try {
      localStorage.removeItem(CLAVE);
    } catch {
      /* ignorar */
    }
    try {
      sessionStorage.removeItem(CLAVE);
    } catch {
      /* ignorar */
    }
  }
}
