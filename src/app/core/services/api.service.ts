import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { SesionService } from './sesion.service';
import { SwalService } from '../../shared/services/swal.service';

/**
 * Cliente de la REST API de Apps Script.
 *
 * CORS: Apps Script no maneja preflight OPTIONS, por lo que:
 *  - GET se usa para lecturas (request simple, funciona cross-origin).
 *  - POST se envía con Content-Type: text/plain (request simple que evita
 *    el preflight). El backend lee e.postData.contents y parsea el JSON.
 * El redirect 302 de Apps Script lo sigue el navegador automáticamente.
 *
 * El render posterior a cada llamada lo garantizan los componentes con
 * cdr.detectChanges() tras asignar sus datos (patrón del proyecto). No se
 * usa appRef.tick() global aquí: un tick global puede lanzar errores cuando
 * hay vistas destruidas/inconsistentes.
 *
 * Se devuelve `any`: las respuestas de Apps Script no tienen esquema estático
 * y los componentes las consumen con acceso directo (res.msg, res.vehiculos, ...).
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = environment.apiUrl;
  private redirigiendoSesion = false;

  constructor(private sesion: SesionService, private router: Router, private swal: SwalService) {}

  async get(accion: string, params: any = {}, token = ''): Promise<any> {
    return this.post(accion, params, token);
  }

  async post(accion: string, body: any = {}, token = ''): Promise<any> {
    const q = new URLSearchParams();
    q.set('api', accion);
    const url = `${this.base}?${q.toString()}`;
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, ...(token ? { token } : {}) })
    });
    const data: any = await res.json();
    // Sesión expirada/inválida: se pide volver a ingresar automáticamente.
    // Se exime 'login' (un 401 ahí significa credenciales incorrectas, no sesión vencida).
    if (accion !== 'login' && data?.codigo === 401) {
      this.gestionarSesionExpirada();
    }
    return data;
  }

  private gestionarSesionExpirada(): void {
    if (this.redirigiendoSesion) return;
    this.redirigiendoSesion = true;
    this.sesion.limpiar();
    void this.swal.error('Tu sesión expiró. Inicia sesión nuevamente.').then(() => {
      this.redirigiendoSesion = false;
    });
    void this.router.navigate(['/login']);
  }
}
