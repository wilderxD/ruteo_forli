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

  constructor() {
    this.cargar();
  }

  private cargar(): void {
    try {
      const raw = sessionStorage.getItem(CLAVE);
      if (raw) this.sesion = JSON.parse(raw);
    } catch {
      this.sesion = null;
    }
  }

  guardar(s: Sesion): void {
    this.sesion = s;
    sessionStorage.setItem(CLAVE, JSON.stringify(s));
  }

  actualizar(parcial: Partial<Sesion>): void {
    if (!this.sesion) return;
    this.sesion = { ...this.sesion, ...parcial };
    sessionStorage.setItem(CLAVE, JSON.stringify(this.sesion));
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
    sessionStorage.removeItem(CLAVE);
  }
}
