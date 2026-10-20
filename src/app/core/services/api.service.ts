import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { SesionService } from './sesion.service';
import { SwalService } from '../../shared/services/swal.service';

export interface ApiOpciones {
  reintentar?: boolean;
}

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

  private static readonly INTENTOS = 3;
  private static readonly ESPERAS = [400, 1200];
  private static readonly TIMEOUT_MS = 12000;

  constructor(private sesion: SesionService, private router: Router, private swal: SwalService) {}

  async get(accion: string, params: any = {}, token = '', opciones: ApiOpciones = {}): Promise<any> {
    return this.post(accion, params, token, { reintentar: true, ...opciones });
  }

  async post(accion: string, body: any = {}, token = '', opciones: ApiOpciones = {}): Promise<any> {
    const reintentar = opciones.reintentar ?? false;
    const q = new URLSearchParams();
    q.set('api', accion);
    const url = `${this.base}?${q.toString()}`;
    const payload = JSON.stringify({ ...body, ...(token ? { token } : {}) });

    // Apps Script puede responder 404 o colgarse de forma intermitente por el
    // redirect interno. Cada intento lleva timeout para que la promesa SIEMPRE
    // resuelva y la UI no quede con el spinner infinito. Los POST de escritura
    // no se reintentan por defecto para evitar operaciones duplicadas.
    let ultimoError: unknown = new Error('No se pudo conectar con el servidor.');
    for (let intento = 0; intento < ApiService.INTENTOS; intento++) {
      const controlador = new AbortController();
      const temporizador = setTimeout(() => controlador.abort(), ApiService.TIMEOUT_MS);
      let reintentarIntento = false;
      try {
        const res = await fetch(url, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: payload,
          signal: controlador.signal
        });

        if ((res.status === 404 || res.status >= 500) && reintentar && intento < ApiService.INTENTOS - 1) {
          ultimoError = new Error('HTTP ' + res.status);
          reintentarIntento = true;
        } else {
          const data: any = await res.json();
          // Sesión expirada/inválida: se pide volver a ingresar automáticamente.
          // Se exime 'login' (un 401 ahí significa credenciales incorrectas, no sesión vencida).
          if (accion !== 'login' && data?.codigo === 401) {
            this.gestionarSesionExpirada();
          }
          return data;
        }
      } catch (e) {
        ultimoError = (e as any)?.name === 'AbortError'
          ? new Error('El servidor tardó demasiado en responder.')
          : e;
        reintentarIntento = reintentar && intento < ApiService.INTENTOS - 1;
      } finally {
        clearTimeout(temporizador);
      }

      if (reintentarIntento) {
        await ApiService.esperar(ApiService.ESPERAS[intento]);
      }
    }

    throw ultimoError;
  }

  private static esperar(ms: number | undefined): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms ?? 400));
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
