import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { SesionService } from './sesion.service';

@Injectable({ providedIn: 'root' })
export class AuthService {

  constructor(private api: ApiService, private sesion: SesionService) {}

  async login(usuario: string, password: string, recordar = false): Promise<{ ok: boolean; error?: string }> {
    const res = await this.api.post('login', { usuario, password }, '', { reintentar: true });
    if (res.success) {
      this.sesion.guardar({
        token: res.token as string,
        nombre: res.nombre as string,
        dni: res.dni as string,
        placas: (res.placas as string[]) || [],
        rol: (res.rol as string) || 'chofer',
        fechaGlobal: (res.fechaGlobal as string) || ''
      }, recordar);
      return { ok: true };
    }
    return { ok: false, error: (res.error as string) || 'Credenciales inválidas o sin datos.' };
  }

  logout(): void {
    this.sesion.limpiar();
  }
}
