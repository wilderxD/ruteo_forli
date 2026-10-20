import { Component, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { SesionService } from '../../core/services/sesion.service';
import { ApiService } from '../../core/services/api.service';
import { CargandoService } from '../../shared/services/cargando.service';
import { ProgresoSeccionComponent } from '../../shared/components/progreso-seccion/progreso-seccion.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, CommonModule, ProgresoSeccionComponent],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent implements OnInit {
  constructor(
    private auth: AuthService,
    public sesion: SesionService,
    private router: Router,
    private api: ApiService,
    private carga: CargandoService
  ) {}

  async ngOnInit(): Promise<void> {
    // Chequeo proactivo de sesión al cargar la app: si el token venció, el backend
    // responde 401 y api.service limpia la sesión, avisa y redirige a /login.
    this.carga.mostrar('layout', 'Verificando sesión…');
    try {
      const res = await this.api.get('refreshSession', {}, this.sesion.token);
      if (res?.success) {
        this.sesion.actualizar({
          nombre: res.nombre,
          rol: res.rol,
          placas: Array.isArray(res.placas) ? res.placas : []
        });
      }
    } catch {
      /* api.service ya maneja la expiración */
    } finally {
      this.carga.ocultar('layout');
    }
  }

  get nombre(): string {
    return this.sesion.obtener()?.nombre ?? '';
  }

  salir(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  ir(ruta: string): void {
    this.router.navigate([ruta]);
  }

  activa(ruta: string): boolean {
    return this.router.url.startsWith(ruta);
  }
}
