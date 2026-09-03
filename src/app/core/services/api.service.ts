import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

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
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = environment.apiUrl;

  async get(accion: string, params: Record<string, string | number | undefined> = {}, token = ''): Promise<any> {
    const q = new URLSearchParams();
    q.set('api', accion);
    if (token) q.set('token', token);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    }
    const url = `${this.base}?${q.toString()}`;
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    return res.json();
  }

  async post(accion: string, body: unknown, token = ''): Promise<any> {
    const q = new URLSearchParams();
    q.set('api', accion);
    if (token) q.set('token', token);
    const url = `${this.base}?${q.toString()}`;
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    return res.json();
  }
}